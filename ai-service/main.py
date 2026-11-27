import os
import transformers.utils.import_utils as _transformers_import_utils
_transformers_import_utils.is_torchvision_available = lambda: False
_transformers_import_utils._torchvision_available = False
_transformers_import_utils.is_sklearn_available = lambda: False
_transformers_import_utils._sklearn_available = False

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from services.text_cleaner import ensure_ollama_running, OCR_ENABLE_OLLAMA

if OCR_ENABLE_OLLAMA:
    ensure_ollama_running()

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

cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:3001")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers
app.include_router(extract_router)
app.include_router(parse_pdf_router)
app.include_router(evaluate_router)
app.include_router(similarity_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service", "version": "v2.1-pen-to-print"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
