import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image

# Transformers can optionally use scikit-learn for assisted decoding. Disable that
# optional probe before importing Transformers; this avoids loading blocked sklearn
# extension modules under Windows application-control policies.
import transformers.utils.import_utils as _transformers_import_utils

_transformers_import_utils.is_sklearn_available = lambda: False

from transformers import RobertaTokenizer, ViTImageProcessor, VisionEncoderDecoderModel
from paddleocr import PaddleOCR


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
MODEL_SRC = (
    str(LOCAL_MODEL_DIR)
    if LOCAL_MODEL_DIR.exists()
    else "microsoft/trocr-base-handwritten"
)

print(f"Loading TrOCR handwriting model from {MODEL_SRC}...")
image_processor = ViTImageProcessor.from_pretrained(MODEL_SRC)
tokenizer = RobertaTokenizer.from_pretrained(MODEL_SRC)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_SRC)
model.to(DEVICE)
model.eval()
print(f"TrOCR model loaded successfully on device: {DEVICE.upper()}")


def extract_text_from_image(image_path: str) -> list[dict]:
    """Detect page text with PaddleOCR and batch-refine short, uncertain regions."""
    page_started = time.perf_counter()
    image = cv2.imread(image_path)
    if image is None:
        return []

    image_height, image_width = image.shape[:2]
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    detection_started = time.perf_counter()
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

        box, (paddle_text, paddle_confidence) = line[0], line[1]
        x, y, width, height = cv2.boundingRect(np.array(box, dtype=np.int32))
        aspect = width / float(height) if height > 0 else 0.0

        item_index = len(items)
        items.append(
            {
                "box": (x, y, width, height),
                "text": paddle_text,
                "conf": float(paddle_confidence),
            }
        )

        if (
            aspect <= 4.5
            and width >= 25
            and height >= 14
            and paddle_confidence < 0.88
        ):
            padding_y = max(4, int(height * 0.15))
            padding_x = max(6, int(width * 0.10))
            y1 = max(0, y - padding_y)
            y2 = min(image_height, y + height + padding_y)
            x1 = max(0, x - padding_x)
            x2 = min(image_width, x + width + padding_x)
            crop = image_rgb[y1:y2, x1:x2]

            if crop.shape[0] > 6 and crop.shape[1] > 6:
                crops_to_infer.append(Image.fromarray(crop))
                crop_indices.append(item_index)

    recognition_started = time.perf_counter()
    if crops_to_infer:
        batch_size = 16
        for batch_start in range(0, len(crops_to_infer), batch_size):
            batch_crops = crops_to_infer[batch_start : batch_start + batch_size]
            batch_indices = crop_indices[batch_start : batch_start + batch_size]
            try:
                pixel_values = image_processor(
                    images=batch_crops,
                    return_tensors="pt",
                ).pixel_values.to(DEVICE)
                with torch.no_grad():
                    output = model.generate(
                        pixel_values,
                        max_new_tokens=32,
                        num_beams=1,
                    )
                decoded = tokenizer.batch_decode(output, skip_special_tokens=True)
                for index, text in enumerate(decoded):
                    recognised_text = text.strip()
                    if (
                        recognised_text
                        and len(recognised_text) > 1
                        and not recognised_text.startswith("0 000")
                    ):
                        items[batch_indices[index]]["text"] = recognised_text
            except Exception as error:
                print(f"TrOCR batch inference warning: {error}")
    recognition_seconds = time.perf_counter() - recognition_started

    if not items:
        return []

    items.sort(key=lambda item: item["box"][1])
    lines = []
    current_line = [items[0]]

    for item in items[1:]:
        _, y, _, height = item["box"]
        _, previous_y, _, previous_height = current_line[-1]["box"]
        vertical_overlap = max(
            0,
            min(y + height, previous_y + previous_height)
            - max(y, previous_y),
        )
        minimum_height = min(height, previous_height)

        if (
            minimum_height > 0
            and vertical_overlap / float(minimum_height) >= 0.45
        ):
            current_line.append(item)
        else:
            lines.append(current_line)
            current_line = [item]

    if current_line:
        lines.append(current_line)

    final_output = []
    for line in lines:
        line.sort(key=lambda item: item["box"][0])
        line_text = " ".join(item["text"] for item in line if item["text"]).strip()
        average_confidence = sum(item["conf"] for item in line) / max(1, len(line))
        if line_text:
            final_output.append(
                {
                    "text": line_text,
                    "confidence": round(average_confidence, 2),
                }
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
    for image_path in image_paths:
        all_results.extend(extract_text_from_image(image_path))
    return all_results
