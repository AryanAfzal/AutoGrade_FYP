import math
import os
import re
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from paddleocr import PaddleOCR
from transformers import RobertaTokenizer, ViTImageProcessor, VisionEncoderDecoderModel

# ── Tunable settings ──────────────────────────────────────────────────────────
TROCR_BATCH_SIZE = 8          # lower this if you run out of memory
TROCR_NUM_BEAMS = 1           # Greedy decoding avoids multiplying CPU work per crop.
TROCR_MAX_NEW_TOKENS = 48     # Enough for a typical handwritten answer line.
TROCR_MIN_PADDLE_CONFIDENCE = 0.88

# TrOCR squashes every crop to a square, so very wide crops become unreadable.
# Lines wider than MAX_CROP_ASPECT x their height are split at word gaps.
# Try 8, 12 and 18 on your own pages; this is the main knob to tune.
MAX_CROP_ASPECT = 12.0

LINE_TOLERANCE = 0.5          # box joins a line if its centre is within 0.5 x line height
MIN_BOX_SIDE = 12             # ignore detected boxes smaller than this (dust, specks)
MIN_INK_RATIO = 0.004         # below this a crop is blank
MAX_INK_RATIO = 0.60          # above this a crop is a black blob (scanner shadow)

WATERMARK_RE = re.compile(r"camscanner|scanned\s+(?:with|by)|^cs\b", re.IGNORECASE)

DEBUG_DIR = os.getenv("OCR_DEBUG_DIR", "").strip()

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
USE_GPU_PADDLE = torch.cuda.is_available()

try:
    ocr_engine = PaddleOCR(
        use_angle_cls=True,
        lang="en",
        use_gpu=USE_GPU_PADDLE,
        show_log=False,
        det_limit_side_len=3000,
        det_db_thresh=0.10,
        det_db_box_thresh=0.20,
        det_db_unclip_ratio=2.0,
    )
except Exception as error:
    print(f"PaddleOCR initialization fallback (retry without use_gpu): {error}")
    ocr_engine = PaddleOCR(
        use_angle_cls=True,
        lang="en",
        show_log=False,
        det_limit_side_len=3000,
        det_db_thresh=0.10,
        det_db_box_thresh=0.20,
        det_db_unclip_ratio=2.0,
    )

LOCAL_MODEL_DIR = (
    Path(__file__).resolve().parent.parent
    / "model_files"
    / "trocr-base-handwritten"
)
MODEL_SRC = str(LOCAL_MODEL_DIR) if LOCAL_MODEL_DIR.exists() else "microsoft/trocr-base-handwritten"

print(f"Loading TrOCR handwriting model from {MODEL_SRC}...")
image_processor = ViTImageProcessor.from_pretrained(MODEL_SRC)
tokenizer = RobertaTokenizer.from_pretrained(MODEL_SRC)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_SRC)
model.to(DEVICE)
model.eval()
print(f"TrOCR model loaded on {DEVICE.upper()}.")


# ── Geometry helpers ──────────────────────────────────────────────────────────
def _ink_ratio(gray_crop: np.ndarray) -> float:
    """Fraction of dark (ink) pixels in a grayscale crop, using Otsu thresholding."""
    if gray_crop.size == 0:
        return 0.0
    _, binary = cv2.threshold(gray_crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return float((binary > 0).mean())


def _merge_into_lines(items: list[dict]) -> list[list[dict]]:
    if not items:
        return []

    ordered = sorted(items, key=lambda it: it["rect"][1] + it["rect"][3] / 2.0)
    lines: list[list[dict]] = []
    line_centres: list[list[float]] = []
    line_heights: list[list[float]] = []

    for item in ordered:
        _, y, _, h = item["rect"]
        centre = y + h / 2.0

        if lines:
            mean_centre = sum(line_centres[-1]) / len(line_centres[-1])
            median_height = sorted(line_heights[-1])[len(line_heights[-1]) // 2]
            if abs(centre - mean_centre) <= LINE_TOLERANCE * max(h, median_height):
                lines[-1].append(item)
                line_centres[-1].append(centre)
                line_heights[-1].append(h)
                continue

        lines.append([item])
        line_centres.append([centre])
        line_heights.append([h])

    for line in lines:
        line.sort(key=lambda it: it["rect"][0])
    return lines


def _line_rect(line: list[dict]) -> tuple[int, int, int, int]:
    """Union of all boxes in a line as (x1, y1, x2, y2)."""
    x1 = min(it["rect"][0] for it in line)
    y1 = min(it["rect"][1] for it in line)
    x2 = max(it["rect"][0] + it["rect"][2] for it in line)
    y2 = max(it["rect"][1] + it["rect"][3] for it in line)
    return x1, y1, x2, y2


def _split_wide_line(gray: np.ndarray, rect: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    x1, y1, x2, y2 = rect
    width, height = x2 - x1, y2 - y1
    if height <= 0 or width / float(height) <= MAX_CROP_ASPECT:
        return [(x1, x2)]

    crop = gray[y1:y2, x1:x2]
    _, binary = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    profile = (binary > 0).sum(axis=0).astype(np.float32)
    kernel = max(3, int(height * 0.12))
    profile = np.convolve(profile, np.ones(kernel, dtype=np.float32) / kernel, mode="same")

    parts = int(math.ceil(width / (MAX_CROP_ASPECT * height)))
    cuts = [0]
    for i in range(1, parts):
        target = int(width * i / parts)
        span = max(4, int(width / parts * 0.30))
        lo = max(cuts[-1] + 1, target - span)
        hi = min(width - 1, target + span)
        if lo >= hi:
            continue
        window = profile[lo:hi + 1]
        plateau = np.flatnonzero(window <= window.min() + 0.5)   # the whole empty gap
        cuts.append(lo + int(plateau[len(plateau) // 2]))        # cut in the middle of it
    cuts.append(width)

    return [(x1 + cuts[i], x1 + cuts[i + 1]) for i in range(len(cuts) - 1) if cuts[i + 1] > cuts[i]]


def _crop_piece(image_rgb: np.ndarray, x_start: int, x_end: int, y1: int, y2: int) -> np.ndarray:
    """Crop a piece of a line with a small real-page margin (boxes already carry one)."""
    image_height, image_width = image_rgb.shape[:2]
    height = max(1, y2 - y1)
    pad_y = max(4, int(height * 0.06))   # small: a big value pulls in the neighbouring line
    pad_x = max(8, int(height * 0.12))
    return image_rgb[
        max(0, y1 - pad_y): min(image_height, y2 + pad_y),
        max(0, x_start - pad_x): min(image_width, x_end + pad_x),
    ]


# ── Recognition ───────────────────────────────────────────────────────────────
def _recognize_crops(crops: list[np.ndarray]) -> list[tuple[str, float | None]]:
    results: list[tuple[str, float | None]] = []

    for start in range(0, len(crops), TROCR_BATCH_SIZE):
        batch = crops[start:start + TROCR_BATCH_SIZE]
        try:
            pixel_values = image_processor(
                images=[Image.fromarray(crop) for crop in batch],
                return_tensors="pt",
            ).pixel_values.to(DEVICE)

            with torch.no_grad():
                output = model.generate(
                    pixel_values,
                    max_new_tokens=TROCR_MAX_NEW_TOKENS,
                    num_beams=TROCR_NUM_BEAMS,
                )

            texts = tokenizer.batch_decode(output, skip_special_tokens=True)
            results.extend((text.strip(), None) for text in texts)
        except Exception as error:
            print(f"TrOCR batch inference warning: {error}")
            results.extend([("", None)] * len(batch))

    return results


def _looks_degenerate(text: str) -> bool:
    """TrOCR sometimes loops ('the the the ...') on noise; detect that."""
    words = text.split()
    return len(words) >= 8 and len(set(words)) / float(len(words)) < 0.35


# ── Public function ───────────────────────────────────────────────────────────
def extract_text_from_image(image_path: str) -> list[dict]:
    page_started = time.perf_counter()
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Unable to read OCR page image: {image_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # 1. Detect text boxes (PaddleOCR also returns its own text guess per box).
    result = ocr_engine.ocr(image_path, cls=True)
    detection_seconds = time.perf_counter() - page_started
    if not result or result[0] is None:
        print(
            f"[handwriting_ocr] {Path(image_path).name}: no text regions; "
            f"detection={detection_seconds:.1f}s"
        )
        return []

    items = []
    for entry in result[0]:
        if entry is None or len(entry) < 2:
            continue
        box, (paddle_text, paddle_conf) = entry[0], entry[1]
        x, y, w, h = cv2.boundingRect(np.array(box, dtype=np.int32))
        if w < MIN_BOX_SIDE or h < MIN_BOX_SIDE:
            continue
        ink = _ink_ratio(gray[y:y + h, x:x + w])
        if ink < MIN_INK_RATIO or ink > MAX_INK_RATIO:
            continue  # blank area or black scanner shadow
        items.append({"rect": (x, y, w, h), "text": paddle_text, "conf": float(paddle_conf)})

    if not items:
        return []

    # 2. Merge boxes into lines, drop watermark lines, split lines that are too wide.
    lines = []
    for line_items in _merge_into_lines(items):
        paddle_line = " ".join(it["text"] for it in line_items if it["text"]).strip()
        if WATERMARK_RE.search(paddle_line):
            continue
        paddle_conf = sum(it["conf"] for it in line_items) / len(line_items)
        rect = _line_rect(line_items)
        if all(it["conf"] >= TROCR_MIN_PADDLE_CONFIDENCE for it in line_items):
            lines.append(
                {
                    "rect": rect,
                    "paddle_text": paddle_line,
                    "paddle_conf": paddle_conf,
                    "crops": [],
                }
            )
            continue

        pieces = _split_wide_line(gray, rect)
        crops = [_crop_piece(image_rgb, a, b, rect[1], rect[3]) for a, b in pieces]
        crops = [c for c in crops if c.shape[0] > 6 and c.shape[1] > 6]
        if not crops:
            continue
        lines.append(
            {"rect": rect, "paddle_text": paddle_line, "paddle_conf": paddle_conf, "crops": crops}
        )

    if not lines:
        return []

    # 3. Read every crop with TrOCR in batches.
    flat_crops = [crop for line in lines for crop in line["crops"]]
    recognition_started = time.perf_counter()
    recognised = _recognize_crops(flat_crops)
    recognition_seconds = time.perf_counter() - recognition_started

    # 4. Put the pieces back together line by line, in reading order.
    output_lines = []
    cursor = 0
    stem = Path(image_path).stem
    debug_rows = []

    for index, line in enumerate(lines):
        count = len(line["crops"])
        pieces = recognised[cursor:cursor + count]
        cursor += count

        trocr_text = " ".join(text for text, _ in pieces if text).strip()
        confidences = [c for _, c in pieces if c is not None]
        trocr_conf = sum(confidences) / len(confidences) if confidences else None

        if trocr_text and not _looks_degenerate(trocr_text):
            final_text = trocr_text
            final_conf = trocr_conf if trocr_conf is not None else line["paddle_conf"]
        else:
            final_text = line["paddle_text"]  # TrOCR failed or looped: keep PaddleOCR's guess
            final_conf = line["paddle_conf"]

        final_text = re.sub(r"\s+", " ", final_text).strip()
        if not final_text or WATERMARK_RE.search(final_text):
            continue

        output_lines.append({"text": final_text, "confidence": round(float(final_conf), 2)})

        if DEBUG_DIR:
            x1, y1, x2, y2 = line["rect"]
            debug_rows.append(
                f"[{index:02d}] box=({x1},{y1},{x2 - x1},{y2 - y1}) pieces={count} "
                f"conf={final_conf:.2f}\n     paddle: {line['paddle_text']}\n     trocr : {trocr_text}\n"
            )
            for piece_no, crop in enumerate(line["crops"]):
                os.makedirs(DEBUG_DIR, exist_ok=True)
                cv2.imwrite(
                    os.path.join(DEBUG_DIR, f"{stem}_line{index:02d}_{piece_no}.png"),
                    cv2.cvtColor(crop, cv2.COLOR_RGB2BGR),
                )

    if DEBUG_DIR and debug_rows:
        with open(os.path.join(DEBUG_DIR, f"{stem}_debug.txt"), "w", encoding="utf-8") as handle:
            handle.write("\n".join(debug_rows))
        print(f"[handwriting_ocr] debug output written to {DEBUG_DIR}")

    print(
        f"[handwriting_ocr] {Path(image_path).name}: "
        f"regions={len(items)}, lines={len(lines)}, "
        f"trocr_lines={sum(bool(line['crops']) for line in lines)}, "
        f"crops={len(flat_crops)}, "
        f"device={DEVICE}, detect={detection_seconds:.1f}s, "
        f"recognize={recognition_seconds:.1f}s, "
        f"total={time.perf_counter() - page_started:.1f}s"
    )
    return output_lines