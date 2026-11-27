"""MegaLoc (gmberton/MegaLoc, MIT): ảnh -> vector 8448 chiều, L2-normalize.

Tiền xử lý theo cách MegaLoc được huấn luyện: resize vuông 322x322 (không giữ tỉ lệ),
chuẩn hoá ImageNet mean/std. Model nạp lười ở lần gọi đầu.
"""
from __future__ import annotations

import os
import threading

import numpy as np
from PIL import Image

from .env import load_root_env
from .store import BACKEND

load_root_env()
if not os.environ.get('TORCH_HOME'):
    os.environ['TORCH_HOME'] = str(BACKEND / '.torch')
if not os.environ.get('HF_HOME'):
    os.environ['HF_HOME'] = str(BACKEND / '.torch' / 'hf')

SIDE = 322
DIM = 8448
MODEL_NAME = 'megaloc-squash322'
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class Embedder:
    def __init__(self):
        self._model = None
        self._lock = threading.Lock()
        self.device = None

    def _load(self):
        import torch
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        model = torch.hub.load('gmberton/MegaLoc', 'get_trained_model', trust_repo=True)
        self._model = model.to(self.device).eval()
        self._torch = torch

    @property
    def loaded(self):
        return self._model is not None

    def __call__(self, images: list[Image.Image], batch: int = 16) -> np.ndarray:
        with self._lock:
            if self._model is None:
                self._load()
            torch = self._torch
            out = []
            with torch.inference_mode():
                for i in range(0, len(images), batch):
                    arr = np.stack([
                        (np.asarray(im.convert('RGB').resize((SIDE, SIDE), Image.BICUBIC),
                                    dtype=np.float32) / 255.0 - MEAN) / STD
                        for im in images[i:i + batch]])
                    x = torch.from_numpy(arr).permute(0, 3, 1, 2).to(self.device)
                    y = self._model(x)
                    y = y[0] if isinstance(y, tuple) else y
                    out.append(y.float().cpu().numpy())
        v = np.concatenate(out) if out else np.zeros((0, DIM), np.float32)
        return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


embedder = Embedder()
