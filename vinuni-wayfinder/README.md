# VinUni Wayfinder

Web app chỉ đường tới phòng trong campus VinUni (demo: **Tòa I, tầng trệt**). Ngoài trời dùng GPS; trong nhà chụp ảnh
hành lang để nhận diện vị trí bằng [MegaLoc](https://github.com/gmberton/MegaLoc) (kNN bỏ phiếu, học từ lần sửa sai) —
theo cách tiếp cận của [Hound Around](https://github.com/DxubleBTW/Hound-Around). Người dùng chỉ thấy thẻ chỉ dẫn từng bước,
không thấy sơ đồ tòa. Chi tiết yêu cầu và quyết định: [`CLAUDE.md`](../CLAUDE.md) ở gốc repo.

> **Dữ liệu không nằm trong repo** (repo công khai): ảnh sơ đồ, đồ thị đường đi thật, video/khung hình và vector nằm ở
> `maps/` và `backend/data/`, đã bị `.gitignore` chặn. Muốn chạy, cần xin bản `maps/` từ nhóm.

## Chạy

```powershell
# 1) Backend (lần đầu: cài PyTorch CUDA rồi requirements)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2) Frontend (terminal khác)
cd frontend
npm install
npm run dev          # HTTPS tự ký, mở được từ điện thoại cùng Wi-Fi
```

Trên điện thoại mở `https://<IP-laptop>:5173`, bấm "Nâng cao → Vẫn tiếp tục" qua cảnh báo chứng chỉ (chỉ lần đầu).
Laptop có thể phải cho phép cổng 5173 qua Windows Firewall. Wi-Fi trường có thể chặn kết nối giữa hai máy; khi đó dùng
điểm phát Wi-Fi từ điện thoại.

`npm run dev:http` chỉ để thử trên laptop (không có camera/cảm biến).

## Dữ liệu chung của nhóm (Supabase)

Bản đồ, điểm, đường nối, phòng, vết đi bộ, vector nhận diện và ảnh (sơ đồ, khung nhỏ) lưu trên **một project Supabase
riêng tư** để cả nhóm dùng chung. Mỗi người vẫn chạy backend trên laptop của mình (dùng GPU của mình), cùng trỏ vào
project đó. Mọi bảng bật RLS và không có policy, hai kho ảnh `maps` và `frames` là private: chỉ khoá service mới đọc
được. **Khoá này bỏ qua RLS, không đưa lên Git, không dán vào chat.**

Mỗi thành viên:
1. Xin khoá `SUPABASE_SERVICE_KEY` từ người quản lý project (qua kênh riêng của nhóm).
2. Sao chép `backend/.env.example` thành `backend/.env`, điền `SUPABASE_URL` và `SUPABASE_SERVICE_KEY`.
3. Chạy backend như bình thường. `GET /api/health` sẽ báo `"storage": "supabase"`. Thiếu `.env` thì backend chạy chế độ
   cục bộ (dữ liệu trong `backend/data/`, không chia sẻ).

Người đang giữ dữ liệu cục bộ chuyển lên một lần: `cd backend; .\.venv\Scripts\python.exe migrate_to_supabase.py`
(thêm `--replace` để ghi đè). Script từ chối chạy nếu Supabase đã có dữ liệu.

Khi dùng chung:
- **Sửa bản đồ:** lưu kiểu "người lưu sau thua nếu có người lưu trước". Nếu người khác vừa lưu, bạn nhận thông báo
  "hãy tải lại trang" và phải sửa lại, nên hãy chia nhau mỗi người một khu vực (Tòa G, Tòa I, campus) và lưu thường xuyên.
- **Vector nhận diện:** quay video ở máy nào cũng vào chung kho. Các máy tự đồng bộ trong khoảng 20 giây.
- Ảnh sơ đồ và khung nhỏ phục vụ qua backend, không có đường dẫn công khai nào.

## Hai chế độ

- **Chỉ đường** (`/`): chọn điểm đến → xác định vị trí (chụp ảnh / GPS / gõ số phòng) → xác nhận nếu chưa chắc → thẻ chỉ dẫn.
- **Thu thập** (`/#thu-thap`, cho nhóm): sửa điểm & đường nối trên sơ đồ, đặt phòng làm điểm đến, neo GPS (≥ 2 neo/bản đồ),
  ghi GPS cho điểm ngoài trời, quay video 10–15 s tại mỗi điểm để tạo ảnh nhận diện, ghi vết đi bộ, xuất/nhập JSON.

## Dữ liệu khởi tạo

Lần chạy đầu, backend đọc `maps/seed-site.json` (vẽ tay từ ảnh sơ đồ, **chưa kiểm tại chỗ**: các điểm viền đỏ, cạnh nét đứt).
Sau khi bấm Lưu ở chế độ Thu thập, dữ liệu nằm ở `backend/data/site.json`.

## Thu thập ở Tòa I (gợi ý thứ tự)

1. Campus: đứng ở 3 chỗ dễ nhận ra (cổng chính, góc tòa…), dùng "Neo GPS". Kiểm "sai số neo" < 10 m.
2. Tòa I: neo GPS ở 2–3 cửa ra vào (đứng ngay ngoài cửa).
3. Đi từng hành lang: kéo điểm cho đúng chỗ, sửa tên, nối lại; đánh dấu "Đã kiểm tại chỗ".
4. Mỗi điểm hành lang: quay ≥ 2 video (hướng/thời điểm khác nhau). Không quay mặt người.
5. Thử chụp ảnh ở chế độ Chỉ đường; nếu sai, chạm đúng chỗ để app học.

## Độ chính xác

Chưa đo. Ngưỡng `auto ≥ 0.7`, `picker ≥ 0.5` là heuristic *(tự ước tính)*, cần hiệu chỉnh khi có dữ liệu thật
(thử theo kiểu leave-one-video-out: `VectorIndex.vote(..., exclude_video=...)`).
