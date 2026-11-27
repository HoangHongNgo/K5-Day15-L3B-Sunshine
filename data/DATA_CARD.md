# Data card — dữ liệu bản chạy thử dùng

> Bản CP2, cập nhật 27/11/2026. Dataset 1–2 (bản chạy thử trong `codebase/`) là **synthetic**, nhóm tự viết tay. Dataset 3–4 là dữ liệu thật cho wayfinder và **chưa số hoá / chưa quay** (ghi rõ trạng thái từng dòng). Không dataset nào là bằng chứng pain.

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

## Dataset 3 · Sơ đồ khuôn viên và mặt bằng tầng trệt Toà G, Toà I (wayfinder)

| | |
|---|---|
| Dùng để làm gì | dựng đồ thị đường đi (nút: cửa, ngã rẽ, cửa phòng, thang máy, cầu thang, lối ra; cạnh: đoạn hành lang) cho `tim_lo_trinh` · danh sách phòng/địa điểm · đáp án cho bộ đo wayfinder |
| Từ đâu | (a) **sơ đồ khuôn viên**: từ 28/11/2026 lấy từ **OpenStreetMap** (footprint toà A–J, đường đi bộ, lối vào, cổng), truy vấn qua Overpass bằng `vinuni-wayfinder/backend/tools/build_osm_campus.py`; dữ liệu © OpenStreetMap contributors, giấy phép ODbL — phải ghi nguồn khi hiển thị. Trước đó là ảnh sơ đồ sự kiện có toà A–L, cổng chính (Main Gate), cổng San Ho (San Ho Gate), sân chính (đã thay, không còn dùng); (b) **mặt bằng tầng trệt Toà I**: ảnh chụp biển "Floor map" của VinUniversity dán trong toà, do thành viên nhóm chụp; (c) **mặt bằng tầng trệt Toà G**: ảnh chụp bảng "Fire Evacuation Plan" trong toà, do thành viên nhóm chụp. Ảnh giữ ở `vinuni-wayfinder/maps/` trên máy nhóm (`campus-osm.webp`, `campus-map.webp` cũ, `toa-I-tang-tret.webp`, `toa-G-tang-tret.webp`, lưu 27–28/11/2026); đồ thị dùng chung nằm trong project Supabase riêng tư của nhóm; thư mục này **bị `.gitignore` chặn nên không lên repo công khai** |
| Xử lý những bước gì | khuôn viên: dựng đồ thị đi bộ trong ranh giới trường từ OSM, rút gọn khúc cua nhỏ, gắn cổng và cửa toà vào đỉnh đường gần nhất. Toà G, Toà I: vẽ điểm và hành lang trên ảnh bằng chế độ thu thập; Toà G neo bằng 3 điểm GPS đo tại chỗ (sai số 4,9 m). Còn lại: đi bộ kiểm từng điểm |
| Số dòng / số đoạn | khuôn viên ~290 điểm, ~400 cạnh; Toà G 33 điểm (phòng G101–G107, 2 khu WC, 2 thang máy, 2 cầu thang); toàn bộ dữ liệu dùng chung lúc kiểm 28/11/2026: 355 điểm, 476 đường nối, 27 phòng. Toà I — từ ảnh biển đọc được các khu: Trung tâm Khởi nghiệp, Vườn Thư viện, quầy cà phê, khu tự học mở, quầy tiện ích, văn phòng, phòng I109 và I119, nhà vệ sinh, thang máy, cầu thang; lối sang toà A, B, C, E và bãi xe |
| Phiên bản / ngày lấy | 27/11/2026 (ảnh), 28/11/2026 (đồ thị OSM, Toà G) |
| Nhãn | `thật — chưa kiểm`; không phải `synthetic` |
| Giới hạn | ảnh biển chụp nghiêng, có chói; chữ nhỏ (ví dụ tên phòng I119, I109) có thể đọc sai; biển có thể không cập nhật; ảnh biển không có kích thước thật (tỉ lệ Toà G 0,04 m/px là *(tự ước tính)*); cổng và cửa toà ngoài trời suy từ OSM, không phải cửa thật; Toà K không có trong OSM; tên cửa Toà G theo hướng trên bảng, có thể lệch hướng thật; **phải đi bộ kiểm từng phòng trước khi dùng làm đáp án** |

## Dataset 4 · Ảnh và video hành lang để nhận diện vị trí (wayfinder)

| | |
|---|---|
| Dùng để làm gì | tính vector MegaLoc cho từng điểm, làm chỉ số tra cứu khi người dùng chụp ảnh; chia train/test theo video để đo |
| Từ đâu | nhóm tự quay bằng điện thoại ở hành lang công cộng tầng trệt Toà G và Toà I, qua chế độ thu thập: chạm điểm trên sơ đồ rồi quay 10–15 giây xoay nhiều hướng |
| Xử lý những bước gì | backend cắt khoảng 40 khung rõ nét/điểm, tính vector MegaLoc rồi xoá video gốc; chỉ vector và nhãn được dùng khi chạy. Làm mờ khuôn mặt: dự kiến, chưa cài |
| Số dòng / số đoạn | 240 vector trong kho dùng chung (đếm 28/11/2026), là dữ liệu thử ban đầu; **chưa quay đủ** ở Toà G và Toà I, chưa có số đo độ chính xác |
| Phiên bản / ngày lấy | 28/11/2026 (bản thử) |
| Nhãn | `thật — đang thu thập` |
| Giới hạn | dự kiến quay ở chiều cao cầm tay, chưa phủ tầm ngồi xe lăn; thay đổi ánh sáng và đông người có thể làm sai; các hành lang giống nhau dễ nhầm |
| Riêng tư / an ninh | chỉ quay hành lang công cộng, bỏ khu dịch vụ và khu hạn chế; **không đưa ảnh, video, đồ thị hay vector lên repo công khai** (một bộ ảnh đầy đủ của toà nhà là rủi ro an ninh); tên ảnh không chứa thông tin cá nhân; từ 28/11/2026 dữ liệu Dataset 3–4 lưu trên project Supabase riêng tư của nhóm (RLS bật, không có policy, chỉ khoá service của backend đọc/ghi) |

**Cách sinh:** Dataset 1–2 viết tay, không dùng LLM, không cần seed. Người kiểm: Nguyễn Ánh Dương *(cần kiểm tay toàn bộ 12 địa điểm, 11 lối đi, 6 hoạt động trước CP3)*. Dataset 3–4 do nhóm tự thu thập, chưa có người kiểm.
**Không dùng:** sơ đồ, lịch, danh sách sinh viên thật của bất kỳ trường nào cho dữ liệu synthetic; không dùng dữ liệu của dự án Hound Around (họ không công khai dữ liệu; nhóm chỉ tham khảo cách làm).
