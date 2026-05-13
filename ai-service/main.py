"""
main.py
-------
FastAPI entry point for the AI service.

Startup sequence:
  1. FastAPI app created.
  2. SBERT model loaded at import time in sbert_loader.py (happens once).
  3. All routers registered under their respective prefixes.
  4. Uvicorn serves on 0.0.0.0:8000.

Run with:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Environment variables (optional):
    AI_SERVICE_PORT   — defaults to 8000
    CORS_ORIGIN       — NestJS backend origin, defaults to http://localhost:3001
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Routers
from routers.extract    import router as extract_router
from routers.parse_pdf  import router as parse_pdf_router
from routers.evaluate   import router as evaluate_router
from routers.similarity import router as similarity_router

app = FastAPI(
    title="Exam AI Service",
    description=(
        "SBERT-powered evaluation service. "
        "Handles PDF parsing, semantic scoring, keyword scoring, "
        "and cross-student similarity detection."
    ),
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow requests from the NestJS backend only.
# The frontend never calls this service directly.
cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:3001")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(extract_router)      # POST /extract-student-info
app.include_router(parse_pdf_router)    # POST /parse-pdf
app.include_router(evaluate_router)     # POST /evaluate
app.include_router(similarity_router)   # POST /similarity/{examId}


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """
    Quick liveness probe. NestJS can call this on startup to confirm
    the AI service is ready before accepting uploads.
    """
    return {"status": "ok", "service": "ai-service"}


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)