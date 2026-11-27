# Data card — dữ liệu bản chạy thử dùng

> Bản CP2. Toàn bộ dữ liệu chạy thử là **synthetic**, nhóm tự viết tay. Không phải bằng chứng pain.

## Dataset 1 · Bản đồ khuôn viên giả lập (`data/campus.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn cho công cụ `tra_dia_diem`, `danh_sach_dia_diem`, `tim_lo_trinh` · đáp án cho bộ câu thử |
| Từ đâu | nhóm tự viết tay, mô phỏng một khuôn viên đại học điển hình (cổng, sân trung tâm, toà A/B/C, nhà thể thao). **Không phải sơ đồ thật của VinUni** |
| Xử lý những bước gì | không có (viết tay). Mỗi địa điểm có mã, tên, bí danh, toà, tầng; mỗi lối đi có câu chỉ đường và số phút |
| Số dòng / số đoạn | 12 địa điểm · 11 lối đi (đi được hai chiều) |
| Phiên bản / ngày lấy | v1 · 27/11/2026 |
| Nhãn | `synthetic` |
| Giới hạn | ít địa điểm, không có thang máy riêng / lối cho người khuyết tật, số phút là *(tự ước tính)*; chưa đối chiếu với khuôn viên thật |

## Dataset 2 · Lịch hoạt động giả lập (`data/events.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn cho `tra_dia_diem`, `tao_ma_checkin` · câu thử về hoạt động |
| Từ đâu | nhóm tự viết tay, mô phỏng tuần đầu của tân sinh viên |
| Xử lý những bước gì | không có |
| Số dòng / số đoạn | 6 hoạt động |
| Phiên bản / ngày lấy | v1 · 27/11/2026 |
| Nhãn | `synthetic` |
| Giới hạn | giờ và tên hoạt động là giả; không có hoạt động trùng giờ / trùng tên |

**Cách sinh:** viết tay, không dùng LLM, không cần seed. Người kiểm: Nguyễn Ánh Dương *(cần kiểm tay toàn bộ 12 địa điểm, 11 lối đi, 6 hoạt động trước CP3)*.
**Không dùng:** sơ đồ, lịch, danh sách sinh viên thật của bất kỳ trường nào.
