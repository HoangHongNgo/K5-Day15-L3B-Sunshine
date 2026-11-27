# Sunshine — VinUni Wayfinder · CLAUDE.md

> Cập nhật 28/11/2026. File này là **CLAUDE.md duy nhất** của repo: mô tả dự án, quyết định đã chốt và chi tiết kỹ thuật
> wayfinder (gộp từ `vinuni-wayfinder/CLAUDE.md` cũ, đã xoá). Luật của khung hackathon ở [`AGENTS.md`](AGENTS.md) vẫn áp
> dụng đầy đủ. Quyết định ở đây đổi thì cập nhật `docs/PRD.md` và `spec.md` (changelog §10).

## Dự án là gì

App web (mở trên điện thoại, không cần cài) chỉ đường trong khuôn viên **VinUniversity (Gia Lâm, Hà Nội)** cho sinh viên
mới và khách: tìm phòng/địa điểm/sự kiện CLB → app xác định mình đang đứng ở đâu → **mascot dẫn đường** bằng thẻ chỉ dẫn
từng bước. Đây là bài của nhóm **Sunshine** (lớp L3B, track F) trong hackathon AI20K; repo công khai
https://github.com/HoangHongNgo/K5-Day15-L3B-Sunshine. Thành viên và phần việc: [`TEAMS.md`](TEAMS.md).

- **Ngoài trời:** GPS điện thoại trên đồ thị đi bộ dựng từ **OpenStreetMap**.
- **Trong nhà:** chụp ảnh hành lang → **MegaLoc** (vector 8448 chiều) → kNN bỏ phiếu → tự nhận / top 3 / xin ảnh thứ hai;
  dự phòng gõ số phòng gần nhất. Cách tiếp cận học theo Hound Around (BU Spark!), **tự cài đặt, không chép code**
  (repo đó không có giấy phép).
- **Phạm vi demo:** tầng trệt **Tòa G và Tòa I** + đường ngoài trời giữa các tòa. Không làm nhiều tầng, thang máy,
  chế độ không bậc thang. Giao diện **chỉ tiếng Việt**.
- **Mascot:** dùng để dẫn đường như trong `web/` (Vini mặc định; sự kiện CLB có mascot riêng). Mascot là sprite 2D phủ
  lên thẻ/camera, **chưa phải AR neo không gian**.

## Ba phần của repo và hướng hợp nhất

| Thư mục | Vai trò | Trạng thái |
|---|---|---|
| `web/` | **Giao diện chính duy nhất** (React 19 + TypeScript + Vite 7 + Three.js, PWA). Tìm phòng, ảnh, dẫn đường, mascot, sự kiện CLB | Đang chạy bằng dữ liệu fixture, **chưa nối backend**. Điểm nối: [`web/docs/backend-integration.md`](web/docs/backend-integration.md) |
| `vinuni-wayfinder/backend/` | **Nguồn sự thật cho định vị và tìm đường**: FastAPI + MegaLoc (GPU), đồ thị OSM, `routing.py` sinh thẻ chỉ dẫn, Supabase dùng chung | Chạy được trên laptop; chưa có số đo độ chính xác thật |
| `vinuni-wayfinder/frontend/` | Giao diện cũ (React 18 JS): màn Chỉ đường và màn Thu thập `#thu-thap` | **Sẽ bỏ.** Các màn này được thiết kế lại theo style `web/` và chuyển code về `web/`; dùng tạm tới khi `web/` có bản thay thế |
| `codebase/`, `run.py`, `eval/`, `cost/`… | Khung chấm hackathon: workflow AI hiểu câu hỏi → dẫn đường / hỏi lại / từ chối (dữ liệu `synthetic`) | Chạy ở chế độ giả; giữ hợp đồng `answer(text)` để `eval`/`simulate` chạy |

Khi làm frontend:
- **Thiết kế theo `web/`**: dùng token/màu/chữ ở `web/src/tokens.css`, `brand.ts`, `glass.css`, font Be Vietnam Pro, icon
  `lucide-react`, bố cục ưu tiên điện thoại. Không mang style của `vinuni-wayfinder/frontend` sang.
- **Logic định vị/tìm đường lấy từ backend wayfinder**, không viết lại ở client: `GET /api/destinations`,
  `POST /api/locate` (+ `previous` cho ảnh thứ hai), `POST /api/correct`, `GET /api/spots/search`, `GET /api/route`.
  Thay fixture trong `web/src/data.ts`, `PhotoFlow.tsx` bằng adapter gọi API; tham khảo client sẵn có
  `vinuni-wayfinder/frontend/src/api.js`.
- Proxy dev trong `web/vite.config.ts` chỉ các endpoint wayfinder, **không đè `/api/mascot/*`**. Điện thoại cần HTTPS
  (camera, GPS, la bàn) và cùng origin để tránh mixed content.
- Màn Thu thập (sửa đồ thị, neo GPS, quay video, ghi vết) chỉ cho nhóm, đặt sau route riêng; người dùng thường **không bao
  giờ thấy sơ đồ/đồ thị tòa nhà**, chỉ thấy thẻ chỉ dẫn.
- Lỗi backend (`no_index`, `no_path`, `too_far`…) hiện màn lỗi + chọn lại, **không âm thầm rơi về kết quả mock**.
- Máy này có Node 18.14.2; `web/` cần Node 22.12+ → phải nâng Node (hoặc dùng nvm) trước khi chạy/build `web/`.

## Định vị trong nhà (pipeline theo Hound Around)

1. Điện thoại thu ảnh về ~512 px, vẽ lại qua canvas để xoá EXIF, rồi upload.
2. MegaLoc: resize vuông 322×322 (squash), chuẩn hoá ImageNet mean/std → vector **8448 chiều**, L2-normalize.
3. Top-10 khung gần nhất theo cosine → bỏ phiếu theo spot; gộp phiếu các spot cách nhau < 8 m đi bộ.
4. Confidence = phiếu thắng / 10 (/ 20 khi gộp 2 ảnh), tối đa 1. Tier `auto ≥ 0.7` (vào chỉ đường luôn, có link
   "Không phải ở đây?"), `picker ≥ 0.5` (top 3 bằng tên dễ hiểu, vd "Hành lang trước phòng I109"), còn lại `second`
   (xin thêm 1 ảnh hướng khác, gộp phiếu; không bao giờ xin ảnh thứ 3). Ngưỡng là heuristic *(tự ước tính)*, chưa có dữ
   liệu để huấn luyện logistic regression như Hound Around.
5. **Sửa sai = học ngay**: người dùng chọn đúng spot → vector ảnh đó vào index với `source="correction"`, trọng số cao hơn.
6. Ảnh gốc xoá ngay sau khi embed; chỉ giữ vector + nhãn. Thu thập: ~40 khung/spot (video 10–15 s); quay thêm góc/thời
   điểm khác hiệu quả hơn quay dài.
7. Đo độ chính xác phải loại cả video khỏi index khi thử (leave-one-video-out: `VectorIndex.vote(..., exclude_video=...)`).
   **Chưa có số đo nào**; số của Hound Around (toà CDS, Boston) chỉ để tham khảo.

Luồng màn: Chụp → Đang định vị → Xác nhận / Ảnh thứ hai → Chỉ đường; thêm "Gõ số phòng" để bắt đầu thủ công.

## Tìm đường và thẻ chỉ dẫn

- Đồ thị đường đi (networkx) trong backend; client chỉ nhận `steps`, **không nhận toạ độ/đường đi** (`path` bị loại).
- Câu bắt đầu bằng "Đi thẳng", "Tiếp tục", "Rẽ trái và đi", "Rẽ phải và đi", "Quay lại và đi", "Vào Tòa … qua cửa …".
- Rẽ khi góc ≥ 45° (≥ 150° là "Quay lại"); khúc nhỏ hơn gộp vào bước trước; bước ngoài trời < 15 m được gộp.
- Cửa phòng đích dọc hành lang → kết thúc "…, ở bên trái/phải"; cửa đi ngang qua không tính là rẽ. Mỗi bước kèm tối đa
  3 mốc đi ngang qua. Ngoài trời: mũi tên xoay theo la bàn + khoảng cách còn lại; trong nhà: đếm bước + la bàn (PDR)
  giữa hai lần chụp.

## Dữ liệu bản đồ

- **Campus (từ 28/11/2026) dựng từ OpenStreetMap** bằng `vinuni-wayfinder/backend/tools/build_osm_campus.py` (chạy trong
  `backend/`: `python -m tools.build_osm_campus --dry --preview x.png` để xem thử, bỏ `--dry` để ghi). Cache Overpass ở
  `backend/data/osm-cache.json`; ảnh nền `maps/campus-osm.webp` (Bắc lên, 0.35 m/px, 4 neo GPS ở góc); đồ thị trong ranh
  giới trường (OSM way 777888670) + đệm 35 m; ~290 điểm, ~400 cạnh, `outdoorGeo = true`. Giữ nguyên id mà cửa/phòng trong
  nhà trỏ tới (`gate_main`, `gate_sanho`, `square`, `a_door`…`j_door`, `parking`, `i_west`, `i_east`, `lib_garden`,
  `g_w`, `r_n`, `g_east`, `h_door`, `gd_*`). Ghi nguồn "© OpenStreetMap contributors" (ODbL) ở nơi hiển thị.
- **Chưa chắc, cần đi bộ kiểm:** hai cổng suy từ nút OSM (Cổng chính = `barrier=gate` node 7972661011 phía Nam; Cổng San Hô =
  `lift_gate` node 10991194448); cửa tòa A, B, C, E, F, H, J, bãi xe là đỉnh đường gần footprint nhất, không phải cửa thật;
  cửa Tòa I nối theo hướng tòa lân cận (chưa có neo GPS); **Tòa K không có trong OSM** (đã bỏ phòng `bK`, thêm lại bằng
  Thu thập); tên cửa Tòa G theo hướng trên bảng thoát hiểm, mà hướng "lên" của bảng gần như là Nam thật.
- **Tòa G tầng trệt** (thu thập trước): ảnh `maps/toa-G-tang-tret.webp`. Phòng G101–G107, 2 khu WC, 2 thang máy, 2 cầu
  thang. 33 điểm trong nhà, cửa nối theo GPS thật (3 neo, sai số 4,9 m). `metersPerPx` = 0.04 *(tự ước tính)*.
- **Tòa I tầng trệt**: ảnh chụp biển "Floor map" `maps/toa-I-tang-tret.webp` (nghiêng, chói, chữ nhỏ). Hướng "lên" của
  ảnh là phía Tòa E. Đọc được: quầy cà phê, quầy tiện ích, khu tự học mở, **I119** (y tế), **I109**, văn phòng, WC, thang
  máy, cầu thang; lối sang Tòa A, B, C, E, bãi xe. Khu phía đông nhiều phòng chưa ghi số.
- Mọi điểm `verified: false` cho tới khi đi bộ kiểm. Seed `maps/seed-site.json` dùng khi chưa có `backend/data/site.json`.

## Dữ liệu chung (Supabase)

- Project **vinwayfinder** (riêng tư): điểm, đường nối, phòng, vết đi bộ, vector (bảng `embeddings`, float16 bytea), ảnh
  (kho `maps`, `frames`). Mọi bảng bật RLS, **không có policy**; chỉ khoá service đọc/ghi.
- Backend tự chuyển chế độ: có `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` trong `backend/.env` thì dùng Supabase, thiếu thì
  dùng `backend/data/`. `GET /api/health` trả `storage`. Khi có `.env`, sửa tay `site.json` sẽ không lên Supabase.
- Lưu sơ đồ qua SQL `save_site(base_version, payload)`: người khác đã lưu thì 409 `version_conflict`. Vector nạp vào bộ
  nhớ lúc khởi động và đồng bộ ~20 s (8448 chiều vượt giới hạn chỉ mục pgvector). DELETE qua API phải có WHERE.

## Môi trường máy dev

- Windows 11, PowerShell, Python 3.13, Node 18.14.2 (cần nâng lên 22 cho `web/`). GPU GTX 1650 4 GB: MegaLoc ~73 ms/ảnh,
  load lần đầu ~2 phút.
- Venv `vinuni-wayfinder/backend/.venv` (torch 2.14.1+cu126). Đặt `TORCH_HOME=backend/.torch` và
  `HF_HOME=backend/.torch/hf` để dùng cache model trong dự án (trọng số ~870 MB). Model:
  `torch.hub.load('gmberton/MegaLoc', 'get_trained_model', trust_repo=True)`; nên ghim commit để vector không đổi.

## Việc còn lại

- [ ] Nối `web/` vào backend wayfinder; chuyển màn Chỉ đường + Thu thập sang `web/` theo style mới, rồi bỏ
  `vinuni-wayfinder/frontend/`.
- [ ] Thử end-to-end trên điện thoại (HTTPS, camera, GPS, la bàn) — chưa thử lần nào.
- [ ] Thu thập dữ liệu thật ở Tòa G và Tòa I; đi bộ kiểm đồ thị campus OSM, tên/vị trí phòng, hướng tên cửa Tòa G.
- [ ] Bộ đo nhận diện bằng ảnh + hiệu chỉnh ngưỡng (thêm vào bộ chính là quyết định của nhóm, không thêm im lặng).

## Guardrail khi dùng AI (trong sản phẩm)

- **Model không bao giờ sinh đường đi, vị trí, giờ hay mã địa điểm tự do.** Model (ở `codebase/agent.py`) chỉ chọn
  `from` / `to` / `event` từ danh sách mã được đưa vào và một hành động `dan_duong | hoi_lai | tu_choi`, trả JSON.
- Code kiểm sau model: JSON hỏng hoặc mã không có trong bản đồ → hạ xuống **hỏi lại** (G10); `to` lệch địa điểm của
  sự kiện → lấy địa điểm của sự kiện. Lộ trình, số phút, giờ lấy từ dữ liệu, không từ chữ model.
- Vị trí trong nhà là **kNN trên dữ liệu đã thu thập**, không phải model sinh. Không chắc thì nói thẳng (top 3, ảnh thứ hai,
  gõ số phòng), không đoán.
- Từ chối việc ngoài chỉ đường: điểm danh hộ, vào khu có khoá, lấy thông tin người khác, đổi luật/vai trò
  (prompt injection) → `[TỪ CHỐI]` + chỉ tới BTC / phòng CTSV. Mã check-in chỉ là nội dung QR nháp, BTC xác nhận tại cửa.
- `POST /api/correct` chỉ gọi sau hành động xác nhận rõ ràng của người dùng (không gọi khi mount component).
- Tạo mascot bằng AI (`web/server/mascotApi.ts`, OpenAI) chỉ chạy ở Vite dev localhost; key nằm ở `web/.env.local`,
  **không dùng tiền tố `VITE_`**. Lên production phải là API máy chủ có quyền CLB và quota.
- Mọi số liệu độ chính xác/thời gian phải có nguồn đo thật; `estSeconds` (1,2 m/s) là ước tính, ghi rõ như vậy.

## Luật dữ liệu và bảo mật (repo công khai)

- **Không commit** ảnh/video hành lang, ảnh sơ đồ/mặt bằng tòa nhà, đồ thị đường đi thật (`seed-site.json`, `site.json`),
  vector (`*.npz`), khung hình: `vinuni-wayfinder/maps/`, `backend/data/`, `backend/.venv/`, `backend/.torch/` đã bị
  `.gitignore` chặn. Chỉ commit code và doc. Fixture trong `web/` phải là dữ liệu minh hoạ, không phải đồ thị thật.
- **Không commit** `.env`, `web/.env.local`, `backend/.env`, API key. Khoá `SUPABASE_SERVICE_KEY` bỏ qua RLS: không
  đưa vào Git, frontend, biến `VITE_*`, chat hay log; mỗi người xin qua kênh riêng của nhóm.
- Ảnh người dùng gửi để định vị bị xoá ngay sau khi embed; không lưu GPS của người dùng sau khi trả lời. Ảnh gửi lên phải
  thu nhỏ và xoá EXIF trước khi upload. Quay ở hành lang công cộng, tránh mặt người.
- Không bịa số liệu, người được phỏng vấn, trích dẫn; số không nguồn ghi *(tự ước tính)*. Không sửa chuẩn "đạt"
  (`spec.md` §7), `eval/metric_spec.yaml`, `eval/benchmark.csv`, các lượt đã chạy (`eval/run-*.csv`,
  `cost/simulate-*.csv`, `traces/*`). Không sửa file khung (`codebase/tracing.py`, `eval/run_eval.py`,
  `cost/simulate.py`, `run.py`).
- Khi một quyết định trong file này đổi, cập nhật doc nhóm (`docs/PRD.md`, `spec.md` + changelog §10, `README.md`).

## Chạy

```powershell
python run.py; python run.py check          # khung hackathon (chế độ giả)
```

Backend wayfinder và frontend cũ: xem [`vinuni-wayfinder/README.md`](vinuni-wayfinder/README.md) (cấu hình preview ở
`D:\VinAI\Hackathon\.claude\launch.json`). Giao diện `web/`: `cd web; npm ci; npm run dev` (Node 22), kiểm bằng
`npm test`, `npm run build`, `npm run verify*`.

## Mốc

CP3 10:00 và CP4 14:30 Thứ Bảy 28/11/2026; changelog `spec.md` §10 và `reflection/<ten>.md` tới 23:59 cùng ngày.
