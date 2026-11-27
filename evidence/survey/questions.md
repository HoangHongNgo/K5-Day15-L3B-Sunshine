# Khảo sát — bộ câu hỏi và kênh gửi

- **Kênh:** Google Form gửi trong lớp, cho các bạn cùng khoá AI20K; đã loại phiếu của thành viên nhóm Sunshine.
- **Thời gian nhận phiếu:** phiếu đầu 27/11/2026 17:37, phiếu cuối 27/11/2026 19:58. n = 27.
- **Kết quả:** [`results.csv`](results.csv). Mỗi phiếu có mã `R01`…`R27` theo thứ tự thời gian; form không thu tên/email.
- **Cách đếm:** [`count.py`](count.py) (`python evidence/survey/count.py`).
- **Lưu ý:** chữ của các lựa chọn ở Câu 5, 6, 7, 10 được rút gọn giữa chừng (R01–R04 dùng bản dài, từ R05 dùng bản
  ngắn). Ở bản dài, Câu 5 gộp "Tòa B, Tòa E, SuperLab, Sports Complex" vào một lựa chọn.

| # | Câu hỏi | Kiểu |
|---|---|---|
| 1 | Bạn đang thuộc nhóm nào tại VinUni? | Chọn một |
| 2 | Bạn đã học tập/làm việc tại VinUni được bao lâu? | Chọn một |
| 3 | Điện thoại chính bạn mang theo hằng ngày khi ở trường dùng hệ điều hành nào? | Chọn một |
| 4 | Trong khoảng thời gian mới đến VinUni, bạn đã từng gặp khó khăn khi tìm phòng/tòa tổ chức hoạt động bao nhiêu lần? | Chọn một |
| 5 | Khu vực nào ở VinUni khiến bạn dễ nhầm hoặc mất thời gian tìm? (tối đa 3) | Chọn nhiều |
| 6 | Lần gần nhất bạn khó tìm đường/phòng ở VinUni, nguyên nhân chính là gì? (tối đa 2) | Chọn nhiều |
| 7 | Hậu quả lớn nhất bạn từng gặp phải do không tìm được đường/phòng là gì? | Chọn một (R01, R04 chọn nhiều) |
| 8 | Lúc không chắc đường đi tới phòng/sự kiện, phản xạ ĐẦU TIÊN của bạn thường là gì? | Chọn một |
| 9 | Cách xử lý ở Câu 8 có điểm nào khiến bạn thấy phiền hoặc bất tiện nhất? (không bắt buộc) | Đoạn văn |
| 10 | Giả sử bạn đang đứng ở một khu vực trong VinUni và cần tới nhanh một phòng/sự kiện lạ, bạn muốn nhận chỉ dẫn theo cách nào nhất? (tối đa 2) | Chọn nhiều |
