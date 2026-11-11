import os
import threading
from typing import List, Optional, Union

import numpy as np
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
import onnxruntime as ort

DEFAULT_EMBEDDING_REPO = "sentence-transformers/all-MiniLM-L6-v2"
MAX_SEQ_LENGTH = 256
EMBEDDING_DIM = 384

_embedder_lock = threading.Lock()
_embedder_instance: Optional["ONNXMiniLMEmbedder"] = None


def _resolve_repo_id(model_name: str) -> str:
    clean = (model_name or "").strip()
    if not clean or clean == "all-MiniLM-L6-v2":
        return DEFAULT_EMBEDDING_REPO
    return clean


def _download_model_asset(repo_id: str, filenames: List[str]) -> str:
    """
    Resolve a HuggingFace Hub file from local cache first, falling back to download
    when offline mode is not enabled.
    """
    last_err: Optional[Exception] = None
    for filename in filenames:
        try:
            return hf_hub_download(repo_id=repo_id, filename=filename, local_files_only=True)
        except Exception as err:
            last_err = err

    offline = os.getenv("HF_HUB_OFFLINE", "").strip().lower() in ("1", "true", "yes")
    if not offline:
        for filename in filenames:
            try:
                return hf_hub_download(repo_id=repo_id, filename=filename)
            except Exception as err:
                last_err = err

    raise RuntimeError(
        f"Failed to load '{filenames}' from '{repo_id}' (HF_HUB_OFFLINE={os.getenv('HF_HUB_OFFLINE', '')}): {last_err}"
    )


class ONNXMiniLMEmbedder:
    """
    Lightweight drop-in replacement for SentenceTransformer('all-MiniLM-L6-v2')
    using ONNX Runtime and HuggingFace tokenizers (~120-180MB RSS vs ~2GB PyTorch).
    Produces 384-d attention-masked mean-pooled, L2-normalized embeddings.
    """

    def __init__(self, repo_id: str = DEFAULT_EMBEDDING_REPO, max_length: int = MAX_SEQ_LENGTH):
        self.repo_id = _resolve_repo_id(repo_id)
        self.max_length = max_length

        tokenizer_path = _download_model_asset(self.repo_id, ["tokenizer.json"])
        model_path = _download_model_asset(self.repo_id, ["onnx/model.onnx", "model.onnx"])

        self.tokenizer = Tokenizer.from_file(tokenizer_path)
        pad_id = self.tokenizer.token_to_id("[PAD]")
        self.tokenizer.enable_truncation(max_length=self.max_length)
        self.tokenizer.enable_padding(
            pad_id=pad_id if pad_id is not None else 0,
            pad_token="[PAD]",
        )

        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        sess_options.enable_mem_pattern = False
        sess_options.enable_cpu_mem_arena = False

        self.session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )
        self._input_names = {inp.name for inp in self.session.get_inputs()}

    def _encode_batch(self, texts: List[str]) -> np.ndarray:
        encoded = self.tokenizer.encode_batch(texts)
        input_ids = np.array([enc.ids for enc in encoded], dtype=np.int64)
        attention_mask = np.array([enc.attention_mask for enc in encoded], dtype=np.int64)

        ort_inputs = {}
        if "input_ids" in self._input_names:
            ort_inputs["input_ids"] = input_ids
        if "attention_mask" in self._input_names:
            ort_inputs["attention_mask"] = attention_mask
        if "token_type_ids" in self._input_names:
            ort_inputs["token_type_ids"] = np.array([enc.type_ids for enc in encoded], dtype=np.int64)

        outputs = self.session.run(None, ort_inputs)
        token_embeddings = outputs[0]

        if token_embeddings.ndim == 2:
            pooled = token_embeddings.astype(np.float32)
        else:
            mask_expanded = np.expand_dims(attention_mask, axis=-1).astype(np.float32)
            sum_embeddings = np.sum(token_embeddings * mask_expanded, axis=1)
            sum_mask = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
            pooled = (sum_embeddings / sum_mask).astype(np.float32)

        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        norms = np.clip(norms, a_min=1e-12, a_max=None)
        return (pooled / norms).astype(np.float32)

    def encode(
        self,
        texts: Union[str, List[str]],
        batch_size: int = 16,
        **kwargs,
    ) -> np.ndarray:
        """
        Encode a single string -> (384,) ndarray, or a sequence of strings -> (N, 384) ndarray.
        """
        is_single = isinstance(texts, str)
        text_list = [texts] if is_single else [str(t) if t is not None else "" for t in texts]

        if not text_list:
            return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

        chunk_size = max(1, int(batch_size or 16))
        batches = [
            self._encode_batch(text_list[i:i + chunk_size])
            for i in range(0, len(text_list), chunk_size)
        ]
        result = np.vstack(batches) if len(batches) > 1 else batches[0]
        return result[0] if is_single else result


def compute_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Pure-NumPy cosine similarity between two 1D or (1, D) vectors (avoids eager SciPy RAM overhead)."""
    a = np.asarray(vec_a, dtype=np.float32).ravel()
    b = np.asarray(vec_b, dtype=np.float32).ravel()
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-12:
        return 0.0
    return float(np.dot(a, b) / denom)


def get_embedding_model() -> ONNXMiniLMEmbedder:
    """Thread-safe singleton getter so the ONNX Runtime session is loaded once in memory."""
    global _embedder_instance
    if _embedder_instance is None:
        with _embedder_lock:
            if _embedder_instance is None:
                model_name = os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_REPO)
                _embedder_instance = ONNXMiniLMEmbedder(repo_id=model_name)
    return _embedder_instance

