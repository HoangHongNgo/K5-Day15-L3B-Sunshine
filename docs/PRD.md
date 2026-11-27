# VinUni Wayfinder (nhóm Sunshine) — Tài liệu yêu cầu sản phẩm (PRD)

> Nhóm Sunshine · L3B · Track F. PRD này bám theo phạm vi ở [`spec.md`](../spec.md) §4. Số liệu bằng chứng sẽ được điền từ [`evidence/`](../evidence/) sau khi phỏng vấn và khảo sát xong; chưa có số nào, và không có con số nào dưới đây là bịa. Số liệu của dự án tham khảo được ghi rõ là của họ, đo trên toà nhà khác.
>
> **Cập nhật 27/11/2026:** nhóm chuyển ưu tiên sang **wayfinder** (chỉ đường trong khuôn viên VinUni Gia Lâm, có nhận diện vị trí bằng ảnh). Mascot AR dẫn đường không bỏ, nhưng làm sau khi wayfinder chạy được (xem [Kế hoạch phát triển](#kế-hoạch-phát-triển)). Lý do và các dòng bị ảnh hưởng ghi ở `spec.md` §10.

## Vấn đề

Sinh viên mới, khách và người đến dự sự kiện thường không biết phòng mình cần tới nằm ở toà nào, tầng nào, và đi lối nào trong khuôn viên VinUni (Gia Lâm). Tuần định hướng dồn nhiều hoạt động vào vài ngày, rải khắp các toà mà các bạn chưa từng đến.

Hiện nay các bạn tìm đường như sau:

- Đọc mã phòng trên poster hoặc nhóm chat ("I109", "Hội trường B") nhưng không biết phòng đó ở đâu.
- Hỏi bạn bè, bảo vệ hoặc người đi ngang, mỗi người chỉ một kiểu.
- Mở Google Maps, thấy được khuôn viên nhưng không thấy toà, tầng hay phòng. GPS dừng ở cửa toà nhà.
- Nếu đã trễ, các bạn đi vòng tìm biển chỉ dẫn, có bạn bỏ cuộc và lỡ luôn hoạt động.

Trong toà nhà, biển "Floor map" dán ở lối vào có sơ đồ nhưng người đọc phải tự định hướng từ chấm "Bạn đang ở đây" tới phòng cần tìm, và chỉ có ở chỗ biển được dán.

Phía ban tổ chức cũng gặp khó: họ chuẩn bị công phu nhưng số sinh viên đến ít hơn số đăng ký, còn điểm danh ở cửa chậm và làm bằng tay.

Tình trạng bằng chứng: đang là giả thuyết. Nhóm sẽ phỏng vấn ít nhất 3 sinh viên VinUni (P1–P3) và khảo sát ít nhất 20 sinh viên AI20K, lấy ít nhất 5 trích dẫn nguyên văn. Kết quả ghi ở `evidence/summary.md`.

## Người dùng mục tiêu

Người dùng chính là sinh viên mới, sinh viên năm nhất lần đầu tìm một phòng trong khuôn viên. Khách, phụ huynh và người dự sự kiện (ví dụ Career Day ở toà K, phỏng vấn và mentoring ở toà I) cũng dùng cùng một luồng. Ban tổ chức sự kiện được lợi gián tiếp: người đến đúng giờ, điểm danh bằng mã QR thay cho danh sách giấy.

## Giải pháp

Wayfinder là web app mở trên điện thoại, không cần cài đặt và không cần tài khoản. Người dùng nói mình muốn tới đâu bằng câu tự nhiên; app xác định mình đang đứng ở đâu rồi chỉ đường từng bước.

1. **Hỏi bằng câu tự nhiên.** Sinh viên gõ điểm đến: một phòng ("I109"), một địa điểm ("thư viện", "quầy cà phê") hoặc một hoạt động ("Career Day"). Một lần gọi model để hiểu ý; mọi mã địa điểm, lộ trình và giờ lấy từ dữ liệu của nhóm. Model không bao giờ tự nghĩ ra địa điểm, đường đi hay giờ giấc. Khi chưa chắc, app hỏi lại một câu ngắn.
2. **Xác định vị trí hiện tại.**
   - *Ngoài trời:* dùng GPS của điện thoại, cập nhật liên tục khi app đang mở.
   - *Trong toà nhà:* GPS sai 5–20 m nên không đủ. Người dùng chụp một ảnh hành lang. Server nhận diện địa điểm bằng mô hình nhận diện vị trí **MegaLoc** (vector đặc trưng của ảnh) và so với các khung hình nhóm đã quay sẵn ở từng điểm; 10 khung giống nhất bỏ phiếu chọn ra vị trí.
   - *Khi chưa chắc:* app nói thẳng là chưa chắc, hiện 3 vị trí khả dĩ nhất để người dùng chọn, hoặc xin một ảnh thứ hai chụp hướng khác. Người dùng chọn đúng thì ảnh đó được thêm vào dữ liệu để lần sau nhận đúng.
   - *Không chụp được ảnh:* người dùng gõ số phòng ngay bên cạnh để làm điểm xuất phát.
3. **Chỉ đường bằng thẻ từng bước.** Mỗi lần một thẻ ("Đi thẳng", "Rẽ trái về phía quầy cà phê", "Ra cổng toà I, đi về toà C"). Không hiện sơ đồ toà nhà: người dùng chỉ thấy bước kế tiếp. Ngoài trời, thẻ có mũi tên la bàn xoay theo hướng điện thoại và khoảng cách còn lại. Lộ trình do code tính trên đồ thị đường đi (networkx), model không viết lộ trình.
4. **Chế độ thu thập dữ liệu (cho nhóm).** Một màn hình riêng trên điện thoại để xây dữ liệu cho từng toà, thay cho việc dựng tay:
   - neo ảnh sơ đồ mặt bằng vào bản đồ thật bằng vài điểm GPS;
   - chạm để đặt phòng và cửa, nhập mã/tên phòng;
   - vẽ hành lang và lối đi thành đồ thị;
   - tại mỗi điểm, quay video ngắn xoay nhiều hướng; server cắt khung hình và tính vector đặc trưng;
   - ghi vết khi đi bộ để kiểm tra lối đi đã vẽ.
   Dữ liệu lưu trên máy chủ của nhóm, có nút xuất/nhập JSON để sao lưu.
5. **Mã QR check-in và từ chối.** Giữ từ bản Sunshine: khi điểm đến là một hoạt động, app sinh nội dung mã QR nháp; app từ chối điểm danh hộ, đóng vai admin hoặc xuất dữ liệu sinh viên.

Giao diện chỉ có tiếng Việt. Mascot AR dẫn đường nằm trong giai đoạn sau, không thuộc bản demo wayfinder.

### Cách làm và nguồn tham khảo

Cách định vị trong nhà tham khảo dự án **Hound Around** (BU Spark! DS+X 2026, tác giả David Ribeiro và nhóm): chụp ảnh, nhận diện bằng MegaLoc, bỏ phiếu k láng giềng gần nhất, hiện top 3 khi chưa chắc. Nhóm tự cài đặt, không chép code của họ (repo của họ không có file giấy phép trong cây thư mục khi nhóm kiểm). Mô hình **MegaLoc** là của Gabriele Berton và Carlo Masone. Các con số của Hound Around trong tài liệu này (nếu có) là kết quả của họ trên toà CDS ở Boston, không phải kết quả của nhóm.

## Phạm vi bản demo

| Hạng mục | Quyết định |
|---|---|
| Toà demo | **Toà I**, chỉ **tầng trệt** |
| Ngoài trời | Đường đi giữa các toà trên sơ đồ khuôn viên (toà A–L, Main Gate, San Ho Gate), bằng GPS + la bàn |
| Trong nhà | Chỉ tầng trệt Toà I. Không làm nhiều tầng, không làm thang máy/cầu thang giữa các tầng |
| Ngôn ngữ | Chỉ tiếng Việt |
| Chế độ tiếp cận (không bậc thang) | Chưa làm |
| Nền tảng | Web app (React + Vite), mở trên điện thoại qua HTTPS cùng mạng Wi-Fi |

Nội dung tầng trệt Toà I đọc từ ảnh chụp biển "Floor map" (xem [`data/DATA_CARD.md`](../data/DATA_CARD.md)): Trung tâm Khởi nghiệp, Vườn Thư viện, quầy cà phê, khu tự học mở, quầy tiện ích, văn phòng, các phòng I109 và I119, nhà vệ sinh, thang máy, cầu thang, và lối sang toà A (Thư viện), B (Hội trường), C (Lớp học, giảng đường), E (Nhà ăn, lab, lớp học) và bãi xe. Tên và vị trí từng phòng phải được kiểm lại tại chỗ trước khi dùng làm đáp án.

## Giới hạn hiện tại

| Hạng mục | Hiện trạng (27/11/2026) |
|---|---|
| Môi trường chạy | Đã cài PyTorch 2.14.1 bản CUDA trong môi trường ảo riêng, nhận GPU GTX 1650 4 GB. Chưa tải và chưa chạy thử MegaLoc |
| Sơ đồ | Đã có sơ đồ khuôn viên (ảnh) và ảnh mặt bằng tầng trệt Toà I (ảnh chụp biển). Chưa số hoá thành đồ thị đường đi |
| Dữ liệu ảnh nhận diện | Chưa quay. Chưa có vector, chưa có chỉ số nào |
| Backend (FastAPI), frontend (React) | Chưa viết |
| Độ chính xác nhận diện | Chưa đo. Mục tiêu (tự đặt, chưa kiểm): đúng phòng ở ≥ 80% ảnh khi app tự trả lời, đo bằng cách loại cả video khỏi chỉ số khi thử |
| Bản Sunshine cũ | Bản chạy thử dòng lệnh (`codebase/`) dùng bản đồ giả lập 12 địa điểm; chạy ở chế độ giả cho tới khi nối model thật |
| Check-in | Chỉ sinh nội dung mã QR; điểm danh chưa ghi vào hệ thống thật |

Bộ câu thử hiện tại (`eval/benchmark.csv`, 12 câu) đo phần hiểu câu hỏi, hỏi lại, lộ trình và từ chối trên dữ liệu giả lập. Chưa có bộ đo cho nhận diện vị trí bằng ảnh; việc này ghi ở Rủi ro #1 và `spec.md` §7.

## User stories

Mã trong ngoặc là câu thử tương ứng trong `eval/benchmark.csv` (chỉ có cho phần đã có bộ câu thử).

### Epic 1 — Hỏi đường

**US01.** Là sinh viên mới, tôi muốn hỏi đường bằng câu nói tự nhiên, để không phải biết mã phòng hay sơ đồ trường.

- AC1.1 Given sinh viên nói rõ đang ở đâu và muốn tới đâu, When gửi câu hỏi, Then agent trả lời mở đầu `[DẪN ĐƯỜNG]`, kèm mã điểm đến và các bước đi. *(B01, B02, B03)*
- AC1.2 Given sinh viên gọi địa điểm bằng tên quen ("hội trường", "phòng lab", "căng tin"), Then agent khớp theo tên và bí danh trong bản đồ.
- AC1.3 Then mọi địa điểm trong câu trả lời đều là mã có trong dữ liệu bản đồ của nhóm.

**US02.** Là sinh viên mới, tôi muốn hỏi theo tên hoạt động, để app tự biết hoạt động đó tổ chức ở đâu.

- AC2.1 Given sinh viên nhắc tên hoặc chủ đề của hoạt động ("ngày hội CLB AI", "workshop Python"), Then điểm đến là địa điểm của hoạt động đó trong lịch. *(B04, B05)*
- AC2.2 Then câu trả lời kèm giờ hoạt động lấy đúng từ `data/events.json`, không bịa giờ khác. *(B09)*

**US03.** Là sinh viên mới, tôi muốn được hỏi lại khi câu hỏi của tôi chưa rõ, để không bị dẫn tới sai chỗ.

- AC3.1 Given sinh viên không nói đang ở đâu, Then agent trả lời `[HỎI LẠI]` và hỏi điểm xuất phát, không đưa lộ trình. *(B06)*
- AC3.2 Given tên địa điểm quá chung, Then agent dẫn tới địa điểm duy nhất khớp trong bản đồ, hoặc hỏi lại nếu có nhiều chỗ khớp. *(B07)*
- AC3.3 Given phòng không có trong bản đồ ("C501"), Then agent nói không tìm thấy và hỏi lại, không đưa lộ trình tới phòng không tồn tại. *(B08)*
- AC3.4 Given sinh viên nói bị lạc mà không nêu được vị trí, Then agent hỏi mốc nhìn thấy được hoặc gợi ý quay về sân trung tâm, không tự đoán vị trí. *(B10)*
- AC3.5 Given model trả về dữ liệu lỗi hoặc mã không có thật, Then hệ thống hạ xuống `[HỎI LẠI]` thay vì dẫn đường.

### Epic 2 — Chỉ đường từng bước

**US04.** Là sinh viên mới, tôi muốn nhận lộ trình từng bước kèm số phút, để biết đi bao lâu thì tới.

- AC4.1 Given điểm xuất phát và điểm đến hợp lệ, Then lộ trình do code tính trên đồ thị, model không sinh đường đi.
- AC4.2 Then mỗi bước dùng đúng câu chỉ đường của lối đi trong dữ liệu, và tổng số phút bằng tổng các lối đi.
- AC4.3 Then câu trả lời nêu rõ từ đâu tới đâu, để sinh viên đối chiếu với biển chỉ dẫn.

**US05.** *(Hoãn sang giai đoạn sau)* Là sinh viên mới, tôi muốn thấy mascot trên camera điện thoại dẫn đường, để vừa nhìn đường vừa nghe chỉ dẫn.

- AC5.1 Given đã có lộ trình, When sinh viên mở camera trên điện thoại Android, Then mascot hiện trên khung hình và đọc bước hiện tại.
- AC5.2 Given máy không hỗ trợ camera AR, Then vẫn hiện thẻ chỉ dẫn dạng chữ, không chặn sinh viên.

**US06.** Là sinh viên mới, tôi muốn sửa lại vị trí khi đi sai, để app tính lại đường từ chỗ mới.

- AC6.1 When sinh viên nói hoặc chọn vị trí mới, Then app tính lại lộ trình từ điểm đó tới cùng điểm đến.

### Epic 3 — Check-in hoạt động

**US07.** Là sinh viên mới, tôi muốn có mã QR check-in khi tới nơi, để điểm danh nhanh tại cửa.

- AC7.1 Given điểm đến là một hoạt động, Then câu trả lời có nội dung mã QR dạng `SUNSHINE-CHECKIN:<event_id>`. *(B04, B05)*
- AC7.2 Then mã QR chỉ là bản nháp. Điểm danh chỉ được ghi nhận khi ban tổ chức quét mã và xác nhận tại cửa.

**US08.** Là ban tổ chức, tôi muốn app không điểm danh hộ, để danh sách tham dự phản ánh đúng người có mặt.

- AC8.1 Given sinh viên nhờ điểm danh hộ hoặc xin mã khi không tới, Then agent trả lời `[TỪ CHỐI]`, không có chuỗi `SUNSHINE-CHECKIN`, và gợi ý liên hệ ban tổ chức. *(B11)*

### Epic 4 — An toàn và phạm vi

**US09.** Là ban tổ chức, tôi muốn app từ chối yêu cầu vượt quyền, để không lộ mã check-in hay dữ liệu sinh viên.

- AC9.1 Given người dùng yêu cầu bỏ qua luật, đổi vai thành admin, in mọi mã check-in hoặc danh sách sinh viên, Then agent trả lời `[TỪ CHỐI]`, không in mã hàng loạt, không có dữ liệu cá nhân. *(B12)*
- AC9.2 Given câu hỏi ngoài việc dẫn đường trong trường, Then agent nói rõ app chỉ dẫn đường và hoạt động trong trường, việc khác liên hệ ban tổ chức hoặc phòng CTSV.
- AC9.3 Then hệ thống không lưu vị trí của sinh viên sau khi trả lời.

### Epic 5 — Định vị bằng GPS và ảnh (wayfinder)

Chưa có câu thử cho epic này; bộ đo sẽ viết cùng dữ liệu quay (Rủi ro #1).

**US10.** Là người đang ở ngoài trời, tôi muốn app biết tôi đang ở đâu mà không phải gõ, để bắt đầu đi ngay.

- AC10.1 Given đã cho phép vị trí, When mở app ngoài trời, Then app hiện vị trí hiện tại theo GPS và cập nhật liên tục khi app còn mở.
- AC10.2 Given GPS có độ sai số lớn, Then app nói rõ sai số thay vì chỉ một điểm chắc chắn.
- AC10.3 Given người dùng từ chối quyền vị trí, Then app vẫn chạy: người dùng chọn điểm xuất phát từ danh sách hoặc chụp ảnh.

**US11.** Là người đang ở trong toà nhà, tôi muốn chụp một ảnh hành lang để app biết tôi đang đứng ở đâu, vì GPS không đủ chính xác trong nhà.

- AC11.1 Given ảnh hành lang, When gửi lên, Then server trả về điểm xuất phát gần nhất kèm độ tin cậy và xoá ảnh ngay sau khi so khớp (chỉ giữ vector).
- AC11.2 Given độ tin cậy cao, Then app đi thẳng tới lộ trình, có đường "Không phải đây?".
- AC11.3 Given độ tin cậy trung bình, Then app hiện 3 vị trí khả dĩ nhất để người dùng chọn.
- AC11.4 Given độ tin cậy thấp, Then app xin một ảnh thứ hai chụp hướng khác, không đoán bừa.
- AC11.5 Given ảnh không giống địa điểm nào đã quay, Then app báo không nhận ra và cho chọn điểm xuất phát thủ công.

**US12.** Là người dùng, tôi muốn gõ số phòng bên cạnh để làm điểm xuất phát khi không chụp được ảnh.

- AC12.1 Given mã phòng có trong dữ liệu, Then app dùng phòng đó làm điểm xuất phát; Given không có, Then app nói không tìm thấy và không đoán.

**US13.** Là người dùng, tôi muốn sửa khi app nhận sai, để lần sau ở chỗ này app nhận đúng.

- AC13.1 When người dùng chọn đúng vị trí, Then vector của ảnh đó được thêm vào dữ liệu với nhãn đúng.
- AC13.2 Then việc sửa bị giới hạn tần suất để tránh bị lạm dụng.

**US14.** Là người dùng, tôi muốn thấy từng bước một, không phải đọc sơ đồ.

- AC14.1 Then app chỉ hiện thẻ của bước kế tiếp ("Đi thẳng", "Rẽ trái về phía…"), không hiện sơ đồ toà nhà.
- AC14.2 Given đang ở ngoài trời, Then thẻ có mũi tên xoay theo la bàn của điện thoại và khoảng cách còn lại.

### Epic 6 — Thu thập dữ liệu (cho nhóm)

**US15.** Là thành viên nhóm, tôi muốn xây dữ liệu của một toà ngay trên điện thoại, để không phải dựng tay từng nút và từng khung hình.

- AC15.1 Given ảnh sơ đồ mặt bằng, When đặt vài điểm tham chiếu kèm GPS, Then app căn ảnh vào bản đồ thật.
- AC15.2 When chạm để đặt phòng/cửa và vẽ hành lang, Then app lưu thành đồ thị đường đi với mã phòng và tên.
- AC15.3 When quay video ngắn tại một điểm, Then server cắt khung hình, tính vector và gắn vào điểm đó.
- AC15.4 When ghi vết khi đi bộ, Then app hiện vết đã đi để đối chiếu với lối đi đã vẽ.
- AC15.5 Then dữ liệu lưu ở máy chủ của nhóm, xuất/nhập được dạng JSON, và không bị đưa lên repo công khai.

## Rủi ro

| # | Rủi ro | Mức | Ảnh hưởng | Cách giảm |
|---|---|---|---|---|
| 1 | Nhận diện ảnh nhầm: các hành lang giống nhau, ánh sáng đổi, ít ảnh mẫu | Cao | Dẫn sai chỗ | Hiện độ tin cậy thật; chỉ tự trả lời khi chắc, ngược lại hiện top 3 hoặc xin ảnh thứ hai; cho gõ số phòng; viết bộ đo riêng, loại cả video khỏi chỉ số khi thử. Hiện **chưa đo gì** |
| 2 | Model bịa địa điểm, lộ trình hoặc giờ không có trong dữ liệu | Cao | Đi nhầm chỗ, đến sai giờ | Model chỉ chọn mã trong dữ liệu; code kiểm từng mã, sai thì hạ xuống `[HỎI LẠI]`; lộ trình và giờ luôn lấy từ dữ liệu. Metric `khong_bia_dia_diem` phải 0 lỗi |
| 3 | Mặt bằng đọc từ ảnh chụp biển có thể sai hoặc lỗi thời (tên phòng, vị trí cửa) | Cao | Đồ thị sai, chỉ đường sai | Đi bộ kiểm từng phòng bằng chế độ thu thập, ghi vết khi đi; gắn nhãn dữ liệu chưa kiểm |
| 4 | Điện thoại cần HTTPS mới dùng được camera và cảm biến; Wi-Fi trường có thể chặn kết nối giữa các máy | Trung bình | Không mở được app trên điện thoại khi demo | Dùng chứng chỉ tự ký trên cùng Wi-Fi; phương án dự phòng: tunnel HTTPS hoặc điểm phát Wi-Fi của điện thoại |
| 5 | Bộ dữ liệu ảnh là bản đồ ảnh chi tiết của toà nhà (rủi ro an ninh) và ảnh có thể chứa người | Trung bình | Lộ không gian nội bộ, lộ khuôn mặt | Chỉ quay hành lang công cộng; làm mờ mặt trước khi lưu; ảnh, sơ đồ, đồ thị và vector không đưa lên repo công khai; xoá ảnh người dùng sau khi so khớp; hỏi lại nhà trường nếu mở rộng |
| 6 | GPS ngoài trời sai gần toà cao hoặc dưới mái | Trung bình | Mũi tên chỉ sai hướng | Hiện sai số; cho chọn điểm xuất phát thủ công; chỉ dùng la bàn khi có hiệu chuẩn |
| 7 | Bản đồ khuôn viên chưa số hoá nên bản đồ giả lập cũ không khớp thật | Cao | Bản Sunshine chỉ đường đúng trong demo nhưng sai ngoài thực tế | Thay bản đồ giả bằng đồ thị đo từ khuôn viên thật; giữ nhãn `synthetic` cho dữ liệu cũ |
| 8 | Mã check-in bị chia sẻ hoặc chụp màn hình | Trung bình | Sinh viên "check-in" mà không có mặt | Mã QR chỉ là bản nháp, ban tổ chức xác nhận tại cửa |
| 9 | Prompt injection đòi quyền admin, đòi mọi mã hoặc danh sách sinh viên | Trung bình | Lộ mã hoặc dữ liệu cá nhân | Agent không có công cụ liệt kê sinh viên hay toàn bộ mã; câu thử từ chối B11, B12 phải qua 100% |
| 10 | Ban tổ chức không cập nhật lịch kịp thời | Trung bình | Dẫn tới phòng hoặc giờ cũ | Một file lịch chung cho mỗi tuần sự kiện |

## Kế hoạch phát triển

### Giai đoạn 1 — Wayfinder demo (hiện tại, ưu tiên)

| Tính năng | Mô tả |
|---|---|
| Hỏi bằng câu tự nhiên | Sinh viên nói điểm đến; hiểu ý, hỏi lại khi chưa chắc |
| Chế độ thu thập dữ liệu | Neo sơ đồ, đặt phòng/cửa, vẽ hành lang, quay video theo điểm, ghi vết đi bộ |
| Đồ thị đường đi Toà I (tầng trệt) và đường ngoài trời | Số hoá từ sơ đồ, kiểm tại chỗ |
| Định vị | GPS ngoài trời; ảnh hành lang + MegaLoc trong toà; top 3, ảnh thứ hai, gõ số phòng |
| Thẻ chỉ dẫn | Từng bước, la bàn + khoảng cách ngoài trời, không hiện sơ đồ toà |
| Mã QR check-in, từ chối | Giữ từ bản Sunshine |
| Bộ đo nhận diện | Bộ câu thử riêng cho định vị bằng ảnh, bổ sung cho `eval/benchmark.csv` |

### Giai đoạn 2 — Mở rộng khuôn viên

| Tính năng | Mô tả |
|---|---|
| Thêm toà và thêm tầng | Mỗi toà là một gói dữ liệu riêng, không phải mã mới; thêm thang máy/cầu thang giữa các tầng |
| Chế độ tiếp cận | Lộ trình không bậc thang, ưu tiên thang máy |
| Chạy trên điện thoại không cần mạng | Chuyển bước so khớp xuống điện thoại |
| Check-in thật | Ban tổ chức quét mã QR và điểm danh được ghi vào danh sách của hoạt động |

### Giai đoạn 3 — Mascot (làm khi có thời gian)

| Tính năng | Mô tả |
|---|---|
| Mascot dẫn đường trên camera | Một mascot dựng sẵn đọc từng bước trên camera điện thoại; có thẻ chữ dự phòng |
| Chạy trên iPhone | Mascot 2D đè lên camera, chạy được trên trình duyệt mọi điện thoại |
| Mascot riêng của sự kiện | Ban tổ chức tải lên mascot 2D hoặc 3D |

### Giai đoạn 4 — Công cụ cho ban tổ chức và sinh viên

| Tính năng | Mô tả |
|---|---|
| Trang cho ban tổ chức | Thêm hoạt động, địa điểm, giờ mà không cần sửa file; xem số người đã check-in |
| Nhiệm vụ trên bản đồ | Điểm nhiệm vụ, quét QR để nhận huy hiệu |
| Gợi ý hoạt động, nhắc lịch | Theo sở thích hoặc khoa, nhắc trước giờ kèm lộ trình |

## Công nghệ

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| Frontend | React + Vite, chỉ tiếng Việt | Màn hình hỏi đường, thẻ chỉ dẫn, chế độ thu thập; dùng camera, GPS và la bàn của điện thoại; phục vụ qua HTTPS tự ký |
| Backend | FastAPI + PyTorch (Python), chạy trên máy của nhóm | Nhận ảnh/video, tính vector, so khớp, trả vị trí; lưu dữ liệu thu thập |
| Nhận diện vị trí | MegaLoc (vector 8.448 chiều, ảnh resize vuông 322 × 322), bỏ phiếu 10 láng giềng gần nhất theo cosine | Định vị trong nhà. Chạy bằng GPU GTX 1650 4 GB (đã xác nhận PyTorch thấy GPU) |
| Độ tin cậy | Mô hình hồi quy logistic trên đặc trưng khớp (dự kiến) | Quyết định tự trả lời / top 3 / xin ảnh thứ hai. Ngưỡng phải hiệu chỉnh trên dữ liệu thật, chưa có |
| Lộ trình | networkx, đồ thị đường đi tự dựng | Đường đi ngắn nhất; model không viết lộ trình |
| Hiểu câu hỏi | Một lần gọi LLM qua `codebase/ai.py` (`call_model`), kết quả JSON | Chọn điểm xuất phát, điểm đến, hoạt động và hành động (`dan_duong` / `hoi_lai` / `tu_choi`); code kiểm lại |
| Công cụ (bản Sunshine) | `tra_dia_diem`, `danh_sach_dia_diem`, `tim_lo_trinh`, `tao_ma_checkin` (`codebase/tools.py`) | Không công cụ nào tác động ra hệ thống bên ngoài |
| Dữ liệu | `data/campus.json`, `data/events.json` (giả lập, bản Sunshine); đồ thị và vector thật (riêng tư, không nằm trong repo) | Xem `data/DATA_CARD.md` |
| Đánh giá | `eval/benchmark.csv`, `eval/metric_spec.yaml`, `run.py eval` / `score` | 12 câu thử (5 thường, 5 khó, 2 từ chối) và 4 metric cho phần hiểu câu hỏi, lộ trình và từ chối |
| Chi phí | `cost/simulate.py`, `cost/personas.yaml` | Mô phỏng phiên dùng để ước tính chi phí hằng tháng |
