"""Upload video thu thập: cắt khung + embed chạy nền, client poll trạng thái (không giữ 1 request dài)."""
from __future__ import annotations

import os
import pathlib
import sys
import time
import unittest
from unittest.mock import patch

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""

BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import main  # noqa: E402


class FakeIndex:
    def __init__(self):
        self.added = []

    def add(self, vecs, label, source, video):
        self.added.append((len(vecs), label, source, video))

    def counts(self):
        return {}

    def __len__(self):
        return sum(a[0] for a in self.added)


def fake_frames(path, n):
    return [Image.new("RGB", (64, 64), (i, i, i)) for i in range(10)], 10


def wait_job(client, job_id, timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/api/spots/jobs/{job_id}")
        assert r.status_code == 200, r.text
        j = r.json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.05)
    raise AssertionError("job không kết thúc")


class VideoJobTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.node = next(iter(main.graph().nodes))
        self.index = FakeIndex()

    def post(self):
        return self.client.post(f"/api/spots/{self.node}/video",
                                files={"video": ("v.mp4", b"x" * 1000, "video/mp4")})

    def test_returns_job_immediately_then_done(self):
        embed = lambda imgs: np.ones((len(imgs), main.DIM), np.float32)  # noqa: E731
        with patch.object(main, "_extract_frames", fake_frames), \
             patch.object(main, "embedder", embed), patch.object(main, "index", self.index):
            r = self.post()
            self.assertEqual(r.status_code, 202)
            job = wait_job(self.client, r.json()["job"])
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["result"]["frames"], 10)
        self.assertEqual(self.index.added[0][:3], (10, self.node, "video"))

    def test_embed_failure_is_reported_not_lost(self):
        def boom(imgs):
            raise RuntimeError("CUDA out of memory")
        with patch.object(main, "_extract_frames", fake_frames), \
             patch.object(main, "embedder", boom), patch.object(main, "index", self.index):
            job = wait_job(self.client, self.post().json()["job"])
        self.assertEqual(job["status"], "error")
        self.assertIn("CUDA out of memory", job["message"])
        self.assertEqual(self.index.added, [])

    def test_unknown_job_404(self):
        self.assertEqual(self.client.get("/api/spots/jobs/nope").status_code, 404)


if __name__ == "__main__":
    unittest.main()
