"""Nối model — chỗ DUY NHẤT trong bản chạy thử gọi model AI. NHÓM VIẾT phần gọi model thật.

Hợp đồng (giữ nguyên để khung đo được token):
    call_model(system: str, user: str) -> dict với 4 khoá
        "text":       str   chữ model trả về
        "model":      str   tên model đã gọi (để tra giá ở bảng giá model)
        "tokens_in":  int   số token vào, lấy từ trường usage trong phản hồi API — KHÔNG ước lượng
        "tokens_out": int   số token ra, gồm cả token suy luận / suy nghĩ nếu API tính riêng
    @model_call (từ tracing.py) tự ghi mỗi lần gọi vào trace; agent.py gọi call_model bao nhiêu lần
    cũng được, khung tự cộng token.
    Lỗi gọi model (hết lượt, sai key, mất mạng): cứ để exception bay ra — khung ghi lỗi vào cột error.

Đọc cấu hình từ file `.env` ở thư mục gốc repo (mẫu ở `.env.example`):
    MODEL_PROVIDER=codex   # codex / openai / fake
    MODEL_NAME=6.2-sol
    API_KEY=...            # dự phòng OPENAI_API_KEY nếu API_KEY để trống
"""
import json
import os
import urllib.error
import urllib.request

from tracing import model_call

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL_OPENAI = "https://api.openai.com/v1/chat/completions"


def load_env(path=os.path.join(ROOT, ".env")):
    """Đọc file .env (KEY=VALUE mỗi dòng) vào biến môi trường, không ghi đè biến đã có."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            k = key.strip()
            v = value.strip().strip('"').strip("'")
            if k and v:
                os.environ.setdefault(k, v)


load_env()
MODEL_PROVIDER = (os.environ.get("MODEL_PROVIDER") or "fake").strip().lower()
MODEL_NAME = (os.environ.get("MODEL_NAME") or "6.2-sol").strip()
API_KEY = (os.environ.get("API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
MODEL_BASE_URL = (os.environ.get("MODEL_BASE_URL") or URL_OPENAI).strip()


def post_json(url: str, headers: dict, body: dict, timeout: int = 60) -> dict:
    """Gửi POST JSON, trả về JSON phản hồi. Chỉ dùng thư viện chuẩn (urllib)."""
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers=dict({"Content-Type": "application/json"}, **headers),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))


def call_openai_compat(system: str, user: str) -> dict:
    """Gọi API tương thích OpenAI (dùng cho MODEL_PROVIDER=codex hoặc openai)."""
    if not API_KEY:
        raise RuntimeError("Thiếu API_KEY (hoặc OPENAI_API_KEY) trong file .env ở gốc repo")
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    data = post_json(
        MODEL_BASE_URL,
        {"Authorization": "Bearer " + API_KEY},
        {"model": MODEL_NAME, "messages": messages},
    )
    usage = data.get("usage") or {}
    tokens_in = usage.get("prompt_tokens", usage.get("input_tokens", 0))
    tokens_out = usage.get("completion_tokens", usage.get("output_tokens", 0))
    text = data["choices"][0]["message"]["content"]
    return {
        "text": text,
        "model": MODEL_NAME,
        "tokens_in": int(tokens_in),
        "tokens_out": int(tokens_out),
    }


@model_call
def call_model(system: str, user: str) -> dict:
    if MODEL_PROVIDER == "fake":
        # Trả một đối tượng JSON giả cố định (không so khớp input) để luồng trong agent.py
        # chạy trọn qua cả 4 bước (tra_dia_diem → model giả → chặn rủi ro → tim_lo_trinh + tao_ma_checkin).
        mock_payload = {
            "action": "dan_duong",
            "from": "CONG_CHINH",
            "to": "P_A305",
            "event": "EV_PYTHON",
            "message": "[câu trả lời giả — chưa nối model]",
        }
        return {
            "text": json.dumps(mock_payload, ensure_ascii=False),
            "model": "fake",
            "tokens_in": 0,
            "tokens_out": 0,
        }

    if MODEL_PROVIDER in ("codex", "openai"):
        return call_openai_compat(system, user)

    raise NotImplementedError(
        "chưa viết phần gọi model thật cho MODEL_PROVIDER=%s trong codebase/ai.py — xem docs/connect-model.md"
        % MODEL_PROVIDER
    )
