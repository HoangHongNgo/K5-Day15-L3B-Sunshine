# Canvas — Sunshine · Track F

> Điền ở guide bước 1.4. CP1 17:00 Thứ Sáu 27/11: nộp bản đầu, đủ 7 dòng (dòng 4 được ghi giả thuyết + nguồn sẽ kiểm).
> CP2 19:30 Thứ Sáu 27/11: cập nhật (số bằng chứng đầu, lát cắt đã chốt) và điền dòng "Đã đổi gì so với CP1".
> Track F: chép thêm thẻ đề của nhóm (khung trong file track F) xuống dưới bảng này.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track F · Wayfinder: chỉ đường trong khuôn viên VinUni cho sinh viên mới (định vị bằng GPS + ảnh hành lang ở tầng trệt Toà G và Toà I, mascot dẫn đường bằng thẻ chỉ dẫn từng bước). AR neo không gian làm sau |
| 2 | Người dùng chính (một vai cụ thể — không phải "học viên nói chung") | Sinh viên năm nhất / sinh viên mới của VinUni (thuộc AI20K) đang tham dự một hoạt động trong khuôn viên trường |
| 3 | Pain một câu: ai — đang làm gì — vướng đâu — hậu quả | Sinh viên mới đi tìm phòng/địa điểm của một hoạt động trong trường nhưng không biết đường, nên đi lạc, trễ giờ hoặc bỏ lỡ hoạt động hợp với mình; ban tổ chức thì khó thu hút người đến và điểm danh. |
| 4 | Bằng chứng người dùng | Khảo sát 27 học viên AI20K ngoài nhóm. 25/27 từng gặp khó khi tìm phòng hoặc tòa, 14/27 từng trễ, bỏ lỡ hoạt động hoặc lỡ điểm danh. Một phiếu chọn “Biết mã phòng nhưng không hình dung được đường đi/tầng /lối vào” và “Lỡ khâu điểm danh” (R26). [Phiếu và cách đếm](evidence/summary.md) |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Một sinh viên mới hoặc khách trong khuôn viên VinUni · hỏi đường tới một phòng/địa điểm/hoạt động bằng câu tự nhiên · AI quyết định mình đang đứng ở đâu (GPS ngoài trời; nhận diện ảnh hành lang trong tầng trệt Toà G và Toà I) và nên dẫn đường / hỏi lại / từ chối · mascot dẫn đường bằng thẻ chỉ dẫn từng bước, kèm mã QR check-in nếu là hoạt động. |
| 6 | AI tự làm đến đâu + 1 dòng lý do: sai thì ai chịu gì | AI tự hiểu câu hỏi và nhận diện vị trí khi chắc; khi chưa chắc thì hiện top 3 hoặc xin ảnh thứ hai, câu hỏi mơ hồ hoặc không có địa điểm thì hỏi lại hoặc từ chối. Sai thì sinh viên đi nhầm chỗ và trễ giờ (thiệt hại nhỏ, không liên quan tiền/sức khoẻ). Check-in chỉ ghi nhận bằng QR, AI không tự điểm danh. |
| 7 | Phân công có tên | Hoàng: chốt lát cắt, canvas/spec, slide, demo · Quân: bản chạy thử (AI hiểu câu hỏi + lộ trình, mascot AR) · Dương: data card, bộ câu thử, eval, chi phí · Phương: phỏng vấn, khảo sát, evidence/ |
| — | *(CP2)* Đã đổi gì so với CP1 | 27/11/2026: chuyển ưu tiên từ mascot AR sang wayfinder (định vị bằng ảnh và thẻ chỉ dẫn). 28/11/2026: phạm vi thử định vị trong nhà gồm tầng trệt Tòa G và Tòa I. Giao diện hợp nhất ở `vinuni-wayfinder/frontend/`. Chi tiết ở [spec.md](spec.md) §10. |

---

# Track F · Wayfinder chỉ đường trong khuôn viên VinUni (mascot dẫn đường)

**Lĩnh vực.** Trải nghiệm sinh viên mới / sự kiện trong trường.
**Pain.** Sinh viên mới đi tìm nơi tổ chức hoạt động nhưng không biết đường, nên trễ hoặc bỏ lỡ; ban tổ chức khó thu hút người đến và điểm danh.
**Insight từ người dùng thật.** 15/27 học viên đã biết mã phòng nhưng khó hình dung đường đi. 15/27 chọn chỉ dẫn từng bước kèm mốc, 5/27 chọn camera có nhân vật ảo. Nhóm lấy thẻ chỉ dẫn làm luồng chính. [Khảo sát](evidence/summary.md)
**Người dùng.** Sinh viên mới VinUni · gặp trực tiếp trong lớp AI20K và quanh trường trong hai ngày.
**Data.** Bản chạy thử hiện tại dùng bản đồ/lịch hoạt động giả lập (`synthetic`). Wayfinder dùng đồ thị khuôn viên dựng từ OpenStreetMap, mặt bằng tầng trệt Toà G và Toà I do nhóm chụp từ biển sơ đồ trong toà, cùng ảnh hành lang nhóm tự quay; ghi trong data/DATA_CARD.md. Dữ liệu quay không đưa lên repo công khai và không dùng dữ liệu cá nhân của ai.
**Lát cắt.** Xem dòng 5 của bảng trên.
**Công cụ của agent.** Đã chốt 4 công cụ không tác động ra ngoài (`codebase/tools.py`, bảng chi tiết ở `spec.md` §4): `tra_dia_diem`, `danh_sach_dia_diem`, `tim_lo_trinh` (BFS trên đồ thị), và `tao_ma_checkin` (chỉ sinh nội dung QR nháp).
**Bộ câu thử.** Bản CP3 có 20 câu (5 thường, 11 khó, 4 từ chối), trong đó 8 câu dựa vào thông tin công khai của VinUni. Tiêu chí theo từng câu và chuẩn đạt nằm ở [hồ sơ đánh giá](eval/README.md) và [spec.md](spec.md) §7.
**Persona chi phí.** Ba nhóm dùng 2, 4 và 8 phiên/tháng *(tự ước tính)*. Mỗi phiên có 1, 2 hoặc 3 lượt hỏi. [Cấu hình mô phỏng](cost/personas.yaml)
**Bẫy.** Làm cả hai phía (tạo mascot 3D cho ban tổ chức + dẫn đường) nên lát cắt quá to; sa vào AR/3D mà quên quyết định AI cần đo; không có bản đồ chuẩn để chấm đúng/sai.
**An toàn.** AI không tự điểm danh thay sinh viên; không lưu vị trí cá nhân; ảnh người dùng gửi để định vị bị xoá sau khi so khớp; không tự đoán vị trí khi chưa chắc.
