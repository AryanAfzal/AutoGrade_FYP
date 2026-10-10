from pathlib import Path
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
TARGET = Path(__file__).resolve().parent / "model_files" / "all-MiniLM-L6-v2"

if TARGET.exists():
    print(f"Model already exists at {TARGET}, skipping download.")
else:
    print("Downloading model...")
    SentenceTransformer(MODEL_NAME).save(str(TARGET))
    print(f"Saved to {TARGET}")