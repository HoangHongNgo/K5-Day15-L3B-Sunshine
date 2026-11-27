# VinUni Wayfinder — CLAUDE.md

App chỉ đường tới các phòng trong campus VinUniversity (Gia Lâm, Hà Nội), dự án hackathon.
Mô phỏng cách tiếp cận của **Hound Around** (https://github.com/DxubleBTW/Hound-Around):
định vị **trong nhà** bằng nhận diện ảnh hành lang (GPS không đủ chính xác trong nhà); **ngoài trời** dùng GPS.

> Repo Hound-Around **không có LICENSE** → chỉ học theo kiến trúc/luồng màn hình, **không copy code nguyên văn**.
> Bản clone để tham khảo nằm ngoài dự án (scratchpad của phiên làm việc, có thể đã bị dọn), không đưa vào repo này.
> Số liệu độ chính xác của Hound Around (đo trên toà CDS ở Boston) chỉ để tham khảo, **không phải kết quả của dự án này**.

## Bối cảnh nhóm (cập nhật 27/11/2026)

- Đây là bài của nhóm **Sunshine** (lớp L3B, track F) trong hackathon AI20K. Repo nộp bài của nhóm là **một repo riêng, công khai**: https://github.com/HoangHongNgo/K5-Day15-L3B-Sunshine (thư mục `D:\VinAI\Hackathon\K5-Day15-L3B-Sunshine`). Thư mục `vinuni-wayfinder/` này **nằm trong chính repo đó** (không phải dự án hay repo riêng; chuyển vào ngày 27/11/2026). `.gitignore` của repo chặn `vinuni-wayfinder/maps/`, `backend/data/`, `backend/.venv/`, `backend/.torch/`, `*.npz` và video: **chỉ commit code và doc, không commit dữ liệu hay ảnh sơ đồ**.
- **Wayfinder là ưu tiên chính. Mascot AR dẫn đường (hướng ban đầu của nhóm) hoãn lại, làm khi có thời gian**; không đưa vào bản demo wayfinder.
- Tài liệu của nhóm đã được viết lại theo hướng này và push lên `main` (commit `47743d3`): `docs/PRD.md` (yêu cầu, user story US10–US15, rủi ro, lộ trình), `spec.md` (§3, §4, §9, changelog §10), `canvas.md`, `data/DATA_CARD.md` (dataset 3–4), `README.md`. **Khi quyết định nào ở đây thay đổi thì doc ở repo nhóm cũng phải được cập nhật** (changelog `spec.md` §10).
- Luật của repo nhóm (`AGENTS.md`) áp dụng cả ở đây: **không bịa** số liệu, người được phỏng vấn hay trích dẫn (số không có nguồn ghi *(tự ước tính)*); không sửa chuẩn "đạt" `spec.md` §7, `eval/metric_spec.yaml`, `eval/benchmark.csv` và các lượt đã chạy `eval/run-*.csv`, `cost/simulate-*.csv`, `traces/*`.
- Bộ câu thử của repo nhóm hiện chỉ đo phần hiểu câu hỏi, lộ trình và từ chối (dữ liệu giả lập). **Chưa có bộ đo cho nhận diện vị trí bằng ảnh**; nếu viết thì phải loại cả video khỏi chỉ số khi thử (leave-one-video-out), và việc thêm vào bộ chính là quyết định của nhóm.

## Yêu cầu đã chốt với người dùng (đừng thay đổi nếu chưa hỏi lại)

| Mục | Quyết định |
| --- | --- |
| Nền tảng | Web app, mở trên điện thoại, không cần cài |
| Frontend | React + Vite |
| Backend | Python FastAPI + MegaLoc (PyTorch CUDA) chạy trên laptop |
| Ngôn ngữ UI | **Chỉ tiếng Việt** |
| Tòa demo | **Tòa I**, chỉ **tầng trệt** (không làm nhiều tầng, không cần chế độ thang máy) |
| Phạm vi | Chỉ đường ngoài trời giữa các tòa + trong Tòa I tới đúng phòng + tìm kiếm phòng |
| Chưa làm / hoãn | Mascot AR (hoãn), chế độ tiếp cận (không bậc thang), nhiều tầng, giao diện tiếng Anh |
| Định vị ngoài trời | GPS `watchPosition`, cập nhật liên tục |
| Định vị trong nhà | Chụp ảnh hành lang → MegaLoc kNN (kiểu Hound Around); giữa các lần chụp ước lượng bằng đếm bước + la bàn (PDR); dự phòng: gõ số phòng gần nhất |
| Giao diện dẫn đường | **Chỉ thẻ chỉ dẫn**, KHÔNG hiển thị bản đồ/sơ đồ tòa cho người dùng |
| Thẻ ngoài trời | Mũi tên xoay theo la bàn điện thoại + khoảng cách còn lại tới mốc tiếp theo |
| Kết nối điện thoại | Cùng Wi-Fi với laptop, **HTTPS tự ký** (camera/cảm biến bắt buộc HTTPS). Vite proxy `/api` sang backend để tránh mixed content |
| Lưu dữ liệu | Trên backend (thư mục `data/`, không commit), có nút xuất/nhập JSON để sao lưu |
| Chế độ thu thập (trên điện thoại) | (1) Neo ảnh mặt bằng vào bản đồ bằng GPS ở 2–3 góc tòa; (2) đánh dấu phòng & cửa; (3) vẽ hành lang/lối vào; (4) chạm vào điểm → quay video 10–15s, backend cắt ~40 khung và tính embedding; (5) ghi vết khi đi bộ (GPS + bước chân) |

## Pipeline nhận diện (theo Hound Around)

1. Điện thoại thu ảnh về ~512px, vẽ lại qua canvas để xóa EXIF/metadata, rồi upload.
2. MegaLoc: resize vuông 322×322 (squash, không giữ tỉ lệ), chuẩn hóa ImageNet mean/std → vector **8448 chiều**, L2-normalize.
3. Top-10 khung gần nhất theo cosine → bỏ phiếu theo điểm (spot); gộp phiếu các spot cách nhau < 8 m đi bộ.
4. Confidence = phiếu thắng (đã gộp) / 10 (hoặc / 20 khi gộp 2 ảnh), tối đa 1.
   Phân tầng: `auto` (đủ chắc → vào chỉ đường luôn, có link "Không phải ở đây?"), `picker` (hiện top 3 bằng tên dễ hiểu, vd "Hành lang trước phòng I109"), `second` (xin chụp thêm 1 ảnh hướng khác, rồi gộp phiếu, không bao giờ xin ảnh thứ 3).
   Chưa có dữ liệu để huấn luyện logistic regression như Hound Around → dùng ngưỡng heuristic, có thể hiệu chỉnh sau.
5. **Sửa sai = học ngay**: người dùng chạm đúng spot → vector ảnh đó thêm vào index với `source="correction"` và trọng số cao hơn; correction là láng giềng gần nhất thì được ưu tiên.
6. Ảnh gốc xóa ngay sau khi embed; chỉ giữ vector + nhãn.
7. Thu thập: lấy ~40 khung/spot là đủ; quay thêm góc/thời điểm mới hiệu quả hơn quay dài.

Luồng màn hình tham khảo: Chụp → Đang định vị → Xác nhận / Ảnh thứ hai → Chỉ đường; thêm màn "Gõ số phòng" để bắt đầu thủ công.

## Quy tắc chỉ dẫn từng bước

- Mẫu câu bắt đầu bằng: "Đi thẳng", "Tiếp tục", "Rẽ trái và đi", "Rẽ phải và đi", "Quay lại và đi", "Vào Tòa … qua cửa …".
- Chỉ coi là rẽ khi góc ≥ 45° (≥ 150° là "Quay lại"); khúc cua nhỏ hơn gộp vào bước trước.
- Cửa phòng đích nằm dọc hành lang → kết thúc bằng "…, ở bên trái/phải" thay vì một lần rẽ; cửa đi ngang qua giữa đường không tính là rẽ.
- Mỗi bước có thể kèm tối đa 3 mốc đi ngang qua (vd "quầy cà phê bên trái").

## Môi trường

- Windows 11, PowerShell. Node 18.14.2, npm 9.5.0. Python 3.13.
- GPU: NVIDIA GTX 1650 4 GB. **Đã kiểm 27/11/2026:** MegaLoc load được trên GPU, đầu ra `(1, 8448)`, ~73 ms/ảnh (ảnh 322×322, batch 1). Lần load đầu ~2 phút vì phải tải trọng số.
- Backend venv: `backend/.venv` (torch 2.14.1+cu126, torchvision 0.29.1+cu126, fastapi 0.165, uvicorn 0.54, python-multipart, opencv-python-headless, huggingface_hub 2.5, safetensors, networkx 3.7, numpy 2.5.4, pillow). Chưa có `requirements.txt`; nên viết khi code backend bắt đầu.
- Cache model: mã MegaLoc (torch hub) ở `backend/.torch/hub`, trọng số (~870 MB) ở HuggingFace cache. Để chạy tự chứa trong dự án, đặt **cả hai** biến trước khi chạy: `TORCH_HOME=backend/.torch` và `HF_HOME=backend/.torch/hf` (đã có sẵn bản trọng số ở đó). Bản gốc còn ở `~/.cache/huggingface/hub/models--gberton--MegaLoc`.
- Tải model: `torch.hub.load('gmberton/MegaLoc', 'get_trained_model', trust_repo=True)` (cần `huggingface_hub`, `safetensors`). Repo Hound-Around ghim phiên bản mã/trọng số theo commit; nên ghim tương tự khi cài đặt chính thức để vector không đổi.
- Không có `HF_TOKEN` → tải HF bị giới hạn tốc độ (chỉ cảnh báo, vẫn chạy).

## Cấu trúc thư mục (dự kiến)

Thư mục này nằm trong repo nhóm: `K5-Day15-L3B-Sunshine/vinuni-wayfinder/`. Các thư mục ghi "không commit" bên dưới đã được `.gitignore` của repo chặn.

```
vinuni-wayfinder/
  CLAUDE.md
  maps/            ảnh nguồn, không commit: campus-osm.webp (sơ đồ campus dựng từ OSM; campus-map.webp là bản vẽ tay cũ), toa-I-tang-tret.webp (mặt bằng Tòa I)
  backend/tools/   build_osm_campus.py (dựng sơ đồ campus từ OSM; đây là code, commit được)
  backend/         FastAPI + MegaLoc (.venv, .torch là cache, không commit)
  backend/data/    site.json, frames/, index.npz, ảnh mặt bằng đã upload — dữ liệu riêng, không commit
  frontend/        React + Vite (HTTPS tự ký, proxy /api)
```

## Dữ liệu chung của nhóm: Supabase (thêm 28/11/2026)

- Project Supabase **vinwayfinder** (riêng tư) chứa bản đồ, điểm, đường nối, phòng, vết đi bộ, vector nhận diện (bảng `embeddings`, float16 bytea) và ảnh (kho `maps`, `frames`). Mọi bảng bật RLS, **không có policy**; chỉ khoá service đọc/ghi được.
- Backend tự chuyển chế độ: có `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (trong `backend/.env`, gitignore) thì dùng Supabase; thiếu thì dùng file cục bộ `backend/data/`. `GET /api/health` trả `storage`.
- Khoá service **không bao giờ** được đưa vào Git, frontend, chat hay log. Mỗi người xin khoá qua kênh riêng của nhóm.
- Lưu sơ đồ qua hàm SQL `save_site(base_version, payload)`: có số phiên bản, nếu người khác đã lưu thì trả 409 `version_conflict` (người dùng phải tải lại). `get_site()` đọc toàn bộ. Vector được nạp vào bộ nhớ lúc khởi động và tự đồng bộ ~20 giây (MegaLoc 8448 chiều vượt giới hạn chỉ mục pgvector).
- Lệnh DELETE qua API của Supabase bắt buộc có WHERE (`delete ... where true`).
- Dữ liệu cục bộ đã chuyển lên bằng `backend/migrate_to_supabase.py`. Sau đó file `backend/data/site.json` **không còn là nguồn chính** khi có `.env`: sửa trực tiếp file đó sẽ không lên Supabase.
- Kiểm 28/11/2026 với hai backend (một có thư mục dữ liệu rỗng): cùng thấy 355 điểm, 476 đường nối, 27 phòng, 240 vector, ảnh sơ đồ/khung từ Supabase; lưu chồng nhau cho 409 đúng. Chưa thử với người dùng thật ở máy khác.

## Dữ liệu bản đồ

### Campus — từ 28/11/2026 dựng từ OpenStreetMap (thay sơ đồ vẽ tay `maps/campus-map.webp`)
- Công cụ: `backend/tools/build_osm_campus.py` (chạy trong `backend/`: `python -m tools.build_osm_campus --dry --preview x.png` để xem thử, bỏ `--dry` để ghi). Tải Overpass (cache `backend/data/osm-cache.json`), vẽ ảnh nền `maps/campus-osm.webp` (hướng Bắc lên, 0.35 m/px, 4 neo GPS ở góc nên sai số 0 m), dựng đồ thị đi bộ trong ranh giới trường (OSM way 777888670) + vùng đệm 35 m, rút gọn khúc cua nhỏ, đặt lại các điểm có tên. Ghi `site.json` (sao lưu `backend/data/site.pre-osm.json`) và seed (sao lưu `maps/seed-site.pre-osm.json`).
- Kết quả: ~290 điểm, ~400 cạnh, **GPS ngoài trời dùng được** (`outdoorGeo = true`). Giữ nguyên id mà phòng/cửa trong nhà trỏ tới (`gate_main`, `gate_sanho`, `square`, `a_door`, `b_door`, `c_door`, `e_door`, `f_door`, `j_door`, `parking`, `i_west`, `i_east`, `lib_garden`, `g_w`, `r_n`, `g_east`); thêm `h_door`, `gd_ne`, `gd_s`, `gd_nw`. Điểm không tên gọi "Ngã rẽ gần Tòa X".
- Dữ liệu © OpenStreetMap contributors (ODbL): giữ dòng ghi nguồn trên ảnh và ở nơi hiển thị.
- **Chưa chắc, cần đi bộ kiểm:** (1) hai cổng lấy từ nút OSM theo suy luận — Cổng chính = `barrier=gate` (node 7972661011) ở đầu Nam; Cổng San Hô = `lift_gate` (node 10991194448, `access=private`) cuối trục đường thẳng từ Tòa G lên Bắc; (2) cửa tòa A, B, C, E, F, H, J, bãi xe = đỉnh đường đi bộ gần footprint nhất, không phải cửa thật; (3) cửa Tòa I nối theo hướng tới tòa lân cận vì Tòa I chưa có neo GPS; (4) **Tòa K không có trong OSM** nên đã bỏ phòng `bK`, thêm lại bằng chế độ Thu thập; (5) tên cửa Tòa G ("Tây/Bắc/Nam…") theo hướng trên bảng thoát hiểm, mà neo GPS của bạn cho thấy hướng "lên" của bảng gần như là Nam thật — nên đặt lại tên theo hướng thật khi đi kiểm.
- Cửa Tòa G nối theo GPS thật: vị trí mỗi cửa tính từ 3 neo của Tòa G (sai số 4,9 m), rồi gắn vào đỉnh đường đi bộ gần nhất (8–19 m).

### Campus cũ (sơ đồ vẽ tay, không còn dùng — giữ lại để tham khảo)
Hai cổng: **Main Gate** (phía Nam, qua Main Square) và **San Ho Gate** (phía Bắc, đường San Hô).
Các tòa: A, B (Auditorium/hội trường), C, E (Canteen), F (Medical Simulation Center), G (Superlab), H, I, J (Dorm), K, L, Parking Lot.
Trục trung tâm từ Bắc xuống Nam: G – A – I nối liền nhau; Main Square nằm ngay phía Nam Tòa I. B ở Đông Bắc của A, C ở phía Tây I, E ở phía Đông I.

### Tòa I – tầng trệt (ảnh "Floor map" chụp từ bảng thoát hiểm trong tòa)
- Ảnh đã lưu ở `maps/toa-I-tang-tret.webp` (27/11/2026). Ảnh chụp nghiêng, có chói, chữ nhỏ → tên phòng phải kiểm lại tại chỗ.
- Sơ đồ bị xoay so với campus: hướng "lên" trên ảnh là phía Tòa E. Việc neo GPS (anchor) sẽ xử lý phép xoay.
- Lối ra/vào và hướng dẫn trên bảng: phía trên-trái → Tòa B (Hội trường); phía trên-giữa → Tòa E (nhà ăn, lab, lớp học); cạnh trái → Trung tâm Khởi nghiệp (Entrepreneurship Lab), Vườn Thư viện (Library Garden), Tòa A (Thư viện); phía dưới-trái → Parking (P), cũng là vị trí "Bạn đang ở đây"; phía dưới-giữa → Tòa C (lớp học, giảng đường).
- Phòng/khu vực đọc được: Quầy cà phê (Coffee Shop), Quầy tiện ích (Convenience Store), Khu tự học mở (Open learning space), **I119** (Phòng y tế), **I109**, Văn phòng (Office, khu lớn bên phải), nhà vệ sinh, thang máy, cầu thang. Khu phía đông có nhiều phòng nhỏ chưa ghi số → cần thu thập tại chỗ.

### Tòa G – tầng trệt (ảnh "Fire Evacuation Plan", thêm 27/11/2026)
- Ảnh ở `maps/toa-G-tang-tret.webp` (2000×1500). Người dùng **thu thập Tòa G trước** (trước Tòa I).
- Phòng: G101–G107, 2 khu WC, 2 thang máy, 2 cầu thang bộ, 1 thang hàng (chưa đưa vào). Hành lang: trục ngang qua sảnh trung tâm (vị trí "bạn đang ở đây" trên bảng), trục dọc xuống cửa Nam, hai hành lang hai bên khối thang/WC, hành lang chữ U phía Bắc quanh G102.
- 33 điểm trong nhà + 1 điểm campus (`g_east`), tất cả `verified: false`. Lối nối cửa G ↔ campus là đoán (giả định phía trên ảnh là Bắc): cửa Tây ↔ `g_w`, cửa Bắc ↔ `r_n`, cửa Đông ↔ `g_east`; cửa Nam chưa nối (Tòa A sát phía Nam).
- `metersPerPx` = 0.04 *(tự ước tính)*. Ảnh kiểm tra đồ thị: `maps/toa-G-do-thi-kiem-tra.jpg`.

## Tiến độ

- [x] Chốt yêu cầu qua nhiều vòng hỏi đáp
- [x] Cài PyTorch CUDA + deps backend, kiểm tra MegaLoc chạy trên GPU (vector 8448-d, ~73 ms/ảnh, đo lại 27/11/2026)
- [x] Lưu sơ đồ campus vào `maps/campus-map.webp`
- [x] Cập nhật doc repo nhóm theo hướng wayfinder ưu tiên, commit `47743d3` đã push lên `main`
- [x] Lưu ảnh mặt bằng Tòa I vào `maps/toa-I-tang-tret.webp`
- [ ] Đi bộ kiểm lại tên/vị trí từng phòng ở Tòa I (đọc từ ảnh biển nên có thể sai, ví dụ I109/I119)
- [ ] Bộ đo nhận diện bằng ảnh + ngưỡng tin cậy hiệu chỉnh trên dữ liệu thật (chưa có số đo nào)
- [x] Backend FastAPI (`backend/app/`): `/api/site` (GET/PUT), `/api/destinations`, upload ảnh sơ đồ, `/api/spots/{id}/video` (cắt 40 khung rõ nét + MegaLoc, video gốc xoá ngay), `/api/locate` (k=10, gộp phiếu trong 8 m, tier auto/picker/second, gộp ảnh thứ 2), `/api/correct`, `/api/route` (thẻ chỉ dẫn, không trả toạ độ), vết đi bộ, xuất/nhập JSON. Kiểm 27/11/2026 bằng TestClient + video giả: pipeline chạy, ~90 ms/ảnh định vị, ~3 s/video 40 khung trên GTX 1650 (chưa có số đo độ chính xác thật).
- [x] Seed bản đồ: `maps/seed-site.json` (gitignored, vì là đồ thị đường đi thật) — 25 điểm ngoài trời + 30 điểm Tòa I, tất cả `verified: false`. Backend dùng seed khi chưa có `backend/data/site.json`.
- [x] Frontend (`frontend/`, Vite 5 vì Node 18): màn Chỉ đường (chọn đích, chụp ảnh / GPS / gõ số phòng, top-3, ảnh thứ 2, thẻ từng bước + mũi tên la bàn ngoài trời + đếm bước trong nhà) và màn Thu thập `#thu-thap` (kéo/thêm/nối/xoá điểm, phòng, neo GPS, GPS từng điểm, quay video, độ phủ ảnh, ghi vết, xuất/nhập). Đã thử trên trình duyệt laptop (HTTP): luồng chỉ đường và lưu dữ liệu chạy đúng; **chưa thử trên điện thoại** (camera, GPS, la bàn, HTTPS).
- Chạy thử trong khung trình duyệt của Claude: `D:\VinAI\Hackathon\.claude\launch.json` (backend + `frontend-http`).
- [x] 28/11/2026: thay sơ đồ campus bằng OSM (xem mục "Dữ liệu bản đồ"). Kiểm bằng TestClient: từ `gate_main` và `gate_sanho` tới G106, I119 đều ra tuyến; GPS ngoài trời trả điểm gần nhất; Thu thập hiện đúng ảnh + đồ thị. Sửa kèm: `routing.py` gộp bước ngoài trời < 15 m, bỏ "tới Ngã rẽ" khi ngã rẽ không tên, bỏ "(bên phải)" khỏi tên cửa trong câu chỉ dẫn; `App.jsx`/`styles.css` đổi class gốc `app collect` → `app app-collect` vì trùng `.collect` (grid) làm khung sơ đồ co còn 2 px ở màn rộng.
- [ ] Đi bộ kiểm đồ thị campus OSM (cổng, cửa tòa, Tòa K), kiểm lại hướng tên cửa Tòa G
- [ ] Thu thập dữ liệu thật tại Tòa I, kiểm thử end-to-end trên điện thoại

## Lưu ý quyền riêng tư / an toàn

- Không commit `backend/data/`, `.venv`, `.torch`, video/khung hình. **Không đưa ảnh/video hành lang, sơ đồ hay mặt bằng tòa nhà, đồ thị đường đi thật và vector vào repo công khai của nhóm** (một bộ ảnh đầy đủ của tòa nhà là rủi ro an ninh). Nếu sau này đưa code wayfinder vào repo nhóm, chỉ đưa code, không đưa dữ liệu, và thêm quy tắc chặn vào `.gitignore` trước.
- Ảnh người dùng gửi để định vị bị xóa ngay sau khi embed; không lưu GPS của người dùng sau khi trả lời.
- Không hiển thị toàn bộ sơ đồ tòa cho người dùng cuối (chỉ ở chế độ thu thập).
- Quay ở hành lang công cộng; tránh quay mặt người, hoặc làm mờ mặt trước khi lưu.
