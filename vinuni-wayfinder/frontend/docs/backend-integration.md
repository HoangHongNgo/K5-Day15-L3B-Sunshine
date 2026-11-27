# Bàn giao frontend cho backend

Cập nhật 28/11/2026. Frontend đã được gộp về duy nhất thư mục `vinuni-wayfinder/frontend/`, tổ chức theo từng feature trong `src/features/` và nối trực tiếp tới backend FastAPI (`vinuni-wayfinder/backend/app/main.py`) qua `src/features/wayfinder/`, `src/features/collect/` (route `/thu-thap` và `#thu-thap`) và proxy trong `vite.config.ts` (giữ nguyên fallback mô phỏng khi chạy tĩnh/ngoại tuyến). Mọi thay đổi tính năng/sửa lỗi tuân thủ quy trình **viết test trước khi làm (TDD)** theo `AGENTS.md`. Phần sự kiện CLB và lưu mascot chung vẫn dùng `localStorage` + middleware dev cục bộ cho tới khi có API CLB + xác thực.

## Các phần đã có

| Phần frontend | Vị trí feature | Trạng thái kết nối backend |
|---|---|---|
| Tìm kiếm, trang phòng, chọn điểm đến | `src/features/wayfinder/` (`WayfinderContext.tsx`, `wayfinderApi.ts`, `data.ts`), `src/features/explore/` | **Đã nối** `GET /api/destinations` (giữ ID backend làm chuẩn, tự suy luận icon/category/mô tả khi API không trả). |
| Chọn nơi đang đứng | `src/features/navigation/ChooseLocationPage.tsx` | **Đã nối** `GET /api/spots/search?q=...` cho điểm trong nhà và GPS ngoài trời khi `outdoorGeo=true`. |
| Camera/chọn ảnh | `src/features/localization/` (`MascotCamera.tsx`, `PhotoLocationPage.tsx`) | **Đã nối** thu nhỏ ≤ 512px + xoá EXIF (`prepPhotoBlob`) và gửi multipart `image` (+ `previous`) tới `POST /api/locate`, xử lý 3 tầng `auto`/`picker`/`second` và chỉ gọi `POST /api/correct` khi người dùng chủ động xác nhận. |
| Luồng xác nhận ảnh mẫu | `src/features/localization/` (`PhotoFlow.tsx`, `demoPhotos.ts`) | Giữ tách riêng ở `/anh-mau` cho demo minh hoạ, không trộn với ảnh thật ở `/anh`. |
| Tuyến và thẻ từng bước | `src/features/navigation/` (`PlanRoutePage.tsx`, `JourneyPage.tsx`) | **Đã nối** `GET /api/route?to=<room-id>&start=<spot-id>` hoặc `to=...&lat=...&lng=...`. Render `steps` + mốc `passes`; hiển thị lỗi FastAPI rõ ràng, không âm thầm fallback sang mock khi đang kết nối live. |
| Thu thập dữ liệu bản đồ | `src/features/collect/` (`Collect.jsx`, `CollectPage.tsx`, `api.js`) | **Đã nối** toàn bộ API thu thập (`/api/site`, `/api/spots`, `/api/maps/*`, `/api/frames/*`, `/api/traces`, `/api/export`, `/api/import`) ở `/thu-thap`. |
| Sự kiện/mascot | `src/features/events/`, `src/features/mascot/` | **Chưa có API CLB** — vẫn dùng localStorage; `validateEvent` và `activeEvent` đã hỗ trợ ID phòng từ backend live. |
| Tạo mascot | `server/mascotApi.ts`, `src/features/mascot/MascotStudio.tsx` | **Chưa có API production** — giữ middleware Vite dev `/api/mascot/*` (proxy wayfinder không đè lên route này). |

Endpoint đối chiếu ở [`../../backend/app/main.py`](../../backend/app/main.py), client thu thập ở [`../src/features/collect/api.js`](../src/features/collect/api.js) và client wayfinder ở [`../src/features/wayfinder/wayfinderApi.ts`](../src/features/wayfinder/wayfinderApi.ts).

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
