"""Event photos are private until the organizing club approves them."""

import base64
import binascii
import io
import json
import sqlite3
from contextlib import closing
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from .supa import SupabaseError

PREFIX = "data:image/jpeg;base64,"
MAX_BODY = 2_000_000
CAPACITY = 24


def thumbnail(value):
    if not isinstance(value, str) or not value.startswith(PREFIX):
        raise HTTPException(422, "Chỉ nhận ảnh JPEG.")
    try:
        raw = base64.b64decode(value[len(PREFIX) :], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format != "JPEG" or im.width * im.height > 5_000_000:
                raise ValueError()
            im.thumbnail((1000, 1000))
            buf = io.BytesIO()
            rgb = im.convert("RGB")
            rgb.info.clear()
            rgb.save(buf, format="JPEG", quality=72)
    except (ValueError, binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(422, "Ảnh không hợp lệ hoặc quá lớn.")
    image = PREFIX + base64.b64encode(buf.getvalue()).decode()
    if len(image) > 600000:
        raise HTTPException(413, "Ảnh quá lớn.")
    return image


class Album:
    def __init__(self, path, remote):
        self.path, self.remote = path, remote

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute(
            "CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY,event_id TEXT,slot INTEGER,approved INTEGER DEFAULT 0,image TEXT,UNIQUE(event_id,slot))"
        )
        return db

    def list(self, eid, approved):
        if self.remote:
            return self.remote.select(
                "event_photos",
                {
                    "event_id": f"eq.{eid}",
                    "approved": f"eq.{str(approved).lower()}",
                    "select": "id,image",
                    "order": "slot.asc",
                },
            )
        with closing(self.connect()) as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,image FROM photos WHERE event_id=? AND approved=? ORDER BY slot", (eid, approved)
                )
            ]

    def add(self, eid, image):
        pid = str(uuid4())
        if self.remote:
            slots = {
                r["slot"]
                for r in self.remote.select("event_photos", {"event_id": f"eq.{eid}", "select": "slot"})
            }
            for slot in range(1, CAPACITY + 1):
                if slot in slots:
                    continue
                try:
                    self.remote.insert("event_photos", [dict(id=pid, event_id=eid, slot=slot, image=image)])
                    return pid
                except SupabaseError as exc:
                    if exc.code != "23505":
                        raise
        else:
            with closing(self.connect()) as db, db:
                db.execute("BEGIN IMMEDIATE")
                slots = {row[0] for row in db.execute("SELECT slot FROM photos WHERE event_id=?", (eid,))}
                slot = next((i for i in range(1, CAPACITY + 1) if i not in slots), None)
                if slot:
                    db.execute(
                        "INSERT INTO photos(id,event_id,slot,image) VALUES(?,?,?,?)", (pid, eid, slot, image)
                    )
                    return pid
        raise HTTPException(409, "Album đã đầy. Ban tổ chức có thể gỡ ảnh để nhận thêm.")

    def moderate(self, eid, pid, approve):
        if self.remote:
            params = {"event_id": f"eq.{eid}", "id": f"eq.{pid}", "select": "id"}
            method = "PATCH" if approve else "DELETE"
            kwargs = {"json": {"approved": True}} if approve else {}
            rows = self.remote._send(
                method,
                "/rest/v1/event_photos",
                params=params,
                headers={"Prefer": "return=representation"},
                **kwargs,
            ).json()
            return bool(rows)
        sql = "UPDATE photos SET approved=1" if approve else "DELETE FROM photos"
        with closing(self.connect()) as db, db:
            return db.execute(sql + " WHERE event_id=? AND id=?", (eid, str(pid))).rowcount > 0

    def clear_local(self, eid):
        if self.remote is None:
            with closing(self.connect()) as db, db:
                db.execute("DELETE FROM photos WHERE event_id=?", (eid,))


def album_router(album, find_event, require_actor):
    router = APIRouter(prefix="/api/events/{event_id}/photos")

    def published(eid):
        event = find_event(eid)
        if not event or event["status"] != "published":
            raise HTTPException(404, "Không tìm thấy sự kiện đã công bố.")
        return event

    def owner(eid, authorization):
        actor = require_actor(authorization)
        event = published(eid)
        if actor.get("role") != "admin_truong" and actor["id"] != event.get("ownerId"):
            raise HTTPException(403, "Chỉ ban tổ chức sự kiện được duyệt ảnh.")

    @router.get("")
    def gallery(event_id: str):
        published(event_id)
        return {"photos": album.list(event_id, True)}

    @router.post("", status_code=201)
    async def submit(event_id: str, request: Request):
        await run_in_threadpool(published, event_id)
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_BODY:
                raise HTTPException(413, "Ảnh quá lớn.")
            body.extend(chunk)
        try:
            data = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(422, "Dữ liệu không hợp lệ.")
        image = await run_in_threadpool(thumbnail, data.get("image") if isinstance(data, dict) else None)
        pid = await run_in_threadpool(album.add, event_id, image)
        return {"id": pid, "status": "pending"}

    @router.get("/pending")
    def pending(event_id: str, authorization: str | None = Header(None)):
        owner(event_id, authorization)
        return {"photos": album.list(event_id, False)}

    def change(eid, pid, authorization, approve):
        owner(eid, authorization)
        if not album.moderate(eid, pid, approve):
            raise HTTPException(404, "Không tìm thấy ảnh.")
        return {"ok": True}

    @router.post("/{pid}/approve")
    def approve(event_id: str, pid: UUID, authorization: str | None = Header(None)):
        return change(event_id, pid, authorization, True)

    @router.delete("/{pid}")
    def remove(event_id: str, pid: UUID, authorization: str | None = Header(None)):
        return change(event_id, pid, authorization, False)

    return router
