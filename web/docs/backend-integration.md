# Bàn giao frontend cho backend

Ngày 28/11/2026. `web/` là prototype riêng; giữ nguyên `vinuni-wayfinder/`, khung Python `run.py`, dữ liệu và bộ đánh giá. Không đưa UI mascot vào giao diện wayfinder hiện tại một cách tự động. Các mục dưới đây là điểm tích hợp tiếp theo, **chưa được nối trong commit này**.

## Các phần đã có

| Phần frontend | Nguồn hiện tại | Khi nối backend |
|---|---|---|
| Tìm kiếm, trang phòng, chọn điểm đến | `src/data.ts`: `places`, `getPlace`, `searchPlaces` | Thay danh mục bằng `GET /api/destinations`; dùng ID backend làm ID chuẩn. UI đang có category/ảnh/mô tả bổ sung, cần fallback khi API không trả các trường đó. |
| Chọn nơi đang đứng | `src/App.tsx`, danh mục fixture | `GET /api/spots/search?q=...` cho các điểm trong nhà; `spot` khác ID phòng. |
| Camera/chọn ảnh | `src/MascotCamera.tsx`, `src/App.tsx` | Thu nhỏ ảnh và loại EXIF trước khi gửi multipart `image` tới `POST /api/locate`. Hiện ảnh chỉ preview cục bộ. |
| Luồng xác nhận ảnh mẫu | `src/PhotoFlow.tsx`, `src/demoPhotos.ts` | Tách luồng mock khỏi luồng ảnh thật. Dùng `tier`, `top3`, `photoId`, `confidence` từ backend; bỏ timer giả 1,3 giây đối với ảnh thật. |
| Tuyến và thẻ từng bước | `src/data.ts`: `findRoute`, màn trong `src/App.tsx` | `GET /api/route?to=<room-id>&start=<spot-id>` hoặc `to=...&lat=...&lng=...`. Render `steps`; không tải đồ thị thật vào client. |
| Sự kiện/mascot | `src/events.ts`, `src/EventContext.tsx` | Thay localStorage bằng API + auth + storage. Giữ quy tắc `event` chỉ áp dụng khi khớp `to`. |
| Tạo mascot | `server/mascotApi.ts`, `src/MascotStudio.tsx` | Chuyển thành API máy chủ có quyền CLB, quota theo tài khoản và lưu kết quả. Middleware hiện chỉ chạy Vite dev, không phải backend production. |

Endpoint đối chiếu ở [`../../vinuni-wayfinder/backend/app/main.py`](../../vinuni-wayfinder/backend/app/main.py), ví dụ client sẵn có ở [`../../vinuni-wayfinder/frontend/src/api.js`](../../vinuni-wayfinder/frontend/src/api.js).

## Hợp đồng định vị/chỉ đường hiện có

- `GET /api/destinations`: `{ rooms: [{ id, code, name, aliases, building }], outdoorGeo }`.
- `POST /api/locate`: multipart `image`, tùy chọn `previous=<photoId>` để gộp ảnh thứ hai. Trả `photoId`, `spot`, `label`, `confidence`, `tier`, `top3`, `combined`, `ms`.
- `tier=auto`: đủ ngưỡng để dẫn đường, vẫn có thao tác sửa vị trí. `picker`: chọn trong các ứng viên. `second`: chụp thêm góc khác và gửi kèm `previous`; không ép người dùng lặp vô hạn.
- `GET /api/spots/search?q=...`: `{ spots: [{ spot, label }] }` cho lựa chọn thủ công.
- `GET /api/route`: trả `destination`, `start`, `steps`, `totalMeters`, `estSeconds`; backend loại `path` khỏi response. Mỗi step có `kind`, `text`, `meters`, `approx`, `mapKind`, `building`, `target`, `passes`, `side`.
- `estSeconds` hiện tính từ chiều dài / 1,2 m/s: **ước tính theo giả định**, không phải thời gian đã đo tại trường. Không gán số phút giả cho tuyến prototype.
- Lỗi FastAPI: `{ detail: { code, message } }`, gồm `no_index`, `bad_image`, `no_start`, `no_dest`, `no_geo`, `too_far`, `no_path`. Cần màn lỗi + chọn lại, không âm thầm đổi sang kết quả mock.
- `POST /api/correct` với `{ photoId, trueSpot }` làm thay đổi index. Chỉ gọi sau hành động xác nhận/sửa vị trí rõ ràng của người dùng; không gọi do mount component.

`GET /api/site` và các API thu thập chỉ dành cho giao diện thu thập; không dùng chúng để hiển thị mặt bằng/đồ thị trong PWA cho người tham dự.

## Nối dev và môi trường triển khai

Hiện `web/vite.config.ts` không proxy wayfinder vì các luồng đang mock. Khi triển khai adapter, thêm proxy các endpoint wayfinder tới backend FastAPI (xem cấu hình ở `vinuni-wayfinder/frontend/vite.config.js`). Tránh proxy cả `/api` đè lên `/api/mascot/*` của middleware local. Khi chuyển mascot sang backend, có thể thống nhất proxy/API origin.

Không đưa API key vào biến `VITE_*`. Trên điện thoại, camera và cảm biến cần HTTPS; dùng cùng origin qua proxy để tránh mixed content. Static Vercel không chạy FastAPI hoặc middleware Vite. Cấu hình service worker hiện loại `/api/` khỏi navigation fallback, không cache kết quả API.

## CLB và dữ liệu chung — đề xuất, chưa có API

Các type hiện tại ở `src/events.ts` là hợp đồng UI, **không phải schema DB đã chốt**:

- `CampusEvent`: `id`, `title`, `club`, `description`, `locationId`, `startsAt`, `endsAt`, `mascotId`, `status` (`draft`/`published`), `demo`.
- `MascotAsset`: `id`, `name`, `kind` (`vini`/`boba`/`image`), `image`, `brief`.

Backend nên gắn sự kiện với CLB/người sở hữu đã xác thực; `club` hiện là text nhập tự do. `locationId` phải được xác minh từ danh mục phòng; không mặc định ID fixture như `i109` trùng ID backend. Chốt quy ước UTC/múi giờ khi lưu lịch. Ảnh custom hiện là data URI tại máy; khi dùng object storage cần đổi validation và policy URL trong `events.ts`/`MascotStudio.tsx`, lưu metadata và quyền truy cập ở server.

Giữ Vini cho người đi bình thường; chỉ đổi mascot khi mở đường dẫn sự kiện hợp lệ. Link một sự kiện tự tạo hiện chưa chia sẻ được sang thiết bị khác vì kho sự kiện vẫn là localStorage.

## Bàn giao và kiểm chứng

Các test `web/src/*.test.ts`, `web/server/*.test.ts` và `web/scripts/verify*.mjs` kiểm prototype/fixture. Không phải benchmark MegaLoc hay bằng chứng độ chính xác tại VinUni. Sau khi có adapter thật, cần kiểm request/response, timeout, hủy request, các tier định vị, ID phòng/spot và tình huống backend thiếu index trước khi thử tại hiện trường.
