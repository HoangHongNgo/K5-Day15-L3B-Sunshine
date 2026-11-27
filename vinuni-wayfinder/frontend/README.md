# VinUni AR Map — prototype web/PWA

Giao diện tiếng Việt của team Sunshine: khám phá khuôn viên minh hoạ 3D, tìm phòng, trải nghiệm dẫn đường, mascot và sự kiện CLB. React 19 + TypeScript + Vite + Three.js; ưu tiên điện thoại với ba tab, hỗ trợ desktop, cài PWA và ngoại tuyến.

Đây là prototype UI chạy độc lập trong repo hackathon. Backend và giao diện thu thập dữ liệu của anh Hoàng nằm ở [`../vinuni-wayfinder/`](../vinuni-wayfinder/README.md). Bản này **chưa gọi backend định vị/chỉ đường**; không thay đổi phạm vi đánh giá hackathon hay các file benchmark.

## Chạy

Node.js 22.12+ trong nhánh 22.x, npm. Từ thư mục gốc repo:

```sh
cd web
npm ci
npm run dev
```

Mở http://localhost:5173. Nếu đang chạy prototype cũ hoặc frontend khác ở cổng đó: `npm run dev -- --port 5174`.

Không cần API key cho các luồng mô phỏng. Muốn dùng nút tạo mascot AI tại localhost, sao chép `.env.example` thành `.env.local` **trong `web/`**, điền `OPENAI_API_KEY` tại máy rồi khởi động lại dev server. Cũng có thể truyền biến qua môi trường tiến trình. Không dùng tiền tố `VITE_`; không tự đọc `.env` ở gốc repo. [Chi tiết API mascot](docs/club-events.md).

Để thử PWA/offline:

```sh
npm run build
npm run preview
```

Preview ở http://localhost:4173. Camera/GPS/service worker trên điện thoại cần HTTPS hoặc localhost; HTTP qua IP LAN chỉ phù hợp xem UI.

## Các màn chính

| URL | Trải nghiệm |
|---|---|
| `/` | Khám phá, tìm kiếm không dấu, dropdown lọc, mô hình kiến trúc |
| `/dia-diem/i109` | Chi tiết địa điểm mẫu |
| `/di-den?to=i109` | Chọn điểm xuất phát và tuyến giả lập |
| `/anh` | Camera/chọn ảnh, mascot phủ trên hình; chưa có AR neo không gian |
| `/anh-mau?to=i109` | Chọn ảnh minh hoạ → gợi ý/nhiều ứng viên/không nhận ra → xác nhận → dẫn đường |
| `/da-luu` | Địa điểm đã lưu trên thiết bị |
| `/clb` | Quản lý sự kiện cục bộ |
| `/clb/su-kien/moi` | Tạo sự kiện, chọn địa điểm và mascot |
| `/clb/mascot` | Mẫu có sẵn, tải ảnh hoặc tạo mascot AI trên localhost |
| `/su-kien` | Các sự kiện đã đăng thử trên trình duyệt này |

Mỗi màn có đường dẫn History API riêng; reload/back/forward và link `/#/...` cũ được xử lý. Vini là mascot mặc định. Đi từ trang sự kiện sẽ dùng mascot của sự kiện đó; đổi sang điểm đến thông thường sẽ trở về Vini.

## Dữ liệu và giới hạn

- Tên phòng, đồ thị, hướng rẽ và kết quả nhận diện là fixture để thử UI, chưa dùng đi thực tế. Không có pin địa điểm trên mô hình minh hoạ.
- Ba ảnh mẫu được vẽ bằng code, không phải ảnh trường/mặt bằng/ảnh nhận diện. [Nguồn asset](docs/sources.md).
- Sự kiện và mascot tự tạo lưu trong `localStorage`; chưa có tài khoản, cơ sở dữ liệu chung hoặc đồng bộ giữa người dùng. “Đăng thử” chưa xuất bản ra hệ thống của trường.
- Camera vị trí và GPS không upload hoặc lưu. Riêng brief mascot gửi tới OpenAI khi người dùng bấm tạo. API này chỉ phục vụ dev localhost; bản static có mẫu sẵn và upload ảnh.
- Vini/Boba là sprite 2D; mascot tự tạo là ảnh có chuyển động CSS, chưa phải mô hình 3D có rig.

## Bàn giao backend

Xem [các điểm nối API cho anh Hoàng](docs/backend-integration.md). Danh mục, nhận diện, tuyến đường và kho sự kiện được chỉ rõ theo file; endpoint wayfinder đối chiếu với backend hiện có. Không cần sửa backend để chạy prototype.

## Kiểm tra

Từ `web/`:

```sh
npm test
npm run build
npm run preview
# Terminal khác, vẫn tại web/:
npm run verify
npm run verify:v2
npm run verify:campus
npm run verify:events
```

Các bài browser test dùng Chrome headless riêng. macOS mặc định dùng Google Chrome; hệ điều hành khác đặt `CHROME_PATH` là đường dẫn Chrome/Chromium. Đặt `PROTOTYPE_URL` nếu preview dùng cổng khác. Mỗi script tự tạo `artifacts/` để ghi báo cáo và ảnh, Git bỏ qua thư mục này. Test mascot mock phản hồi API, không tốn lượt tạo ảnh. Axe là kiểm tra tự động, chưa thay thế thử trên điện thoại thật.

[Kết quả kiểm tra bản tích hợp](docs/verification.md).

## Triển khai riêng

Nếu nối repo hackathon với Vercel, chọn **Root Directory = `web`**, Node 22.x, install `npm ci`, build `npm run build`, output `dist`. `web/vercel.json` xử lý các route SPA. Backend Python vẫn cần chạy/deploy riêng. Không có cấu hình tài khoản `.vercel` hoặc liên kết tự động với deployment của repo prototype cũ.

Chỉ chuyển thư mục vào nhánh Git không triển khai bản mới. API tạo mascot local không được triển khai trong bản static; muốn bật cho nhiều CLB cần API có đăng nhập, phân quyền và quota bền vững.
