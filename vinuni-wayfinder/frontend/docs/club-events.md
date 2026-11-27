# CLB, sự kiện và mascot

## Đường dẫn

- `/clb`: quản lý sự kiện trong bản thử.
- `/clb/su-kien/moi`: tạo sự kiện, chọn địa điểm và mascot.
- `/clb/su-kien/:id/chinh-sua`: sửa hoặc lưu lại thành bản nháp.
- `/clb/mascot`: chọn mẫu, tải ảnh hoặc tạo mascot bằng AI.
- `/su-kien`: danh sách sự kiện đã đăng thử.
- `/su-kien/:id`: trang cho người tham dự, có nút dẫn đường.

Tất cả cùng một ứng dụng và origin ở giai đoạn này. Chưa cần subdomain.
Khi có tên miền riêng và hệ thống tài khoản, khu CLB có thể được tách sang
`clubs.<tên-miền-riêng>`, dùng chung API và cơ sở dữ liệu với PWA.

## Quy tắc đổi mascot

Vini là mặc định. Link từ một sự kiện có cả `to=<locationId>` và `event=<id>`.
Chỉ một sự kiện đã đăng thử, đủ thông tin và có địa điểm khớp với `to` mới
được kích hoạt. Nhiều sự kiện cùng phòng không tự ghi đè mascot của nhau.

Ngữ cảnh được giữ qua chọn vị trí, camera, ảnh mẫu, xác nhận, xem tuyến,
tiến/lùi chặng và reload. Đổi điểm đến xoá `event`; kết thúc hành trình trở
về tuyến thông thường. URL phòng không có `event` luôn dùng Vini.

## Dữ liệu và giới hạn bản thử

Sự kiện và mascot riêng lưu ở `localStorage` trên trình duyệt hiện tại, không
phải một hệ thống đăng sự kiện công khai. Có kiểm tra dữ liệu đầu vào, thời
gian kết thúc, địa điểm thuộc danh mục, lỗi quota và đồng bộ giữa các tab.
Giới hạn 50 sự kiện, 12 mascot tự tạo. Bản nháp không xuất hiện phía người tham
dự. Những sự kiện có sẵn được gắn nhãn dữ liệu mẫu.

Ảnh tải lên chỉ nhận PNG/JPG/WebP dưới 3 MB, mỗi chiều 64–4096px; trình duyệt
chuẩn hoá thành WebP 512px và lưu tại máy. SVG và URL ảnh ngoài không được
nhận. Ảnh chụp vị trí vẫn không được tải lên hoặc lưu. Mascot custom là một
ảnh 2D có chuyển động CSS; Vini có bộ tư thế, Boba dùng sprite cũ. Chưa có
mesh/rig 3D cho mascot tự tạo.

## Tạo AI trên localhost

`server/mascotApi.ts` là middleware của Vite dev server, **không được đóng gói
vào client hoặc bật trên bản Vercel tĩnh**. Dùng `OPENAI_API_KEY` từ môi trường
tiến trình hoặc file `.env.local` được Git bỏ qua trong thư mục `web/`; không dùng
tiền tố `VITE_`. Khởi động lại dev server sau khi thay env.

- GET `/api/mascot/status`: thông báo khả dụng và token chống gọi chéo origin.
- POST `/api/mascot/generate`: tên, CLB và mô tả; chỉ gọi sau khi bấm tạo.
- Chỉ cho loopback + đúng Origin + token của phiên máy chủ. Không mở API
  tính phí cho máy khác trong LAN.
- Một yêu cầu đang chạy tại một thời điểm, tối đa 3 lượt / 10 phút trên mỗi
  tiến trình; không tự retry. Timeout 120 giây. Bộ giới hạn này là dành cho
  local dev, chưa thay thế quota theo tài khoản khi triển khai thật.
- Model `gpt-image-2`, medium, 1024px. Account hiện từ chối tham số nền trong
  suốt (`400 invalid_value`, `background`), nên dùng nền chroma rồi tách alpha
  và tối ưu trên máy chủ bằng Sharp. Không đổi model.
- Brief gồm tên mascot, tên CLB và mô tả được gửi tới OpenAI; không gửi ảnh
  camera hoặc key về frontend. Mỗi lần tạo/thử lại do người dùng bấm là một
  yêu cầu API mới. Không ước tính token; response giữ `usage` gốc nếu có.

Các bài kiểm tra tự động dùng phản hồi AI giả lập, không gọi API trả phí. Thời gian và chi phí tạo thật phụ thuộc yêu cầu/model; theo dõi `usage` trả về và tài khoản API.

## Trước khi dùng chung cho nhiều CLB

Cần đăng nhập + quyền chủ sở hữu CLB, cơ sở dữ liệu chung, object storage cho
ảnh, trạng thái duyệt/đăng/ẩn và API tạo ảnh có quota bền vững theo tài khoản.
Không chỉ chuyển middleware local thành API công khai. Chọn địa điểm vẫn
phải dùng danh mục đã xác minh; đồ thị hiện tại hoàn toàn là mô phỏng.

## Kiểm tra

```sh
npm test
npm run build
npm run preview
# Terminal khác:
npm run verify:events
```

`verify:events` dùng fixture cho phản hồi AI, không phát sinh lượt gọi trả phí.
Kiểm tra draft/publish, validation, reload, camera/ảnh mẫu, giữ/reset mascot,
upload, lỗi API, lỗi bộ nhớ, 320–1440px, Axe và offline. Những bộ kiểm tra
`verify`, `verify:v2`, `verify:campus` vẫn kiểm các luồng cũ.

API tham khảo:
- https://developers.openai.com/api/docs/guides/image-generation
- https://github.com/lovell/sharp/blob/main/docs/src/content/docs/api-output.md
