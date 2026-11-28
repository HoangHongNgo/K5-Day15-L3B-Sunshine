# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử và wayfinder (backend, frontend, môi trường PyTorch/MegaLoc) | Claude Code (Anthropic) | Viết và sửa code, cài môi trường, đọc repo tham khảo | __ (nhóm điền: ai chạy, ai kiểm, kiểm phần nào) | __ |
| Prompt / thiết kế lời gọi mô hình | | | | |
| Đào data (viết script đếm, gợi ý nhãn) | | | Kiểm tay __ dòng, khớp __ | |
| Rà câu hỏi phỏng vấn / khảo sát | | Chỉ rà câu dẫn dắt | | |
| Viết câu thử (benchmark) | Codex | Soạn B13–B20 từ tài liệu công khai của VinUni, ghi nguồn trước lượt 1 | Nguồn từng câu có trong eval/README.md, chờ thành viên đối chiếu | |
| Sinh data `synthetic` (nếu có) | | | Seed __ · kiểm tay __ dòng | |
| Đối chiếu lượt 1 | Codex | Chạy GPT-4.1 mini, đối chiếu sơ bộ đầu ra, soạn phiếu độc lập và báo cáo chi phí | Điểm đề xuất ghi trong eval/report.md. Cột pass chính thức và phiếu độc lập chờ người chấm | |
| Slide, văn bản (PRD, spec, data card, canvas, README) | Claude Code (Anthropic) | Soạn và cập nhật tài liệu theo quyết định của nhóm (27/11/2026) | __ (nhóm điền: đã đọc và sửa gì) | __ |
| Kiểm tra và sửa nhánh hỏi lại sau CP4 | AGY, Codex | AGY viết test hồi quy và xác nhận bước Red. Codex hoàn thiện code sau khi AGY hết quota, chạy lại test và phát lại trace lượt 1 | Codex đối chiếu diff, kiểm test Red → Green và chạy `make check`. Chờ thành viên duyệt | Phần bản chạy thử theo [TEAMS.md](../TEAMS.md) |
| Hồ sơ nộp sau CP4 | Codex | Đọc rubric, đối chiếu khảo sát và clip do nhóm cung cấp, tái lập dự toán từ token, tổng hợp slide và chuẩn bị bản nháp reflection | Ảnh gốc, điểm chấm độc lập và trải nghiệm cá nhân cần nguồn hoặc xác nhận của thành viên | Theo phân công tại [TEAMS.md](../TEAMS.md) |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
