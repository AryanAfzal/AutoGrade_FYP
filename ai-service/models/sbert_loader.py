from sentence_transformers import SentenceTransformer
import numpy as np
from numpy.linalg import norm

MODEL_NAME = "all-MiniLM-L6-v2"

print(f"[sbert_loader] Loading model: {MODEL_NAME} ...")
_model = SentenceTransformer(MODEL_NAME)
print(f"[sbert_loader] Model ready.")


def encode(texts: list[str]) -> np.ndarray:
    embeddings = _model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,   # L2-normalise → dot product = cosine sim
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings  # shape: (N, 384)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def pairwise_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    return embeddings @ embeddings.T

sbert = _model