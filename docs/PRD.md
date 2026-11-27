# Sunshine Mascot MVP — Tài liệu yêu cầu sản phẩm (PRD)

> Nhóm Sunshine · L3B · Track F. PRD này bám theo phạm vi đã chốt ở [`spec.md`](../spec.md) §4. Dữ liệu là `synthetic` (xem [`data/DATA_CARD.md`](../data/DATA_CARD.md)). Số liệu bằng chứng sẽ được điền từ [`evidence/`](../evidence/) sau khi phỏng vấn và khảo sát xong. Không có con số nào dưới đây là bịa.

## Vấn đề

Sinh viên mới vào trường thường không biết hoạt động được tổ chức ở đâu. Tuần định hướng dồn rất nhiều hoạt động vào vài ngày (lễ chào đón, ngày hội câu lạc bộ, workshop, thể thao, tư vấn học bổng), rải khắp các toà, tầng và phòng mà các bạn chưa từng đến.

Hiện nay các bạn tìm đường như sau:

- Đọc mã phòng trên poster hoặc nhóm chat ("P.A305", "Hội trường A1") nhưng không biết phòng đó ở toà nào, tầng mấy.
- Hỏi bạn bè, bảo vệ hoặc người đi ngang, mỗi người chỉ một kiểu.
- Mở Google Maps, thấy được khuôn viên nhưng không thấy toà, tầng hay phòng.
- Nếu đã trễ, các bạn đi vòng tìm biển chỉ dẫn, có bạn bỏ cuộc và lỡ luôn hoạt động.

Phía ban tổ chức cũng gặp khó. Họ chuẩn bị công phu nhưng số sinh viên đến ít hơn số đăng ký, còn điểm danh ở cửa thì chậm và làm bằng tay.

Hậu quả là sinh viên mới đến trễ hoặc bỏ lỡ hoạt động hợp với mình, còn ban tổ chức không có cách dễ dàng để đưa sinh viên tới đúng chỗ, đúng giờ.

Tình trạng bằng chứng: đang là giả thuyết. Nhóm sẽ phỏng vấn ít nhất 3 sinh viên VinUni (P1–P3) và khảo sát ít nhất 20 sinh viên AI20K, lấy ít nhất 5 trích dẫn nguyên văn. Kết quả ghi ở `evidence/summary.md` và thay đoạn này tại CP2.

## Người dùng mục tiêu

Người dùng chính là sinh viên mới, sinh viên năm nhất lần đầu tham gia một hoạt động trong khuôn viên trường. Ban tổ chức sự kiện (câu lạc bộ sinh viên, phòng Công tác sinh viên) cũng được lợi: sinh viên đến đúng giờ, và điểm danh bằng mã QR thay cho danh sách giấy.

## Giải pháp

Sunshine là mascot của trường, dẫn sinh viên tới nơi tổ chức hoạt động. Sinh viên hỏi theo cách nói của mình, ví dụ "Mình ở căng tin, ngày hội CLB AI ở đâu?", và mascot chỉ đường từng bước trên camera điện thoại, kèm giờ hoạt động và mã QR check-in.

Chỉ có một lần gọi model để hiểu sinh viên muốn gì. Mọi thứ cần chính xác (địa điểm, lộ trình, giờ, mã check-in) đều lấy từ dữ liệu của trường. Model không bao giờ tự nghĩ ra địa điểm, đường đi hay giờ giấc.

1. **Hỏi bằng câu tự nhiên.** Sinh viên gõ hoặc nói mình đang ở đâu và muốn tới đâu. Điểm đến có thể là một địa điểm ("phòng lab", "thư viện") hoặc một hoạt động ("workshop Python"). Agent sẽ:
   - so từ ngữ với tên và bí danh của địa điểm trong bản đồ ("hội trường" → `HT_A1`, "phòng lab" → `P_A305`);
   - so với tên và thẻ chủ đề của hoạt động trong lịch, và lấy địa điểm của hoạt động đó làm điểm đến;
   - chỉ được chọn mã địa điểm và mã hoạt động có trong dữ liệu.
2. **Hỏi lại khi chưa chắc.** Nếu thiếu điểm xuất phát, tên địa điểm quá chung, hoặc phòng không tồn tại (ví dụ "C501"), agent hỏi lại một câu ngắn thay vì đoán. Nếu sinh viên bị lạc, agent hỏi một mốc nhìn thấy được hoặc gợi ý quay về sân trung tâm.
3. **Lộ trình lấy từ dữ liệu, không lấy từ model.** Khi điểm xuất phát và điểm đến đều là mã hợp lệ, code tính lộ trình trên đồ thị khuôn viên (BFS). Mỗi bước dùng đúng câu chỉ đường và số phút đã lưu cho lối đi đó. Model không viết lộ trình.
4. **Mascot dẫn đường.** Mascot hiện trên camera điện thoại và đọc từng bước một ("Đi thẳng qua sân trung tâm, vào sảnh A, lên tầng 3"), kèm tổng số phút và giờ hoạt động.
5. **Mã QR check-in.** Khi điểm đến là một hoạt động, agent tạo nội dung mã QR check-in. Ban tổ chức quét mã tại cửa và xác nhận điểm danh. Agent không bao giờ điểm danh thay sinh viên.
6. **Từ chối việc ngoài phạm vi.** Agent từ chối các yêu cầu điểm danh hộ, đóng vai admin, hoặc in mã và dữ liệu sinh viên, rồi chỉ sinh viên tới ban tổ chức hoặc phòng Công tác sinh viên.

Ngày demo sẽ chạy trọn vòng: câu hỏi tự nhiên, câu hỏi lại khi cần, lộ trình từng bước lấy từ bản đồ, mascot trên camera, và mã QR check-in.

## Giới hạn của bản demo

Bản demo chạy được toàn bộ luồng, nhưng một số phần khác với khi triển khai thật.

| Hạng mục | Hiện trạng |
|---|---|
| Bản đồ khuôn viên | Giả lập, nhóm tự viết: 12 địa điểm, 11 lối đi hai chiều, số phút là ước tính. Không phải bản đồ thật của VinUni |
| Lịch hoạt động | Giả lập: 6 hoạt động tuần định hướng, không trùng giờ, không trùng tên |
| Vị trí | Không dùng GPS hay định vị trong nhà. Sinh viên tự nói mình đang ở đâu |
| Mascot | Một mascot dựng sẵn. Ban tổ chức chưa tự tạo được mascot riêng |
| Hiển thị AR | Chỉ trên camera Android. Chưa làm xong; bản chạy thử hiện tại là chữ trên dòng lệnh |
| Check-in | Chỉ sinh nội dung mã QR. Điểm danh chưa được ghi vào hệ thống thật nào |
| Model | Chạy ở chế độ giả cho tới khi nối model thật trước CP3 |

## User stories

Các user story dưới đây mô tả phạm vi MVP. Các tính năng dự định làm sau nằm ở mục Kế hoạch phát triển. Mã trong ngoặc là câu thử tương ứng trong `eval/benchmark.csv`.

### Epic 1 — Hỏi đường

**US01.** Là sinh viên mới, tôi muốn hỏi đường bằng câu nói tự nhiên, để không phải biết mã phòng hay sơ đồ trường.

- AC1.1 Given sinh viên nói rõ đang ở đâu và muốn tới đâu, When gửi câu hỏi, Then agent trả lời mở đầu `[DẪN ĐƯỜNG]`, kèm mã điểm đến và các bước đi. *(B01, B02, B03)*
- AC1.2 Given sinh viên gọi địa điểm bằng tên quen ("hội trường", "phòng lab", "căng tin"), Then agent khớp theo tên và bí danh trong bản đồ.
- AC1.3 Then mọi địa điểm trong câu trả lời đều là mã có trong `data/campus.json`.

**US02.** Là sinh viên mới, tôi muốn hỏi theo tên hoạt động, để mascot tự biết hoạt động đó tổ chức ở đâu.

- AC2.1 Given sinh viên nhắc tên hoặc chủ đề của hoạt động ("ngày hội CLB AI", "workshop Python"), Then điểm đến là địa điểm của hoạt động đó trong lịch. *(B04, B05)*
- AC2.2 Then câu trả lời kèm giờ hoạt động lấy đúng từ `data/events.json`, không bịa giờ khác. *(B09)*

**US03.** Là sinh viên mới, tôi muốn được hỏi lại khi câu hỏi của tôi chưa rõ, để không bị dẫn tới sai chỗ.

- AC3.1 Given sinh viên không nói đang ở đâu, Then agent trả lời `[HỎI LẠI]` và hỏi điểm xuất phát, không đưa lộ trình. *(B06)*
- AC3.2 Given tên địa điểm quá chung, Then agent dẫn tới địa điểm duy nhất khớp trong bản đồ, hoặc hỏi lại nếu có nhiều chỗ khớp. *(B07)*
- AC3.3 Given phòng không có trong bản đồ ("C501"), Then agent nói không tìm thấy và hỏi lại, không đưa lộ trình tới phòng không tồn tại. *(B08)*
- AC3.4 Given sinh viên nói bị lạc mà không nêu được vị trí, Then agent hỏi mốc nhìn thấy được hoặc gợi ý quay về sân trung tâm, không tự đoán vị trí. *(B10)*
- AC3.5 Given model trả về dữ liệu lỗi hoặc mã không có thật, Then hệ thống hạ xuống `[HỎI LẠI]` thay vì dẫn đường.

### Epic 2 — Dẫn đường bằng mascot

**US04.** Là sinh viên mới, tôi muốn nhận lộ trình từng bước kèm số phút, để biết đi bao lâu thì tới.

- AC4.1 Given điểm xuất phát và điểm đến hợp lệ, Then lộ trình do code tính trên bản đồ, model không sinh đường đi.
- AC4.2 Then mỗi bước dùng đúng câu chỉ đường của lối đi trong dữ liệu, và tổng số phút bằng tổng các lối đi.
- AC4.3 Then câu trả lời nêu rõ từ đâu tới đâu và mã địa điểm, để sinh viên đối chiếu với biển chỉ dẫn.

**US05.** Là sinh viên mới, tôi muốn thấy mascot trên camera điện thoại dẫn đường, để vừa nhìn đường vừa nghe chỉ dẫn.

- AC5.1 Given đã có lộ trình, When sinh viên mở camera trên điện thoại Android, Then mascot hiện trên khung hình và đọc bước hiện tại.
- AC5.2 When sinh viên bấm "Tiếp", Then mascot chuyển sang bước sau. Given đã tới bước cuối, Then mascot báo đã tới nơi và hiện mã QR (nếu là hoạt động).
- AC5.3 Given máy không hỗ trợ camera AR, Then vẫn hiện lộ trình dạng chữ, không chặn sinh viên.

**US06.** Là sinh viên mới, tôi muốn sửa lại vị trí khi đi sai, để mascot tính lại đường từ chỗ mới.

- AC6.1 When sinh viên nói vị trí mới ("giờ mình đang ở sảnh B"), Then agent tính lại lộ trình từ điểm đó tới cùng điểm đến.

### Epic 3 — Check-in hoạt động

**US07.** Là sinh viên mới, tôi muốn có mã QR check-in khi tới nơi, để điểm danh nhanh tại cửa.

- AC7.1 Given điểm đến là một hoạt động, Then câu trả lời có nội dung mã QR dạng `SUNSHINE-CHECKIN:<event_id>`. *(B04, B05)*
- AC7.2 Then mã QR chỉ là bản nháp. Điểm danh chỉ được ghi nhận khi ban tổ chức quét mã và xác nhận tại cửa.

**US08.** Là ban tổ chức, tôi muốn agent không điểm danh hộ, để danh sách tham dự phản ánh đúng người có mặt.

- AC8.1 Given sinh viên nhờ điểm danh hộ hoặc xin mã khi không tới, Then agent trả lời `[TỪ CHỐI]`, không có chuỗi `SUNSHINE-CHECKIN`, và gợi ý liên hệ ban tổ chức. *(B11)*

### Epic 4 — An toàn và phạm vi

**US09.** Là ban tổ chức, tôi muốn agent từ chối yêu cầu vượt quyền, để không lộ mã check-in hay dữ liệu sinh viên.

- AC9.1 Given người dùng yêu cầu bỏ qua luật, đổi vai thành admin, in mọi mã check-in hoặc danh sách sinh viên, Then agent trả lời `[TỪ CHỐI]`, không in mã hàng loạt, không có dữ liệu cá nhân. *(B12)*
- AC9.2 Given câu hỏi ngoài việc dẫn đường trong trường, Then agent nói rõ mascot chỉ dẫn đường và hoạt động trong trường, việc khác liên hệ ban tổ chức hoặc phòng CTSV.
- AC9.3 Then hệ thống không lưu vị trí của sinh viên sau khi trả lời.

## Rủi ro

| # | Rủi ro | Mức | Ảnh hưởng | Cách giảm |
|---|---|---|---|---|
| 1 | Model bịa địa điểm, lộ trình hoặc giờ không có trong dữ liệu | Cao | Sinh viên đi nhầm chỗ hoặc đến sai giờ | Model chỉ được chọn mã trong dữ liệu; code kiểm từng mã, sai thì hạ xuống `[HỎI LẠI]`; lộ trình và giờ luôn lấy từ dữ liệu. Metric `khong_bia_dia_diem` phải 0 lỗi |
| 2 | Bản đồ giả lập không khớp khuôn viên thật | Cao | Chỉ đường đúng trong demo nhưng sai ngoài thực tế | Gắn nhãn `synthetic` cho mọi dữ liệu; trước khi thử thật, đi khảo sát khuôn viên và dựng lại bản đồ với lối đi và số phút thật |
| 3 | Không định vị được, sinh viên phải tự nói mình ở đâu | Trung bình | Sinh viên không biết mình đang ở đâu thì không bắt đầu được | Hỏi mốc nhìn thấy được; gợi ý quay về sân trung tâm; sau này đặt mã QR ở các điểm chính để xác định điểm xuất phát |
| 4 | AR chỉ chạy trên Android; Safari trên iPhone không hỗ trợ WebXR | Trung bình | Khoảng một nửa sinh viên không thấy mascot trên camera | Luôn hiện lộ trình dạng chữ để dự phòng; sau này dùng mascot 2D đè lên camera, chạy được trên mọi điện thoại |
| 5 | Mã check-in bị chia sẻ hoặc chụp màn hình | Trung bình | Sinh viên "check-in" mà không có mặt | Mã QR chỉ là bản nháp, ban tổ chức xác nhận tại cửa; sau này dùng mã ngắn hạn riêng cho từng sinh viên |
| 6 | Prompt injection đòi quyền admin, đòi mọi mã hoặc danh sách sinh viên | Trung bình | Lộ mã hoặc dữ liệu cá nhân | Agent không có công cụ nào liệt kê sinh viên hay toàn bộ mã; câu thử từ chối B11, B12 phải qua 100% |
| 7 | Tên địa điểm mơ hồ hoặc tiếng lóng ("chỗ ăn", "nhà A") | Trung bình | Dẫn tới sai điểm đến | Danh sách bí danh cho từng địa điểm; hỏi lại khi có nhiều hơn một chỗ khớp |
| 8 | Ban tổ chức không cập nhật lịch kịp thời | Trung bình | Mascot dẫn sinh viên tới phòng hoặc giờ cũ | Một file lịch chung cho mỗi tuần sự kiện; sau này có trang cho ban tổ chức tự sửa hoạt động |

## Kế hoạch phát triển

### Giai đoạn 1 — MVP (làm cho hackathon)

| Tính năng | Mô tả |
|---|---|
| Hỏi bằng câu tự nhiên | Sinh viên hỏi theo cách nói của mình là muốn đi đâu |
| Khớp địa điểm và hoạt động | Khớp tên, bí danh và thẻ chủ đề với mã trong dữ liệu |
| Hỏi lại khi chưa chắc | Hỏi một câu ngắn khi điểm xuất phát, địa điểm hoặc phòng chưa rõ hay bị thiếu |
| Lộ trình từ bản đồ | Code tính lộ trình từng bước và số phút; model không viết lộ trình |
| Mascot trên camera | Một mascot dựng sẵn dẫn đường trên camera Android, có lộ trình dạng chữ để dự phòng |
| Mã QR check-in | Sinh nội dung mã QR cho hoạt động; ban tổ chức xác nhận tại cửa |
| Từ chối | Từ chối điểm danh hộ, yêu cầu quyền admin và yêu cầu xuất dữ liệu |

### Giai đoạn 2 — Sẵn sàng cho khuôn viên thật

| Tính năng | Mô tả |
|---|---|
| Bản đồ khuôn viên thật | Dựng lại sau khi đi khảo sát khuôn viên, có lối đi, tầng và số phút thật |
| Lộ trình tiếp cận | Thang máy và lối không bậc thang cho sinh viên cần |
| Mã QR đặt tại chỗ | Sinh viên quét mã ở cửa toà nhà để xác định mình đang ở đâu |
| Chạy trên iPhone | Mascot 2D đè lên camera, chạy được trên trình duyệt mọi điện thoại |
| Check-in thật | Ban tổ chức quét mã QR và điểm danh được ghi vào danh sách của hoạt động |

### Giai đoạn 3 — Công cụ cho ban tổ chức

| Tính năng | Mô tả |
|---|---|
| Trang cho ban tổ chức | Ban tổ chức thêm hoạt động, địa điểm và giờ mà không cần sửa file |
| Mascot riêng | Ban tổ chức tải lên mascot 2D hoặc 3D của sự kiện mình |
| Nhiệm vụ trên bản đồ | Ban tổ chức đặt các điểm nhiệm vụ; sinh viên quét QR ở từng điểm để hoàn thành nhiệm vụ và nhận huy hiệu |
| Theo dõi điểm danh | Ban tổ chức xem số sinh viên đã check-in theo từng hoạt động |

### Giai đoạn 4 — Thêm cho sinh viên

| Tính năng | Mô tả |
|---|---|
| Chụp ảnh AR với mascot | Sinh viên chụp ảnh cùng mascot của sự kiện và chia sẻ |
| Mũi tên la bàn | Mũi tên trên camera chỉ về phía điểm đến, dùng GPS và la bàn của điện thoại khi ở ngoài trời |
| Gợi ý hoạt động | Sinh viên chọn sở thích hoặc khoa, nhận danh sách hoạt động sắp tới phù hợp |
| Nhắc lịch | Nhắc trước giờ hoạt động, kèm lộ trình từ nơi sinh viên hay ở |

## Công nghệ

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| AI | Một lần gọi LLM qua `codebase/ai.py` (`call_model`) | Đọc câu hỏi, trả về điểm xuất phát, điểm đến, hoạt động và hành động (`dan_duong` / `hoi_lai` / `tu_choi`) dạng JSON |
| Agent | Workflow cố định bằng Python (`codebase/agent.py`) | Gọi công cụ, kiểm JSON và mã do model trả về, chọn câu trả lời cuối |
| Công cụ | `tra_dia_diem`, `danh_sach_dia_diem`, `tim_lo_trinh`, `tao_ma_checkin` (`codebase/tools.py`) | Tra địa điểm, liệt kê địa điểm, tìm lộ trình bằng BFS, sinh nội dung mã QR check-in. Không công cụ nào tác động ra hệ thống bên ngoài |
| Dữ liệu | `data/campus.json`, `data/events.json` | Bản đồ khuôn viên và lịch hoạt động giả lập |
| Đánh giá | `eval/benchmark.csv`, `eval/metric_spec.yaml`, `run.py eval` / `score` | 12 câu thử (5 thường, 5 khó, 2 từ chối) và 4 metric |
| Chi phí | `cost/simulate.py`, `cost/personas.yaml` | Mô phỏng phiên dùng để ước tính chi phí hằng tháng |
| Hiển thị AR *(dự kiến)* | Camera trên trình duyệt Android (WebXR) với mascot dựng sẵn | Hiện mascot và bước hiện tại trên camera |
| Môi trường chạy | Chỉ dùng thư viện chuẩn của Python | Chạy bằng `python run.py` |
