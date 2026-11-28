# Chi phí hỏi đường bằng văn bản

Mười phiên mô phỏng ngày 28/11/2026 phát sinh 15 lượt gọi GPT-4.1 mini, nhận 13.304 token vào và 1.119 token ra. Cả 10 phiên đều có kết quả. Với đơn giá chuẩn 0,40 USD/triệu token vào và 1,60 USD/triệu token ra, tổng chi phí ước tính của 10 phiên là **0,007112 USD**, trung bình **0,000711 USD/phiên**. Đây là chi phí suy từ usage trước chiết khấu hoặc cache. [Giá GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

## Đầu vào

Mã lượt `simulate-try@20261128-060200`, seed 42. Trong 10 phiên có 6 phiên một câu, 3 phiên hai câu và 1 phiên ba câu. Mỗi lượt lấy một đầu vào độc lập từ benchmark. Các biến về tỷ lệ persona, số phiên/tháng và người dùng/tháng là giả định để nhóm duyệt. Mốc 27 chỉ lấy kích thước mẫu khảo sát làm quy mô thử, chưa đo nhu cầu sử dụng hằng tháng. [Cấu hình và nguồn giá](personas.yaml)

## Kịch bản từ bản thử CP3

| Giá áp dụng cho cùng lượng token | USD/phiên | USD/tháng, 10 người | USD/tháng, 27 người | USD/tháng, 54 người |
|---|---:|---:|---:|---:|
| GPT-4.1 mini, model đã chạy | 0,00071 | 0,0385 | 0,1039 | 0,2079 |
| GPT-5 mini, kịch bản đổi đơn giá | 0,00056 | 0,0302 | 0,0817 | 0,1633 |

Bảng giữ nguyên kết quả từ `cost/simulate-try-summary.md`. Với GPT-5 mini, token thực tế và chất lượng có thể khác khi chạy model đó. [Giá GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)

## Ước tính 50 phiên từ log lượt 1

Mốc kiểm tra sau CP4 dùng 50 phiên và seed 42 trong [cấu hình](personas.yaml). Khung chọn 22 phiên một câu, 17 phiên hai câu và 11 phiên ba câu. Mỗi lượt hỏi dùng token của đúng câu trong [CSV lượt 1](../eval/run-1.csv). Tổng cộng 89 lượt hỏi, 78.158 token vào và 6.019 token ra khi cộng theo mẫu rút. Đây là ước tính lấy mẫu lại từ log đã có. OpenAI trả HTTP 401 lúc kiểm tra khóa nên mô phỏng gọi API 50 phiên vẫn chờ chạy.

| Đơn giá áp dụng lên token lượt 1 | USD/phiên | 10 người/tháng | 27 người/tháng | 54 người/tháng | USD/người/tháng |
|---|---:|---:|---:|---:|---:|
| GPT-4.1 mini | 0,00082 | 0,0376 | 0,1014 | 0,2028 | 0,0038 |
| GPT-5 mini | 0,00063 | 0,0290 | 0,0783 | 0,1566 | 0,0029 |

Chi phí phiên dùng số token nhân với đơn giá. Chi phí tháng dùng số người, tỷ trọng, số phiên/tháng và chi phí trung bình theo từng persona. Token GPT-5 mini trong bảng được định giá trên log GPT-4.1 mini. Với kịch bản cơ sở, **0,0038 USD tiền model/người/tháng** so với mục tiêu ước tính **0,72–1,20 phút tiết kiệm/người/tháng**. Bước tiếp theo của pilot là đo thời gian thực tế và ghi riêng chi phí hosting, định vị ảnh, giọng nói, mascot và công vận hành. [Căn cứ impact](../spec.md#2-tác-động-và-lựa-chọn) · [Đơn giá GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) · [Đơn giá GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)

**Chi phí/tác vụ thành công** = chi phí trung bình mỗi phiên chia cho tỷ lệ đạt đã duyệt của lượt đánh giá cùng model. Khoản này đang chờ lượt đánh giá sau cải tiến và phần duyệt của thành viên. Phạm vi trên là hỏi đường bằng văn bản.

### Tái lập ước tính từ log

Chạy tại thư mục gốc. Đoạn lệnh chỉ đọc các đầu vào và in bảng.

```sh
python3 - <<'PY'
import csv
import sys
from pathlib import Path

sys.path.insert(0, "cost")
import simulate

config, _ = simulate.load_config()
with Path("eval/run-1.csv").open(encoding="utf-8-sig") as handle:
    history = {row["input"]: row for row in csv.DictReader(handle)}
sessions = simulate.plan_sessions(config, simulate.ev.load_items(), config["sessions"])
replayed = []
for _, persona, inputs in sessions:
    measured = [history[text] for text in inputs]
    replayed.append({
        "persona": persona["name"],
        "turns": len(inputs),
        "error": "",
        "model": "gpt-4.1-mini",
        **{key: sum(int(row[key]) for row in measured)
           for key in ("tokens_in", "tokens_out", "model_calls", "tool_calls")},
    })
print("\n".join(simulate.summarize(config, replayed, None)))
PY
```
