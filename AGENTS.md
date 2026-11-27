# AGENTS.md — hướng dẫn cho coding agent (Claude Code, Cursor, Codex, AGY…) làm việc trong repo này

> Ôn lại: ngày 12 · lab ngày 12. Nhóm sửa file này cho khớp bài của mình (thêm quy ước riêng, bỏ dòng không dùng).

## Repo này là gì

Repo nộp bài hackathon AI20K của nhóm **Sunshine**: gồm khung đánh giá/chạy thử AI (`codebase/`, `eval/`, `cost/`) và ứng dụng web **VinUni Wayfinder** (`vinuni-wayfinder/backend/` + `vinuni-wayfinder/frontend/`).

## Quy trình bắt buộc — Viết test trước khi làm (TDD: Red → Green → Refactor)

Mọi coding agent làm việc trong repo này **BẮT BUỘC** tuân thủ quy trình viết test trước:

1. **Red — Viết test trước khi viết code triển khai:**
   - Với **mọi feature mới**: viết unit/integration test mô tả hành vi mong đợi trước, chạy test và xác nhận test **fail** do chưa có implementation.
   - Với **mọi bug fix**: viết test tái hiện đúng lỗi và xác nhận test **fail** trước khi sửa code.
2. **Green — Viết code tối giản để test pass:**
   - Triển khai đúng phạm vi feature, giữ ranh giới sạch giữa các feature (`src/features/<feature>/`), chạy lại test thấy **pass**.
3. **Refactor — Làm gọn & kiểm tra toàn bộ:**
   - Không commit/push hoặc kết thúc task khi code mới/sửa thiếu test hoặc chưa chạy kiểm tra đầy đủ:
     - Frontend: `cd vinuni-wayfinder/frontend && npm test && npm run build`
     - Khung Python / eval: `python3 run.py check` (và `pytest` khi sửa `codebase/` hoặc `vinuni-wayfinder/backend/`).
4. **Vị trí đặt test:**
   - Frontend: đặt test cạnh chính feature đó (`vinuni-wayfinder/frontend/src/features/<feature>/*.test.ts`) và middleware/proxy trong `vinuni-wayfinder/frontend/server/*.test.ts`.
   - Python: đặt trong `tests/test_*.py` (hoặc `vinuni-wayfinder/backend/tests/`).

## Lệnh

```bash
# Khung hackathon AI20K (Python chuẩn)
python run.py                    # chạy bản chạy thử
python run.py check              # kiểm eval/benchmark.csv + eval/metric_spec.yaml
python run.py eval --try         # thử 3 câu đầu
python run.py eval               # chạy cả bộ → eval/run-N.csv + traces/run-N.jsonl
python run.py score eval/run-N.csv
python run.py simulate --try     # thử mô phỏng chi phí 10 phiên
python run.py simulate           # mô phỏng chi phí → cost/simulate-N.csv

# VinUni Wayfinder — Frontend duy nhất (React + TypeScript + Vite)
cd vinuni-wayfinder/frontend
npm test                         # chạy toàn bộ unit + proxy integration test (Vitest)
npm run build                    # kiểm TypeScript (tsc -b) + build production PWA
npm run dev                      # chạy dev server (proxy API sang 127.0.0.1:8000)

# VinUni Wayfinder — Backend (FastAPI + MegaLoc)
cd vinuni-wayfinder/backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Khung Python chỉ dùng thư viện chuẩn. Thêm thư viện thì ghi vào `requirements.txt` (hoặc `vinuni-wayfinder/backend/requirements.txt` cho backend).

## Cấu trúc code

### 1. Khung hackathon (`codebase/`)

| File | Ai sửa | Hợp đồng |
|---|---|---|
| `codebase/agent.py` | nhóm | `answer(text) -> {"output": str}` — luồng chính, đúng hình dạng ở `spec.md` §4 |
| `codebase/ai.py` | nhóm | `call_model(system, user) -> {"text", "model", "tokens_in", "tokens_out"}`, giữ `@model_call`. Token lấy từ `usage` của API, không ước lượng |
| `codebase/tools.py` | nhóm | mỗi công cụ một hàm có `@tool`, docstring: tên · input · output · có tác động ra ngoài không |
| `codebase/tracing.py`, `eval/run_eval.py`, `cost/simulate.py`, `run.py` | **khung — không sửa** | ghi trace, chạy bộ câu thử, mô phỏng chi phí |

### 2. Ứng dụng VinUni Wayfinder (`vinuni-wayfinder/`) — tổ chức theo từng feature

```text
vinuni-wayfinder/
├── backend/app/                      # FastAPI + MegaLoc + routing + Supabase/local store
└── frontend/
    ├── server/                       # Vite dev middleware (/api/mascot/*) + proxy integration tests
    └── src/
        ├── main.tsx, App.tsx         # Entry point & app shell (routing)
        ├── shared/                   # Dùng chung: brand, PWA, FavoritesContext, ui, styles/, lib/
        └── features/
            ├── wayfinder/            # API client, adapter, catalog fallback, WayfinderContext + tests
            ├── explore/              # Bản đồ 3D khuôn viên, tìm kiếm, chi tiết địa điểm, đã lưu
            ├── navigation/           # Lập tuyến (/di-den), chọn xuất phát (/vi-tri), hành trình (/hanh-trinh)
            ├── localization/         # Camera AR + định vị MegaLoc (/anh), ảnh mẫu (/anh-mau)
            ├── mascot/               # Hiển thị mascot & studio tạo/tải mascot
            ├── events/               # Quản lý sự kiện CLB, mascot theo sự kiện + tests
            └── collect/              # Giao diện thu thập dữ liệu & sửa đồ thị (/thu-thap)
```

> Khi thêm tính năng mới cho frontend, tạo hoặc mở rộng đúng thư mục trong `vinuni-wayfinder/frontend/src/features/<feature>/`, kèm file `*.test.ts` đặt cạnh code; không dồn thêm logic vào `App.tsx` hay tạo thư mục frontend thứ hai.

## Luật — agent KHÔNG được làm

- Không viết code tính năng hoặc sửa lỗi trước khi viết và chạy test fail (vi phạm TDD).
- Không commit `.env`, API key, dữ liệu cá nhân thật, nguyên file data BTC cấp.
- Không commit ảnh/video hành lang, sơ đồ hay mặt bằng toà nhà, đồ thị đường đi thật và vector nhận diện của wayfinder (repo công khai; xem `data/DATA_CARD.md`). Mã wayfinder nằm trong repo này, ở `vinuni-wayfinder/` (xem `CLAUDE.md` ở gốc repo); `.gitignore` đã chặn `vinuni-wayfinder/maps/`, `backend/data/`, `backend/.venv/`, `backend/.torch/`, `*.npz`, video. Chỉ commit code và doc, không commit dữ liệu.
- Không sửa `eval/run-*.csv`, `cost/simulate-*.csv`, `traces/*` đã chạy (trừ điền cột `pass`, `ghi_chu`).
- Không sửa chuẩn "đạt" (`spec.md` §7), `eval/metric_spec.yaml` sau CP2; không xoá câu thử trượt, không sửa `expected` cho khớp output.
- Không bịa người được phỏng vấn, trích dẫn, câu trả lời khảo sát, số liệu. Số không có nguồn thì ghi rõ *(tự ước tính)*.
- Công cụ có tác động ra ngoài (gửi tin, sửa dữ liệu, chấm điểm): chỉ tạo bản nháp chờ người duyệt.
- Không viết prompt "giấu" câu thử vào code (vd so khớp nguyên văn input của bộ câu thử).

## Quy ước của nhóm

- Ngôn ngữ trả lời người dùng: tiếng Việt (giao diện wayfinder chỉ có tiếng Việt)
- Phong cách code / đặt tên: tổ chức theo feature (`src/features/<feature>/`), viết test trước khi triển khai (TDD)
- Ai duyệt thay đổi do agent tạo trước khi commit: thành viên nhóm kiểm tra diff và kết quả test trước khi commit
