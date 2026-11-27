import importlib.machinery
import sys
import time
import types
from pathlib import Path


# Safeguard against Windows Smart App Control blocking compiled sklearn DLLs/.pyd files
class _DummySklearnCallable:
    def __init__(self, *args, **kwargs):
        pass

    def __call__(self, *args, **kwargs):
        return self

    def __getattr__(self, name: str):
        return _DummySklearnCallable()


class _DummySklearnModule(types.ModuleType):
    def __getattr__(self, name: str):
        if name.startswith("__"):
            raise AttributeError(name)
        return _DummySklearnCallable()


class _SklearnMetaFinder:
    def find_spec(self, fullname: str, path=None, target=None):
        if fullname == "sklearn" or fullname.startswith("sklearn."):
            return importlib.machinery.ModuleSpec(
                fullname,
                loader=self,
                is_package=True,
            )
        return None

    def create_module(self, spec):
        mod = _DummySklearnModule(spec.name)
        mod.__path__ = []
        return mod

    def exec_module(self, module):
        pass


if not any(type(f).__name__ == "_SklearnMetaFinder" for f in sys.meta_path):
    sys.meta_path.insert(0, _SklearnMetaFinder())

import transformers.utils.import_utils as _transformers_import_utils

_transformers_import_utils.is_sklearn_available = lambda: False
_transformers_import_utils._sklearn_available = False

import cv2
import numpy as np
import torch
from paddleocr import PaddleOCR
from PIL import Image
from transformers import (
    RobertaTokenizer,
    VisionEncoderDecoderModel,
    ViTImageProcessor,
)

from services.text_cleaner import (
    is_watermark_or_noise,
    looks_like_header_token,
    parse_header_line,
)

# Device configuration (CUDA GPU if available, else CPU)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
USE_GPU_PADDLE = False
ENABLE_TROCR = False  # Disabled on Free Tier (512MB RAM) to avoid OOM crashes (TrOCR alone takes 1.4GB)

# Lazy-loaded singletons to prevent startup Out-Of-Memory on 512MB free tier
_ocr_engine = None
_trocr_bundle = None


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            _ocr_engine = PaddleOCR(
                use_angle_cls=False,
                lang="en",
                use_gpu=False,
                show_log=False,
                det_limit_side_len=1500,
                det_db_thresh=0.15,
                det_db_box_thresh=0.25,
                det_db_unclip_ratio=1.8,
            )
        except Exception as e:
            print(f"PaddleOCR init fallback: {e}")
            _ocr_engine = PaddleOCR(
                use_angle_cls=False,
                lang="en",
                show_log=False,
                det_limit_side_len=1500,
            )
    return _ocr_engine


def get_trocr():
    global _trocr_bundle
    if _trocr_bundle is not None:
        return _trocr_bundle

    BACKEND_TROCR_DIR = (
        Path(__file__).resolve().parent.parent.parent
        / "backend"
        / "src"
        / "Models"
        / "trocr-base-handwritten"
    )
    FALLBACK_TROCR_DIR = (
        Path(__file__).resolve().parent.parent
        / "model_files"
        / "trocr-base-handwritten"
    )
    LOCAL_MODEL_DIR = (
        BACKEND_TROCR_DIR if BACKEND_TROCR_DIR.exists() else FALLBACK_TROCR_DIR
    )
    if not LOCAL_MODEL_DIR.exists():
        raise FileNotFoundError(
            f"Local TrOCR model not found at {BACKEND_TROCR_DIR} or {FALLBACK_TROCR_DIR}"
        )
    MODEL_SRC = str(LOCAL_MODEL_DIR)

    print(f"Loading official Base TrOCR on-demand from local folder '{MODEL_SRC}'...")
    image_processor = ViTImageProcessor.from_pretrained(
        MODEL_SRC, local_files_only=True
    )
    tokenizer = RobertaTokenizer.from_pretrained(MODEL_SRC, local_files_only=True)
    model = VisionEncoderDecoderModel.from_pretrained(
        MODEL_SRC, local_files_only=True
    )
    model.to(DEVICE)
    model.eval()
    print(f"TrOCR model loaded successfully on device: {DEVICE.upper()}")

    _trocr_bundle = (image_processor, tokenizer, model)
    return _trocr_bundle


def extract_text_from_image(image_path: str) -> list[dict]:
    """
    Extracts handwriting text lines using PaddleOCR detection & recognition,
    refines short/difficult handwriting crops in parallel batches with TrOCR,
    and sorts into natural reading order (ported directly from OCR_SYSTEM).
    """
    page_started = time.perf_counter()
    img = cv2.imread(image_path)
    if img is None:
        return []

    img_h, img_w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    detection_started = time.perf_counter()
    ocr_engine = get_ocr_engine()
    result = ocr_engine.ocr(image_path, cls=True)
    detection_seconds = time.perf_counter() - detection_started
    if not result or result[0] is None:
        return []

    items = []
    crops_to_infer = []
    crop_indices = []

    for line in result[0]:
        if line is None or len(line) < 2:
            continue

        box, (p_text, p_conf) = line[0], line[1]
        pts = np.array(box, dtype=np.int32)
        x, y, w, h = cv2.boundingRect(pts)
        aspect = w / float(h) if h > 0 else 0.0

        idx = len(items)
        items.append(
            {
                "box": (x, y, w, h),
                "text": p_text,
                "conf": float(p_conf),
            }
        )

        # Queue very low-confidence handwriting crops where PaddleOCR failed for TrOCR batch refinement
        # Note: TrOCR base hallucinates on normal crops, so only query it if PaddleOCR confidence is very low (< 0.35)
        if (
            aspect <= 4.5
            and w >= 25
            and h >= 14
            and p_conf < 0.35
            and not looks_like_header_token(p_text)
        ):
            pad_y = max(4, int(h * 0.15))
            pad_x = max(6, int(w * 0.10))
            y1 = max(0, y - pad_y)
            y2 = min(img_h, y + h + pad_y)
            x1 = max(0, x - pad_x)
            x2 = min(img_w, x + w + pad_x)
            crop_np = img_rgb[y1:y2, x1:x2]

            if crop_np.shape[0] > 6 and crop_np.shape[1] > 6:
                crops_to_infer.append(Image.fromarray(crop_np))
                crop_indices.append(idx)

    # Run batch inference for all queued crops at once (only when ENABLE_TROCR is true)
    recognition_started = time.perf_counter()
    if crops_to_infer and ENABLE_TROCR:
        batch_size = 16
        for b_start in range(0, len(crops_to_infer), batch_size):
            b_crops = crops_to_infer[b_start : b_start + batch_size]
            b_indices = crop_indices[b_start : b_start + batch_size]
            try:
                image_processor, tokenizer, model = get_trocr()
                pixel_values = image_processor(
                    images=b_crops, return_tensors="pt"
                ).pixel_values.to(DEVICE)
                with torch.no_grad():
                    out = model.generate(
                        pixel_values, max_new_tokens=32, num_beams=1
                    )
                decoded = tokenizer.batch_decode(out, skip_special_tokens=True)
                for i, text_val in enumerate(decoded):
                    t_text = text_val.strip()
                    orig_text = items[b_indices[i]]["text"]
                    if looks_like_header_token(orig_text):
                        continue
                    if (
                        t_text
                        and len(t_text) > 1
                        and not t_text.startswith("0 000")
                        and not t_text.startswith("p.")
                    ):
                        items[b_indices[i]]["text"] = t_text
            except Exception as e:
                print(f"TrOCR batch inference warning: {e}")
    recognition_seconds = time.perf_counter() - recognition_started

    if not items:
        return []

    # Sort items by Y to group into lines using geometric vertical overlap
    items.sort(key=lambda it: it["box"][1])
    lines = []
    curr_line = [items[0]]

    for it in items[1:]:
        x, y, w, h = it["box"]
        px, py, pw, ph = curr_line[-1]["box"]

        # Calculate vertical overlap between bounding boxes
        overlap_y = max(0, min(y + h, py + ph) - max(y, py))
        min_h = min(h, ph)

        # If vertical overlap is at least 45% of box height, they belong to the same text line
        if min_h > 0 and (overlap_y / float(min_h)) >= 0.45:
            curr_line.append(it)
        else:
            lines.append(curr_line)
            curr_line = [it]

    if curr_line:
        lines.append(curr_line)

    final_output = []
    for line in lines:
        line.sort(key=lambda it: it["box"][0])  # Sort left-to-right
        line_text = " ".join(it["text"] for it in line if it["text"]).strip()
        avg_conf = sum(it["conf"] for it in line) / max(1, len(line))
        if not line_text:
            continue

        # Skip watermarks (CamScanner, etc.)
        if is_watermark_or_noise(line_text) and not looks_like_header_token(
            line_text
        ):
            continue

        # Check if line contains a question header (standalone or inline)
        is_h, num_val, rest_text = parse_header_line(line_text)
        if is_h:
            h_text = (
                f"Q#{num_val:02d}:"
                if num_val is not None and num_val > 0
                else "Q#?:"
            )
            print(f"--> Extracted header: {h_text}")
            final_output.append(
                {"text": h_text, "confidence": round(avg_conf, 2)}
            )
            if rest_text and not is_watermark_or_noise(rest_text):
                print(f"--> Extracted line: {rest_text}")
                final_output.append(
                    {"text": rest_text, "confidence": round(avg_conf, 2)}
                )
        else:
            print(f"--> Extracted line: {line_text}")
            final_output.append(
                {"text": line_text, "confidence": round(avg_conf, 2)}
            )

    print(
        f"[handwriting_ocr] {Path(image_path).name}: "
        f"regions={len(items)}, refined_crops={len(crops_to_infer)}, "
        f"lines={len(final_output)}, device={DEVICE}, "
        f"detect={detection_seconds:.1f}s, "
        f"recognize={recognition_seconds:.1f}s, "
        f"total={time.perf_counter() - page_started:.1f}s"
    )
    return final_output


def extract_text_from_images(image_paths: list[str]) -> list[dict]:
    all_results = []
    for path in image_paths:
        page_results = extract_text_from_image(path)
        all_results.extend(page_results)
    return all_results
