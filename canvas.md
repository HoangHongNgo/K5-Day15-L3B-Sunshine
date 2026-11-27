# Canvas — Sunshine · Track F

> Điền ở guide bước 1.4. CP1 17:00 Thứ Sáu 27/11: nộp bản đầu, đủ 7 dòng (dòng 4 được ghi giả thuyết + nguồn sẽ kiểm).
> CP2 19:30 Thứ Sáu 27/11: cập nhật (số bằng chứng đầu, lát cắt đã chốt) và điền dòng "Đã đổi gì so với CP1".
> Track F: chép thêm thẻ đề của nhóm (khung trong file track F) xuống dưới bảng này.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track F · Dẫn đường trong trường cho sinh viên mới bằng mascot AR |
| 2 | Người dùng chính (một vai cụ thể — không phải "học viên nói chung") | Sinh viên năm nhất / sinh viên mới của VinUni (thuộc AI20K) đang tham dự một hoạt động trong khuôn viên trường |
| 3 | Pain một câu: ai — đang làm gì — vướng đâu — hậu quả | Sinh viên mới đi tìm phòng/địa điểm của một hoạt động trong trường nhưng không biết đường, nên đi lạc, trễ giờ hoặc bỏ lỡ hoạt động hợp với mình; ban tổ chức thì khó thu hút người đến và điểm danh. |
| 4 | Bằng chứng đầu — CP1: giả thuyết + nguồn sẽ kiểm · CP2: số đầu tiên + 1 trích dẫn | Giả thuyết (CP1): ≥3 sinh viên mới từng đi lạc/trễ/bỏ lỡ hoạt động vì không tìm được đường. Nguồn sẽ kiểm: phỏng vấn ≥3 học viên VinUni (P1–P3), khảo sát ≥20 sinh viên AI20K, ≥5 trích dẫn nguyên văn. Chưa có số. |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Một sinh viên mới · hỏi đường tới một địa điểm hoạt động bằng câu tự nhiên · AI quyết định điểm đến và lộ trình dựa trên bản đồ/lịch hoạt động giả lập của trường · mascot hiện trên camera Android dẫn tới nơi, sinh viên quét QR để check-in. |
| 6 | AI tự làm đến đâu + 1 dòng lý do: sai thì ai chịu gì | AI tự hiểu câu hỏi, chọn điểm đến và lộ trình; nếu câu hỏi mơ hồ hoặc không có địa điểm thì hỏi lại hoặc từ chối. Sai thì sinh viên đi nhầm chỗ và trễ giờ (thiệt hại nhỏ, không liên quan tiền/sức khoẻ). Check-in chỉ ghi nhận bằng QR, AI không tự điểm danh. |
| 7 | Phân công có tên | Hoàng: chốt lát cắt, canvas/spec, slide, demo · Quân: bản chạy thử (AI hiểu câu hỏi + lộ trình, mascot AR) · Dương: data card, bộ câu thử, eval, chi phí · Phương: phỏng vấn, khảo sát, evidence/ |
| — | *(CP2)* Đã đổi gì so với CP1 | |

---

# Track F · Dẫn đường cho sinh viên mới bằng mascot AR

**Lĩnh vực.** Trải nghiệm sinh viên mới / sự kiện trong trường.
**Pain.** Sinh viên mới đi tìm nơi tổ chức hoạt động nhưng không biết đường, nên trễ hoặc bỏ lỡ; ban tổ chức khó thu hút người đến và điểm danh.
**Insight từ người dùng thật.** Chưa có số. Sẽ phỏng vấn ≥3 học viên VinUni và khảo sát ≥20 sinh viên AI20K (CP2 cập nhật).
**Người dùng.** Sinh viên mới VinUni · gặp trực tiếp trong lớp AI20K và quanh trường trong hai ngày.
**Data.** Tự dựng bản đồ/danh sách địa điểm và lịch hoạt động giả lập, có seed, ghi trong data/DATA_CARD.md. Không dùng dữ liệu thật của ai.
**Lát cắt.** Xem dòng 5 của bảng trên.
**Công cụ của agent.** Chưa chốt (dự kiến: tra địa điểm/lịch, tính lộ trình, sinh mã QR check-in); input/output sẽ ghi ở spec.md.
**Bộ câu thử.** Chưa dựng. Dự kiến 20–30 câu "đứng ở A, muốn tới B"; đạt khi chọn đúng điểm đến và lộ trình; phải hỏi lại khi câu mơ hồ và từ chối khi địa điểm không tồn tại.
**Persona chi phí.** Chưa tính (sẽ ước lượng số sinh viên × số lần hỏi mỗi sự kiện).
**Bẫy.** Làm cả hai phía (tạo mascot 3D cho ban tổ chức + dẫn đường) nên lát cắt quá to; sa vào AR/3D mà quên quyết định AI cần đo; không có bản đồ chuẩn để chấm đúng/sai.
**An toàn.** AI không tự điểm danh thay sinh viên; không lưu vị trí cá nhân; chỉ dùng dữ liệu giả lập.
