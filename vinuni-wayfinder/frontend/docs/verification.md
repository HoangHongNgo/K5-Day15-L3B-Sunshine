# Kiểm tra bản tích hợp web/

Ngày 28/11/2026, Node 22.17.1, macOS, Chrome headless. Kiểm trên build của **thư mục `web/` trong repo hackathon**, phục vụ tại cổng 4175; không dùng dev server của repo prototype cũ. Không gọi API tạo ảnh trả phí trong lượt kiểm tra này.

| Lệnh / kiểm tra | Kết quả |
|---|---|
| `npm ci` | Cài được từ lockfile |
| `npm test` | 10/10 test qua: đồ thị giả lập/tìm kiếm, sự kiện/mascot, xử lý ảnh mascot |
| `npm run build` | TypeScript + Vite + PWA build thành công |
| `PROTOTYPE_URL=http://localhost:4175 npm run verify` | Tìm/lưu phòng, tuyến mẫu, chọn ảnh, quyền vị trí, manifest, service worker/offline qua |
| `PROTOTYPE_URL=http://localhost:4175 npm run verify:v2` | Mascot, motion, camera giả lập cấp/từ chối quyền, dừng camera, WebGL fallback qua |
| `PROTOTYPE_URL=http://localhost:4175 npm run verify:campus` | Route sạch, dropdown, không có pin, ba tình huống ảnh mẫu, fallback và offline qua |
| `PROTOTYPE_URL=http://localhost:4175 npm run verify:events` | Nháp/đăng thử, validation, mascot theo sự kiện, upload, API mock/lỗi, quota bộ nhớ và offline qua |
| Responsive / Axe | Không tràn ngang hoặc phát hiện vi phạm Axe trong các viewport/màn được kiểm; không có lỗi JavaScript trong bốn báo cáo |
| Secret và phạm vi file | Không tìm thấy key qua mẫu credential và đối chiếu key local; không chuyển `.env`, `.vercel`, dữ liệu thật, ảnh tour hoặc build vào Git |

Ảnh mẫu công khai đã thay bằng tranh tổng hợp 640×360. Test upload được cập nhật kích thước fixture này (thay thumbnail cũ 240px) rồi chạy lại thành công. Các script tự tạo `artifacts/` trên checkout mới; báo cáo JSON và screenshot nằm tại đó, được Git bỏ qua.

Giới hạn: chưa kiểm trên iPhone/Android thật; camera trong test là nguồn giả lập của trình duyệt; nhận diện ảnh và tuyến vẫn mock. Vite còn cảnh báo chunk Three.js khoảng 592 kB trước gzip (đã lazy-load), build không lỗi. Các kết quả trên không phải benchmark AI/định vị.

`python3 run.py check` ở gốc repo chạy được nhưng báo hai thiếu sót sẵn có: bộ câu thử có 12 câu thay vì 20–30 cần cho CP3, và 0/12 câu có nguồn người dùng/data thật thay vì tối thiểu 1/3. Không sửa benchmark, nguồn, ngưỡng hoặc dữ liệu để làm mất cảnh báo.
