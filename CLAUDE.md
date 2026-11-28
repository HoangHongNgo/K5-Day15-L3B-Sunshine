# Sunshine — VinUni Wayfinder · CLAUDE.md

> Cập nhật 28/11/2026. File này là **CLAUDE.md duy nhất** của repo: mô tả dự án, quyết định đã chốt, quy trình TDD bắt buộc và chi tiết kỹ thuật wayfinder (gộp từ `vinuni-wayfinder/CLAUDE.md` cũ, đã xoá). Luật của khung hackathon ở [`AGENTS.md`](AGENTS.md) vẫn áp dụng đầy đủ. Quyết định ở đây đổi thì cập nhật `docs/PRD.md` và `spec.md` (changelog §10).

## Quy trình bắt buộc: Viết test trước khi làm (TDD)

Mọi AI coding agent và thành viên khi thêm feature hoặc sửa lỗi **BẮT BUỘC** làm theo vòng `Red → Green → Refactor`:

1. **Red:** Viết unit/integration test mô tả hành vi mong đợi (hoặc tái hiện lỗi) trước khi viết code triển khai; chạy test và xác nhận test **fail**.
2. **Green:** Triển khai code gọn gàng đúng phạm vi feature (`vinuni-wayfinder/frontend/src/features/<feature>/`, `vinuni-wayfinder/backend/app/`, hoặc `codebase/`), chạy test thấy **pass**.
3. **Refactor & kiểm tra:** Trước khi commit/push hoặc kết thúc task, chạy đầy đủ:
   - Frontend: `cd vinuni-wayfinder/frontend && npm test && npm run build`
   - Khung Python / eval: `python3 run.py check` (và `pytest` nếu sửa code Python).
- Đặt test cạnh từng feature (`src/features/<feature>/*.test.ts`, `server/*.test.ts`, `tests/test_*.py`). Không xoá/tắt test để làm xanh build.

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
- **Mascot:** dùng để dẫn đường (Vini mặc định; sự kiện CLB có mascot riêng). Mascot là sprite 2D phủ
  lên thẻ/camera, **chưa phải AR neo không gian**.

## Kiến trúc repo (đã hợp nhất frontend theo feature)

| Thư mục | Vai trò | Trạng thái |
|---|---|---|
| `vinuni-wayfinder/frontend/` | **Giao diện chính duy nhất** (React 19 + TypeScript + Vite 7 + Three.js, PWA — đã gộp `web/` vào và bỏ thư mục `web/`). Gồm khám phá 3D, tìm phòng, ảnh/MegaLoc, dẫn đường, mascot, sự kiện CLB và màn Thu thập (`/thu-thap` / `#thu-thap`) | **Đã nối backend** qua `src/features/wayfinder/` và proxy `vite.config.ts` (giữ fallback mô phỏng khi ngoại tuyến). Chi tiết: [`vinuni-wayfinder/frontend/docs/backend-integration.md`](vinuni-wayfinder/frontend/docs/backend-integration.md) |
| `vinuni-wayfinder/backend/` | **Nguồn sự thật cho định vị và tìm đường**: FastAPI + MegaLoc (GPU), đồ thị OSM, `routing.py` sinh thẻ chỉ dẫn, Supabase dùng chung | Chạy được trên laptop; chưa có số đo độ chính xác thật |
| `codebase/`, `run.py`, `eval/`, `cost/`… | Khung chấm hackathon: workflow AI hiểu câu hỏi → dẫn đường / hỏi lại / từ chối (dữ liệu `synthetic`) | Chạy ở chế độ giả; giữ hợp đồng `answer(text)` để `eval`/`simulate` chạy |

Cấu trúc feature trong `vinuni-wayfinder/frontend/src/`:
- `App.tsx`, `main.tsx` — chỉ giữ layout khung và `<Routes>`, không nhồi logic nghiệp vụ của từng feature vào đây.
- `shared/` — `brand.ts`, `usePwa.ts`, `FavoritesContext.tsx`, `ui.tsx`, `styles/` (`tokens.css`, `base.css`, `styles.css`, `glass.css`), `lib/` (`geo.js`, `sensors.js`, `image.js`, `text.js`).
- `features/wayfinder/` — API client, adapter, fallback catalog, `WayfinderContext` (+ `data.test.ts`, `wayfinderApi.test.ts`).
- `features/explore/` — mô hình 3D, `ExploreMap`, trang chi tiết/đã lưu/giới thiệu.
- `features/navigation/` — lập tuyến (`/di-den`), chọn vị trí (`/vi-tri`), dẫn đường từng bước (`/hanh-trinh`).
- `features/localization/` — Camera AR + MegaLoc (`/anh`), luồng ảnh mẫu (`/anh-mau`).
- `features/mascot/` — `Mascot`, `MascotStudio`.
- `features/events/` — sự kiện CLB, mascot theo sự kiện (+ `events.test.ts`).
- `features/collect/` — giao diện thu thập & sửa đồ thị (`/thu-thap`, CSS scoped trong `.collect-page`).

Khi làm frontend:
- Dùng token/màu/chữ ở `src/shared/styles/tokens.css`, `src/shared/brand.ts`, `src/shared/styles/glass.css`, font Be Vietnam Pro, icon `lucide-react`, bố cục ưu tiên điện thoại.
- **Logic định vị/tìm đường lấy từ backend wayfinder**, không viết lại ở client: `GET /api/destinations`, `POST /api/locate` (+ `previous` cho ảnh thứ hai), `POST /api/correct`, `GET /api/spots/search`, `GET /api/route`.
- Proxy dev trong `vinuni-wayfinder/frontend/vite.config.ts` chỉ proxy các endpoint wayfinder + thu thập, **không đè `/api/mascot/*`**. Điện thoại cần HTTPS (camera, GPS, la bàn) và cùng origin để tránh mixed content.
- Màn Thu thập (`/thu-thap`) chỉ cho nhóm; người dùng thường **không bao giờ thấy sơ đồ/đồ thị tòa nhà**, chỉ thấy thẻ chỉ dẫn.
- Lỗi backend (`no_index`, `no_path`, `too_far`…) hiện màn lỗi + chọn lại, **không âm thầm rơi về kết quả mock**.
- Frontend cần Node 22+.

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
- **Tòa C tầng 3 và tầng 4** (28/11/2026): sơ đồ **vẽ lại** từ bảng thoát hiểm bằng `backend/tools/add_c_floors.py` (`python -m tools.add_c_floors`, chạy lại được; ảnh `maps/toa-C-tang-3.webp`, `toa-C-tang-4.webp`, map `C3`/`C4` có `floor`). Tầng 3: C301–C305; tầng 4: hội trường C401, C402; mỗi tầng 3 cầu thang, thang máy, 3 WC. Hai tầng nối nhau qua thang máy/cầu thang; **tầng trệt Tòa C chưa có sơ đồ nên `c_door` tạm nối thẳng vào thang máy tầng 3**. Mọi điểm `verified: false`, `metersPerPx` 0.035 *(tự ước tính)*.
- **Tòa I tầng trệt**: ảnh chụp biển "Floor map" `maps/toa-I-tang-tret.webp` (nghiêng, chói, chữ nhỏ). Hướng "lên" của
  ảnh là phía Tòa E. Đọc được: quầy cà phê, quầy tiện ích, khu tự học mở, **I119** (y tế), **I109**, văn phòng, WC, thang
  máy, cầu thang; lối sang Tòa A, B, C, E, bãi xe. Khu phía đông nhiều phòng chưa ghi số.
- Mọi điểm `verified: false` cho tới khi đi bộ kiểm. Seed `maps/seed-site.json` dùng khi chưa có `backend/data/site.json`.

## Dữ liệu chung (Supabase)

- Project **vinwayfinder** (riêng tư): điểm, đường nối, phòng, vết đi bộ, vector (bảng `embeddings`, float16 bytea), ảnh
  (kho `maps`, `frames`). Mọi bảng bật RLS, **không có policy**; chỉ khoá service đọc/ghi.
- Backend tự chuyển chế độ: có `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` trong file `.env` ở gốc repo (mẫu ở `.env.example`) thì dùng Supabase, thiếu thì dùng `backend/data/`. `GET /api/health` trả `storage`. Khi có `.env`, sửa tay `site.json` sẽ không lên Supabase.
- Lưu sơ đồ qua SQL `save_site(base_version, payload)`: người khác đã lưu thì 409 `version_conflict`. Vector nạp vào bộ
  nhớ lúc khởi động và đồng bộ ~20 s (8448 chiều vượt giới hạn chỉ mục pgvector). DELETE qua API phải có WHERE.

## Môi trường máy dev & triển khai production

- Backend (dev local): Python 3.12/3.13, venv `vinuni-wayfinder/backend/.venv` (torch CUDA). GPU GTX 1650 4 GB: MegaLoc ~73 ms/ảnh, load lần đầu ~2 phút.
- Đặt `TORCH_HOME=backend/.torch` và `HF_HOME=backend/.torch/hf` để dùng cache model trong dự án (trọng số ~870 MB). Model: `torch.hub.load('gmberton/MegaLoc', 'get_trained_model', trust_repo=True)`.
- Frontend (dev local): Node 22+, `cd vinuni-wayfinder/frontend && npm ci && npm run dev`.
- **Production (Vercel + Tailscale Funnel cố định):**
  - Frontend deploy trên Vercel tại `https://vinuni-wayfinder.vercel.app` (deploy thủ công từ `vinuni-wayfinder/frontend/` bằng `vercel --prod`).
  - `vinuni-wayfinder/frontend/vercel.json` rewrite `/api/:path*` và `/maps/:path*` cùng origin tới domain HTTPS cố định `https://minhphuong.tail65ddfe.ts.net` (được kiểm tra bởi `vinuni-wayfinder/frontend/server/wayfinderProxy.test.ts`, không dùng `*.trycloudflare.com` tạm thời).
  - Backend chạy trên máy chủ `phuong@minhphuong` qua `systemd --user` (`vinuni-wayfinder-backend.service`, `uvicorn app.main:app --host 127.0.0.1 --port 8010`) và public HTTPS cố định qua `tailscale funnel --bg 8010` (cấu hình lưu bền vững sau reboot; đã tắt `vinuni-wayfinder-tunnel.service` của Cloudflare Quick Tunnel cũ).

## Việc còn lại

- [x] Nối frontend vào backend wayfinder, gộp `web/` vào `vinuni-wayfinder/frontend/` và tổ chức theo feature (`src/features/`).
- [x] Có một [bản ghi demo trên điện thoại tại tòa C](evidence/mobile-demo.md), từ mở sự kiện đến định vị bằng camera, theo các chặng và gặp Tia trong AR.
- [ ] Xác minh GPS, la bàn và độ chính xác định vị qua nhiều lượt trên điện thoại.
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
- Tạo mascot bằng AI (`vinuni-wayfinder/frontend/server/mascotApi.ts`, OpenAI) chỉ chạy ở Vite dev localhost; key `OPENAI_API_KEY` nằm trong file `.env` duy nhất ở gốc repo, **không dùng tiền tố `VITE_`**. Lên production phải là API máy chủ có quyền CLB và quota.
- Mọi số liệu độ chính xác/thời gian phải có nguồn đo thật; `estSeconds` (1,2 m/s) là ước tính, ghi rõ như vậy.

## Luật dữ liệu và bảo mật (repo công khai)

- **Không commit** ảnh/video hành lang, ảnh sơ đồ/mặt bằng tòa nhà, đồ thị đường đi thật (`seed-site.json`, `site.json`),
  vector (`*.npz`), khung hình: `vinuni-wayfinder/maps/`, `backend/data/`, `backend/.venv/`, `backend/.torch/` đã bị
  `.gitignore` chặn. Chỉ commit code và doc. Fixture trong `src/features/wayfinder/data.ts` phải là dữ liệu minh hoạ, không phải đồ thị thật.
- **Không commit** `.env`, `.env.*` (chỉ commit `.env.example`), API key, `supabase/.temp/`. Khoá `SUPABASE_SERVICE_KEY` bỏ qua RLS: không
  đưa vào Git, frontend, biến `VITE_*`, chat hay log; mỗi người xin qua kênh riêng của nhóm.
- Ảnh người dùng gửi để định vị bị xoá ngay sau khi embed; không lưu GPS của người dùng sau khi trả lời. Ảnh gửi lên phải
  thu nhỏ và xoá EXIF trước khi upload. Quay ở hành lang công cộng, tránh mặt người.
- Không bịa số liệu, người được phỏng vấn, trích dẫn; số không nguồn ghi *(tự ước tính)*. Không sửa chuẩn "đạt"
  (`spec.md` §7), `eval/metric_spec.yaml`, `eval/benchmark.csv`, các lượt đã chạy (`eval/run-*.csv`,
  `cost/simulate-*.csv`, `traces/*`). Không sửa file khung (`codebase/tracing.py`, `eval/run_eval.py`,
  `cost/simulate.py`, `run.py`).
- Khi một quyết định trong file này đổi, cập nhật doc nhóm (`docs/PRD.md`, `spec.md` + changelog §10, `README.md`).

## Chạy

```bash
python3 run.py && python3 run.py check                     # khung hackathon (chế độ giả)
cd vinuni-wayfinder/backend && uvicorn app.main:app --port 8000
cd vinuni-wayfinder/frontend && npm ci && npm test && npm run build && npm run dev
```

## Mốc

CP3 10:00 và CP4 14:30 Thứ Bảy 28/11/2026; changelog `spec.md` §10 và `reflection/<ten>.md` tới 23:59 cùng ngày.
