"""Unit and API tests for club events & custom mascots persistence (Supabase & local fallback)."""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

# Keep unit tests fully offline even if root .env has live Supabase credentials.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""

BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app import supa  # noqa: E402

supa.URL = ""
supa.KEY = ""
supa.ENABLED = False

from fastapi.testclient import TestClient  # noqa: E402

SAMPLE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="


class FakeRemoteSupa:
    """In-memory fake matching app.supa.Supa table methods."""

    def __init__(self):
        self.tables: dict[str, dict[str, dict]] = {
            "club_events": {},
            "club_mascots": {},
            "club_accounts": {},
            "club_sessions": {},
        }

    def _pk(self, table: str) -> str:
        return "token_hash" if table == "club_sessions" else "id"

    def _matches(self, row: dict, params: dict) -> bool:
        for k, v in params.items():
            if k in ("select", "order", "limit", "on_conflict"):
                continue
            if isinstance(v, str) and v.startswith("eq.") and str(row.get(k, "")) != v[3:]:
                return False
        return True

    def select(self, table: str, params: dict) -> list[dict]:
        return [dict(r) for r in self.tables[table].values() if self._matches(r, params)]

    def insert(self, table: str, rows: list[dict], returning=None, on_conflict=None):
        pk = self._pk(table)
        for r in rows:
            self.tables[table][r[pk]] = dict(r)
        return rows if returning else None

    def delete(self, table: str, params: dict):
        to_del = [k for k, r in self.tables[table].items() if self._matches(r, params)]
        for k in to_del:
            self.tables[table].pop(k, None)


class TestEventsStore(unittest.TestCase):
    def test_supabase_mode_upserts_lists_and_deletes_events_and_mascots(self):
        from app import events_store

        fake = FakeRemoteSupa()
        store = events_store.EventsStore(pathlib.Path(tempfile.mkdtemp()) / "events.json", remote=fake)

        mascot = {
            "id": "momo-1",
            "name": "Momo",
            "kind": "image",
            "image": SAMPLE_PNG,
            "brief": "Chú chim cánh cụt đeo tai nghe",
        }
        saved_m = store.save_mascot(mascot)
        self.assertEqual(saved_m["id"], "momo-1")
        self.assertIn("momo-1", fake.tables["club_mascots"])

        event = {
            "id": "ev-robotics",
            "title": "Robotics Open Lab",
            "club": "CLB Robotics",
            "description": "Gặp gỡ thành viên CLB.",
            "locationId": "bA",
            "startsAt": "2026-12-01T14:00:00+07:00",
            "endsAt": "2026-12-01T16:00:00+07:00",
            "mascotId": "momo-1",
            "status": "published",
            "demo": False,
        }
        saved_e = store.save_event(event, valid_locations={"bA", "bB"})
        self.assertEqual(saved_e["locationId"], "bA")
        self.assertEqual(fake.tables["club_events"]["ev-robotics"]["location_id"], "bA")

        loaded = store.list_all()
        self.assertEqual(loaded["storage"], "supabase")
        self.assertEqual([m["id"] for m in loaded["mascots"]], ["momo-1"])
        self.assertEqual([e["id"] for e in loaded["events"]], ["ev-robotics"])

        store.delete_event("ev-robotics")
        store.delete_mascot("momo-1")
        self.assertEqual(store.list_all()["events"], [])
        self.assertEqual(store.list_all()["mascots"], [])

    def test_validation_rejects_svg_mascots_and_invalid_published_events(self):
        from app import events_store

        store = events_store.EventsStore(pathlib.Path(tempfile.mkdtemp()) / "events.json", remote=None)

        with self.assertRaises(events_store.ValidationError):
            store.save_mascot({
                "id": "bad-svg",
                "name": "Bad",
                "kind": "image",
                "image": "data:image/svg+xml;base64,PHN2Zz4=",
            })

        with self.assertRaises(events_store.ValidationError):
            store.save_mascot({
                "id": "vini",
                "name": "Override Vini",
                "kind": "image",
                "image": SAMPLE_PNG,
            })

        # Draft allows missing schedule/location
        draft = store.save_event({
            "id": "draft-1",
            "title": "Nháp đầu tiên",
            "club": "",
            "description": "",
            "locationId": "",
            "startsAt": "",
            "endsAt": "",
            "mascotId": "vini",
            "status": "draft",
        }, valid_locations={"bA"})
        self.assertEqual(draft["status"], "draft")

        # Published requires known location and endsAt > startsAt
        with self.assertRaises(events_store.ValidationError):
            store.save_event({
                "id": "pub-bad-loc",
                "title": "Sự kiện lỗi địa điểm",
                "club": "CLB",
                "description": "Mô tả",
                "locationId": "unknown-room",
                "startsAt": "2026-12-01T14:00:00+07:00",
                "endsAt": "2026-12-01T16:00:00+07:00",
                "mascotId": "vini",
                "status": "published",
            }, valid_locations={"bA"})

        with self.assertRaises(events_store.ValidationError):
            store.save_event({
                "id": "pub-bad-time",
                "title": "Sự kiện lỗi giờ",
                "club": "CLB",
                "description": "Mô tả",
                "locationId": "bA",
                "startsAt": "2026-12-01T16:00:00+07:00",
                "endsAt": "2026-12-01T14:00:00+07:00",
                "mascotId": "vini",
                "status": "published",
            }, valid_locations={"bA"})


class TestEventsEndpoints(unittest.TestCase):
    def test_events_and_club_mascots_http_endpoints(self):
        from app import auth_store, events_store, main

        fake = FakeRemoteSupa()
        tmp_dir = pathlib.Path(tempfile.mkdtemp())
        test_store = events_store.EventsStore(tmp_dir / "events.json", remote=fake)
        test_auth = auth_store.AuthStore(tmp_dir / "auth.json", remote=fake)

        class FakeGraph:
            rooms = [{"id": "bA", "node": "nA", "name": "Tòa A"}]
            nodes = {"nA": {"id": "nA", "label": "Tòa A"}}

        with (
            patch.object(main, "events_store", test_store),
            patch.object(main, "auth_store", test_auth),
            patch.object(main, "graph", return_value=FakeGraph()),
        ):
            client = TestClient(main.app)

            r = client.get("/api/events")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["storage"], "supabase")

            reg = client.post("/api/auth/register", json={
                "username": "clb_music",
                "password": "password123",
                "displayName": "CLB Âm nhạc",
                "clubName": "CLB Âm nhạc",
            })
            self.assertEqual(reg.status_code, 200)
            headers = {"Authorization": f"Bearer {reg.json()['token']}"}

            r = client.put("/api/club-mascots/momo-1", json={
                "id": "momo-1",
                "name": "Momo",
                "kind": "image",
                "image": SAMPLE_PNG,
            }, headers=headers)
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()["ok"])

            r = client.put("/api/events/ev-1", json={
                "id": "ev-1",
                "title": "Đêm nhạc CLB",
                "club": "CLB Âm nhạc",
                "description": "Giao lưu âm nhạc ngoài trời.",
                "locationId": "bA",
                "startsAt": "2026-12-02T18:00:00+07:00",
                "endsAt": "2026-12-02T20:00:00+07:00",
                "mascotId": "momo-1",
                "status": "published",
            }, headers=headers)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["event"]["id"], "ev-1")

            r_bad = client.put("/api/events/ev-bad", json={
                "id": "ev-bad",
                "title": "Sai địa điểm",
                "club": "CLB",
                "description": "Mô tả",
                "locationId": "does-not-exist",
                "startsAt": "2026-12-02T18:00:00+07:00",
                "endsAt": "2026-12-02T20:00:00+07:00",
                "mascotId": "vini",
                "status": "published",
            }, headers=headers)
            self.assertEqual(r_bad.status_code, 422)
            self.assertEqual(r_bad.json()["detail"]["code"], "invalid_event")

            r_list = client.get("/api/events")
            self.assertEqual(len(r_list.json()["events"]), 1)
            self.assertEqual(len(r_list.json()["mascots"]), 1)

            self.assertEqual(client.delete("/api/events/ev-1", headers=headers).status_code, 200)
            self.assertEqual(client.delete("/api/club-mascots/momo-1", headers=headers).status_code, 200)
            self.assertEqual(client.get("/api/events").json()["events"], [])


if __name__ == "__main__":
    unittest.main()
