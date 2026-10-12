# AutoGrade AI service

The evaluation service combines SBERT answer scoring with the handwritten answer-sheet OCR pipeline migrated from `OCR_SYSTEM-main`.

## Handwritten answer-sheet flow

When PDF text extraction returns fewer answer entries than the exam has questions, the service:

1. Renders the PDF pages at 288 DPI with PyMuPDF.
2. Scales and enhances each page with OpenCV (bilateral denoising, CLAHE, and sharpening).
3. Detects text regions with PaddleOCR and refines low-confidence line crops in batches with Microsoft TrOCR.
4. Detects question boundaries from raw OCR labels before language-model correction, then corrects each answer separately in bounded text chunks with a conservative local Ollama prompt.
5. Preserves recognizer confidence rather than assigning an artificial confidence to corrected text, then sends the structured answers through the existing MCQ/SBERT evaluator.

The existing teacher review-before-publishing flow remains in place. OCR/SBERT output should be treated as a draft grade for teacher review, not as a final decision.

## Setup

Use Python 3.11, as specified by the OCR reference project. From this directory, install the pinned requirements in the AI service's `venv311` environment. The OCR dependency versions match the reference project's version table. The listed PyTorch and torchvision wheels are the reference CPU-compatible versions; CUDA acceleration requires installing a compatible PyTorch/torchvision and PaddlePaddle build for the local CUDA runtime instead.

```powershell
.\venv311\Scripts\python.exe -m pip install -r requirements.txt
```

Download the TrOCR checkpoint once for local/offline startup:

```powershell
.\venv311\Scripts\python.exe download_trocr.py
```

The downloaded files go under `model_files/trocr-base-handwritten/`, which is intentionally excluded from Git because the checkpoint is large. Without the local copy, Transformers attempts to download `microsoft/trocr-base-handwritten` at runtime.
PaddleOCR also downloads its detector and recognizer model assets on first initialization unless those assets are already cached.

The OCR archive does not contain custom TrOCR fine-tuned weights or training code. Its loader uses the standard `microsoft/trocr-base-handwritten` checkpoint, with an optional local checkpoint directory. Therefore this integration carries over the archive's OCR pipeline and configuration, but does not claim to include a project-specific fine-tuned model.

Ollama contextual correction is attempted by default. If Ollama is unavailable, the service keeps the original OCR text instead of applying speculative dictionary rewrites. Install Ollama, then pull the configured model:

```powershell
ollama pull qwen2.5:1.5b
```

The AI service loads settings from this directory's `.env` file before initializing OCR. These settings can override the defaults:

```env
OCR_ENABLE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT=15
```

Scanned/image-only PDFs need the OCR dependencies and TrOCR checkpoint available. Ollama can correct some recognition errors but cannot recover handwriting the vision recognizers did not read; review uncertain answers before grading is finalized. OCR/SBERT output should be treated as a draft grade for teacher review, not as a final decision.

Start the API with the same interpreter so a global Python installation cannot serve requests instead:

```powershell
.\venv311\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```
