# AutoGrade AI service

The evaluation service combines SBERT answer scoring with the handwritten answer-sheet OCR pipeline migrated from `OCR_SYSTEM-main`.

## Descriptive-answer rubrics

Each descriptive question can define named rubric concepts with a short evidence description, optional
concept keywords, an allocated mark weight, and a strictness level (`lenient`, `balanced`, or `strict`).
The concept mark allocations must add up to the question's maximum marks. Rubric scoring weights for
reference-answer similarity, keyword evidence, and concept coverage must add up to 100%.

For each concept, available scoring signals are combined using the configured rubric weights. Strictness
sets the evidence threshold used to calculate proportional checkpoint marks (20%, 35%, or 50% for
lenient, balanced, or strict). Checkpoint marks are summed to produce the AI question mark. The evaluation
response includes the per-concept coverage, awarded marks, status, an overall concept-coverage score,
and a student-readable feedback draft. These remain AI suggestions for teacher review.

## Handwritten answer-sheet flow

When PDF text extraction returns fewer answer entries than the exam has questions, the service:

1. Renders the PDF pages at 288 DPI with PyMuPDF.
2. Scales and enhances each page with OpenCV (bilateral denoising, CLAHE, and sharpening).
3. Detects text regions with PaddleOCR and refines low-confidence line crops in batches with Microsoft TrOCR.
4. Detects question boundaries from raw OCR labels before language-model correction, then sends each answer to local Ollama for contextual OCR correction. If Ollama is unavailable or its shared correction budget expires, SymSpell and OCR-specific substitutions provide an offline fallback.
5. Retains the recognizer confidence for SymSpell-only output. Ollama-corrected lines are assigned a fixed confidence of `0.98` by this implementation; this is a configured value, not a calibrated recognition confidence, so teacher review remains important.

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

Ollama contextual correction is attempted by default. If Ollama is unavailable, SymSpell applies offline spelling corrections using its English frequency dictionaries. Install Ollama, then pull the configured model:

```powershell
ollama pull qwen2.5:1.5b
```

The AI service loads settings from this directory's `.env` file before initializing OCR. These settings can override the defaults:

```env
OCR_ENABLE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT=15
OLLAMA_CORRECTION_BUDGET_SECONDS=45
```

Scanned/image-only PDFs need the OCR dependencies and TrOCR checkpoint available. Ollama can correct some recognition errors but cannot recover handwriting the vision recognizers did not read; review uncertain answers before grading is finalized. OCR/SBERT output should be treated as a draft grade for teacher review, not as a final decision.

Start the API with the same interpreter so a global Python installation cannot serve requests instead:

```powershell
.\venv311\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```
