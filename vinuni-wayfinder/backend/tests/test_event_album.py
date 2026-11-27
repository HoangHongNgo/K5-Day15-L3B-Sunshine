import base64
import io
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app import events_store


def test_anchor_validation_and_remote_roundtrip():
    ev = dict(id="abc", title="Demo", status="draft", arAnchor={"lat": 10, "lon": 20})
    valid = events_store.validate_event(ev)
    assert events_store._row_to_event(events_store._event_to_row(valid))["arAnchor"] == ev["arAnchor"]
    for bad in [{"lat": 91, "lon": 20}, {"lat": True, "lon": 0}, {"lon": 5}]:
        with pytest.raises(events_store.ValidationError):
            events_store.validate_event({**ev, "arAnchor": bad})


@pytest.fixture
def client(tmp_path):
    from app.event_album import album_router, Album

    app = FastAPI()

    def actor(token):
        if token not in ["owner", "other"]:
            raise HTTPException(401)
        return {"id": token}

    def event(eid):
        return (
            {"id": eid, "status": "draft" if eid == "draft" else "published", "ownerId": "owner"}
            if eid in ["event", "another", "draft"]
            else None
        )

    app.include_router(album_router(Album(tmp_path / "album.sqlite", None), event, actor))
    return TestClient(app)


def shot():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "blue").save(buf, "JPEG", comment=b"strip-me")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def test_photo_only_appears_after_owner_approval(client):
    url = "/api/events/event/photos"
    r = client.post(url, json={"image": shot()})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert client.get(url).json()["photos"] == []
    assert client.get(url + "/pending").status_code == 401
    assert client.get(url + "/pending", headers={"Authorization": "other"}).status_code == 403
    assert client.post(url + "/" + pid + "/approve", headers={"Authorization": "other"}).status_code == 403
    assert (
        client.post(
            "/api/events/another/photos/" + pid + "/approve", headers={"Authorization": "owner"}
        ).status_code
        == 404
    )
    assert client.post(url + "/" + pid + "/approve", headers={"Authorization": "owner"}).status_code == 200
    photo = client.get(url).json()["photos"][0]
    assert photo["id"] == pid
    assert b"strip-me" not in base64.b64decode(photo["image"].split(",")[1])
    assert client.delete(url + "/" + pid, headers={"Authorization": "owner"}).status_code == 200
    assert client.get(url).json()["photos"] == []


def test_rejects_invalid_and_unpublished_uploads(client):
    assert (
        client.post("/api/events/event/photos", json={"image": "data:image/jpeg;base64,AAAA"}).status_code
        == 422
    )
    for eid in ["draft", "missing"]:
        assert client.post("/api/events/" + eid + "/photos", json={"image": shot()}).status_code == 404
