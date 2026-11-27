# Tổng hợp bằng chứng pain

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☐ | `evidence/data-mining.md` |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☐ | `evidence/interviews/P1.md`… |
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☑ n = 27 học viên AI20K ngoài nhóm, ở trường 1–4 tuần | `evidence/survey/` ([câu hỏi](survey/questions.md), [kết quả](survey/results.csv), [cách đếm](survey/count.py)) |

## 2. Số chính

- Đào data: không làm.
- Phỏng vấn: __/3 người gặp *(n nhỏ không ghi %)* · số lần / tháng: P1 __, P2 __, P3 __ · mỗi lần mất __–__ phút
- Khảo sát: n = 27 (27/27 học viên AI20K, 27/27 ở trường 1–4 tuần; phiếu 27/11/2026 17:37–19:58). Số dưới đây tính
  trên n = 27, chạy lại bằng `python evidence/survey/count.py`.
  - **Từng gặp khó khi tìm phòng/tòa ≥1 lần: 25/27 (93%)**; ≥3 lần: 13/27 (48%); trên 5 lần / vẫn hay nhầm: 7/27 (26%).
  - **Hậu quả nặng hơn đi vòng (trễ, bỏ lỡ hoạt động, lỡ điểm danh): 14/27 (52%)**: đến trễ 6/27 (22%), bỏ lỡ
    hoạt động 6/27 (22%), lỡ điểm danh 3/27 (11%). Chỉ mất thêm 3–5 phút: 13/27 (48%).
  - Nguyên nhân (chọn tối đa 2): biết mã phòng nhưng không hình dung được đường đi/tầng/lối vào 15/27 (56%); biển chỉ
    dẫn/bản đồ chưa rõ 10/27 (37%); biết tên sự kiện nhưng không rõ tòa/phòng 9/27 (33%); lịch/phòng đổi sát giờ 5/27 (19%).
  - Khu vực dễ nhầm (chọn tối đa 3): **Tòa I 15/27 (56%)**, Tòa G 8/27 (30%), Tòa A 8/27 (30%), Tòa E 8/27 (30%),
    Tòa H 6/27 (22%), Tòa C 5/27 (19%).
  - Phản xạ đầu tiên: hỏi người xung quanh/lễ tân/bảo vệ 8/27 (30%), nhắn bạn bè/group lớp 6/27 (22%), tự dò biển chỉ
    dẫn 5/27 (19%), mở bản đồ minh họa của trường 4/27 (15%), mở lại email/thông báo 4/27 (15%).
  - Muốn nhận chỉ dẫn (chọn tối đa 2): bản đồ 2D có tòa/tầng/đường ngắn nhất 16/27 (59%); gõ/nói câu hỏi → chỉ dẫn từng
    bước kèm mốc 15/27 (56%); giơ camera để nhân vật ảo dẫn đường 5/27 (19%); chỉ cần phòng + tầng, không cần app 4/27 (15%).
  - Điện thoại: Android 13/27 (48%), iOS 9/27 (33%), cả hai 5/27 (19%).
  - Câu 9 (điểm phiền, không bắt buộc): 0/27 trả lời → khảo sát **không có câu trả lời tự do nào**.

Phỏng vấn nhiều vai thì đếm theo từng vai, không cộng chung.

| | Vai | Gặp pain? | Số lần / 1 tháng qua | Lần gần nhất mất | Đang xoay xở bằng |
|---|---|---|---|---|---|
| P1 | | | | | |
| P2 | | | | | |
| P3 | | | | | |

## 3. ≥5 trích dẫn hoặc ví dụ nguyên văn (có nguồn, bỏ tên)

Khảo sát không có câu trả lời tự do (Câu 9 bỏ trống ở cả 27 phiếu), nên dưới đây là **ví dụ nguyên văn các lựa chọn**
của từng phiếu. Trích dẫn lời nói thật cần lấy từ phỏng vấn P1–P3.

1. "Trên 5 lần / Vẫn hay nhầm tới tận bây giờ" · khó tìm ở "Tòa I, Tòa G (hội trường), Tòa C" · vì "Biết tên sự kiện
   nhưng không rõ tổ chức ở tòa/phòng nào, Biết mã phòng nhưng không hình dung được đường đi/tầng /lối vào" · hậu quả
   "Bỏ lỡ hoạt động vì tìm mãi không thấy" — phiếu khảo sát R09
2. "3–5 lần" · "Tòa I, Tòa A" · "Biết mã phòng nhưng không hình dung được đường đi/tầng /lối vào, Biển chỉ dẫn hoặc bản
   đồ trường chưa đủ rõ" · "Đến trễ giờ" · phản xạ "Hỏi trực tiếp sinh viên xung quanh, lễ tân hoặc bảo vệ" — phiếu R05
3. "3–5 lần" · "Tòa G (hội trường), Tòa E" · "Biết tên sự kiện nhưng không rõ tổ chức ở tòa/phòng nào, Lịch hoặc phòng
   bị đổi sát giờ" · "Lỡ khâu điểm danh" · phản xạ "Nhắn tin hỏi bạn bè/ group lớp" — phiếu R16
4. "Trên 5 lần / Vẫn hay nhầm tới tận bây giờ" · "Tòa I, Tòa E, Tòa G (hội trường)" · "Biết mã phòng nhưng không hình
   dung được đường đi/tầng /lối vào, Biển chỉ dẫn hoặc bản đồ trường chưa đủ rõ" · "Lỡ khâu điểm danh" — phiếu R26
5. "Trên 5 lần / Vẫn hay nhầm tới tận bây giờ" · "Chỉ biết tên sự kiện/hoạt động, không nhớ hoặc không rõ tổ chức ở
   tòa/phòng nào, Biển chỉ dẫn hoặc bản đồ trường chưa đủ rõ ở các ngã rẽ/thang máy" · hậu quả "Đến trễ lớp / trễ buổi
   workshop, sự kiện, Bỏ lỡ luôn một hoạt động vì ngại vào muộn hoặc tìm mãi không thấy" · phản xạ "Mở lại email /
   thông báo sự kiện để tìm hướng dẫn" — phiếu R01
6. Phiếu ngược giả thuyết: "Chưa bao giờ" · "Chưa có khu vực nào" · "Chưa từng gặp hậu quả gì đáng kể" · "Chỉ cần
   thông tin phòng + tầng là đủ, không cần app riêng" — phiếu R14

## 4. Các nguồn có khớp nhau không

Hiện mới có **một nguồn** (khảo sát); phỏng vấn P1–P3 chưa làm nên chưa kiểm chéo được. Trong khảo sát:

- **Khớp giả thuyết:** gần như ai cũng từng gặp khó (25/27), và hơn nửa đã chịu hậu quả thật (14/27 trễ / bỏ lỡ / lỡ
  điểm danh). Nguyên nhân hàng đầu là "biết mã phòng nhưng không hình dung đường đi" (15/27), đúng phần Google Maps và
  biển chỉ dẫn không lấp được. Tòa I đứng đầu (15/27) và Tòa G nằm trong nhóm thứ hai (8/27), khớp phạm vi demo G + I.
- **Lệch / cần lưu ý:**
  - Gần một nửa (13/27) nói chỉ mất thêm 3–5 phút → pain có thật nhưng phần lớn là **nhẹ, xảy ra vài ngày đầu**
    (12/27 chỉ gặp 1–2 lần).
  - 1/3 nguyên nhân là **không biết sự kiện ở đâu** (9/27), tức thiếu thông tin địa điểm, không phải không biết đường.
    Tính năng "tìm theo tên sự kiện CLB" giải đúng phần này.
  - Cách muốn nhận chỉ dẫn: **bản đồ 2D 16/27 (59%)** và gõ/nói → chỉ dẫn từng bước 15/27 (56%); camera + nhân vật ảo
    chỉ 5/27 (19%). Điều này **ngược quyết định hiện tại** "người dùng không thấy sơ đồ, chỉ thấy thẻ chỉ dẫn + mascot".
    Thẻ chỉ dẫn từng bước được ủng hộ; mascot/camera chưa được ủng hộ, cần hỏi lại trong phỏng vấn vì sao.
  - Phản xạ đầu tiên là **hỏi người** (14/27 hỏi trực tiếp hoặc nhắn bạn bè) → đối thủ thật là "hỏi bạn/bảo vệ", app
    phải nhanh hơn việc đó.

## 5. Kết luận

Giả thuyết ở `evidence/hypothesis.md`: **đúng theo khảo sát, nhưng phải đổi phần mức độ**. Ngưỡng đặt ra là ≥50% người
trả lời (n ≥ 20) từng gặp tình huống tương tự: đạt 25/27 (93%) nếu tính "từng gặp khó", và 14/27 (52%) nếu chỉ tính
trễ / bỏ lỡ / lỡ điểm danh (vừa qua ngưỡng). Cần chỉnh lại: với phần lớn người, pain là mất vài phút trong những ngày
đầu; nhóm bị nặng (≥3 lần, 13/27) và nhóm bỏ lỡ hoạt động (6/27) mới là người dùng chính. Nửa phỏng vấn của tiêu chí
(≥2/3 người) **chưa kiểm**.

Điều vẫn chưa biết:

- Phỏng vấn P1–P3 chưa làm: chưa có số lần/tháng, số phút mỗi lần, hay lời kể nguyên văn.
- Mẫu là học viên AI20K ở trường 1–4 tuần (đã loại thành viên nhóm Sunshine), chưa có sinh viên năm nhất VinUni hay
  khách.
- Câu 4 hỏi "trong khoảng thời gian mới đến", không giới hạn 1 tháng qua, nên không so trực tiếp được với tiêu chí
  "trong 1 tháng qua" (mọi người mới ở 1–4 tuần nên gần như trùng).
- Phiếu R11 chọn "Chưa bao giờ" ở Câu 4 nhưng lại chọn khu vực, nguyên nhân và hậu quả "Bỏ lỡ hoạt động" → mâu thuẫn,
  vẫn được đếm như đã ghi (không sửa phiếu).
- Vì sao người ta thích bản đồ 2D hơn mascot/camera, và thẻ chỉ dẫn không kèm bản đồ có đủ không.

## Lịch hẹn (dùng cho CP2 — chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| | | |
