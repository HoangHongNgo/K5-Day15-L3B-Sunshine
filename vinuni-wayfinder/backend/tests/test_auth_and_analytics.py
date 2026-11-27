"""TDD tests for BTC Auth (Supabase + local JSON), RBAC ownership, multi-stop events, and anonymous analytics."""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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

SAMPLE_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class FakeRemoteSupa:
    """In-memory fake matching app.supa.Supa table & RPC methods for offline tests."""

    def __init__(self):
        self.tables: dict[str, list[dict]] = {
            "club_accounts": [],
            "club_sessions": [],
            "club_events": [],
            "club_mascots": [],
        }

    def _pk_field(self, table: str) -> str:
        return "token_hash" if table == "club_sessions" else "id"

    def _match(self, row: dict, params: dict) -> bool:
        for k, v in params.items():
            if k in ("select", "order", "limit", "on_conflict"):
                continue
            if isinstance(v, str) and v.startswith("eq."):
                if str(row.get(k, "")) != v[3:]:
                    return False
        return True

    def select(self, table: str, params: dict) -> list[dict]:
        rows = [dict(r) for r in self.tables[table] if self._match(r, params)]
        return rows

    def insert(self, table: str, rows: list[dict], returning=None, on_conflict=None):
        pk = self._pk_field(table)
        inserted = []
        for r in rows:
            item = dict(r)
            existing_idx = next(
                (i for i, cur in enumerate(self.tables[table]) if cur.get(pk) == item.get(pk)),
                None,
            )
            if existing_idx is not None:
                self.tables[table][existing_idx] = item
            else:
                self.tables[table].append(item)
            inserted.append(item)
        return inserted if returning else None

    def delete(self, table: str, params: dict):
        self.tables[table] = [r for r in self.tables[table] if not self._match(r, params)]

    def rpc(self, fn: str, args: dict):
        if fn != "increment_event_metric":
            raise AssertionError(f"Unexpected rpc: {fn}")
        event_id = args["p_event_id"]
        metric = args["p_metric"]
        for row in self.tables["club_events"]:
            if row.get("id") == event_id:
                if metric == "view":
                    row["views_count"] = int(row.get("views_count") or 0) + 1
                elif metric == "navigation":
                    row["navigations_count"] = int(row.get("navigations_count") or 0) + 1
                else:
                    raise ValueError(f"invalid_metric: {metric}")
                return {
                    "viewsCount": int(row.get("views_count") or 0),
                    "navigationsCount": int(row.get("navigations_count") or 0),
                }
        return None


class TestAuthStore(unittest.TestCase):
    def test_register_login_session_logout_and_password_hash_in_local_mode(self):
        from app import auth_store

        path = pathlib.Path(tempfile.mkdtemp()) / "auth.json"
        store = auth_store.AuthStore(path, remote=None)

        res = store.register("robotics.club", "secret123", "CLB Robotics", "VinUni Robotics")
        acc = res["account"]
        token = res["token"]
        self.assertEqual(acc["username"], "robotics.club")
        self.assertEqual(acc["displayName"], "CLB Robotics")
        self.assertEqual(acc["clubName"], "VinUni Robotics")
        self.assertEqual(acc["role"], "clb")
        self.assertNotIn("password_hash", acc)
        self.assertNotIn("passwordHash", acc)
        self.assertTrue(len(token) >= 24)

        # Stored password hash must use pbkdf2_sha256 format, never plaintext
        raw_text = path.read_text(encoding="utf-8")
        self.assertIn("pbkdf2_sha256$", raw_text)
        self.assertNotIn("secret123", raw_text)
        # Stored session must store sha256 hash, never raw token
        self.assertNotIn(token, raw_text)

        # Duplicate username raises ConflictError
        with self.assertRaises(auth_store.ConflictError):
            store.register("robotics.club", "another123", "Other", "Other Club")

        # Cannot self-register admin_truong publicly
        with self.assertRaises(auth_store.ValidationError):
            store.register("hacker_admin", "secret123", "Fake Admin", "Fake", role="admin_truong")

        # Invalid username or short password raises ValidationError
        with self.assertRaises(auth_store.ValidationError):
            store.register("ab", "secret123", "Short", "Club")
        with self.assertRaises(auth_store.ValidationError):
            store.register("valid_user", "12345", "Short Pass", "Club")

        # Session lookup returns account without password_hash
        session_acc = store.get_session(token)
        self.assertEqual(session_acc["id"], acc["id"])
        self.assertNotIn("password_hash", session_acc)

        # Wrong password fails with AuthError
        with self.assertRaises(auth_store.AuthError):
            store.login("robotics.club", "wrongpass")

        # Correct login works
        login_res = store.login("robotics.club", "secret123")
        self.assertEqual(login_res["account"]["id"], acc["id"])

        # Logout invalidates token
        store.logout(token)
        self.assertIsNone(store.get_session(token))
        # Second session from login is still valid
        self.assertIsNotNone(store.get_session(login_res["token"]))

    def test_expired_session_is_rejected_and_admin_seeded_from_env_in_supabase_mode(self):
        from app import auth_store

        fake = FakeRemoteSupa()
        store = auth_store.AuthStore(pathlib.Path(tempfile.mkdtemp()) / "auth.json", remote=fake)

        with patch.dict(os.environ, {"BTC_ADMIN_PASSWORD": "super-admin-pass"}, clear=False):
            seeded = store.ensure_admin_from_env()
            self.assertIsNotNone(seeded)
            self.assertEqual(seeded["username"], "admin")
            self.assertEqual(seeded["role"], "admin_truong")
            # Calling again is idempotent
            store.ensure_admin_from_env()
            self.assertEqual(len(fake.tables["club_accounts"]), 1)

        login_res = store.login("admin", "super-admin-pass")
        token = login_res["token"]
        self.assertEqual(store.get_session(token)["role"], "admin_truong")

        # Expire the session in fake Supabase
        fake.tables["club_sessions"][0]["expires_at"] = (
            datetime.now(timezone.utc) - timedelta(minutes=5)
        ).isoformat()
        self.assertIsNone(store.get_session(token))


class TestEventsRbacStopsAndAnalytics(unittest.TestCase):
    def _make_event(self, eid="ev-multi", stops=None, status="published", location_id="bA"):
        return {
            "id": eid,
            "title": "Ngày hội CLB VinUni",
            "club": "CLB Robotics",
            "description": "Tham quan các gian hàng công nghệ.",
            "locationId": location_id,
            "startsAt": "2026-12-01T14:00:00+07:00",
            "endsAt": "2026-12-01T17:00:00+07:00",
            "mascotId": "vini",
            "status": status,
            "stops": stops if stops is not None else [
                {"id": "s1", "label": "Gian hàng Check-in", "locationId": "bA", "note": "Nhận vòng tay"},
                {"id": "s2", "label": "Sân khấu chính", "locationId": "bB"},
            ],
        }

    def test_stops_validation_ownership_and_analytics_in_supabase_and_local(self):
        from app import events_store

        fake = FakeRemoteSupa()
        store = events_store.EventsStore(pathlib.Path(tempfile.mkdtemp()) / "events.json", remote=fake)
        club_a = {"id": "acc_a", "username": "club_a", "role": "clb"}
        club_b = {"id": "acc_b", "username": "club_b", "role": "clb"}
        admin = {"id": "admin", "username": "admin", "role": "admin_truong"}

        # Published event with invalid stop location fails validation
        with self.assertRaises(events_store.ValidationError):
            store.save_event(
                self._make_event(
                    eid="ev-bad-stop",
                    stops=[{"id": "s1", "label": "Gian lạ", "locationId": "missing"}],
                ),
                valid_locations={"bA", "bB"},
                actor=club_a,
            )

        # More than 12 stops fails validation
        too_many = [{"id": f"s{i}", "label": f"Trạm {i}", "locationId": "bA"} for i in range(13)]
        with self.assertRaises(events_store.ValidationError):
            store.save_event(self._make_event(eid="ev-13", stops=too_many), valid_locations={"bA"}, actor=club_a)

        # Valid multi-stop event saved by club_a
        saved = store.save_event(self._make_event(), valid_locations={"bA", "bB"}, actor=club_a)
        self.assertEqual(saved["ownerId"], "acc_a")
        self.assertEqual(len(saved["stops"]), 2)
        self.assertEqual(saved["viewsCount"], 0)
        self.assertEqual(saved["navigationsCount"], 0)

        # Anonymous metrics increment via RPC
        m1 = store.increment_metric("ev-multi", "view")
        m2 = store.increment_metric("ev-multi", "navigation")
        self.assertEqual(m1, {"viewsCount": 1, "navigationsCount": 0})
        self.assertEqual(m2, {"viewsCount": 1, "navigationsCount": 1})

        # Invalid metric raises ValidationError
        with self.assertRaises(events_store.ValidationError):
            store.increment_metric("ev-multi", "click")

        # club_b cannot edit or delete club_a's event
        with self.assertRaises(PermissionError):
            store.save_event(self._make_event(), valid_locations={"bA", "bB"}, actor=club_b)
        with self.assertRaises(PermissionError):
            store.delete_event("ev-multi", actor=club_b)

        # Updating by owner preserves ownerId and metric counts
        updated_payload = self._make_event()
        updated_payload["title"] = "Ngày hội CLB VinUni (Cập nhật)"
        updated = store.save_event(updated_payload, valid_locations={"bA", "bB"}, actor=club_a)
        self.assertEqual(updated["ownerId"], "acc_a")
        self.assertEqual(updated["viewsCount"], 1)
        self.assertEqual(updated["navigationsCount"], 1)

        # Admin can edit and delete any club's event
        admin_updated = store.save_event(updated_payload, valid_locations={"bA", "bB"}, actor=admin)
        self.assertEqual(admin_updated["ownerId"], "acc_a")
        store.delete_event("ev-multi", actor=admin)
        self.assertEqual(store.list_all()["events"], [])

        # Local mode metrics & mascot ownership check
        local_store = events_store.EventsStore(pathlib.Path(tempfile.mkdtemp()) / "local_events.json", remote=None)
        local_store.save_event(self._make_event(eid="ev-loc"), valid_locations={"bA", "bB"}, actor=club_a)
        lm = local_store.increment_metric("ev-loc", "view")
        self.assertEqual(lm, {"viewsCount": 1, "navigationsCount": 0})
        self.assertIsNone(local_store.increment_metric("does-not-exist", "view"))

        local_store.save_mascot(
            {"id": "momo-a", "name": "Momo A", "kind": "image", "image": SAMPLE_PNG},
            actor=club_a,
        )
        with self.assertRaises(PermissionError):
            local_store.delete_mascot("momo-a", actor=club_b)
        local_store.delete_mascot("momo-a", actor=admin)


class TestAuthAndAnalyticsEndpoints(unittest.TestCase):
    def test_auth_rbac_and_metrics_http_flow(self):
        from app import auth_store, events_store, main

        fake = FakeRemoteSupa()
        tmp_dir = pathlib.Path(tempfile.mkdtemp())
        ev_store = events_store.EventsStore(tmp_dir / "events.json", remote=fake)
        au_store = auth_store.AuthStore(tmp_dir / "auth.json", remote=fake)
        with patch.dict(os.environ, {"BTC_ADMIN_PASSWORD": "admin-password-1"}, clear=False):
            au_store.ensure_admin_from_env()

        class FakeGraph:
            rooms = [
                {"id": "bA", "node": "nA", "name": "Tòa A"},
                {"id": "bB", "node": "nB", "name": "Tòa B"},
            ]
            nodes = {
                "nA": {"id": "nA", "label": "Tòa A"},
                "nB": {"id": "nB", "label": "Tòa B"},
            }

        with (
            patch.object(main, "events_store", ev_store),
            patch.object(main, "auth_store", au_store),
            patch.object(main, "graph", return_value=FakeGraph()),
        ):
            client = TestClient(main.app)

            # Unauthenticated /api/auth/me
            me0 = client.get("/api/auth/me")
            self.assertEqual(me0.status_code, 200)
            self.assertEqual(me0.json(), {"authenticated": False, "account": None})

            # Unauthenticated write returns 401
            r_unauth = client.put("/api/events/ev-1", json={"title": "Test"})
            self.assertEqual(r_unauth.status_code, 401)
            self.assertEqual(r_unauth.json()["detail"]["code"], "unauthorized")

            # Register Club A
            r_reg_a = client.post("/api/auth/register", json={
                "username": "clb_a",
                "password": "passwordA",
                "displayName": "CLB A",
                "clubName": "CLB Âm nhạc",
            })
            self.assertEqual(r_reg_a.status_code, 200)
            tok_a = r_reg_a.json()["token"]
            hdr_a = {"Authorization": f"Bearer {tok_a}"}

            # Duplicate register returns 409
            r_dup = client.post("/api/auth/register", json={
                "username": "clb_a",
                "password": "passwordA2",
                "displayName": "CLB A Dup",
                "clubName": "CLB A",
            })
            self.assertEqual(r_dup.status_code, 409)

            # Authenticated /api/auth/me
            me_a = client.get("/api/auth/me", headers=hdr_a)
            self.assertEqual(me_a.status_code, 200)
            self.assertTrue(me_a.json()["authenticated"])
            self.assertEqual(me_a.json()["account"]["username"], "clb_a")

            # Register Club B
            r_reg_b = client.post("/api/auth/register", json={
                "username": "clb_b",
                "password": "passwordB",
                "displayName": "CLB B",
                "clubName": "CLB Robotics",
            })
            self.assertEqual(r_reg_b.status_code, 200)
            hdr_b = {"Authorization": f"Bearer {r_reg_b.json()['token']}"}

            # Wrong login returns 401
            r_bad_login = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
            self.assertEqual(r_bad_login.status_code, 401)

            # Admin login
            r_admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin-password-1"})
            self.assertEqual(r_admin.status_code, 200)
            self.assertEqual(r_admin.json()["account"]["role"], "admin_truong")
            hdr_admin = {"Authorization": f"Bearer {r_admin.json()['token']}"}

            # Club A creates multi-stop event
            event_body = {
                "id": "ev-music",
                "title": "Đêm nhạc VinUni",
                "club": "CLB Âm nhạc",
                "description": "Biểu diễn acoustic và giao lưu.",
                "locationId": "bA",
                "startsAt": "2026-12-02T18:00:00+07:00",
                "endsAt": "2026-12-02T20:00:00+07:00",
                "mascotId": "vini",
                "status": "published",
                "stops": [{"id": "st1", "label": "Quầy check-in", "locationId": "bB", "note": "Tầng 1"}],
            }
            r_create = client.put("/api/events/ev-music", json=event_body, headers=hdr_a)
            self.assertEqual(r_create.status_code, 200)
            self.assertEqual(len(r_create.json()["event"]["stops"]), 1)

            # Club B gets 403 trying to overwrite or delete Club A's event
            r_forbid_put = client.put("/api/events/ev-music", json=event_body, headers=hdr_b)
            self.assertEqual(r_forbid_put.status_code, 403)
            self.assertEqual(r_forbid_put.json()["detail"]["code"], "forbidden")
            r_forbid_del = client.delete("/api/events/ev-music", headers=hdr_b)
            self.assertEqual(r_forbid_del.status_code, 403)

            # Public anonymous metrics endpoint works without auth
            r_view = client.post("/api/events/ev-music/metrics", json={"metric": "view"})
            self.assertEqual(r_view.status_code, 200)
            self.assertEqual(r_view.json(), {"ok": True, "viewsCount": 1, "navigationsCount": 0})

            r_nav = client.post("/api/events/ev-music/metrics", json={"metric": "navigation"})
            self.assertEqual(r_nav.status_code, 200)
            self.assertEqual(r_nav.json(), {"ok": True, "viewsCount": 1, "navigationsCount": 1})

            # Invalid metric -> 422; unknown event -> 404
            self.assertEqual(
                client.post("/api/events/ev-music/metrics", json={"metric": "invalid"}).status_code,
                422,
            )
            self.assertEqual(
                client.post("/api/events/unknown-ev/metrics", json={"metric": "view"}).status_code,
                404,
            )

            # Admin can delete Club A's event
            self.assertEqual(client.delete("/api/events/ev-music", headers=hdr_admin).status_code, 200)

            # Logout invalidates Club A token
            self.assertEqual(client.post("/api/auth/logout", headers=hdr_a).status_code, 200)
            self.assertEqual(client.get("/api/auth/me", headers=hdr_a).json()["authenticated"], False)


if __name__ == "__main__":
    unittest.main()
