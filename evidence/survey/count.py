"""Đếm số chính từ evidence/survey/results.csv. Chạy: python evidence/survey/count.py

Form đổi chữ của lựa chọn giữa chừng (R01–R04 dùng bản dài, từ R05 dùng bản ngắn), và một lựa chọn
có dấu phẩy bên trong, nên KHÔNG tách theo ", " mà khớp theo từ khoá bên dưới.
"""
import csv
from pathlib import Path

rows = list(csv.DictReader(open(Path(__file__).with_name("results.csv"), encoding="utf-8")))
N = len(rows)

def pct(x, n=N):
    return f"{x}/{n} ({x / n:.0%})"

def count(col, options):
    print(f"\n## {col}")
    for label, keys in options.items():
        hit = [r["id"] for r in rows if any(k in r[col] for k in keys)]
        print(f"- {label}: {pct(len(hit))}")

print(f"n = {N}")
count("q1_nhom", {"Học viên AI20K": ["AI20K"]})
count("q3_he_dieu_hanh", {"Android": ["Android"], "iOS": ["iOS"], "Cả hai": ["cả hai"]})
count("q4_so_lan_kho_tim", {
    "Chưa bao giờ": ["Chưa bao giờ"], "1–2 lần": ["1–2 lần"], "3–5 lần": ["3–5 lần"], "Trên 5 lần": ["Trên 5 lần"],
})
gap = [r for r in rows if "Chưa bao giờ" not in r["q4_so_lan_kho_tim"]]
lap = [r for r in rows if any(k in r["q4_so_lan_kho_tim"] for k in ("3–5 lần", "Trên 5 lần"))]
print(f"- Từng gặp khó ≥1 lần: {pct(len(gap))}")
print(f"- Gặp khó ≥3 lần: {pct(len(lap))}")

count("q5_khu_vuc", {
    "Tòa I": ["Tòa I"], "Tòa G": ["Tòa G"], "Tòa A": ["Tòa A"], "Tòa H": ["Tòa H"], "Tòa C": ["Tòa C"],
    "Tòa E": ["Tòa E"], "Tòa B": ["Tòa B"], "Chưa có khu vực nào": ["Chưa có"],
})
count("q6_nguyen_nhan", {
    "Biết mã phòng nhưng không hình dung đường đi": ["Biết mã phòng"],
    "Biết tên sự kiện, không rõ tòa/phòng": ["tên sự kiện"],
    "Biển chỉ dẫn / bản đồ chưa rõ": ["Biển chỉ dẫn"],
    "Lịch/phòng đổi sát giờ": ["đổi sát giờ"],
    "Chưa từng gặp": ["Chưa từng gặp"],
})
count("q7_hau_qua", {
    "Chỉ mất 3–5 phút": ["3–5 phút"],
    "Đến trễ": ["trễ"],
    "Bỏ lỡ hoạt động": ["Bỏ lỡ"],
    "Lỡ điểm danh": ["điểm danh"],
    "Không hậu quả đáng kể": ["Chưa từng gặp hậu quả"],
})
nang = [r["id"] for r in rows if any(k in r["q7_hau_qua"] for k in ("trễ", "Bỏ lỡ", "điểm danh"))]
print(f"- Hậu quả nặng hơn đi vòng (trễ / bỏ lỡ / lỡ điểm danh): {pct(len(nang))}")
count("q8_phan_xa_dau_tien", {
    "Hỏi trực tiếp người xung quanh": ["Hỏi trực tiếp"],
    "Nhắn bạn bè / group lớp": ["Nhắn tin"],
    "Tự dò biển chỉ dẫn": ["Tự đi dò"],
    "Mở bản đồ minh họa của trường": ["bản đồ minh họa"],
    "Mở lại email / thông báo": ["email"],
})
print(f"\n## q9_diem_phien\n- Có trả lời: {pct(sum(1 for r in rows if r['q9_diem_phien'].strip()))}")
count("q10_cach_muon_nhan_chi_dan", {
    "Bản đồ 2D có tòa/tầng/đường ngắn nhất": ["bản đồ 2D"],
    "Gõ/nói câu hỏi → chỉ dẫn từng bước": ["Gõ hoặc nói"],
    "Camera + nhân vật ảo dẫn đường": ["camera"],
    "Chỉ cần phòng + tầng, không cần app": ["không cần app"],
})
