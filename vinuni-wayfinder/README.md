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
npm run dev          # HTTP tại localhost:5173
```

Mở `http://localhost:5173` trên máy chạy Vite. Để dùng camera và micro từ điện thoại, mở ứng dụng qua HTTPS, chẳng hạn qua reverse proxy hoặc tunnel HTTPS trỏ đến Vite.

## Triển khai production (Vercel + Tailscale Funnel)

- **Frontend (Vercel):** `https://vinuni-wayfinder.vercel.app`, deploy từ `vinuni-wayfinder/frontend/` (`vercel --prod`). File `vinuni-wayfinder/frontend/vercel.json` rewrite `/api/:path*` và `/maps/:path*` tới backend HTTPS cố định `https://minhphuong.tail65ddfe.ts.net` (cùng origin nên không bị CORS hoặc mixed content trên điện thoại).
- **Backend (`phuong@minhphuong`):** chạy bằng systemd user service `vinuni-wayfinder-backend.service` (`127.0.0.1:8010`) và mở HTTPS cố định bằng `tailscale funnel --bg 8010` (tự khôi phục sau khi khởi động lại máy, thay thế Cloudflare Quick Tunnel cũ).
- Kiểm tra nhanh sức khoẻ production: `curl https://vinuni-wayfinder.vercel.app/api/health`.

## Nói chuyện với mascot sự kiện

Điền các biến sau vào `.env` ở gốc repo rồi khởi động lại backend. Các khóa dùng ở máy chủ.

- `AZURE_SPEECH_KEY` và `AZURE_SPEECH_REGION` lấy từ tài nguyên Azure Speech. Dùng mã vùng của tài nguyên, ví dụ `southeastasia`. [Tài liệu Azure Speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text)
- `OPENAI_API_KEY` dùng để gọi `gpt-6-luna` qua OpenAI Responses API. Backend cung cấp nội dung công bố, lịch, địa điểm và các trạm của sự kiện đang mở.

Mở sự kiện đã công bố, vào camera AR rồi bấm **Nói chuyện** trên thanh điều khiển. Ở chế độ dev có thể chọn **Dùng vị trí mô phỏng** để vào AR. Bấm **Nói**, cấp quyền micro, nói câu hỏi tiếng Việt rồi bấm **Dừng và hỏi**. Mỗi lượt ghi âm dài tối đa 30 giây.

Azure Speech nhận diện câu hỏi tiếng Việt từ micro. GPT-6 Luna soạn câu trả lời dạng chữ dựa trên dữ liệu sự kiện, sau đó Azure Speech đọc bằng giọng Hoài My (`vi-VN`). Người dùng có thể nhập câu hỏi bằng bàn phím, bấm **Nghe lại** hoặc đọc câu trả lời trên màn hình.

## Hỏi đường bằng giọng nói

Trong trang **Dẫn đường**, chọn **Hỏi đường bằng giọng nói**. Trong camera sự kiện, chọn **Nói chuyện**, rồi chọn **Chỉ đường**. Ví dụ, hỏi “Mình đứng trước phòng G101, đi G106 thế nào?”. Bạn có thể nói hoặc nhập tên phòng, tòa, tầng hay mốc thấy trên biển chỉ dẫn.

Trong màn hình camera, **Dùng ảnh xung quanh** lấy một khung hình để MegaLoc đối chiếu với kho vector ảnh. Backend dùng vị trí nhận diện đủ chắc chắn hoặc mốc khớp với danh mục để tính tuyến trên đồ thị đường đi. Tia đọc phần đầu của tuyến bằng giọng Việt và nút **Mở lộ trình** hiển thị các chặng còn lại.

## Dữ liệu chung của nhóm (Supabase)

Bản đồ, điểm, đường nối, phòng, vết đi bộ, vector nhận diện và ảnh (sơ đồ, khung nhỏ) lưu trên **một project Supabase
riêng tư** để cả nhóm dùng chung. Mỗi người vẫn chạy backend trên laptop của mình (dùng GPU của mình), cùng trỏ vào
project đó. Mọi bảng bật RLS và không có policy, hai kho ảnh `maps` và `frames` là private: chỉ khoá service mới đọc
được. **Khoá này bỏ qua RLS, không đưa lên Git, không dán vào chat.**

Mỗi thành viên:
1. Xin khoá `SUPABASE_SERVICE_KEY` từ người quản lý project (qua kênh riêng của nhóm).
2. Sao chép `.env.example` ở thư mục gốc repo thành `.env` ở gốc repo, điền `SUPABASE_URL` và `SUPABASE_SERVICE_KEY` (dùng chung cho cả khung AI, backend và frontend).
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
