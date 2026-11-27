from pathlib import Path
import importlib.machinery
import sys
import types


# Prevent Windows Smart App Control from blocking unused scikit-learn .pyd binaries
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
_transformers_import_utils.is_torchvision_available = lambda: False
_transformers_import_utils._torchvision_available = False
_transformers_import_utils.is_sklearn_available = lambda: False
_transformers_import_utils._sklearn_available = False

import numpy as np
from numpy.linalg import norm

MODEL_NAME = "all-MiniLM-L6-v2"
BACKEND_MODELS_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "backend"
    / "src"
    / "Models"
    / MODEL_NAME
)
FALLBACK_MODEL_DIR = (
    Path(__file__).resolve().parent.parent / "model_files" / MODEL_NAME
)
LOCAL_MODEL_DIR = (
    BACKEND_MODELS_DIR if BACKEND_MODELS_DIR.exists() else FALLBACK_MODEL_DIR
)

_model = None


def get_sbert():
    """Lazy-load SBERT model on demand to keep startup memory under 50MB."""
    global _model
    if _model is not None:
        return _model

    from sentence_transformers import SentenceTransformer

    if BACKEND_MODELS_DIR.exists():
        print(f"[sbert_loader] Loading local backend model: {BACKEND_MODELS_DIR}")
        _model = SentenceTransformer(str(BACKEND_MODELS_DIR), local_files_only=True)
    elif FALLBACK_MODEL_DIR.exists():
        print(f"[sbert_loader] Loading local fallback model: {FALLBACK_MODEL_DIR}")
        _model = SentenceTransformer(str(FALLBACK_MODEL_DIR), local_files_only=True)
    elif LOCAL_MODEL_DIR.exists():
        print(f"[sbert_loader] Loading local model: {LOCAL_MODEL_DIR}")
        _model = SentenceTransformer(str(LOCAL_MODEL_DIR), local_files_only=True)
    else:
        print("[sbert_loader] Local model not found; loading from HuggingFace...")
        _model = SentenceTransformer(f"sentence-transformers/{MODEL_NAME}")

    print("[sbert_loader] Model ready.")
    return _model


def encode(texts: list[str]) -> np.ndarray:
    embeddings = get_sbert().encode(
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


class _SbertProxy:
    """Proxy object so legacy imports of `sbert` resolve lazily."""
    def __getattr__(self, name: str):
        return getattr(get_sbert(), name)


sbert = _SbertProxy()
