# Sunshine Mascot MVP — Product Requirements Document

> Team Sunshine · L3B · Track F. This PRD follows the scope locked in [`spec.md`](../spec.md) §4. Data is `synthetic` (see [`data/DATA_CARD.md`](../data/DATA_CARD.md)). Evidence numbers are filled in from [`evidence/`](../evidence/) once interviews and the survey are done. Nothing below is an invented figure.

## Problems

New students at a university campus often cannot find where an activity is held. Orientation week packs many events into a few days (welcome ceremony, club fairs, workshops, sports, scholarship advice) across buildings, floors and rooms they have never seen.

Today they get there like this:

- They read the room code on a poster or a group chat ("P.A305", "Hội trường A1") without knowing which building or floor it is on.
- They ask friends, security guards or whoever is nearby, and get different answers.
- They open Google Maps, which shows the campus but not the building, the floor or the room.
- If they are late, they walk around looking for signs, and some give up and miss the activity.

Organisers feel the other side. They put effort into an event, but fewer students show up than registered, and taking attendance at the door is slow and done by hand.

As a result, new students arrive late or miss activities that suit them, and organisers have no easy way to bring students to the right place at the right time.

Evidence status: hypothesis. The team will interview at least 3 VinUni students (P1–P3) and survey at least 20 AI20K students, with at least 5 direct quotes. Results go in `evidence/summary.md` and replace this paragraph at CP2.

## Target users

The primary users are new and first-year students attending an activity on campus for the first time. Event organisers (student clubs, the student affairs office) also benefit: students arrive on time, and check-in happens with a QR code instead of a paper list.

## Solution

Sunshine is a campus mascot that guides students to activities. The student asks in their own words, for example "Mình ở căng tin, ngày hội CLB AI ở đâu?", and the mascot shows the way step by step on the phone camera, with the activity time and a check-in QR code.

One model call decides what the student means. Everything that must be correct (places, routes, times, check-in codes) comes from the campus data, and the model never invents a place, a route or a time.

1. **Ask in natural language.** The student types or says where they are and where they want to go, either a place ("phòng lab", "thư viện") or an activity ("workshop Python"). The agent:
   - matches the words against place names and aliases in the campus map ("hội trường" → `HT_A1`, "phòng lab" → `P_A305`);
   - matches activity names and tags in the schedule, and sets the destination to the activity's own venue;
   - may only choose place and event codes that exist in the data.
2. **Ask back when unsure.** If the starting point is missing, the place is too vague, or the room does not exist (e.g. "C501"), the agent asks one short question instead of guessing. If the student is lost, it asks for a visible landmark or suggests going back to the central square.
3. **Route from data, not from the model.** Once the start and destination are valid codes, code computes the route over the campus graph (BFS). Each step uses the direction sentence and minutes stored for that path. The model never writes the route.
4. **Mascot shows the way.** The mascot appears on the phone camera and reads out the route one step at a time ("Đi thẳng qua sân trung tâm, vào sảnh A, lên tầng 3"), with the total minutes and the activity time.
5. **Check-in QR.** For an activity, the agent creates the content of a check-in QR code. The organiser scans it at the door and confirms attendance. The agent never takes attendance on a student's behalf.
6. **Refuse what is out of scope.** Requests to check in for someone else, to act as admin, or to list codes or student data are refused, and the student is pointed to the organiser or the student affairs office.

On demo day, the full loop runs: a natural-language question, a clarifying question when needed, step-by-step route from the map, the mascot on camera, and the check-in QR.

## Current demo limits

The demo runs the full flow, but several parts differ from a real deployment.

| Area | Current state |
|---|---|
| Campus map | Synthetic, written by hand: 12 places, 11 two-way paths, minutes are estimates. Not a real VinUni map |
| Event schedule | Synthetic: 6 orientation-week activities, no overlapping times or names |
| Location | No GPS or indoor positioning. The student says where they are |
| Mascot | One pre-made mascot. Organisers cannot create their own yet |
| AR display | Android camera only. Not yet built; the current runnable demo is command-line text |
| Check-in | Only the QR content is generated. Attendance is not written to any real system |
| Model | Runs in mock mode until a real model is connected before CP3 |

## User stories

The user stories below describe the MVP scope. They are written in Vietnamese, as used by the team. Items planned for later releases are listed under Future plan. The test ID in brackets refers to `eval/benchmark.csv`.

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

## Risks

| # | Risk | Level | Impact | Mitigation |
|---|---|---|---|---|
| 1 | The model invents a place, route or time that is not in the data | High | Students walk to the wrong place or arrive at the wrong time | The model may only pick codes from the data; code checks every code and falls back to `[HỎI LẠI]`; routes and times always come from data. Metric `khong_bia_dia_diem` must be 0 failures |
| 2 | The synthetic map does not match the real campus | High | Directions look right in the demo but are wrong on site | Label all data `synthetic`; before a real pilot, walk the campus and rebuild the map with real paths and minutes |
| 3 | No location sensing; the student must say where they are | Medium | Students who do not know where they are cannot start | Ask for a visible landmark; suggest returning to the central square; later, QR markers at key points to set the start |
| 4 | AR only works on Android; WebXR is not supported on iOS Safari | Medium | About half of students cannot see the mascot on camera | Always show the text route as fallback; later, 2D mascot overlay on the camera feed, which works on any phone |
| 5 | Check-in codes can be shared or screenshotted | Medium | Students "check in" without attending | The QR is only a draft; the organiser confirms at the door. Later, a short-lived code per student |
| 6 | Prompt injection asks for admin powers, all codes or student lists | Medium | Leak of codes or personal data | Agent has no tool that lists students or all codes; refusal tests B11, B12 must pass 100% |
| 7 | Vague or slang place names ("chỗ ăn", "nhà A") | Medium | Wrong destination | Alias list per place; ask back when more than one place matches |
| 8 | Organisers do not keep the schedule up to date | Medium | Mascot sends students to an old room or time | One shared schedule file per event week; later, an organiser page to edit events |

## Future plan

### Stage 1 — MVP (built for the hackathon)

| Feature | What it does |
|---|---|
| Natural-language question | The student asks in their own words where to go |
| Place and activity matching | Matches names, aliases and activity tags to codes in the data |
| Ask back when unsure | One short question when the start, the place or the room is unclear or missing |
| Route from the map | Code computes the step-by-step route and minutes; the model never writes it |
| Mascot on camera | One pre-made mascot shows the route on an Android camera, with a text fallback |
| Check-in QR | Generates the QR content for an activity; the organiser confirms at the door |
| Refusals | Refuses check-in for others, admin requests and data dumps |

### Stage 2 — Ready for a real campus

| Feature | What it does |
|---|---|
| Real campus map | Rebuilt from a walk of the real campus, with real paths, floors and minutes |
| Accessible routes | Lifts and step-free paths for students who need them |
| QR markers on site | Students scan a marker at a building entrance to set where they are |
| Works on iPhone | 2D mascot overlaid on the camera feed, so it runs on any phone browser |
| Real check-in | Organiser scans the QR and attendance is written to the event's list |

### Stage 3 — Tools for organisers

| Feature | What it does |
|---|---|
| Organiser page | Organisers add events, venues and times without editing files |
| Custom mascot | Organisers upload their own 2D or 3D mascot for their event |
| Quests on the map | Organisers place checkpoints; students scan QR at each point to complete a quest and earn badges |
| Attendance view | Organisers see how many students checked in, by event |

### Stage 4 — More for students

| Feature | What it does |
|---|---|
| AR photo with the mascot | Students take a photo with the event mascot and share it |
| Compass arrow | An arrow on the camera points toward the destination, using GPS and the phone's compass outdoors |
| Event suggestions | Students pick interests or their faculty and get a list of upcoming activities that fit |
| Reminders | A reminder before an activity, with the route from where the student usually is |

## Technology

| Layer | Technology | Role |
|---|---|---|
| AI | One LLM call through `codebase/ai.py` (`call_model`) | Reads the question and returns start, destination, event and action (`dan_duong` / `hoi_lai` / `tu_choi`) as JSON |
| Agent | Python fixed workflow (`codebase/agent.py`) | Calls tools, validates the model's JSON and codes, picks the final answer |
| Tools | `tra_dia_diem`, `danh_sach_dia_diem`, `tim_lo_trinh`, `tao_ma_checkin` (`codebase/tools.py`) | Place lookup, place list, BFS route, check-in QR content. None act on outside systems |
| Data | `data/campus.json`, `data/events.json` | Synthetic campus map and activity schedule |
| Evaluation | `eval/benchmark.csv`, `eval/metric_spec.yaml`, `run.py eval` / `score` | 12 test cases (5 normal, 5 hard, 2 refusal) and 4 metrics |
| Cost | `cost/simulate.py`, `cost/personas.yaml` | Simulated sessions to estimate monthly cost |
| AR display *(planned)* | Android browser camera (WebXR) with a pre-made mascot | Shows the mascot and the current step on camera |
| Runtime | Python standard library only | Runs with `python run.py` |
