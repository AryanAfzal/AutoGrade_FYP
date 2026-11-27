import base64
import os
import time
from pathlib import Path

import fitz
import requests

PEN_TO_PRINT_ENDPOINT = "https://api.pen-to-print.com/V1/notes"


def _get_credentials() -> tuple[str, str]:
    user_id = (os.getenv("PEN_TO_PRINT_USER_ID") or "yKwGVHqGNnOsSCbfqGUz34P5pkt2").strip()
    secret = (os.getenv("PEN_TO_PRINT_SECRET") or "39F9FCBA198").strip()
    if not user_id or not secret:
        raise RuntimeError(
            "Pen to Print credentials are not configured. "
            "Set PEN_TO_PRINT_USER_ID and PEN_TO_PRINT_SECRET in ai-service/.env."
        )
    return user_id, secret


def _recognize_image_bytes(
    image_bytes: bytes,
    user_id: str,
    secret: str,
    page_label: str = "page",
) -> str:
    src_image = base64.b64encode(image_bytes).decode("utf-8")
    response = requests.post(
        PEN_TO_PRINT_ENDPOINT,
        json={
            "userId": user_id,
            "secret": secret,
            "srcImage": src_image,
        },
        timeout=120,
    )

    if response.status_code == 400:
        raise RuntimeError("Pen to Print API error (400): Missing required parameters.")
    if response.status_code == 403:
        raise RuntimeError(
            "Pen to Print API error (403): Unauthorized. Verify PEN_TO_PRINT_USER_ID and PEN_TO_PRINT_SECRET."
        )
    if response.status_code == 405:
        raise RuntimeError(
            "Pen to Print API error (405): API access not allowed. Check your Pen to Print subscription status."
        )
    if response.status_code >= 500:
        raise RuntimeError(
            f"Pen to Print API error ({response.status_code}): Remote scan failed on {page_label}."
        )
    response.raise_for_status()

    data = response.json()
    return (data.get("value") or "").strip()


def extract_lines_from_pdf_via_pen_to_print(pdf_path: str) -> list[dict]:
    """
    Renders each page of a PDF as a high-quality JPEG image and sends it
    to Pen to Print's Handwriting OCR API, returning ordered text line dicts.
    """
    user_id, secret = _get_credentials()
    started_at = time.perf_counter()

    pdf = fitz.open(pdf_path)
    all_lines: list[dict] = []

    try:
        total_pages = len(pdf)
        if total_pages == 0:
            raise ValueError("The answer-sheet PDF contains no pages.")

        # 3.0x matrix (~216 DPI) keeps handwriting crisp while maintaining compact JPEG payloads
        matrix = fitz.Matrix(3.0, 3.0)

        for page_idx in range(total_pages):
            page_started = time.perf_counter()
            page = pdf[page_idx]
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            jpeg_bytes = pix.tobytes("jpeg", jpg_quality=92)

            page_label = f"{Path(pdf_path).name} page {page_idx + 1}/{total_pages}"
            recognized_text = _recognize_image_bytes(
                jpeg_bytes, user_id, secret, page_label=page_label
            )

            page_lines = [
                line.strip()
                for line in recognized_text.splitlines()
                if line and line.strip()
            ]
            for line in page_lines:
                all_lines.append({"text": line, "confidence": 0.98})

            print(
                f"[pen_to_print_ocr] {page_label}: lines={len(page_lines)}, "
                f"elapsed={time.perf_counter() - page_started:.1f}s"
            )
    finally:
        pdf.close()

    print(
        f"[pen_to_print_ocr] Completed {Path(pdf_path).name}: "
        f"total_lines={len(all_lines)}, total_elapsed={time.perf_counter() - started_at:.1f}s"
    )
    return all_lines
