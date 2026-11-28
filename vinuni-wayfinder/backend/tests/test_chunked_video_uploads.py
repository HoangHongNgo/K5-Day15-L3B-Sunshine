"""Regression tests for chunked spot video uploads (<= 2 MiB binary chunks over /api/spots)."""
from __future__ import annotations

import hashlib
import os
import pathlib
import sys
import tempfile
import threading
import time
import uuid
from unittest.mock import patch

import pytest

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""

BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import main  # noqa: E402
from app.video_uploads import (  # noqa: E402
    CHUNK_SIZE,
    MAX_ACTIVE_UPLOADS,
    MAX_UPLOAD,
    UploadError,
    VideoUploadStore,
)


class FakeIndex:
    def __init__(self):
        self.added = []

    def add(self, vecs, label, source, video):
        self.added.append((len(vecs), label, source, video))

    def counts(self):
        return {}

    def __len__(self):
        return sum(a[0] for a in self.added)


def wait_job(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/api/spots/jobs/{job_id}")
        assert r.status_code == 200, r.text
        j = r.json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def make_synthetic_payload(size: int) -> bytes:
    """Deterministic pseudo-random bytes without reading real media."""
    pattern = bytes(range(251))
    reps = (size // len(pattern)) + 1
    return (pattern * reps)[:size]


# ---------------- Unit tests for VideoUploadStore ----------------

def test_store_validates_upload_id_size_and_suffix(tmp_path):
    store = VideoUploadStore(chunk_size=1024, max_upload=MAX_UPLOAD, temp_dir=tmp_path)

    with pytest.raises(UploadError) as exc:
        store.init_upload("c_door", "../escape", 100)
    assert exc.value.status == 400

    with pytest.raises(UploadError) as exc:
        store.init_upload("c_door", "not-a-uuid", 100)
    assert exc.value.status == 400

    for bad_size in (0, -1, True, "100", None):
        with pytest.raises(UploadError) as exc:
            store.init_upload("c_door", str(uuid.uuid4()), bad_size)
        assert exc.value.status == 400

    with pytest.raises(UploadError) as exc:
        store.init_upload("c_door", str(uuid.uuid4()), MAX_UPLOAD + 1)
    assert exc.value.status == 413

    # Exact 200 MiB boundary is accepted
    uid = str(uuid.uuid4())
    ack = store.init_upload("c_door", uid, MAX_UPLOAD, "../../evil.weirdext!")
    assert ack["chunkSize"] == 1024
    assert ack["parts"] == MAX_UPLOAD // 1024
    staged_files = list(tmp_path.iterdir())
    assert len(staged_files) == 1
    assert staged_files[0].suffix == ".mp4"
    store.cleanup_all()
    assert list(tmp_path.iterdir()) == []


def test_store_prunes_abandoned_uploads_and_deletes_staging_files(tmp_path):
    now = [1000.0]
    store = VideoUploadStore(
        chunk_size=64,
        max_upload=1024,
        ttl_seconds=60.0,
        temp_dir=tmp_path,
        clock=lambda: now[0],
    )
    uid = str(uuid.uuid4())
    store.init_upload("c_door", uid, 128, "clip.mov")
    store.put_chunk("c_door", uid, 0, b"a" * 64, lambda n, p: "job1")
    assert len(list(tmp_path.iterdir())) == 1

    # Advance past inactivity TTL
    now[0] += 61.0
    pruned = store.prune()
    assert pruned == 1
    assert list(tmp_path.iterdir()) == []

    with pytest.raises(UploadError) as exc:
        store.put_chunk("c_door", uid, 1, b"b" * 64, lambda n, p: "job1")
    assert exc.value.status == 404


def test_store_caps_active_uploads_and_frees_slots_on_completion_or_expiry(tmp_path):
    now = [100.0]
    store = VideoUploadStore(
        chunk_size=64,
        max_upload=1024,
        max_active=MAX_ACTIVE_UPLOADS,
        ttl_seconds=30.0,
        temp_dir=tmp_path,
        clock=lambda: now[0],
    )
    uids = [str(uuid.uuid4()) for _ in range(MAX_ACTIVE_UPLOADS)]
    for uid in uids:
        store.init_upload("c_door", uid, 32)

    # 9th active upload is rejected
    with pytest.raises(UploadError) as exc:
        store.init_upload("c_door", str(uuid.uuid4()), 32)
    assert exc.value.status == 429

    # Completing one frees an active slot while keeping completed ack
    status, ack = store.put_chunk("c_door", uids[0], 0, b"z" * 32, lambda n, p: "job_done")
    assert status == 202 and ack["job"] == "job_done"
    new_uid = str(uuid.uuid4())
    store.init_upload("c_door", new_uid, 32)

    # Expiring all active uploads also frees slots
    now[0] += 31.0
    store.init_upload("c_door", str(uuid.uuid4()), 32)
    store.cleanup_all()


def test_store_serializes_concurrent_matching_final_chunks(tmp_path):
    store = VideoUploadStore(chunk_size=64, max_upload=1024, temp_dir=tmp_path)
    uid = str(uuid.uuid4())
    payload = make_synthetic_payload(100)
    store.init_upload("c_door", uid, len(payload))
    store.put_chunk("c_door", uid, 0, payload[:64], lambda n, p: "unexpected")

    enqueued = []
    barrier = threading.Barrier(2)
    results = []
    errors = []

    def enqueue(node_id: str, path: str) -> str:
        data = pathlib.Path(path).read_bytes()
        enqueued.append((node_id, data))
        pathlib.Path(path).unlink(missing_ok=True)
        return "job_once"

    def worker():
        try:
            barrier.wait(timeout=2)
            results.append(store.put_chunk("c_door", uid, 1, payload[64:], enqueue))
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert not errors
    assert len(enqueued) == 1
    assert enqueued[0] == ("c_door", payload)
    assert len(results) == 2
    assert all(status == 202 and body["job"] == "job_once" for status, body in results)


def test_store_bounds_completed_acknowledgements(tmp_path):
    now = [10.0]
    store = VideoUploadStore(
        chunk_size=32,
        max_upload=1024,
        completed_ttl_seconds=50.0,
        max_completed=2,
        temp_dir=tmp_path,
        clock=lambda: now[0],
    )
    uids = [str(uuid.uuid4()) for _ in range(3)]
    for i, uid in enumerate(uids):
        store.init_upload("c_door", uid, 16)
        store.put_chunk("c_door", uid, 0, bytes([i]) * 16, lambda n, p, idx=i: f"job_{idx}")

    # Oldest completed ack (uids[0]) was evicted by max_completed=2
    with pytest.raises(UploadError) as exc:
        store.put_chunk("c_door", uids[0], 0, bytes([0]) * 16, lambda n, p: "again")
    assert exc.value.status == 404

    # Latest completed ack is still available before TTL
    status, ack = store.put_chunk("c_door", uids[2], 0, bytes([2]) * 16, lambda n, p: "again")
    assert status == 202 and ack["job"] == "job_2"

    # After completed TTL, it is pruned too
    now[0] += 51.0
    with pytest.raises(UploadError) as exc:
        store.put_chunk("c_door", uids[2], 0, bytes([2]) * 16, lambda n, p: "again")
    assert exc.value.status == 404


# ---------------- API integration tests ----------------

@pytest.fixture()
def api_env(tmp_path):
    store = VideoUploadStore(chunk_size=CHUNK_SIZE, max_upload=MAX_UPLOAD, temp_dir=tmp_path)
    fake_index = FakeIndex()
    client = TestClient(main.app)
    node = next(iter(main.graph().nodes))
    with patch.object(main, "video_uploads", store), patch.object(main, "index", fake_index):
        yield client, node, store, fake_index, tmp_path
    store.cleanup_all()


def test_chunked_upload_multi_part_byte_fidelity_and_job_completion(api_env):
    client, node, _store, fake_index, tmp_path = api_env
    # 5 MiB + 123 bytes -> 3 chunks (2 MiB, 2 MiB, 1 MiB + 123 B)
    payload = make_synthetic_payload(5 * 1024 * 1024 + 123)
    expected_sha = hashlib.sha256(payload).hexdigest()
    upload_id = str(uuid.uuid4())
    captured_hashes = []

    def fake_extract(path: str, n_out: int):
        raw = pathlib.Path(path).read_bytes()
        captured_hashes.append(hashlib.sha256(raw).hexdigest())
        return [Image.new("RGB", (64, 64), (i, i, i)) for i in range(8)], 8

    embed = lambda imgs: np.ones((len(imgs), main.DIM), np.float32)  # noqa: E731

    with patch.object(main, "_extract_frames", fake_extract), patch.object(main, "embedder", embed):
        init_res = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}",
            json={"size": len(payload), "filename": "hallway.mp4"},
        )
        assert init_res.status_code == 200, init_res.text
        init_body = init_res.json()
        assert init_body["chunkSize"] == CHUNK_SIZE
        assert init_body["parts"] == 3
        assert str(tmp_path) not in init_res.text

        # Equivalent init retry succeeds idempotently
        retry_init = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}",
            json={"size": len(payload), "filename": "hallway.mp4"},
        )
        assert retry_init.status_code == 200
        assert retry_init.json()["chunkSize"] == CHUNK_SIZE

        chunk0 = payload[:CHUNK_SIZE]
        chunk1 = payload[CHUNK_SIZE : 2 * CHUNK_SIZE]
        chunk2 = payload[2 * CHUNK_SIZE :]

        r0 = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
            content=chunk0,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r0.status_code == 200, r0.text
        assert r0.json()["received"] == len(chunk0)
        assert "job" not in r0.json()
        assert str(tmp_path) not in r0.text

        # Matching retry of non-final chunk does not duplicate bytes
        r0_dup = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
            content=chunk0,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r0_dup.status_code == 200
        assert r0_dup.json()["received"] == len(chunk0)

        r1 = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/1",
            content=chunk1,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["received"] == len(chunk0) + len(chunk1)

        r2 = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/2",
            content=chunk2,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r2.status_code == 202, r2.text
        job_id = r2.json()["job"]
        assert str(tmp_path) not in r2.text

        # Simulated final response loss: matching retry returns same job without enqueuing again
        r2_retry = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/2",
            content=chunk2,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r2_retry.status_code == 202, r2_retry.text
        assert r2_retry.json()["job"] == job_id

        # Conflicting retry of final chunk reports 409
        r2_bad = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/2",
            content=bytes([chunk2[0] ^ 0xFF]) + chunk2[1:],
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r2_bad.status_code == 409

        job = wait_job(client, job_id)

    assert job["status"] == "done"
    assert job["result"]["frames"] == 8
    assert captured_hashes == [expected_sha]
    assert len(fake_index.added) == 1
    assert fake_index.added[0][:3] == (8, node, "video")
    # Staging temp file was unlinked by background worker
    assert list(tmp_path.iterdir()) == []


def test_chunked_upload_validation_gaps_conflicts_and_node_binding(api_env):
    client, node, _store, _fake_index, _tmp_path = api_env
    upload_id = str(uuid.uuid4())

    # Unknown node -> 404
    r = client.put(f"/api/spots/nonexistent_node/video/uploads/{upload_id}", json={"size": 100})
    assert r.status_code == 404

    # Oversized (> 200 MiB) -> 413
    r = client.put(f"/api/spots/{node}/video/uploads/{upload_id}", json={"size": MAX_UPLOAD + 1})
    assert r.status_code == 413

    # Invalid size (0) -> 400
    r = client.put(f"/api/spots/{node}/video/uploads/{upload_id}", json={"size": 0})
    assert r.status_code == 400

    # Initialize valid 2-part upload (2 MiB + 10 bytes)
    total = CHUNK_SIZE + 10
    r = client.put(f"/api/spots/{node}/video/uploads/{upload_id}", json={"size": total, "filename": "v.mp4"})
    assert r.status_code == 200

    # Conflicting init metadata -> 409
    r = client.put(f"/api/spots/{node}/video/uploads/{upload_id}", json={"size": total + 1, "filename": "v.mp4"})
    assert r.status_code == 409

    # Wrong content-type -> 415
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
        content=b"abc",
        headers={"Content-Type": "text/plain"},
    )
    assert r.status_code == 415

    # Chunk exceeding 2 MiB bound -> 413
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
        content=b"x" * (CHUNK_SIZE + 1),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 413

    # Impossible part indices -> 400
    for bad_part in (-1, 2, 99):
        r = client.put(
            f"/api/spots/{node}/video/uploads/{upload_id}/chunks/{bad_part}",
            content=b"x" * 10,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r.status_code == 400

    # Gap (part 1 before part 0) -> 409
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/1",
        content=b"y" * 10,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 409

    # Wrong non-final chunk length -> 400
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
        content=b"x" * 100,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 400

    # Send valid part 0
    chunk0 = make_synthetic_payload(CHUNK_SIZE)
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
        content=chunk0,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 200

    # Conflicting retry of part 0 -> 409
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/0",
        content=bytes([chunk0[0] ^ 1]) + chunk0[1:],
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 409

    # Wrong final chunk length -> 400
    r = client.put(
        f"/api/spots/{node}/video/uploads/{upload_id}/chunks/1",
        content=b"z" * 9,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 400

    # Bind upload ID to node: trying to use the same upload_id on another node -> 409
    other_graph = main.SiteGraph(
        {
            "maps": [
                {
                    "id": "campus",
                    "name": "Campus",
                    "kind": "outdoor",
                    "width": 1000,
                    "height": 1000,
                    "metersPerPx": 0.4,
                    "anchors": [],
                }
            ],
            "nodes": [
                {"id": node, "map": "campus", "x": 10, "y": 10, "type": "entrance", "label": "A"},
                {"id": "other_node", "map": "campus", "x": 20, "y": 20, "type": "entrance", "label": "B"},
            ],
            "edges": [],
            "rooms": [],
        }
    )
    with patch.object(main, "graph", return_value=other_graph):
        r_init = client.put(
            f"/api/spots/other_node/video/uploads/{upload_id}",
            json={"size": total, "filename": "v.mp4"},
        )
        assert r_init.status_code == 409
        r_chunk = client.put(
            f"/api/spots/other_node/video/uploads/{upload_id}/chunks/1",
            content=b"z" * 10,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert r_chunk.status_code == 409


def test_legacy_multipart_upload_still_works_and_cleans_up_on_oversize(api_env):
    client, node, _store, fake_index, _tmp_path = api_env

    def fake_extract(path: str, n_out: int):
        return [Image.new("RGB", (64, 64), (i, i, i)) for i in range(6)], 6

    embed = lambda imgs: np.ones((len(imgs), main.DIM), np.float32)  # noqa: E731

    with patch.object(main, "_extract_frames", fake_extract), patch.object(main, "embedder", embed):
        r = client.post(
            f"/api/spots/{node}/video",
            files={"video": ("legacy.mp4", b"m" * 2048, "video/mp4")},
        )
        assert r.status_code == 202
        job = wait_job(client, r.json()["job"])
    assert job["status"] == "done"
    assert job["result"]["frames"] == 6
    assert fake_index.added[0][:3] == (6, node, "video")

    # Oversized legacy upload returns 413 and does not leak temp file
    created = []
    real_ntf = tempfile.NamedTemporaryFile

    def tracking_ntf(*args, **kwargs):
        f = real_ntf(*args, **kwargs)
        created.append(pathlib.Path(f.name))
        return f

    with patch.object(main, "MAX_UPLOAD", 1024), patch.object(tempfile, "NamedTemporaryFile", tracking_ntf):
        r = client.post(
            f"/api/spots/{node}/video",
            files={"video": ("huge.mp4", b"h" * 2048, "video/mp4")},
        )
    assert r.status_code == 413
    assert created and all(not p.exists() for p in created)
