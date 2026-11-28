# Dàn slide → lấy số từ file nào

> Làm ở guide bước 5.1. Luật: **không có bằng chứng thì không có slide** — mỗi trang ≥1 con số / trích dẫn có nguồn / kết quả đo.
> Xuất PDF thành `demo-slides.pdf` ở thư mục gốc repo, nộp tại CP4 14:30 Thứ Bảy 28/11. Nộp PDF, không nộp link.

| # | Trang | Có gì | Số lấy từ | Xong |
|---|---|---|---|---|
| 1 | Người dùng & pain | Ai · việc gì · chỗ đau + số và trích dẫn | `evidence/summary.md` | ☐ |
| 2 | Vì sao chọn bài này | Bảng impact rút gọn + hướng bị loại | `spec.md` §2 | ☐ |
| 3 | Giải pháp | Lát cắt một câu · sơ đồ · AI tự làm đến đâu, vì sao | `spec.md` §4 | ☐ |
| 4 | Demo live | 1 trường hợp thường + 1 trường hợp khó (lấy từ bộ câu thử); mạng hỏng → video dự phòng | `eval/benchmark.csv` | ☐ |
| 5 | **Đánh giá thế nào** | Dataset · bộ câu thử · metric · lượt 1 → lượt 2 so với chuẩn "đạt" (kèm run ID) · lỗi chính | `eval/README.md`, `eval/report.md` | ☐ |
| 6 | **Chi phí khi dùng thật** | Chi phí / task thành công · 3 kịch bản · so với impact | `cost/cost-estimate.md` | ☐ |
| 7 | Kết luận | Go / iterate / stop — dẫn số ở trang 1, 5, 6 | — | ☐ |
| 8 | Nếu có thêm 1 tuần | 2–3 việc, trỏ về lỗi còn lại / phản hồi người dùng | `eval/report.md` mục 4 · `validation/log.md` | ☐ |

**Tệp dùng khi demo:** [Bản PDF 8 trang](../demo-slides.pdf) · [Video dự phòng](demo-du-phong.webm) · [Ghi chép demo thực địa C401](../evidence/mobile-demo.md).

Chạy `python3 run.py` với khóa của nhóm. Dùng B01 để minh họa tuyến rõ ràng, rồi dùng B13 để minh họa yêu cầu trái với danh mục. Khi gặp lỗi mạng, mở video dự phòng để trình bày luồng thẻ chỉ dẫn bằng dữ liệu minh họa và kết quả thật của lời gọi MegaLoc production. Báo cáo kết quả chấm theo trạng thái trong [eval/report.md](../eval/report.md).

Phân đoạn trình bày đề xuất để nhóm chốt:

| Trang | Người nói |
|---|---|
| 1–2 | Nguyễn Minh Phương |
| 3–4 | Nguyễn Văn Hải Quân |
| 5–6 | Nguyễn Ánh Dương |
| 7–8 | Ngô Hồng Hoàng |
