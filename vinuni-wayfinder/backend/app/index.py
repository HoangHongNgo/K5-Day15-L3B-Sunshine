"""Chỉ số vector (index.npz) + bỏ phiếu kNN theo điểm (spot)."""
from __future__ import annotations

import threading
from pathlib import Path

import numpy as np

CORRECTION_WEIGHT = 3


class VectorIndex:
    def __init__(self, path: Path, dim: int, model_name: str):
        self.path, self.dim, self.model_name = path, dim, model_name
        self.lock = threading.Lock()
        self.vecs = np.zeros((0, dim), np.float16)
        self.labels = np.array([], dtype=object)
        self.source = np.array([], dtype=object)   # 'video' | 'correction'
        self.video = np.array([], dtype=object)    # id video nguồn (để thử leave-one-video-out)
        if path.exists():
            z = np.load(path, allow_pickle=True)
            if str(z['model_name']) == model_name:
                self.vecs, self.labels = z['vecs'], z['labels']
                self.source, self.video = z['source'], z['video']

    def __len__(self):
        return len(self.labels)

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.stem + '.tmp.npz')
        np.savez(tmp, vecs=self.vecs, labels=self.labels, source=self.source,
                 video=self.video, model_name=np.array(self.model_name))
        tmp.replace(self.path)

    def add(self, vecs: np.ndarray, label: str, source: str, video: str):
        with self.lock:
            n = len(vecs)
            self.vecs = np.concatenate([self.vecs, vecs.astype(np.float16)])
            self.labels = np.concatenate([self.labels, np.array([label] * n, dtype=object)])
            self.source = np.concatenate([self.source, np.array([source] * n, dtype=object)])
            self.video = np.concatenate([self.video, np.array([video] * n, dtype=object)])
            self.save()

    def remove(self, label: str = None, video: str = None):
        with self.lock:
            keep = np.ones(len(self), bool)
            if label is not None:
                keep &= self.labels != label
            if video is not None:
                keep &= self.video != video
            removed = int((~keep).sum())
            self.vecs, self.labels = self.vecs[keep], self.labels[keep]
            self.source, self.video = self.source[keep], self.video[keep]
            self.save()
            return removed

    def counts(self):
        out = {}
        for lab, src, vid in zip(self.labels, self.source, self.video):
            c = out.setdefault(lab, {'frames': 0, 'corrections': 0, 'videos': set()})
            if src == 'correction':
                c['corrections'] += 1
            else:
                c['frames'] += 1
                c['videos'].add(vid)
        return {k: {**v, 'videos': len(v['videos'])} for k, v in out.items()}

    def vote(self, q: np.ndarray, k: int = 10, exclude_video: str = None):
        """Trả về (tally theo spot, sim cao nhất). Correction có trọng số cao hơn và,
        nếu là láng giềng gần nhất, được ưu tiên."""
        with self.lock:
            if len(self) == 0:
                return {}, None
            sims = self.vecs.astype(np.float32) @ q.astype(np.float32)
            if exclude_video is not None:
                sims[self.video == exclude_video] = -2
            top = np.argsort(-sims)[:min(k, len(sims))]
            tally = {}
            for rank, i in enumerate(top):
                lab, src = self.labels[i], self.source[i]
                t = tally.setdefault(lab, {'votes': 0.0, 'sim': 0.0, 'nearest': False})
                t['votes'] += CORRECTION_WEIGHT if src == 'correction' else 1
                t['sim'] += float(sims[i])
                if rank == 0 and src == 'correction':
                    t['nearest'] = True
            return tally, float(sims[top[0]])
