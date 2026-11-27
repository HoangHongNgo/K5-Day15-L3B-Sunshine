# Sự kiện CLB và mascot 3D

## Tạo một sự kiện

Trong `/clb/su-kien/moi`, BTC nhập tên, mô tả, thời gian theo giờ Việt Nam, địa điểm và các trạm dừng nếu cần. Điểm gặp AR dùng vĩ độ và kinh độ của địa điểm tổ chức. BTC có thể nhập tay hoặc lấy vị trí hiện tại khi đang đứng tại địa điểm đó.

Chọn cáo Tia hoặc tạo một nhân vật riêng. Sau khi lưu nháp, BTC có thể mở lại ở `/clb/su-kien/:id/chinh-sua`. Khi công bố, trang `/su-kien/:id` hiển thị mascot đã chọn và đường dẫn cho người tham dự. `/clb/mascot` mở thư viện mô hình. Liên kết dẫn đường giữ mã sự kiện và địa điểm để Vini hướng dẫn qua các bước chọn vị trí, chụp ảnh, xác nhận và xem tuyến.

## Từ mô tả đến mô hình 3D

1. Đăng nhập tài khoản BTC, nhập tên và mô tả từ 15 đến 600 ký tự. Nêu hình dáng, màu sắc và phụ kiện. Ví dụ, “Một robot xanh lá có thân hình tròn và đội một chiếc lá nhỏ”.
2. Nhấn **Tạo mascot 3D**. FastAPI gửi tên, mô tả và tên CLB tới OpenAI. Mỗi lần nhấn tạo là một lượt API có thể tính phí. Bản thử giới hạn ba lần tạo trong mười phút trên mỗi tiến trình backend.
3. Xoay bản xem trước để kiểm tra các mặt. Mỗi thiết kế gồm các khối hình có màu sắc, kích thước, góc xoay và vị trí riêng. Các bộ phận được ghép thành thân, hai tay và miệng để dùng cho động tác vẫy tay, nhảy, múa và nói chuyện.
4. Nhấn **Dùng mascot này** để lưu thiết kế vào thư viện và chọn cho sự kiện. BTC có thể tạo nhiều phiên bản, mỗi phiên bản có mã riêng. Bản xem trước chỉ được lưu khi BTC chọn dùng.

Sự kiện cũ có thể tham chiếu Vini, Boba hoặc ảnh đã tải lên. Dữ liệu cũ vẫn đọc được. Trải nghiệm sự kiện dùng Tia khi chưa có mô hình 3D phù hợp. Vini 2D đảm nhiệm phần dẫn đường.

## Trải nghiệm tại sự kiện

Từ trang sự kiện, **Xem mascot 360°** mở mô hình của CLB. Người xem có thể kéo để xoay, thử bốn động tác và tải GLB. Nút **Dẫn đường tới sự kiện** mở hành trình với Vini.

Trong **Gặp mascot trong AR**, sự kiện minh hoạ có tọa độ dùng GPS mô phỏng ở cách điểm gặp 20 m. Với sự kiện mới có tọa độ trên máy phát triển, người thử có thể nhấn **Dùng vị trí mô phỏng**. Với GPS thật, bán kính mở khóa là 50 m và sai số tối đa là 30 m. Sau khi nhấn **Mở camera AR**, chạm vào khung hình để đặt mascot. Thanh **Kích thước mascot** cho phép thu nhỏ hoặc phóng to trước khi chụp. Camera và GPS cần HTTPS hoặc localhost.

Trong nhà, chọn **Định vị trong nhà bằng ảnh** để gửi ảnh cửa phòng cho Wayfinder. Máy chủ cần có ảnh tham chiếu gắn với điểm của phòng trong danh mục. AR mở khóa khi nhận diện tự động khớp đúng địa điểm tổ chức, kể cả khi sự kiện chưa có tọa độ GPS. Nếu một điểm dùng chung cho nhiều phòng, kết quả xác nhận khu vực cửa chung.

- **Nói chuyện** nhận câu hỏi bằng mic trên trình duyệt hỗ trợ hoặc bằng bàn phím. Mascot trả lời theo mô tả, lịch, địa điểm và trạm dừng đã công bố. Khi thiết bị phát câu trả lời bằng giọng nói, miệng mascot chuyển động theo thời gian phát.
- **Chụp ảnh** ghép khung camera và mô hình. Người dùng có thể chụp lại hoặc gửi cho CLB sau khi xem ảnh và xác nhận. CLB mở album ở trang sự kiện, tải lại để xem ảnh chờ, rồi duyệt hoặc từ chối. Bản thử có 24 chỗ trong mỗi album, tính cả ảnh chờ duyệt.
- Tạo mô hình, hỏi đáp và gửi ảnh cần máy chủ hoạt động. Với Supabase, migration `20261128040000_event_album.sql` bổ sung điểm gặp GPS và bảng ảnh.

## Chạy dịch vụ

Backend FastAPI đọc `OPENAI_API_KEY` từ môi trường tiến trình hoặc `.env` ở gốc repo. `MASCOT_3D_MODEL` cho phép chọn model hỗ trợ Structured Outputs, mặc định `gpt-4.1-mini`. Khi đổi cấu hình, khởi động lại backend. Vite chuyển tiếp các yêu cầu API tới backend theo `WAYFINDER_BACKEND`.

- `POST /api/club-mascots/generate` nhận phiên BTC qua Bearer token cùng `name`, `brief`, `club` và trả về bản xem trước. API kiểm tra số khối, loại hình, màu sắc, nhóm chuyển động và giới hạn giá trị trước khi trả kết quả.
- `PUT /api/club-mascots/:id` lưu thiết kế theo tài khoản BTC. Với Supabase, chạy các migration trong `supabase/migrations`, bao gồm `20261128031000_club_mascot_models.sql`, trước khi lưu mô hình. Backend chỉ cần khoá service ở phía máy chủ.
- `GET /api/events` trả sự kiện và thư viện. Khi thiếu cấu hình Supabase, backend ghi JSON cục bộ. Trình duyệt giữ bản sao để xem lại. Danh sách sự kiện của bản thử hiển thị tối đa 50 sự kiện.

## Kiểm tra

Tại thư mục frontend, chạy các lệnh dưới đây. Máy chạy bộ kiểm tra trình duyệt cần Chrome. Biến `CHROME_PATH` chỉ định vị trí Chrome nếu cần.

```sh
npm test
npm run build
npm run preview
# Trong terminal khác, trỏ vào ứng dụng đang chạy
PROTOTYPE_URL=http://localhost:4173 npm run verify:events
```

Bộ kiểm tra trình duyệt dùng phản hồi AI giả lập để kiểm tra lỗi API, xem trước nhiều góc, lưu mascot, công bố sự kiện, dẫn đường, các kích thước màn hình và khả năng truy cập. Bản preview có service worker còn được kiểm tra khi tải lại ngoại tuyến. Kiểm tra backend dùng `python -m pytest tests/test_mascot_generator.py` từ thư mục backend.
