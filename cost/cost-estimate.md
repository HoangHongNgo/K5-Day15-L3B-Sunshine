# Chi phí hỏi đường bằng văn bản · bản thử CP3

Mười phiên mô phỏng ngày 28/11/2026 phát sinh 15 lượt gọi GPT-4.1 mini, nhận 13.304 token vào và 1.119 token ra. Cả 10 phiên đều có kết quả. Với đơn giá chuẩn 0,40 USD/triệu token vào và 1,60 USD/triệu token ra, tổng chi phí ước tính của 10 phiên là **0,007112 USD**, trung bình **0,000711 USD/phiên**. Đây là chi phí suy từ usage trước chiết khấu hoặc cache. [Giá GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

## Đầu vào

Mã lượt `simulate-try@20261128-060200`, seed 42. Trong 10 phiên có 6 phiên một câu, 3 phiên hai câu và 1 phiên ba câu. Mỗi lượt lấy một đầu vào độc lập từ benchmark. Các biến về tỷ lệ persona, số phiên/tháng và người dùng/tháng là giả định để nhóm duyệt. Mốc 27 chỉ lấy kích thước mẫu khảo sát làm quy mô thử, chưa đo nhu cầu sử dụng hằng tháng. [Cấu hình và nguồn giá](personas.yaml)

## Kịch bản chi phí

| Giá áp dụng cho cùng lượng token | USD/phiên | USD/tháng, 10 người | USD/tháng, 27 người | USD/tháng, 54 người |
|---|---:|---:|---:|---:|
| GPT-4.1 mini, model đã chạy | 0,00071 | 0,0385 | 0,1039 | 0,2079 |
| GPT-5 mini, kịch bản đổi đơn giá | 0,00056 | 0,0302 | 0,0817 | 0,1633 |

Bảng giữ nguyên kết quả từ `cost/simulate-try-summary.md`. Với GPT-5 mini, token thực tế và chất lượng có thể khác khi chạy model đó. [Giá GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)

Phạm vi đo là phân loại câu hỏi chỉ đường bằng văn bản. Hosting, định vị MegaLoc, giọng nói, ảnh và mô hình mascot sự kiện cần đo riêng. CP4 cần mô phỏng ít nhất 50 phiên, tỷ lệ đạt đã duyệt của lượt 2 để tính USD/tác vụ thành công, cùng số đo tác động thực tế để so sánh.
