# Phân tích sâu 4 phản hồi người dùng thật — Brainy Bits

- **Ngày:** 2026-11-24 · **Thời gian đọc:** ~8 phút · **Loại tài liệu:** Tham chiếu (`reference`)
- **Phạm vi:** Phân tích nguyên nhân gốc trong code + đo định lượng + đối chiếu các game tương tự trên internet **trước khi sửa code**. Không sửa code game trong lượt này.
- **Review provenance:** Same vendor, same priors — no external verifier ran (Quy tắc Vibe 7).

**TL;DR.** Cả 4 phản hồi đều chỉ trúng lỗi có thật trong code, không phải cảm giác chủ quan. Đợt chỉnh mở màn dễ ngày 2026-11-22 ghì chặt độ khó L1–L14 (`burstP = 0`, `speedF = 0.28`, `mem` giữ 3 ô suốt 9 màn, `rain` kẹt một nhịp suốt 5 màn) khiến cả 5 trò phẳng nhịp; riêng `Đoán Cụm Từ` gãy từ khâu nhập dấu đến từ điển 29.792 âm tiết ảo; còn `Mưa Phép Tính` đánh rơi phím số hàng trên khi bật bộ gõ `Vietnamese` của macOS và bị nút bắt đầu ẩn nuốt phím `Enter`.

---

## 1. Tổng quan 4 phản hồi và mối liên hệ hệ thống

| # | Phản hồi gốc | Trạng thái xác minh | Nguyên nhân gốc chính trong code |
|---|---|---|---|
| 1 | Toàn bộ game thiếu ngẫu nhiên, quá đồng đều | **Confirmed** | Nhịp L1–L14 bị nén phẳng sau đợt 2026-11-22; hàm sinh phép tính `rain` lệch phân phối tam giác (`9 + 1` nhiều gấp 12,3 lần `1 + 9`); `mem` kẹt 3 ô suốt L6–L14; `koi` không cá xám suốt L1–L14 |
| 2 | `Đoán Cụm Từ` nhiều lỗi về từ tiếng Việt | **Confirmed** | `modify()` đánh dấu nhầm (`cứu → cuứ`, `thuở → thưở`); thiếu Telex; `e.isComposing` chặn IME máy; `validSyllable()` đẻ 63 vần bịa và 29.792 tổ hợp; va chạm chính tả cũ/mới; thứ tự màn đảo ngược cảm giác người chơi |
| 3 | `Đường Ray` xe ra đều tăm tắp, thiếu ngẫu nhiên | **Confirmed** | `burstP = 0` suốt L1–L32 (`0%` tàu dồn dập); `speedF = 0.28` cố định; `colorBag` ép `adjSameColor = 0` qua 3.500+ cặp liên tiếp; `argmin(messScore)` gom mọi bản đồ về một dáng na ná |
| 4 | `Mưa Phép Tính` trên laptop/bàn phím không nhận phím | **Confirmed** (code listener có sẵn, nhưng gãy thực tế ở macOS/focus/UX) | Không fallback `Digit0..9` theo `e.code` nên bộ gõ `Vietnamese` (TCVN 6064) trên macOS gõ `ă â ê ô...` thay vì `0–9`; `startLevel()` không `blur()` nút khiến `Enter` bị nuốt; bàn phím ảo che 1/3 màn laptop |

Bốn lỗi này móc vào nhau ở chỗ: bộ engine `js/difficulty.js` và `scripts/sim/calibrate.mjs` tối ưu **tỉ lệ qua trung bình** (pass rate `p*`) bằng cách triệt phương sai. Triệt phương sai giúp bot `weak` vượt gate `G1`, nhưng người thật chơi 5–10 ván liên tiếp lại thấy mọi ván chạy theo một nhịp đều như đồng hồ.

---

## 2. Feedback 3 — Đường Ray Tư Duy (`train`): "các xe xuất hiện luôn đồng đều và không có tính ngẫu nhiên"

### Bằng chứng trong code & số đo định lượng (200 lượt mô phỏng/level)

1. **Tắt hẳn tàu dồn dập (`burstP = 0`) suốt 32 level đang ship (`Confirmed`):**
   - Trong `js/levels/train.js:52`, mọi dòng `L1..L30` (và tới tận `L35`) đều gán `burstP: 0` (trong khi bản cũ `legacyLevels` ở dòng 14 là `burstP: 0.15`, và `L36` mới mở lại `0.02` ở dòng 70–72).
   - Trong `js/train-map.js:31-36`, `spawnGap()` khi `burstP = 0` chỉ lấy 82% khoảng rơi vào `[0.75, 1.35] × base` và 18% khoảng nghỉ `[1.5, 2.1] × base`.
   - Số đo thực tế trên `spawnGap` với `mulberry32`:
     - `v2 L1` (`base=4.60`): trung bình `5.44s`, độ lệch chuẩn `1.54s`, `CV = 0.28`, khoảng `[3.45..9.66s]`, tỉ lệ tàu ra dưới `3s` = **`0.0%`**, trung bình `16.6` tàu/90s. (Bản cũ `v1 L1`: `CV = 0.34`, `[2.39..9.10s]`, **`12.1% < 3s`**).
     - `v2 L10` (`base=4.30`): trung bình `5.12s`, `CV = 0.29`, **`0.0% < 3s`**, `17.6` tàu/90s. (Bản cũ `v1 L10`: `3.66s`, `CV = 0.34`, **`33.6% < 3s`**, `24.5` tàu/90s).
     - `v2 L15` (màn thử thách đầu tiên): vẫn **`0.0% < 3s`** (`[3.08..8.61s]`). Tới tận `L20` mới có `7.9% < 3s`.
   - Ngoài ra, `js/train.js:312` giữ vùng đệm cửa hầm `Math.max(56, cell * 1.15)` nhưng với `speedF = 0.28` thì tàu đi chưa hết chiều dài 1,15 ô trong `2s`, cộng với `base` lớn (3,27–4,60s) nên hai tàu hiếm khi phải xử lý nối đuôi sát nhau.

2. **Tốc độ tàu đóng băng ở mức rùa bò (`Confirmed`):**
   - `js/train.js:101` tính `speed = cell * 2.6 * spec.speedF`, còn `js/levels/train.js:52` giữ cứng `speedF = 0.28` cho toàn bộ L1–L32 (chậm hơn 1,6× so với bản cũ `0.45`).
   - Một tàu cần ~26 giây (tối đa ~41 giây, theo ghi chú tại `js/levels/train.js:34`) để chạy hết bản đồ 15 ga. Mọi tàu chạy y hệt một vận tốc, không có tàu nhanh hay tàu chậm để tạo tình huống vượt nhịp.

3. **Túi màu `colorBag` triệt tiêu hoàn toàn xác suất trùng màu liên tiếp (`Confirmed`):**
   - `js/train.js:313-319` rút từ `colorBag` chứa đúng 1 bản sao mỗi ga (`shuffle(map.stations.slice())`) và dòng 316 chủ động đẩy phần tử cuối lên đầu nếu màu đầu túi mới trùng `lastKey`.
   - Số đo qua 200 ván mỗi level: **`adjSameColor = 0` (0% trên hơn 3.500 cặp tàu liên tiếp)**.
   - Ở L14–L32 (15 ga, mỗi ván chỉ ra ~18–23 tàu), 15 chiếc đầu tiên chắc chắn là **15 ga khác nhau hoàn toàn**. Người chơi chơi ván 90 giây mà cảm giác như hệ thống chia bài vòng tròn `round-robin`: màu nào mới về ga xong gần như biến mất hẳn trong 10–14 tàu tiếp theo.

4. **Hình dáng bản đồ quy về một khuôn đối xứng (`Confirmed`):**
   - `js/train-map.js:59` khóa hầm luôn ở cạnh trên giữa (`c0 = Math.round((C-1)/2) ± 1`, `r0 = 0`, `d0 = 1`), `generate()` ở dòng 229–238 chọn `argmin(messScore)` trong tối đa 300 bản đồ hợp lệ.
   - Kết quả đo 10 lần sinh ngẫu nhiên: với `n = 5` ga, trục dẫn thẳng từ hầm có độ dài `[5,6,5,5,5,5,5,5,6,5]` (8/10 lần đúng 5 ô), lưới `6×11` (8/10 lần); với `n = 11` ga, `10/10` bản đồ ra đúng lưới `7×13`, hầm kẹt ở cột `2..4/7`, trục dẫn `5..7` ô. Hình học sạch nhưng mất bất ngờ giữa các lượt chơi lại.

### Các game tương tự trên internet xử lý thế nào?

- **Lumosity *Train of Thought*:** Áp dụng Dynamic Difficulty Adjustment theo từng nhịp xử lý: khi người chơi bẻ ghi chuẩn liên tiếp, tàu ra dày hơn; khi lỡ sai một ga, nhịp xuất tàu tự hãm lại để lấy lại nhịp, tránh sập dây chuyền. Ở các màn sau có **tàu 2 màu** (buộc ghép hai chặng nhớ — đúng cờ `st.two` đang để không ở `js/train.js:74`) và đổi màu/tốc độ giữa các đoàn.
- ***Train Conductor* / *Conduct THIS!*:** Tách rõ *input randomness* (người chơi thấy đoàn tàu sắp tới sớm và chủ động xử lý) khỏi *output randomness*. Nhịp ra tàu không đều kiểu đồng hồ mà chạy theo sóng: mở màn êm (1 tàu thăm dò) → chồng chéo bất đối xứng (tàu nhanh đuổi tàu chậm) → khoảng lặng để dọn bàn.
- **Valve *Left 4 Dead* AI Director & lý thuyết Pacing (`Bounded Exponential` / `Director`):** Khoảng cách đều (uniform `CV ~ 0.1–0.28`) tạo **"hiệu ứng máy đánh nhịp" (metronome effect)** — não người bắt được nhịp và thấy tẻ nhạt. Ngược lại, **Poisson / Exponential thuần** tạo ra cụm dày và khoảng trống tự nhiên giống hiện tượng ngoài đời, nhưng không kẹp trần/sàn sẽ dính chuỗi xui "5 tàu dồn 1 giây". Chuẩn game là **Bounded Exponential có pha `Build-up → Peak → Fade → Relax`** (kẹp `[minGap, maxGap]`).
- **Hệ thống túi bài (Tetris 7-bag vs 14-bag / Weighted Bag):** Dùng đúng 1 túi + cấm lặp biên khiến người chơi đoán trước được ga nào "chưa tới lượt". Chuyển sang **2-bag (2 bản sao mỗi ga trong túi, hoặc 15–20% xác suất lặp lại một ga gần đây có chủ đích)** vẫn giữ công bằng phân phối ga trên cả ván, nhưng tạo cảm giác "ơ sao lại ra đúng ga đỏ vừa nãy" — yếu tố làm não phải kiểm tra lại ngã rẽ thay vì mặc định chuyển sang ga mới.

### Hướng sửa đề xuất cho `train`

- Mở lại nhịp sóng (`wave pacing`) ngay từ L4–L5 trở đi: thay `burstP = 0` bằng cụm sóng có chủ đích (`burst` nhẹ 2 tàu cách nhau `2.1–2.6s` kèm quãng nghỉ ngay sau đó để giữ nguyên tổng tàu/90s và tỉ lệ qua `p*`).
- Cho phép tàu có **sai số tốc độ nhẹ** (ví dụ hệ số cá thể `0.90× – 1.15×`, từ L10+ có tàu nhanh `1.25×` báo bằng đèn đầu tàu hoặc khói) nhưng giữ trung bình `speedF` khớp calibration.
- Thay túi 1x cấm lặp bằng **túi 2x (hoặc trộn 15% xác suất kéo 1 ga ngẫu nhiên)** để có những pha "double-check" lặp màu liên tiếp tự nhiên.
- Giảm trọng số phạt của `messScore` hoặc chọn ngẫu nhiên trong **Top 5–10% bản đồ tốt nhất** thay vì `argmin` duy nhất, giữ hầm cân nhưng đa dạng dáng nhánh trái/phải.
- **Lưu ý calibration:** `scripts/sim/adapters/train.mjs` dùng chung `RTD_MAP.spawnGap`. Đổi luật chia nhịp/túi màu phải cập nhật đồng bộ trong adapter và chạy lại `calibrate.mjs train --n 1200`.

---

## 3. Feedback 1 — Toàn bộ 5 game: "hiện tại không có tính ngẫu nhiên mà lại quá đồng đều"

Kiểm tra thêm 4 game còn lại cho thấy tình trạng "đồng đều" xảy ra ở cả 2 tầng: **tầng giữa các ván (level progression phẳng)** và **tầng trong một ván (micro-variance bị nén)**.

### Số liệu đo được ở 4 game còn lại (`Confirmed`)

| Game | Bằng chứng "đồng đều" trong code & số đo | Chuẩn benchmark ngoài internet |
|---|---|---|
| **Mưa Phép Tính (`rain`)** | 1) `js/rain.js:124` sinh khoảng cách giọt `s.every * (0.8 + rand*0.4)` → đo 500 lần ở L1/L5/L10/L15/L20 cho **`CV = 0.112–0.118`** (máy đánh nhịp thuần túy).<br>2) `js/rain.js:209` tốc độ rơi `d.p += dt/d.fall` **biến thiên 0%** giữa mọi giọt.<br>3) `js/levels/rain.js:13-14`: `add(m)` chọn `a = ri(1, m-1)`, `b = ri(1, m-a)` tạo phân phối tam giác lệch cực mạnh. Đo 5.000 phép L1 (`add(10)`): **`9 + 1` ra 577 lần (11,5%)** trong khi **`1 + 9` ra 47 lần (0,9%) — chênh 12,3 lần**; `sub(10)` ra **`a − a = 0` tới 21,9% số phép**.<br>4) `js/levels/rain.js:120-123`: **5 level liền L7–L11** giống hệt `every = 3.80s, fall = 10.25s, target = 16, lives = 3`, chỉ đổi loại phép tính. | **Lumosity *Raindrops*:** Tốc độ rơi co giãn theo từng cú trả lời đúng/sai; thỉnh thoảng ra giọt đặc biệt (Mặt trời xóa cả màn hình) phá nhịp đều; nhiều giọt cùng đáp án vỡ chung một lượt (`js/rain.js:162` mới phá 1 giọt thấp nhất mỗi lần `OK`/`evalInput`). |
| **Ô Sáng Ghi Nhớ (`mem`)** | 1) `js/levels/mem.js:48-55`: **9 level liên tiếp L6–L14** (và 12/18 level đầu tiên) cùng chỉ có **`t = 3` ô sáng, `show = 1.9s`**! Riêng L9–L14 là 6 màn liền y hệt `6×6, 3 ô`, chỉ khác ẩn `disp 0 → 0.5`.<br>2) `pickTargets()` với `disp > 0` chặn các ô liền kề → vô tình triệt mất các hình khối tự nhiên (chữ L, chéo, cụm 2–3 ô) khiến màn nào cũng rải đều rời rạc. | **Lumosity *Memory Matrix*:** Thử thách nhảy theo từng lượt chơi (`zero mistakes → +1 tile`, `≥2 mistakes → -1 tile`) nên người chơi giỏi không bị kẹt qua 9 màn 3 ô lặp đi lặp lại. |
| **Cho Cá Koi Ăn (`koi`)** | 1) `js/levels/koi.js:27-30`: suốt **14 level L1–L14 không có bất kỳ cá xám (`decoys = 0`)**, chỉ nhích tốc độ +0,05 mỗi màn.<br>2) `js/koi.js:97, 255-269`: dải tốc độ nền hẹp (`30–42 px/s` đều), góc cua bị làm mượt chậm (`dt * 1.5`) mỗi `1–3s`, mọi con cá koi vẽ đốm cam giống hệt nhau nên cá bơi đều như đàn tuần hoàn. | **Lumosity *Playing Koi*:** Quỹ đạo kết hợp bơi lướt, đổi hướng bất ngờ và lúc tăng tốc nhẹ giúp tạo cảm giác hồ sống động và buộc mắt theo dõi liên tục. |
| **Đoán Cụm Từ (`word`)** | Chỉ có 50 cụm tĩnh đi tuần tự Level 1 → 50; chơi lại level nào chỉ ra đúng 1 cụm đó, chưa có chế độ cụm ngẫu nhiên hay luyện theo chủ đề. | **Wordle / Phởdle:** Có Daily Word + chế độ luyện ngẫu nhiên không lặp cụm đã chơi. |

### Nguyên lý sửa: Tách **Độ khó vĩ mô** khỏi **Biến thiên vi mô**

Việc giữ mở màn L1–L14 thân thiện cho người mới là đúng hướng (`docs/difficulty/RESEARCH-EARLY-LEVELS.md`), nhưng hiện tại chúng ta lại làm bằng cách tắt toàn bộ biến thiên trong ván. Sửa đúng hướng là giữ nguyên **tỉ lệ qua trung bình (`p*`)**, nhưng mở lại **nhịp sóng và độ đa dạng trong từng màn**:
- `rain`: sửa hàm `add(m)`/`sub(m)` thành bốc cặp `(a, b)` đồng đều từ tập hợp phép tính hợp lệ (tránh lặp `9+1` và giảm tỉ lệ `a−a=0`); thêm nhịp mưa lúc thưa lúc mau + sai số tốc độ rơi nhẹ (`±12%`) giữa các giọt; cân nhắc giọt thưởng/giọt đôi cùng đáp án ở L11+.
- `mem`: giữ G1 `weak ≥ 90%` nhưng rút ngắn dải 3 ô lặp (`L6–L14`), hoặc xen kẽ các biến thể hình thù/thời gian nhìn sớm hơn thay vì 6 màn `6×6, 3 ô` giống hệt nhau.
- `koi`: cho cá có nhịp bơi "lướt nhẹ → bẻ cua ngắn" tự nhiên hơn và cân nhắc đưa 1 cá xám xuất hiện sớm hơn (L7–L8 thay vì chờ L15) nếu `calibrate.mjs koi` vẫn giữ `weak ≥ 82%` (cần test sim).

---

## 4. Feedback 2 — Đoán Cụm Từ (`word`): "bị khá nhiều lỗi về từ tiếng Việt"

Đọc sâu `js/word.js` và chạy giả lập gõ phím trên Node (`vm`) xác nhận **6 nhóm lỗi thật** gây ức chế trực tiếp cho người Việt chơi thật.

### 1. Lỗi logic `modify()` biến chữ đúng thành chữ sai vô lý (`Confirmed`)

Hàm `modify(k)` ở `js/word.js:244-264` quét từ phải sang trái và áp dấu mũ/trăng/móc lên nguyên âm đầu tiên khớp từ phải qua, chỉ có 1 ngoại lệ cho cặp `u+o`:

| Người chơi muốn gõ | Thao tác tự nhiên trên phím ảo / VNI | Kết quả của `js/word.js` | Kiểm tra `validSyllable()` | Nguyên nhân trong code |
|---|---|---|---|---|
| **cứu** | `c` `u` `u` + `ơ ư` (hoặc `7`) + `á` | **`cuứ`** | **`false` (bị chặn)** | Quét từ phải sang trái đập trúng chữ `u` thứ hai (`uu → uư`) thay vì `ư` ở chữ đầu (`ươ`/`ưu`) |
| **lưu / hữu / bưu** | `l` `u` `u` + `ơ ư` | **`luư` / `huữ` / `buư`** | **`false` (bị chặn)** | Cùng lỗi trên với mọi vần `ưu` |
| **thuở** | `t` `h` `u` `o` + `ơ ư` + `ả` | **`thưở`** | **`false` (bị chặn)** | Nhánh `u+o` ở dòng 250 đổi `uo → ươ` ở lần bấm đầu tiên, ép người chơi phải bấm `ơ ư` **hai lần** mới ra `uơ`; bấm 1 lần ra `thưở` rồi bị từ chối! |
| **nuôi** (lỡ bấm nhầm `ơ ư` rồi bấm sửa `â ê ô`) | `n` `u` `o` `i` + `ơ ư` → `â ê ô` | **`nưôi`** | **`false` (bị chặn)** | Bấm `ơ ư` biến `uo → ươ`, bấm `â ê ô` chỉ đổi `ơ → ô` (dòng 257), bỏ kẹt chữ `ư` thành `nưôi` |
| **xoong** (lỡ bấm `â ê ô`) | `x` `o` `o` `n` `g` + `â ê ô` | **`xoông`** | **`false` (bị chặn)** | Vần `oong` hai chữ `o`: quét từ phải sửa 1 chữ thành `oô` |

### 2. Thiếu hoàn toàn Telex và hỏng khi bật bộ gõ máy tính / điện thoại (`Confirmed`)

- `js/word.js:512-525` chỉ hỗ trợ gõ **VNI** (`1..5` cho dấu thanh, `6/7/8/9/0`). Người Việt đa số gõ **Telex**: gõ `ba2` kiểu Telex (`baf`) ra `"ba"` (chữ `f` bị bỏ qua vì không nằm trong `LETTERS`); gõ `đồng` bằng `ddoongf` ra **`"ddoong"`** (`validW1 = false`)!
- Dòng `515` viết `if (e.isComposing || ...) return;` khiến bộ gõ native của macOS/iOS (`Telex` / `VNI` hệ thống) gửi sự kiện composition bị nuốt trắng trơn. Không có `<input>` trung gian nên trên điện thoại người dùng cũng không dùng được gợi ý/IME bàn phím OS.
- Với UniKey/EVKey trên Windows: vì hai từ trong `cur` nối liền không có dấu cách (`wordOf()` tự nhảy từ 1 sang từ 2 ở `L1()`), khi gõ tới biên giữa hai từ hoặc khi đủ `N()` chữ mới gõ dấu cuối (`nhật` + `j` sau khi đủ 8 ô), bộ gõ OS sửa sai hoặc game chặn ký tự thứ `N+1` ở dòng 275 khiến mất dấu.

### 3. `validSyllable()` vừa lọt gần 23.000 "tiếng Việt giả", vừa từ chối vần thật (`Confirmed`)

Hàm `validSyllable()` ở `js/word.js:59-78` ghép tích Đề-các `28 INITIALS × 244 RHYMES` với 63 vần không tồn tại:
- **Từ chối từ thật (`False negatives`):** thiếu các vần mở/bán âm thật như `oao` (`ngoao`), `uay` (`nguay` — `quảy` là `qu+ay`), `ya` (đã có `uya` nhưng thiếu `ya`).
- **Nhận cả đống chữ vô nghĩa (`False positives`):**
  - `NUC × 8 phụ âm cuối` sinh ra **63 vần không có trong tiếng Việt** như `ăch, ănh, âch, ânh, ech, enh, êc, êng, ic, ing, och, onh, ôch, ônh, ơch, ơnh, uch, unh, ưch, ưnh, yc, yng, oom, oon, iêch, uôch, ươch, uyêc...` (ví dụ `bănh`, `bônh`, `boch`, `piêch` đều được chấp nhận).
  - Không kiểm luật chính tả **`c/k`, `g/gh`, `ng/ngh`**, **`q` đi với `u`**, **`gi` đi với `i`**: chấp nhận cả `ka, ko, ku, kô, kơ, ci, ce, cê, ge, gê, gha, gho, ghu, ngha, ngho, nghu, quu, gii`.
  - Tổng cộng `validSyllable()` đang chấp nhận **29.792** tổ hợp `(âm đầu, vần, thanh)` — **gấp hơn 4 lần** số âm tiết tiếng Việt thực tế (~6.674–7.184 âm tiết theo các kho ngữ liệu tiếng Việt phổ biến)! Người chơi gõ bừa kiểu `"ka ko"` hay `"bănh cu"` vẫn qua kiểm tra khiến màu phản hồi bị nhiễu, trong khi từ thật hiếm lại có thể bị kẹt nếu thiếu vần.

### 4. Va chạm quy tắc đặt dấu kiểu cũ vs kiểu mới & biến thể `i/y` (`Confirmed`)

- `tonePos()` ở `js/word.js:44-57` ép đặt dấu theo **kiểu cũ** (`hòa, hóa, khỏe, thủy, tòa, xóa`), trong khi sách giáo khoa hiện hành và bộ gõ mặc định trên iOS/macOS/Android gõ **kiểu mới** (`hoà, hoá, khoẻ, thuỷ, toà, xoá`) — ngay trong `js/word.js:20` cũng viết `'Văn hoá'` ở mục gợi ý!
- Nếu đáp án tương lai hoặc dữ liệu copy/paste mang dấu kiểu mới (hoặc người chơi quen nhìn `oà` mà gõ vào bị tự động nhảy thành `òa`), `evaluateAgainst()` so khớp codepoint cứng nên sẽ báo sai vị trí (vàng/xanh dương) dù là cùng một chữ.
- Tương tự với cặp **`i / y`** (`bánh mì` vs `bánh mỳ`, `kĩ` vs `ký`): `fam('i') === 'i'`, `fam('y') === 'y'` nên đoán `mỳ` trước đáp án `mì` sẽ tô chữ `y` màu xám hoàn toàn.

### 5. Màu xanh dương (`blue`) nhập nhằng & bàn phím gộp họ nguyên âm (`Confirmed`)

- Trong `evaluateAgainst()` (`js/word.js:89-95`), cùng một màu **xanh dương** dùng cho 2 tình huống rất khác nhau:
  1. Nguyên âm **đúng vị trí** chỉ khác dấu mũ/thanh (ví dụ chữ `a` thay cho `à`/`ă`/`â`).
  2. Nguyên âm **sai cả vị trí** (thậm chí nằm bên từ kia!) và khác cả dấu (ví dụ trong `tests/word.spec.js:64`, đoán `caphe` cho `cà phê`, chữ `e` cuối là `ê` đúng chỗ cũng màu `blue` giống hệt chữ `a` đúng chỗ nhưng sai thanh; nếu đoán `peca` thì `e` sai chỗ cũng vẫn `blue`).
- Chữ `d` và `đ` bị chấm hoàn toàn khác chữ (`gray`), không có gợi ý xanh dương cho người mới quen.
- Bàn phím ảo (`renderKeys()` dòng 202–207, `keyState` dòng 311) lưu trạng thái theo `fam(ch)` nên gộp chung `a/ă/â`, `e/ê`, `o/ô/ơ`, `u/ư`: nếu ô đáp án có `ô` (`green`) mà từ vẫn còn `o` chưa tìm, phím `o` hiện màu xanh lá đánh lừa cảm giác.

### 6. Thứ tự 50 cụm từ đi ngược trực giác con người (`Confirmed`)

`js/levels/word.js:30-31` xếp độ khó hoàn toàn theo bot ước lượng không gian âm tiết (`INITIALS × RHYMES`):
- **L1:** `"khiêu vũ"` (5+2 = 7 chữ) · **L2:** `"thanh xuân"` (5+4 = 9 chữ) · **L3:** **`"truyền thống"` (6+5 = 11 chữ — cụm dài nhất cả game!)** · **L4:** `"giáng sinh"` (9 chữ).
- Trong khi những cụm ngắn, dễ đoán nhất với người Việt lại bị đẩy về cuối: `"xe đạp"` (L26), `"áo dài"` (L27), `"phở bò"` (L28), `"bà nội"` (L30), `"cà phê"` (L42), `"núi lửa"` (L48), `"con mèo"` (L49).

### Các game Wordle tiếng Việt trên internet xử lý thế nào?

- **`minhqnd/wordle-vietnamese`, Phởdle, Vietle:**
  - Dùng **danh sách âm tiết / từ điển tiếng Việt thật** (như `hieuthi/common-vietnamese-syllables` gồm 7.184 âm tiết phổ biến chiếm >94% văn bản thật, `vietnameselanguage/syllable` ~6.674 âm tiết, hoặc từ điển trích từ `vntk/dictionary` — MIT license; *lưu ý Luật 4 Vibe: phải xác minh trực tiếp file `LICENSE` từng repo trước khi đưa vào code*).
  - Hoặc tách thành phiên bản không dấu (7 chữ) hoặc tích hợp sẵn **bộ gõ Telex + VNI** chuẩn bên trong game để người dùng laptop gõ thẳng `aa/aw/ow/uw/dd/s/f/r/x/j` không phụ thuộc UniKey ngoài.
  - Chuẩn hóa tương đương dấu thanh kiểu cũ ↔ mới (`oà` ≡ `òa`, `uỷ` ≡ `ủy`) khi chấm điểm và khi nhận liệu.

---

## 5. Feedback 4 — Mưa Phép Tính (`rain`): "chơi trên laptop hoặc có bàn phím thì nhận từ bàn phím chứ không bắt buộc typing trên phím ảo"

### Vì sao người dùng thật vẫn phải bấm phím ảo dù `js/rain.js` có listener `keydown`?

Đọc kỹ `js/rain.js:360-382`, `js/rain.js:504-522`, `css/rain.css:53-63` và `index.html:441-458` cho thấy **4 nguyên nhân xác thực** lý giải chính xác phản hồi của người dùng:

1. **Rơi rụng toàn bộ hàng phím số trên laptop khi bật bộ gõ `Vietnamese` của macOS (`Confirmed`):**
   - `js/rain.js:514-515` viết:
     ```js
     const m = /^Numpad(\d)$/.exec(e.code);
     const k = /^[0-9]$/.test(e.key) ? e.key : m ? m[1] : ...
     ```
   - Code chỉ kiểm tra `e.code` cho `Numpad(\d)`, **hoàn toàn bỏ qua `Digit(\d)`**!
   - Trên macOS (bộ gõ `Vietnamese` chuẩn TCVN 6064 — rất nhiều người dùng Mac ở Việt Nam bật mặc định hoặc lỡ nhấn `Ctrl+Space` chuyển sang), hàng phím số `1 2 3 4 5 6 7 8 9 0` phát ra `e.key` là **`ă â ê ô ̀ ̉ ̃ ́ ̣ đ`**, **không phải `'0'..'9'`**! Laptop Mac không có Numpad vật lý, nên toàn bộ hàng số chết cứng không gõ được một số nào. (Điều tương tự xảy ra trên bàn phím AZERTY không giữ Shift.)

2. **Bẫy focus nút `Enter` nuốt phím xác nhận ngay sau khi bấm Bắt đầu / Chơi lại (`Confirmed`):**
   - Trong `js/word.js:365`, `startLevel()` chủ động gọi `document.activeElement.blur()`, và `keydown:517` chỉ nhường `Enter` cho nút đang hiện (`btn.getClientRects().length > 0`).
   - Ngược lại, `js/rain.js:360-372` (`startLevel`) và `378-382` (`resume`) **không gọi `.blur()`**, còn dòng `513` viết:
     ```js
     if (e.key === 'Enter' && e.target instanceof HTMLButtonElement && e.target.closest('#rainApp')) return;
     ```
   - Nếu người dùng mở ván bằng Tab/Space/Enter trên `#rStart`, `#rrNext` hoặc `#rResume`, hoặc trước đó lỡ focus vào một nút bên trong `#rainApp`, phím `Enter` bị nuốt hoặc kích nhầm nút thay vì nộp đáp án khi đang có đáp án trùng đầu số chờ `AUTO_WAIT`. (Còn nếu bấm `#rPad button` bằng chuột rồi gõ bàn phím thì chuột không luôn blur hoặc khi Tab vào nút `5`, nhấn `Enter` gõ số `5` thay vì nộp đáp án hiện tại.)

3. **Giao diện desktop không cho thấy khả năng gõ bàn phím (`Confirmed` UX gap):**
   - Trên màn hình laptop (`1440px`/`1920px`), `css/rain.css:53-63` vẫn giữ nguyên bàn phím ảo 12 nút to (~230px chiều cao) chiếm trọn 1/3 dưới của cột chơi ngay dưới canvas.
   - Ô hiển thị `#rDisp` là `<div>` không focus được, không có con trỏ nhấp nháy hay hint bàn phím, còn hướng dẫn ở menu (`index.html:457`) chỉ ghi *"Bấm đáp án trên bàn phím số"* — thuật ngữ tiếng Việt dễ bị hiểu là bàn phím số ảo hiện trên màn hình! Người dùng mở game trên laptop nhìn thấy nguyên khối phím ảo to tướng và không thấy ô nhập liệu/gợi ý phím cứng nên mặc định bấm chuột lên phím ảo.

4. **Thiếu `e.isComposing` guard và chế độ ẩn bàn phím ảo trên desktop (`Confirmed`):**
   - `rain.js:505` chưa kiểm `if (e.isComposing) return;` (khi dùng IME VNI, gõ số có thể bị trạng thái compose xen ngang).
   - Khi ẩn/thu gọn phím ảo trên laptop (`@media (hover: hover) and (pointer: fine)` + nút bật/tắt bàn phím ảo nếu người dùng thích click), canvas mưa được trả thêm ~200px chiều cao để giọt rơi thoáng mắt hơn nhiều.

### Chuẩn game ngoài internet làm thế nào?

- **Lumosity *Raindrops* bản web:**
  - Mặc định **ẩn hoàn toàn bàn phím ảo** trên desktop; chỉ hiện thanh nhập đáp án với con trỏ nhấp nháy và nhắc ngắn phím sử dụng (`0–9 · Enter · ⌫`).
  - Hỗ trợ cả hàng số trên (`0–9`), Numpad, và có tùy chọn gõ **1 tay kiểu Numpad ảo trên bàn phím laptop** (`7 8 9` / `U I O` = 4 5 6 / `J K L` = 1 2 3 / `M` = 0) cho người gõ nhanh một tay không muốn với hàng số ngang.
- **Chuẩn Web (`MDN` / `Chrome KeyboardLayoutMap`):**
  - Với phím điều khiển/số trong web game trên laptop không phải ô văn bản, luôn dùng **`e.code` (`/^Digit([0-9])$/` và `/^Numpad([0-9])$/`)** làm fallback khi `!/^[0-9]$/.test(e.key)` (chỉ giữ cảnh báo không ăn nhầm phím có `Shift` trên layout đặc biệt nếu ký tự là ký hiệu như `! @ #`, còn với macOS Vietnamese hay AZERTY thì `DigitX` không kèm `Shift` hoặc kiểm `!e.shiftKey || /^Numpad/.test(e.code)`). *Ghi chú an toàn:* nếu người dùng bật bộ gõ VNI/Telex, phím `1..9` không giữ Shift phát ra `e.code = Digit1..9` — xử lý đúng sẽ cứu 100% trường hợp macOS Vietnamese layout!

---

## 6. Đề xuất lộ trình sửa (3 PR tách theo rủi ro) & Ma trận kiểm định

| PR | Phạm vi sửa | Độ rủi ro & tác động lên `scripts/sim/calibrate.mjs` | Cổng kiểm bắt buộc trước khi merge |
|---|---|---|---|
| **PR 1 — `rain` Keyboard Laptop + Phân phối phép tính** | 1) `js/rain.js`: fallback `/^Digit(\d)$/` trên `e.code` (bỏ qua khi `e.ctrlKey`/`metaKey`/`altKey` hoặc `e.shiftKey` ở hàng trên), `blur()` nút khi `startLevel`/`resume`, sửa check `e.target.getClientRects().length > 0`, thêm `e.isComposing`, thêm dòng gợi ý `0–9 · Enter · ⌫` và nút thu gọn phím ảo trên desktop.<br>2) `js/levels/rain.js`: thay `add(m)`/`sub(m)` lệch tam giác bằng chọn đều trên tập hợp phép tính hợp lệ (`a+b <= m`, hạn chế `a−a=0`). | **Thấp.** Keyboard UX không đổi sim; sửa `add`/`sub` chỉ cân lại độ khó L1–L5. | Playwright `tests/rain.spec.js` (thêm test `Digit1..0` với `e.key = 'ă'` + test `Enter` ngay sau khi nhấn `#rStart` bằng bàn phím) + `scripts/sim/calibrate.mjs rain --n 4000` xanh. |
| **PR 2 — `word` Sửa triệt để Tiếng Việt** | 1) Sửa `modify()` xử lý đúng `ưu` (`cứu, lưu, hữu`), `uơ` (`thuở` 1 lần bấm), `nưôi` và `xoong`.<br>2) Tích hợp sẵn **Telex + VNI** trên phím vật lý + cơ chế nhập IME ổn định.<br>3) Thay `validSyllable()` đẻ vần bừa bằng **từ điển âm tiết tiếng Việt thật** (~6.600–7.200 âm tiết, kiểm tra `LICENSE` MIT/CC0/PD trước khi lấy nguồn) + luật chính tả `c/k, g/gh, ng/ngh`.<br>4) Chuẩn hóa dấu thanh kiểu cũ/mới (`hòa ≡ hoà`) & tùy chọn xử lý `i/y`; làm rõ chú giải `blue` và tách màu phím dấu/nguyên âm.<br>5) Sắp lại thứ tự `PLAY` thân thiện người chơi hơn (tăng `version` + giữ migration `id: "p<n>"` theo `docs/DIFFICULTY-RULES.md` §5) + cân nhắc nút chơi cụm ngẫu nhiên. | **Trung bình** (cô lập trong `word` + `scripts/sim/adapters/word.mjs`). Đổi `validSyllable` & `PLAY` sẽ đổi `cands` trong adapter word. | Kiểm tra `legal/licences.json`, unit test toàn bộ tập ~7.000 âm tiết thật + từ rác, Playwright `tests/word.spec.js` (Telex, `cứu`, `thuở`, `hòa/hoà`), `scripts/sim/calibrate.mjs word` + parity G7. |
| **PR 3 — Khôi phục Pacing Sóng & Ngẫu nhiên Có Kiểm Soát (tập trung `train` + 4 game)** | 1) `train`: mở lại sóng `burstP > 0` từ sớm (`L4+`) kèm quãng nghỉ đối ứng, cho sai số tốc độ tàu cá thể nhẹ, nới `colorBag` sang 2-bag/cho phép lặp màu có kiểm soát, đa dạng hóa bản đồ trong Top N `messScore`.<br>2) `rain`: nhịp sóng `every` rộng hơn + biến thiên tốc độ giọt `±12%`, bỏ 5 màn L7–L11 lặp thông số giống nhau.<br>3) `mem`: cắt dải 3 ô lặp 9 màn L6–L14, tăng tự nhiên của cụm ô.<br>4) `koi`: nhịp bơi linh hoạt (lướt/rẽ bất ngờ hơn), cân nhắc cá xám sớm hơn. | **Cao** (đổi phân phối `p*` và luật sinh trong `adapter` + `levels/`). Bắt buộc đồng bộ adapter và hiệu chỉnh lại bảng knob. | Chạy lại `node --test scripts/sim/*.test.mjs`, `scripts/sim/calibrate.mjs` ở N đầy đủ (1200–4000) cho mọi game bị chạm, và toàn bộ Playwright E2E + responsive. |

---

## 7. Chưa xác minh được (`Not Verified`)

1. **Thiết bị, hệ điều hành và bộ gõ cụ thể** của những người dùng đã gửi 4 phản hồi này (ví dụ: có phải người dùng macOS bật bộ gõ `Vietnamese` hay Windows UniKey/EVKey hay laptop màn nhỏ; họ chơi tới level mấy trước khi cảm thấy đều).
2. **Danh sách chính xác các từ tiếng Việt mà người dùng gặp lỗi** khi chơi `Đoán Cụm Từ` (các lỗi ở §4 được chứng minh trực tiếp từ mã nguồn `js/word.js` và chạy thử trên Node, nhưng có thể còn trường hợp gõ thực tế khác tùy bộ gõ).
3. **Dữ liệu telemetry trên người chơi thật** (`G7` hiện vẫn `SKIP` theo `docs/DIFFICULTY-RULES.md` §8): mọi tỉ lệ phần trăm, độ lệch `CV`, số tàu/ván nêu ở §2–§3 đều đo từ code game hiện tại và bộ mô phỏng `scripts/sim/human.mjs`, chưa đo qua log người thật.
4. **Giấy phép gốc (LICENSE) của kho âm tiết tiếng Việt:** Kết quả tìm kiếm internet chỉ ra `hieuthi/common-vietnamese-syllables` (7.184 âm tiết), `vietnameselanguage/syllable` (~6.674 âm tiết) và `vntk/dictionary` (được ghi MIT trong tóm tắt tìm kiếm), nhưng chưa đọc trực tiếp file `LICENSE` từng repo trên GitHub — bắt buộc kiểm tra nguồn gốc và ghi `legal/licences.json` trước khi đưa vào code (Quy tắc Vibe 4).
5. **Tỉ lệ qua mô phỏng sau khi sửa PR 3:** Chưa chạy thử `scripts/sim/calibrate.mjs` với bộ thông số sóng/túi màu đề xuất ở PR 3; cần đo thực tế để bảo đảm không làm sập gate `G1/G9` cho người mới.

---

## 8. Quyết định đã chốt

- **2026-11-24 — Quyết định 1/2:** Duy chọn **Option A** (tách 3 PR theo rủi ro: PR 1 `rain` phím laptop + lệch cộng/trừ -> PR 2 `word` tiếng Việt -> PR 3 `train` & nhịp 5 trò + calibrate).
