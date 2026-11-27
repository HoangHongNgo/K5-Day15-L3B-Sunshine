"""Chỉ số vector + bỏ phiếu kNN theo điểm (spot).

Hai chế độ lưu:
- cục bộ: backend/data/index.npz
- Supabase (`remote`): bảng `embeddings` (vector float16 little-endian, bytea). Backend nạp hết vào
  bộ nhớ lúc khởi động rồi tự đồng bộ: thêm vector của người khác, bỏ vector đã bị xoá.
  MegaLoc 8448 chiều vượt giới hạn chỉ mục của pgvector nên kNN chạy trong bộ nhớ.
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

import numpy as np

CORRECTION_WEIGHT = 3
PAGE = 100          # số dòng vector mỗi lần tải (mỗi dòng ~34 KB hex)
INSERT_BATCH = 20


def _decode(hexstr: str, dim: int) -> np.ndarray:
    v = np.frombuffer(bytes.fromhex(hexstr[2:] if hexstr.startswith('\\x') else hexstr), dtype='<f2')
    if v.shape[0] != dim:
        raise ValueError(f'vector {v.shape[0]} chiều, cần {dim}')
    return v


def _encode(vec: np.ndarray) -> str:
    return '\\x' + np.asarray(vec, dtype='<f2').tobytes().hex()


class VectorIndex:
    def __init__(self, path: Path, dim: int, model_name: str, remote=None):
        self.path, self.dim, self.model_name = path, dim, model_name
        self.remote = remote
        self.lock = threading.Lock()
        self.vecs = np.zeros((0, dim), np.float16)
        self.labels = np.array([], dtype=object)
        self.source = np.array([], dtype=object)   # 'video' | 'correction'
        self.video = np.array([], dtype=object)    # id video nguồn (để thử leave-one-video-out)
        self.ids = np.array([], dtype=np.int64)    # id dòng trong Supabase (chỉ chế độ remote)
        self.last_sync = 0.0
        if remote is not None:
            self.sync()
        elif path.exists():
            z = np.load(path, allow_pickle=True)
            if str(z['model_name']) == model_name:
                self.vecs, self.labels = z['vecs'], z['labels']
                self.source, self.video = z['source'], z['video']
                self.ids = np.zeros(len(self.labels), dtype=np.int64)

    def __len__(self):
        return len(self.labels)

    # ---------- lưu cục bộ ----------
    def save(self):
        if self.remote is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.stem + '.tmp.npz')
        np.savez(tmp, vecs=self.vecs, labels=self.labels, source=self.source,
                 video=self.video, model_name=np.array(self.model_name))
        tmp.replace(self.path)

    # ---------- đồng bộ Supabase ----------
    def _remote_ids(self) -> list[int]:
        out, offset = [], 0
        while True:
            rows = self.remote.select('embeddings', {
                'select': 'id', 'model_name': f'eq.{self.model_name}', 'order': 'id.asc',
                'limit': '1000', 'offset': str(offset)})
            out += [r['id'] for r in rows]
            if len(rows) < 1000:
                return out
            offset += 1000

    def sync(self):
        """Khớp bộ nhớ với Supabase: nạp dòng mới, bỏ dòng đã bị xoá."""
        if self.remote is None:
            return
        remote_ids = self._remote_ids()
        with self.lock:
            have = set(self.ids.tolist())
            want = set(remote_ids)
            if have - want:
                keep = np.isin(self.ids, list(want))
                self._filter(keep)
            missing = sorted(want - have)
        for i in range(0, len(missing), 50):
            chunk = missing[i:i + 50]
            rows = self.remote.select('embeddings', {
                'select': 'id,spot,source,video,vec', 'id': f'in.({",".join(map(str, chunk))})',
                'order': 'id.asc'})
            with self.lock:
                self._append(np.stack([_decode(r['vec'], self.dim) for r in rows]),
                             [r['spot'] for r in rows], [r['source'] for r in rows],
                             [r['video'] for r in rows], [r['id'] for r in rows])
        self.last_sync = time.monotonic()

    def sync_if_stale(self, seconds: float = 20):
        if self.remote is not None and time.monotonic() - self.last_sync > seconds:
            try:
                self.sync()
            except Exception:                 # mất mạng thì vẫn dùng dữ liệu đang có trong bộ nhớ
                self.last_sync = time.monotonic()

    # ---------- thao tác trong bộ nhớ ----------
    def _filter(self, keep):
        self.vecs, self.labels = self.vecs[keep], self.labels[keep]
        self.source, self.video, self.ids = self.source[keep], self.video[keep], self.ids[keep]

    def _append(self, vecs, labels, sources, videos, ids):
        self.vecs = np.concatenate([self.vecs, np.asarray(vecs).astype(np.float16)])
        self.labels = np.concatenate([self.labels, np.array(labels, dtype=object)])
        self.source = np.concatenate([self.source, np.array(sources, dtype=object)])
        self.video = np.concatenate([self.video, np.array(videos, dtype=object)])
        self.ids = np.concatenate([self.ids, np.array(ids, dtype=np.int64)])

    def add(self, vecs: np.ndarray, label: str, source: str, video: str):
        n = len(vecs)
        new_ids = [0] * n
        if self.remote is not None:
            rows = [{'spot': label, 'source': source, 'video': video, 'model_name': self.model_name,
                     'vec': _encode(vecs[i])} for i in range(n)]
            new_ids = []
            for i in range(0, n, INSERT_BATCH):
                res = self.remote.insert('embeddings', rows[i:i + INSERT_BATCH], returning='id')
                new_ids += [r['id'] for r in res]
        with self.lock:
            self._append(vecs, [label] * n, [source] * n, [video] * n, new_ids)
            self.save()

    def remove(self, label: str = None, video: str = None):
        params = {'model_name': f'eq.{self.model_name}'}
        if label is not None:
            params['spot'] = f'eq.{label}'
        if video is not None:
            params['video'] = f'eq.{video}'
        if self.remote is not None and len(params) > 1:
            self.remote.delete('embeddings', params)
        with self.lock:
            keep = np.ones(len(self), bool)
            if label is not None:
                keep &= self.labels != label
            if video is not None:
                keep &= self.video != video
            removed = int((~keep).sum())
            self._filter(keep)
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
