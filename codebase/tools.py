"""Công cụ của lát cắt "mascot dẫn đường cho sinh viên mới" — nhóm Sunshine.

Dữ liệu: data/campus.json (địa điểm + lối đi) và data/events.json (lịch hoạt động), đều SYNTHETIC.
Mỗi công cụ: tên · input · output · có tác động ra ngoài không. Khớp bảng công cụ ở spec.md §4.
"""
import json
import os
import unicodedata
from collections import deque

from tracing import tool, TOOLS  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


CAMPUS = _load("campus.json")
EVENTS = _load("events.json")["events"]
PLACES = {p["id"]: p for p in CAMPUS["places"]}
EVENT_IDS = {e["id"]: e for e in EVENTS}


def _norm(s):
    """Chữ thường, bỏ dấu, gộp khoảng trắng — để so khớp tên địa điểm."""
    s = unicodedata.normalize("NFD", (s or "").lower().replace("đ", "d"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


@tool
def tra_dia_diem(query: str) -> list:
    """tra_dia_diem — tìm địa điểm và hoạt động có tên / bí danh / thẻ xuất hiện trong câu hỏi.
    Input: câu hỏi của sinh viên (str).
    Output: danh sách ứng viên {"kind": "place"|"event", "id", "name", "place", "time"} (tối đa 8).
    Tác động ra ngoài: không (chỉ đọc data/)."""
    q = _norm(query)
    hits = []
    for p in CAMPUS["places"]:
        keys = [p["name"]] + p["aliases"]
        if any(_norm(k) in q for k in keys):
            hits.append({"kind": "place", "id": p["id"], "name": p["name"], "place": p["id"], "time": ""})
    for e in EVENTS:
        keys = [e["name"]] + e["tags"]
        if any(_norm(k) in q for k in keys):
            hits.append({"kind": "event", "id": e["id"], "name": e["name"], "place": e["place"], "time": e["time"]})
    return hits[:8]


@tool
def danh_sach_dia_diem() -> list:
    """danh_sach_dia_diem — liệt kê mọi địa điểm có trong bản đồ (để model chỉ chọn trong danh sách này).
    Input: không. Output: danh sách {"id", "name"}. Tác động ra ngoài: không."""
    return [{"id": p["id"], "name": p["name"]} for p in CAMPUS["places"]]


@tool
def tim_lo_trinh(from_id: str, to_id: str) -> dict:
    """tim_lo_trinh — tìm đường ngắn nhất (theo số chặng) giữa hai địa điểm trên bản đồ.
    Input: from_id, to_id (mã địa điểm trong data/campus.json).
    Output: {"ok": bool, "steps": [câu chỉ đường], "minutes": tổng phút, "path": [mã]} — ok=False nếu mã không có
    hoặc không có đường. Tác động ra ngoài: không. Lộ trình do code tính, KHÔNG do model sinh."""
    if from_id not in PLACES or to_id not in PLACES:
        return {"ok": False, "steps": [], "minutes": 0, "path": []}
    adj = {}
    for e in CAMPUS["edges"]:
        adj.setdefault(e["from"], []).append((e["to"], e["step"], e["minutes"]))
        # đi ngược chiều: câu chỉ đường dựng từ tên hai đầu
        back = "Từ %s đi về %s (ngược lối đã mô tả)" % (PLACES[e["to"]]["name"], PLACES[e["from"]]["name"])
        adj.setdefault(e["to"], []).append((e["from"], back, e["minutes"]))
    prev = {from_id: None}
    dq = deque([from_id])
    while dq:
        cur = dq.popleft()
        if cur == to_id:
            break
        for nxt, step, mins in adj.get(cur, []):
            if nxt not in prev:
                prev[nxt] = (cur, step, mins)
                dq.append(nxt)
    if to_id not in prev:
        return {"ok": False, "steps": [], "minutes": 0, "path": []}
    steps, path, total, node = [], [to_id], 0, to_id
    while prev[node] is not None:
        cur, step, mins = prev[node]
        steps.append(step)
        total += mins
        path.append(cur)
        node = cur
    return {"ok": True, "steps": steps[::-1], "minutes": total, "path": path[::-1]}


@tool
def tao_ma_checkin(event_id: str) -> dict:
    """tao_ma_checkin — tạo NỘI DUNG mã QR check-in cho một hoạt động (bản nháp, chưa ghi danh ai).
    Input: event_id (mã trong data/events.json). Output: {"ok", "qr_payload"}.
    Tác động ra ngoài: không. Việc ghi nhận điểm danh do ban tổ chức xác nhận khi sinh viên quét mã tại chỗ;
    AI không tự điểm danh."""
    if event_id not in EVENT_IDS:
        return {"ok": False, "qr_payload": ""}
    return {"ok": True, "qr_payload": "SUNSHINE-CHECKIN:%s" % event_id}
