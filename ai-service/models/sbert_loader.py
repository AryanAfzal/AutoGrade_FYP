"""
sbert_loader.py
---------------
Loads the sentence-transformer model ONCE when the process starts.
Every service imports `sbert` from here — never loads it twice.

Model choice: all-MiniLM-L6-v2
  - 22M params, 80MB on disk
  - 384-dim embeddings
  - Fast enough for per-request use; good enough for short exam answers
  - Swap to 'all-mpnet-base-v2' (768-dim) for higher accuracy if speed allows
"""

from sentence_transformers import SentenceTransformer
import numpy as np
from numpy.linalg import norm

MODEL_NAME = "all-MiniLM-L6-v2"

print(f"[sbert_loader] Loading model: {MODEL_NAME} ...")
_model = SentenceTransformer(MODEL_NAME)
print(f"[sbert_loader] Model ready.")


def encode(texts: list[str]) -> np.ndarray:
    """
    Encode a list of strings into L2-normalised embedding vectors.

    Returns shape (N, 384) float32 ndarray.
    Normalised so cosine_similarity(a, b) == dot(a, b).

    Args:
        texts: list of strings to encode (can be 1 or many)

    Returns:
        numpy array of shape (len(texts), embedding_dim)
    """
    embeddings = _model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,   # L2-normalise → dot product = cosine sim
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings  # shape: (N, 384)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Cosine similarity between two 1-D vectors.
    Because encode() already L2-normalises, this is just the dot product.
    Returns a float in [-1.0, 1.0], practically [0.0, 1.0] for natural text.
    """
    return float(np.dot(a, b))


def pairwise_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Compute full N×N cosine similarity matrix for a batch of embeddings.
    Since embeddings are already normalised: sim_matrix = embeddings @ embeddings.T

    Args:
        embeddings: shape (N, 384)

    Returns:
        shape (N, N) float32 matrix where entry [i][j] is sim(i, j)
    """
    return embeddings @ embeddings.T


# Expose the raw model if any service needs it directly
sbert = _model