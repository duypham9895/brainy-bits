# Thiết Kế Hệ Thống Độ Khó "Brainy Bits" (`BB-Curve`)

**Tác giả:** Nhà thiết kế độc lập #2 (Gemini — Orchestrator Neon)  
**Đối tượng triển khai:** 5 trò chơi hiện tại (`train`, `koi`, `mem`, `rain`, `word`) và các trò chơi tương lai trên GitHub Pages (HTML/CSS/JS thuần, không backend).

---

## Tóm tắt điều hành

Hệ thống chọn **một trục độ khó chung `BB-Curve`** điều phối toàn bộ game qua 4 tầng tách bạch:

| Tầng | Nơi chạy | Cơ chế chính | Nguồn tham chiếu |
|---|---|---|---|
| **1. Trục vô hướng `D(L)`** | Tĩnh / JS thuần | Căn bậc hai tịnh tiến (`abagames`, MIT) + sóng răng cưa chu kỳ 5 (`Oscillation Method`) | [abagames](https://abagames.github.io/joys-of-small-game-development-en/difficulty/curve.html), [Reid-Thomas](https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design) |
| **2. Bảng knob khai báo** | `BB_SPEC[game]` | Nội suy theo `D(L)`, kẹp cứng ở `hardCap` nhận thức, giảm tải tạm (`reliefOnUnlock`) khi mở cơ chế mới | [Luck & Vogel](https://www.doi.org/10.1038/36846), [Alvarez & Franconeri](https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f), [Parhi](https://dx.doi.org/10.1145/1152215.1152260) |
| **3. Hiệu chỉnh offline** | Node (`scripts/sim/`) | Bot 3 persona (`novice`, `median`, `skilled`) chạy `1.200` seed/màn, khớp `p*(L)`, kiểm 6 cổng T0 và đóng băng `js/levels-data.js` | [Roohi 2020](https://arxiv.org/abs/2008.12937), [Gudmundsson 2018](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf), [Wilson 1927](https://doi.org/10.1080/01621459.1927.10502953) |
| **4. Thích nghi cục bộ** | Client (`js/core.js`) | Elo/Rasch cục bộ tính lại từ `bb_log` để chọn Daily; nút tự chọn *"Thử bản nhẹ hơn (-15%)"* khi thua liên tiếp; tắt adapt ẩn trong ván | [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf), [Chen 2006](https://www.engadget.com/2006/09/18/joystiq-qanda-jenova-chen/), [Hunicke 2005](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) |

---

## 1. Kiến trúc tổng thể

### 1.1. Các điểm nghẽn trong mã nguồn hiện tại

Đọc trực tiếp 6 file `js/*.js` cho thấy 4 lỗi cấu trúc sẽ làm vỡ độ khó nếu chỉ nới `LV_MAX` lên `30`:

1. **Lệch `LV_MAX` giữa hub và `word`:** [core.js](file://scratchpad/wt-agy-design/js/core.js#L203) khoá `LV_MAX = { train: 11, koi: 10, mem: 13, rain: 10, word: 12 }`, nhưng [word.js](file://scratchpad/wt-agy-design/js/word.js#L22) lại đặt `const LV_MAX = PHRASES.length` (`49`). Người chơi Daily Challenge bị kẹp tối đa ở level `12` dù game có `49` màn.
2. **Đảo ngược và chạm trần knob sớm:**
   - [mem.js](file://scratchpad/wt-agy-design/js/mem.js#L31-L36) dùng `t = 2 + L` trên lưới tối đa `6×6`. Lên level `30`, `t = 32/36` ô sáng: người chơi chỉ cần nhớ **4 ô tối** nên level `30` dễ hơn level `5`!
   - [koi.js](file://scratchpad/wt-agy-design/js/koi.js#L45-L51) chạm trần `15` cá ở L10, `4` cá xám ở L9, `cd = 3.2 s` ở L13; tốc độ bơi cố định `30–42 px/s` ở mọi màn.
   - [rain.js](file://scratchpad/wt-agy-design/js/rain.js#L45-L66) chạm sàn `fall = 8 s` ở L10, `every = 2.7 s` ở L11 và `makeEq(L)` viết cứng `switch (L)` tới `10`.
   - [train.js](file://scratchpad/wt-agy-design/js/train.js#L24-L25) khoá cứng `speedFactor = 0.45`; `stationsFor(L)` chạm trần `15` ở L11.
3. **Lỗi vùng chạm nhỏ trên di động:** `fishAt()` trong [koi.js](file://scratchpad/wt-agy-design/js/koi.js#L270) đặt bán trục nhỏ `b = Math.max(f.L * 0.32, 16)` (bề rộng tối thiểu `32 px`), thấp hơn chuẩn chạm ngón cái `≥ 9.2–9.6 mm` (`≈ 44–48 CSS px`) của [Parhi et al. 2006](https://dx.doi.org/10.1145/1152215.1152260).
4. **Logic trộn với DOM và không tái lập được:** `Math.random()` xuất hiện rải rác ở 34 vị trí trong `js/*.js`; `mulberry32` bị chép trùng ở 3 nơi (`core.js`, `train-map.js`, `koi.js`) và `legal/licences.json` chưa ghi nguồn gốc thuật toán này.

---

### 1.2. Trục độ khó vô hướng `D(L)` (Shared Difficulty Spine)

Engine dùng **một công thức duy nhất** chuyển số màn `L ∈ [1, ∞)` thành chỉ số độ khó vô hướng `D(L)` (`D(1) = 0.000`, `D(30) = 1.000`):

$$W(L) = \begin{cases} 0 & L \le 4 \\ -1.3 & L \ge 5,\; L \equiv 1 \pmod 5 \quad\text{(Thở / Mở cơ chế)} \\ -0.3 & L \ge 5,\; L \equiv 2 \pmod 5 \\ 0.0 & L \ge 5,\; L \equiv 3 \pmod 5 \\ +0.3 & L \ge 5,\; L \equiv 4 \pmod 5 \\ +1.0 & L \ge 5,\; L \equiv 0 \pmod 5 \quad\text{(Đỉnh / Chốt chương)} \end{cases}$$

$$L_{\text{eff}}(L) = L + W(L), \qquad D(L) = \frac{\sqrt{L_{\text{eff}}(L) + 5} - \sqrt{6}}{\sqrt{36} - \sqrt{6}} = \frac{\sqrt{L_{\text{eff}}(L) + 5} - \sqrt{6}}{6 - \sqrt{6}}$$

**Vì sao chọn hàm căn bậc hai tịnh tiến `+5` kết hợp sóng `W(L)`?**

- **Đường nền căn bậc hai:** lấy từ mẫu đường cong tăng độ khó của [abagames](https://abagames.github.io/joys-of-small-game-development-en/difficulty/curve.html) (`MIT`), trong đó độ khó tăng dốc ở đầu để người chơi sớm thấy tiến triển rồi thoải dần ở phần cuối, ngược hẳn với bước tuyến tính đều dễ gãy ở màn cao như phản ví dụ [robatron/sudoku.js](https://github.com/robatron/sudoku.js) (`MIT`). Phép tịnh tiến `s = 6` (`L_eff + 5`) khử độ dốc dựng đứng tại `L = 1`: bước `L1 → L2` chỉ tăng `0.055` (thay vì `0.186` nếu dùng `sqrt((L-1)/29)`), giúp 5 màn đầu giữ đúng mức thân thiện để tránh bỏ game sớm ở nhóm người chơi yếu như [Roohi et al. 2020](https://arxiv.org/abs/2008.12937) đã chỉ ra.
- **Nhịp căng – thả chu kỳ 5 màn:** dựa trên *Oscillation Method* trong bài tổng quan về Flow Channel của [Reid-Thomas 2015](https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design). Cứ 5 màn lập thành một chương:
  - **L1–4 (`Mở màn`):** không áp sóng răng cưa, dạy luật gốc êm ái.
  - **Màn `5k` (`Đỉnh`, `L = 5, 10, 15, 20, 25, 30`):** cộng `+1.0` bậc, thử thách tổng hợp cuối chương.
  - **Màn `5k + 1` (`Thở / Mở cơ chế`, `L = 6, 11, 16, 21, 26`):** trừ `-1.3` bậc so với `L`. Hai bất biến đại số luôn đúng với mọi `k ≥ 1` (kể cả khi kéo lên `L40, L50`):
    1. `D(5k+1) < D(5k)` vì `L_eff(5k+1) = 5k - 0.3 < 5k + 1.0 = L_eff(5k)` → người chơi luôn có nhịp thở sau màn đỉnh.
    2. `D(5k+1) > D(5k-1)` vì `L_eff(5k+1) = 5k - 0.3 > 5k - 0.7 = L_eff(5k-1)` → tổng xu hướng toàn cục vẫn đi lên.
- **Nguyên tắc mở cơ chế:** mọi knob mới chỉ bật tại màn `5k + 1` (*dạy trong môi trường nhẹ trước, thử ở màn `5k+2..4`, kiểm ở đỉnh `5k+5`*). Mẫu số `6 - √6 ≈ 3.55051` đóng băng vĩnh viễn tại mốc tham chiếu `L = 30`, nên mọi màn `L ≥ 31` chỉ việc thay `L` vào cùng công thức mà không làm dịch chuyển 1–30.

---

### 1.3. Bảng khai báo knob theo game & Cách nội suy

Mỗi game không tự viết công thức `switch (L)` hay đường cong riêng mà chỉ khai báo một đối tượng `BB_SPEC[game]` chuẩn hoá:

```js
// js/difficulty.js (thuần ES5/IIFE, chạy được cả trên browser lẫn node:vm)
{
  modeAt: L => 'any', // tuỳ chọn, trả về mã chế độ nếu game đổi luật theo chương
  knobs: [
    {
      id: 'swimSpeed',
      labelVi: 'tốc độ bơi',
      unlockL: 11,          // chỉ mở từ màn thở L11; trước đó giữ lockedVal
      lockedVal: 36,
      dStart: 0.39,         // giá trị D tại thời điểm bắt đầu mở (D(11) = 0.390)
      dEnd: 1.00,           // mốc D(30) đạt target30
      min: 38,              // giá trị tại dStart
      target30: 51,         // giá trị tại D = 1.00
      hardCap: 58,          // trần sinh lý tuyệt đối, D > 1 cũng KHÔNG được vượt
      curve: 'linear',      // 'linear' | 'easeIn' | 'easeOut' | 'tier'
      step: 1,              // bước làm tròn (tránh số lẻ vô nghĩa)
      extrapMax: 1.35,      // chặn u khi ngoại suy L31+
      allowInRunAdapt: true // chỉ dùng cho chế độ Vô tận Phase 2
    }
  ],
  reliefOnUnlock: [
    { atL: 11, targetKnob: 'koi', delta: -4, recoverOver: 4 }
  ],
  dOffset: {} // tinh chỉnh vi mô [-0.05, +0.05] từ bộ calibrate Node
}
```

**Hàm tính knob `evalGameSpec(specDef, L)`:**
1. Tính `d = Math.max(0, D(L) + (specDef.dOffset[L] || 0))`.
2. Với mỗi knob: nếu `L < unlockL`, trả về `lockedVal`. Ngược lại chuẩn hoá `u = clamp((d - dStart) / (dEnd - dStart), 0, extrapMax)`, biến dạng qua `curve` (`linear`: `u`; `easeIn`: `u²`; `easeOut`: `1 - (1-u)²`), nội suy tuyến tính giữa `min` và `target30`, làm tròn theo `step` rồi kẹp cứng trong `[min, hardCap]` (hoặc `[hardCap, min]` nếu chiều khó là giảm xuống như `spawnMean`, `show`, `fall`).
3. Áp dụng `reliefOnUnlock`: khi mở một cơ chế phức tạp ở màn thở `atL`, giảm tạm một knob tải chính (`targetKnob`) thêm `delta * (1 - (L - atL) / recoverOver)` trong `recoverOver` màn để tổng gánh nhận thức không nhảy vọt.
4. **Tự sinh nhãn Feedforward:** so sánh `spec(L)` với `spec(L-1)` để in một dòng ngắn ngay trên nút *"Chơi Level L"* (ví dụ: *"Mới: ga hai màu"* hoặc *"Tăng: nhịp ra giọt"*), áp dụng gợi ý *feedforward* từ [Lomas et al. 2013](https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf).

**Kiến trúc chạy chung Browser + Node không cần build step:**  
Vì `package.json` đặt `"type": "module"` còn `index.html` nạp `<script src="...">` trực tiếp trên GitHub Pages, repo dùng mô hình **lõi thuần IIFE + bảng đóng băng**:
- `js/difficulty.js`: hàm `D(L)`, `evalGameSpec`, Elo cục bộ, PRNG `mulberry32` + `hashSeed`, gắn vào `globalThis.BB_DIFF`.
- `js/levels/<game>-core.js`: chứa `BB_SPEC[game]` và các hàm sinh màn thuần không chạm DOM (`makeMap`, `makeEq`, `pickTargets`), gắn vào `globalThis.BB_CORE[game]`.
- `js/levels-data.js`: bảng JSON đã hiệu chỉnh và đóng băng cho L1..L30 (`window.BB_LEVELS = { train: [...], koi: [...], ... }`, kèm `b_L, a_L` từ calibration), tổng dung lượng dưới 5 KB.
- Node (`scripts/sim/`) nạp đúng `js/difficulty.js` và `js/levels/<game>-core.js` qua `node:vm` (`vm.runInNewContext`), bảo đảm 100% logic sinh màn giống trình duyệt mà không thêm bundler hay npm dependency runtime nào.

---

### 1.4. Cách một game mới cắm vào hệ thống

Một game mới chỉ cần cung cấp **4 thành phần** đúng hợp đồng giao diện:
1. **Phiếu `BB_SPEC[newGame]`** (trong `js/levels/<newGame>-core.js`): khai danh sách `knobs[]`, `hardCap` theo tài liệu nhận thức, và `reliefOnUnlock` nếu có cơ chế mở muộn.
2. **Hàm lõi thuần `createGameCore(spec, rng)`**: nhận cấu hình `spec` của 1 màn và `rng = BB.mulberry32(seed)`, không gọi `Math.random()` hay `document.*`.
3. **Bot mô phỏng `scripts/sim/bots/<newGame>.mjs`**: nhận `(spec, persona, rng)` kế thừa từ `scripts/sim/human.mjs`, trả về `{ pass: boolean, margin: number, acc: number }`.
4. **Đăng ký 1 dòng vào Hub:** thêm thông số vào `BB_LEVELS` (sau khi chạy `calibrate.mjs`), gắn `<script>` vào `index.html`, và cập nhật `BB.GAMES`, `BB.GAME_NAME`, `hub.js` (`BB.LV_MAX[g]` tự động đọc `BB_LEVELS[g].length`, bỏ hard-code ở `core.js:203`).

---

### 1.5. Lớp thích nghi cục bộ tùy chọn (Client-side, Zero Server)

Hệ thống giữ **độ khó màn đóng băng** ở file tĩnh (vì không có server gom dữ liệu đám đông như Lichess [`AGPL-3.0`](https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala)), chỉ chạy thích nghi cục bộ trên máy người chơi với 3 nguyên tắc:

1. **Ước lượng năng lực `θ_g` bằng Elo/Rasch từ `bb_log`:**
   - Theo [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) và mô hình logistic của [Duolingo Birdbrain](https://spectrum.ieee.org/duolingo), mỗi ván chuẩn xong (`assist !== true`) cập nhật kỹ năng người chơi `θ_g` (khởi tạo `θ_0 = -1.5`, `n = 0`):
     $$P = \frac{1}{1 + \exp\big(-(\theta_g - b_{g,L})\big)}, \qquad U(n) = \frac{1}{1 + 0.05\,n}, \qquad \theta_g \leftarrow \theta_g + U(n)\,(won - P)$$
     trong đó `b_{g,L}` (đơn vị logit) là độ khó đã hiệu chỉnh từ bước mô phỏng offline (bỏ Glicko-2 [`glicko2.pdf`](http://www.glicko.net/glicko/glicko2.pdf) vì người chơi mỗi phiên chỉ chơi vài màn, ít hơn hẳn 10–15 ván/period khiến tham số volatility vô ích; bỏ TrueSkill vì vướng patent + trademark và `openskill.js` [Weng & Lin 2011](https://jmlr.org/papers/v12/weng11a.html) là thừa cho bài toán 1 người đấu màn).
   - **Ứng dụng `θ_g`:**
     - **Daily Challenge:** thay cho `best + 1` cố định ở `core.js:257`, chọn màn gần mục tiêu `75%` thắng của Outline Maps ([Papoušek via Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)): tìm `L ∈ [1, min(LV_MAX, best + 1)]` có `b_{g,L}` gần `θ_g - ln(0.75/0.25) = θ_g - 1.10` nhất (lượt đầu chưa có log vẫn mở `L = 1`).
     - **Hiển thị:** gắn tag *"Vừa sức"* trên lưới chọn màn khi `P ∈ [0.68, 0.86]`. Mặc định **ẩn số Elo thô** để tránh gây áp lực tâm lý cho người chơi thư giãn và trẻ em.

2. **Active DDA tự chọn (không hạ âm thầm, không rubber-band):**
   - Áp dụng *Active DDA* của [Jenova Chen 2006](https://www.engadget.com/2006/09/18/joystiq-qanda-jenova-chen/) và ngưỡng trễ (*hysteresis*) `THRESHOLD_FALLBACK_SESSIONS = 3` học ý tưởng từ [Brain Workshop](https://github.com/brain-workshop/brainworkshop/blob/master/brainworkshop.py) (`GPL-2.0`, chỉ lấy ngưỡng, không chép code): khi người chơi **thua cùng một màn 3 lần liên tiếp** (hoặc thua 2 lần liên tiếp và `P(pass | θ_g, b_{g,L}) < 0.45`), màn hình kết quả mới hiện thêm nút tự chọn *"Thử bản nhẹ hơn (-15%)"*.
   - Bản nhẹ hơn dịch `L_eff` xuống `-2.0` và kẹp mức giảm tối đa `-15%` trên các knob tốc độ/mật độ theo nguyên tắc chỉnh bước nhỏ của [Hunicke 2005](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) (`mem` tăng `+25%` thời gian xem; `word` bật sẵn gợi ý chủ đề và thêm `1` lượt).
   - **Quy tắc công bằng sao:** thắng ở bản nhẹ vẫn mở khoá màn `L + 1` để chặn bỏ game sớm ([Roohi 2020](https://arxiv.org/abs/2008.12937)), nhưng lưu `assist: true` vào `bb_log`, giới hạn tối đa **1 sao** (kèm biểu tượng hỗ trợ), không ghi đè sao chuẩn (2–3 sao) và không cộng `θ_g` vượt quá `b_{g,L} - 0.5`.

3. **Lý do KHÔNG bật adapt trong ván (in-run staircase) ở 30 màn campaign:**  
   [García-Pérez 1998](https://produccioncientifica.ucm.es/documentos/5df8a7132999525886b6fa35?lang=en) chứng minh staircase ngắn (`≤ 20` reversals) bị lệch điểm hội tụ, trong khi các màn Brainy Bits chỉ dài `3` lượt (`mem`), `6` lượt (`word`) hoặc `6–15` chạm (`koi`). Thêm nữa, [Hunicke 2005](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) cảnh báo việc biến đổi thông số thấy rõ giữa màn dễ gây cảm giác *"rubber-band"*. Vì vậy, bộ điều chỉnh liên tục theo [Kaernbach 1991](https://link.springer.com/content/pdf/10.3758/BF03214307.pdf) (`S_harder / S_easier = (1-p)/p = 1 : 5.7` cho `p = 0.85` của [Wilson et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/), kẹp `adj ∈ [-1.0, +0.5]` trên tốc độ vô hình) **chỉ dành riêng cho chế độ Luyện tập vô tận ở Phase 2** (`rain` và `train`).
   - **Tiếp cận (A11y):** thêm công tắc *"Nhịp chậm hơn (0.85×)"* trong Cài đặt cho `train`, `koi`, `rain` bên cạnh `prefers-reduced-motion` sẵn có trong `core.js:35`.

---

### 1.6. Tính tất định theo seed & Tuân thủ Licence

- **PRNG dùng chung:** gom 3 bản `mulberry32` về `BB.mulberry32` (nguồn [bryc/code](https://github.com/bryc/code/blob/master/jshash/PRNGs.md), Public Domain / MIT fallback; cần bổ sung vào `legal/licences.json`) và thêm `BB.hashSeed(...parts)` dùng FNV-1a 32-bit (Public Domain). Bộ mô phỏng Node dùng `sfc32` (cũng từ `bryc/code`, trạng thái 128-bit qua PractRand) cho nhiễu sinh lý bot, giữ `mulberry32` cho hàm sinh màn.
- **Tách 3 luồng seed:**
  1. **Daily Challenge:** `hashSeed('daily', dayKey, game, level)` — mọi người chơi trong cùng ngày gặp chính xác cùng bản đồ đường ray, đàn cá, chuỗi phép tính và cụm từ.
  2. **Campaign:** `hashSeed('camp', game, level, attemptIdx)` — lượt đầu tiên (`attemptIdx = 0`) luôn tái lập chuẩn để QA / Playwright kiểm thử; từ lần chơi lại thứ hai `attemptIdx` tăng dần để người chơi không học thuộc vị trí ô sáng ở `mem` hay chuỗi số ở `rain`.
  3. **Trang trí nền tĩnh:** `levelSeed ^ 0x9E3779B9` — tách hẳn luồng RNG hình ảnh khỏi luồng gameplay để sửa lá sen hay bụi cây không làm đổi đề bài.
- **Bảng rà soát Licence từ `RESEARCH-KEPT.json`:**
  - *Code được phép dùng (Permissive / PD):* `bryc/code` (PD/MIT), `abagames` (MIT), `mmai/glicko2js` (MIT), `simple-statistics` (ISC), `jspsych/plugin-corsi-blocks` (MIT), `kurokida/jsQUEST` (MIT).
  - *Chỉ mượn ý tưởng / hằng số toán (không copy code):* toàn bộ bài báo học thuật, `Brain Workshop` (`GPL-2.0`), `PsychoPy` (`GPL-3.0`), `Lichess lila` (`AGPL-3.0`).
  - *Loại bỏ hoàn toàn:* `TrueSkill` (patent + trademark), `hadrienj/StaircaseJS` ([không có file licence](https://github.com/hadrienj/StaircaseJS)).

---

## 2. Thiết kế knob & Bảng đầy đủ L1..L30 cho 5 game

**Luật công thái học chung không thương lượng:** mọi vùng chạm (ô lưới, con cá, ngã rẽ, phím số) phải giữ kích thước `≥ 9.2–9.6 mm` (`≥ 44 CSS px` theo [Parhi et al. 2006](https://dx.doi.org/10.1145/1152215.1152260)). Không bao giờ thu nhỏ mục tiêu để làm màn khó hơn.

### 2.1. `train` — Đường Ray Tư Duy (`js/train.js` + `js/train-map.js`)

- **Hiện trạng (`train.js:10-25, 274`):** L1..11 có `5..15` ga, `LEVEL_TIME = 90 s`, `speedFactor = 0.45` cố định, `spawnMean` giảm từ `4.33 s` xuống `3.08 s`, `burstProb = 15%`, `leadCells = 5` (ngã rẽ đầu cách hầm tối thiểu 5 ô, được người chơi khen ở `train-map.js:185`), thắng khi đúng `≥ 80%`. Đã có sẵn trường `st.two` cho ga/tàu hai màu ở `train.js:45, 186, 519`.
- **Trần nhận thức & Knob:**
  - `stations` (`5 → 15`, trần cứng `15`): tăng lượng thông tin lựa chọn theo định luật Hick–Hyman (`H = log2(15) = 3.91 bit`, [Proctor & Schneider 2018](https://www.pubmed.gov/28434379/)), đồng thời lưới tối đa `8` cột trên màn hình `390 px` vẫn giữ mỗi ô `≈ 47 px ≥ 44 px` ([Parhi 2006](https://dx.doi.org/10.1145/1152215.1152260)) và khớp 15 cặp màu-hình `SOLID15/GLYPHS`.
  - `speedFactor` (`0.45 → 0.54`, mở L11, trần cứng `0.62`, mục tiêu L30 `+20%`): tăng nhịp xử lý ở chương 3–6 thay cho việc nhồi thêm ga.
  - `spawnMean` (`4.35 → 2.75 s`, sàn cứng `2.35 s`): giữ số tàu đồng thời trên bản đồ quanh vùng working memory `K ≈ 4` ([Cowan 2001](https://pubmed.ncbi.nlm.nih.gov/11515286/)), tránh nghẽn Switch 0 khiến hai tàu kẹt cùng ngã rẽ.
  - `burstProb` (`15% → 28%`, mở L11, trần `35%`): xác suất tung cặp tàu sát nhau (`min 1.35 s`), vẫn giữ rule không 2 burst liên tiếp (`!lastBurst`).
  - `twoToneFrac` (`0% → 45%`, mở L16, trần `60%`): kích hoạt `st.two = true` (màu thân ≠ màu mái trên cả ga và tàu), buộc kiểm tra đồng thời 2 thuộc tính + glyph.
  - `expressProb` (`0% → 20%`, mở L21, trần `28%`): tàu tốc hành chạy `1.25×` tốc độ thường (có sọc vàng nhận diện), kiểm soát sai lệch thời điểm bấm ([Isaksen & Nealen 2015](https://ojs.aaai.org/index.php/AIIDE/article/view/12846)).
  - `oppositeRate` (`50% → 80%`, mở L26, trần `90%`): xác suất `colorBag` bốc ga đích nằm khác nhánh chính tại ngã rẽ đầu tiên so với tàu liền trước, tăng tần suất đảo công tắc mà **không cần cắt ngắn `leadCells = 5`**.

| Lv | Vai trò | D(L) | stations | speedFactor | spawnMean (s) | burstProb | twoToneFrac | expressProb | oppositeRate |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Mở màn | 0.000 | 5 | 0.45 | 4.35 | 15% | 0% | 0% | 50% |
| 2 | Mở màn | 0.055 | 6 | 0.45 | 4.25 | 15% | 0% | 0% | 50% |
| 3 | Mở màn | 0.107 | 7 | 0.45 | 4.20 | 15% | 0% | 0% | 50% |
| 4 | Mở màn | 0.155 | 8 | 0.45 | 4.10 | 15% | 0% | 0% | 50% |
| 5 | Đỉnh | 0.244 | 9 | 0.45 | 3.95 | 15% | 0% | 0% | 50% |
| 6 | Thở/Mở | 0.187 | 10 | 0.45 | 4.05 | 15% | 0% | 0% | 50% |
| 7 | Tăng | 0.273 | 11 | 0.45 | 3.90 | 15% | 0% | 0% | 50% |
| 8 | Tăng | 0.326 | 12 | 0.45 | 3.85 | 15% | 0% | 0% | 50% |
| 9 | Tăng | 0.375 | 13 | 0.45 | 3.75 | 15% | 0% | 0% | 50% |
| 10 | Đỉnh | 0.437 | 14 | 0.45 | 3.65 | 15% | 0% | 0% | 50% |
| 11 | Thở/Mở | 0.390 | 14 | 0.46 | 3.75 | 15% | 0% | 0% | 50% |
| 12 | Tăng | 0.461 | 15 | 0.47 | 3.60 | 17% | 0% | 0% | 50% |
| 13 | Tăng | 0.505 | 15 | 0.48 | 3.55 | 17% | 0% | 0% | 50% |
| 14 | Tăng | 0.547 | 15 | 0.48 | 3.45 | 18% | 0% | 0% | 50% |
| 15 | Đỉnh | 0.601 | 15 | 0.49 | 3.40 | 19% | 0% | 0% | 50% |
| 16 | Thở/Mở | 0.560 | 15 | 0.48 | 3.45 | 19% | 15% | 0% | 50% |
| 17 | Tăng | 0.622 | 15 | 0.49 | 3.35 | 20% | 20% | 0% | 50% |
| 18 | Tăng | 0.661 | 15 | 0.50 | 3.30 | 21% | 20% | 0% | 50% |
| 19 | Tăng | 0.698 | 15 | 0.50 | 3.25 | 22% | 25% | 0% | 50% |
| 20 | Đỉnh | 0.746 | 15 | 0.51 | 3.15 | 23% | 30% | 0% | 50% |
| 21 | Thở/Mở | 0.710 | 15 | 0.50 | 3.20 | 22% | 25% | 6% | 50% |
| 22 | Tăng | 0.765 | 15 | 0.51 | 3.15 | 23% | 30% | 9% | 50% |
| 23 | Tăng | 0.800 | 15 | 0.51 | 3.05 | 24% | 30% | 11% | 50% |
| 24 | Tăng | 0.835 | 15 | 0.52 | 3.00 | 24% | 35% | 12% | 50% |
| 25 | Đỉnh | 0.878 | 15 | 0.52 | 2.95 | 25% | 35% | 14% | 50% |
| 26 | Thở/Mở | 0.845 | 15 | 0.52 | 3.00 | 25% | 35% | 13% | 65% |
| 27 | Tăng | 0.896 | 15 | 0.53 | 2.90 | 26% | 40% | 15% | 70% |
| 28 | Tăng | 0.928 | 15 | 0.53 | 2.85 | 26% | 40% | 17% | 75% |
| 29 | Tăng | 0.960 | 15 | 0.53 | 2.80 | 27% | 40% | 18% | 75% |
| 30 | Đỉnh | 1.000 | 15 | 0.54 | 2.75 | 28% | 45% | 20% | 80% |

*(Giữ cố định `LEVEL_TIME = 90 s`, `leadCells = 5`, ngưỡng qua màn `≥ 80%` ở toàn bộ L1..L30.)*

---

### 2.2. `koi` — Cho Cá Koi Ăn (`js/koi.js`)

- **Hiện trạng (`koi.js:45-68, 270`):** L1..10 tăng `koi` từ `6 → 15`, `cd` từ `1.45 → 2.80 s`, `decoys` từ `0 → 4`, tốc độ trung bình `36 px/s` (`30 + [0..12]`), `turnMax = 1.6 rad/s`, được phép nhầm tối đa `1` lần. Cần nâng sàn vùng chạm cá trong `fishAt()` từ `a ≥ 20, b ≥ 16` lên `a ≥ 24, b ≥ 22` (`48 × 44 px`) để giữ chuẩn chạm ngón tay ([Parhi 2006](https://dx.doi.org/10.1145/1152215.1152260)).
- **Trần nhận thức & Knob:** Cá đã cho ăn không để lại dấu trên thân (`f.fed` ẩn), biến trò chơi thành bài toán **Multiple Object Tracking (MOT)**. Khi nửa đàn đã ăn, người chơi phải theo dõi tối đa `N/2 ≈ 7–8` con đang bơi — chạm đúng trần `~8` mục tiêu khi bơi chậm của [Alvarez & Franconeri 2007](https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f). Vì tốc độ và số lượng đánh đổi trực tiếp nhau, quy tắc cứng là **không tăng đồng thời `koi` và `swimSpeed` tại màn mở cơ chế**: dùng `reliefOnUnlock` hạ `koi` về `10–11` con ở L11, L16, L21, L26 rồi mới leo lại (và kẹp `koi ≤ 12` ở chương 6).
- **Định nghĩa `decoyTier`:** `T0` = cá xám đậm `#2f4a46` có râu (như bản gốc); `T1` = cá xám-vàng nhạt có râu (gần tông Koi hơn); `T2` = cá trắng-cam nhạt có râu và sọc lưng xám. `scatter` (`px/s`, mở L26) là xung lực đẩy nhẹ các cá xung quanh bán kính `80 px` tản ra khi chạm cho ăn thành công.

| Lv | Vai trò | D(L) | koi | cd (s) | decoys | swimSpeed (px/s, ±6) | turnMax (rad/s) | decoyTier | scatter (px/s) |
|---:|---|---:|---:|---:|---:|---:|---:|---|---:|
| 1 | Mở màn | 0.000 | 6 | 1.45 | 0 | 36 | 1.6 | T0 | 0 |
| 2 | Mở màn | 0.055 | 7 | 1.65 | 0 | 36 | 1.6 | T0 | 0 |
| 3 | Mở màn | 0.107 | 8 | 1.80 | 1 | 36 | 1.6 | T0 | 0 |
| 4 | Mở màn | 0.155 | 9 | 1.95 | 1 | 36 | 1.6 | T0 | 0 |
| 5 | Đỉnh | 0.244 | 10 | 2.20 | 2 | 36 | 1.6 | T0 | 0 |
| 6 | Thở/Mở | 0.187 | 10 | 2.05 | 1 | 36 | 1.6 | T0 | 0 |
| 7 | Tăng | 0.273 | 12 | 2.25 | 2 | 36 | 1.6 | T0 | 0 |
| 8 | Tăng | 0.326 | 13 | 2.40 | 2 | 36 | 1.6 | T0 | 0 |
| 9 | Tăng | 0.375 | 14 | 2.50 | 2 | 36 | 1.6 | T0 | 0 |
| 10 | Đỉnh | 0.437 | 15 | 2.60 | 2 | 36 | 1.6 | T0 | 0 |
| 11 | Thở/Mở | 0.390 | 10 | 2.50 | 2 | 38 | 1.6 | T0 | 0 |
| 12 | Tăng | 0.461 | 12 | 2.65 | 2 | 40 | 1.6 | T0 | 0 |
| 13 | Tăng | 0.505 | 13 | 2.75 | 3 | 40 | 1.6 | T0 | 0 |
| 14 | Tăng | 0.547 | 14 | 2.80 | 3 | 41 | 1.6 | T0 | 0 |
| 15 | Đỉnh | 0.601 | 15 | 2.90 | 3 | 42 | 1.6 | T0 | 0 |
| 16 | Thở/Mở | 0.560 | 11 | 2.80 | 3 | 42 | 1.7 | T0 | 0 |
| 17 | Tăng | 0.622 | 12 | 2.90 | 3 | 43 | 1.8 | T0 | 0 |
| 18 | Tăng | 0.661 | 13 | 2.95 | 3 | 44 | 1.8 | T0 | 0 |
| 19 | Tăng | 0.698 | 14 | 3.00 | 3 | 45 | 1.9 | T0 | 0 |
| 20 | Đỉnh | 0.746 | 14 | 3.05 | 3 | 46 | 2.0 | T0 | 0 |
| 21 | Thở/Mở | 0.710 | 11 | 3.00 | 3 | 45 | 1.9 | T1 | 0 |
| 22 | Tăng | 0.765 | 12 | 3.05 | 3 | 46 | 2.0 | T1 | 0 |
| 23 | Tăng | 0.800 | 13 | 3.10 | 4 | 47 | 2.0 | T1 | 0 |
| 24 | Tăng | 0.835 | 13 | 3.10 | 4 | 47 | 2.1 | T1 | 0 |
| 25 | Đỉnh | 0.878 | 13 | 3.10 | 4 | 48 | 2.1 | T1 | 0 |
| 26 | Thở/Mở | 0.845 | 11 | 3.10 | 4 | 48 | 2.1 | T2 | 15 |
| 27 | Tăng | 0.896 | 12 | 3.15 | 4 | 49 | 2.2 | T2 | 20 |
| 28 | Tăng | 0.928 | 12 | 3.15 | 4 | 49 | 2.2 | T2 | 25 |
| 29 | Tăng | 0.960 | 12 | 3.15 | 4 | 50 | 2.2 | T2 | 25 |
| 30 | Đỉnh | 1.000 | 12 | 3.15 | 4 | 51 | 2.3 | T2 | 30 |

---

### 2.3. `mem` — Ô Sáng Ghi Nhớ (`js/mem.js`)

- **Hiện trạng (`mem.js:31-36`):** L1..13 có `3` lượt mỗi màn (đúng `NEED = 2` để qua), `t = 2 + L` (`3..15`), lưới `3×3 → 6×6`, `show = 1.0 + 0.3·t`.
- **Trần nhận thức & Knob:**
  - `size ≤ 6×6`: giữ ô chạm `≥ 48–52 px` trên màn hình dọc `320–390 px` ([Parhi 2006](https://dx.doi.org/10.1145/1152215.1152260)).
  - **Chế độ đồng thời (`mode = 'any'`, L1..L20):** khoá trần **`t ≤ 13`** (`≤ 36%` lưới `6×6`, triệt tiêu hoàn toàn nguy cơ đảo ngược độ khó). Khi `t` vượt ngưỡng `K ≈ 4` chunk ([Luck & Vogel 1997](https://www.doi.org/10.1038/36846); [Cowan 2001](https://pubmed.ncbi.nlm.nih.gov/11515286/)), người chơi dựa vào gộp cụm hình học. Độ khó ở L11–20 đến từ 3 knob: nén `show` (`4.5 → 3.0 s`), tăng `disp` (hệ số phân tán chống cụm liền kề trong `pickTargets`, `0.05 → 0.25`), mở `decoys` (ô đỏ cấm chạm hiện cùng lúc trong pha nhìn, `1 → 3`) và `delay` (khoảng tối trì hoãn trước khi mở chạm, `0.2 → 0.6 s`).
  - **Chế độ tuần tự (`mode = 'seq'`, L21..L30):** áp dụng mô hình Corsi block-tapping theo khung tham số của [`jspsych/plugin-corsi-blocks`](https://github.com/jspsych/jspsych-contrib/tree/main/packages/plugin-corsi-blocks) (`MIT`) và chuẩn người lớn `6.2 ± 1.3` ([Kessels et al. 2000 qua PsyToolkit](https://www.psytoolkit.org/library/corsi.html)). Mỗi ô sáng lần lượt `show` giây (nghỉ `gap = 0.22 s` giữa 2 ô). Kết quả chạy mô phỏng cho thấy nếu đẩy `t = 7` cùng mồi nháy và `delay` ở L30, pass rate của người trung bình sập xuống dưới `10%`. Do đó L21–30 giữ `t ∈ [4, 6]` với tối đa `1` ô đỏ mồi ở chương 6, để `t = 7..8` cho đợt L31..40.

| Lv | Vai trò | D(L) | mode | size | t | show (s) | disp | decoys | delay (s) |
|---:|---|---:|---|---|---:|---:|---:|---:|---:|
| 1 | Mở màn | 0.000 | any | 3×3 | 3 | 1.90 | 0.00 | 0 | 0.0 |
| 2 | Mở màn | 0.055 | any | 3×3 | 4 | 2.20 | 0.00 | 0 | 0.0 |
| 3 | Mở màn | 0.107 | any | 4×4 | 5 | 2.50 | 0.00 | 0 | 0.0 |
| 4 | Mở màn | 0.155 | any | 4×4 | 6 | 2.80 | 0.00 | 0 | 0.0 |
| 5 | Đỉnh | 0.244 | any | 4×4 | 7 | 3.10 | 0.00 | 0 | 0.0 |
| 6 | Thở/Mở | 0.187 | any | 5×5 | 8 | 3.80 | 0.00 | 0 | 0.0 |
| 7 | Tăng | 0.273 | any | 5×5 | 9 | 3.70 | 0.00 | 0 | 0.0 |
| 8 | Tăng | 0.326 | any | 5×5 | 10 | 4.00 | 0.00 | 0 | 0.0 |
| 9 | Tăng | 0.375 | any | 5×5 | 11 | 4.30 | 0.00 | 0 | 0.0 |
| 10 | Đỉnh | 0.437 | any | 6×6 | 12 | 4.60 | 0.00 | 0 | 0.0 |
| 11 | Thở/Mở | 0.390 | any | 6×6 | 11 | 4.50 | 0.05 | 0 | 0.0 |
| 12 | Tăng | 0.461 | any | 6×6 | 12 | 4.30 | 0.10 | 0 | 0.0 |
| 13 | Tăng | 0.505 | any | 6×6 | 12 | 4.00 | 0.15 | 0 | 0.0 |
| 14 | Tăng | 0.547 | any | 6×6 | 12 | 3.70 | 0.20 | 0 | 0.0 |
| 15 | Đỉnh | 0.601 | any | 6×6 | 13 | 3.40 | 0.20 | 0 | 0.0 |
| 16 | Thở/Mở | 0.560 | any | 6×6 | 8 | 3.80 | 0.10 | 1 | 0.2 |
| 17 | Tăng | 0.622 | any | 6×6 | 9 | 3.60 | 0.10 | 1 | 0.3 |
| 18 | Tăng | 0.661 | any | 6×6 | 9 | 3.40 | 0.15 | 2 | 0.4 |
| 19 | Tăng | 0.698 | any | 6×6 | 10 | 3.20 | 0.20 | 2 | 0.5 |
| 20 | Đỉnh | 0.746 | any | 6×6 | 10 | 3.00 | 0.25 | 3 | 0.6 |
| 21 | Thở/Mở | 0.710 | seq | 5×5 | 4 | 0.56 | 0.00 | 0 | 0.2 |
| 22 | Tăng | 0.765 | seq | 5×5 | 5 | 0.52 | 0.00 | 0 | 0.2 |
| 23 | Tăng | 0.800 | seq | 6×6 | 5 | 0.50 | 0.00 | 0 | 0.3 |
| 24 | Tăng | 0.835 | seq | 6×6 | 6 | 0.48 | 0.00 | 0 | 0.3 |
| 25 | Đỉnh | 0.878 | seq | 6×6 | 6 | 0.46 | 0.00 | 0 | 0.4 |
| 26 | Thở/Mở | 0.845 | seq | 6×6 | 5 | 0.50 | 0.00 | 1 | 0.2 |
| 27 | Tăng | 0.896 | seq | 6×6 | 5 | 0.48 | 0.00 | 1 | 0.2 |
| 28 | Tăng | 0.928 | seq | 6×6 | 6 | 0.46 | 0.00 | 1 | 0.2 |
| 29 | Tăng | 0.960 | seq | 6×6 | 6 | 0.46 | 0.00 | 1 | 0.3 |
| 30 | Đỉnh | 1.000 | seq | 6×6 | 6 | 0.44 | 0.00 | 1 | 0.3 |

*(Cột `show` ở `mode = any` là tổng thời gian sáng toàn bảng; ở `mode = seq` là thời gian sáng từng ô với `gap = 0.22 s`.)*

---

### 2.4. `rain` — Mưa Phép Tính (`js/rain.js`)

- **Hiện trạng (`rain.js:6-7, 32-66, 158`):** L1..10 giải đủ `10+L` giọt, tối đa `3` mạng (`LIVES = 3`), `AUTO_WAIT = 0.6 s`, giới hạn gõ tối đa `3` chữ số (`0..999`), `fall` giảm từ `13 → 8.05 s`, `every` giảm từ `4.6 → 2.8 s`, tối đa `5` giọt trên màn hình.
- **Trần nhận thức & Ràng buộc hàng đợi:**
  - [Barrouillet & Thevenot 2013](https://access.archive-ouverte.unige.ch/access/metadata/2c3ad80b-2334-48ee-8cc9-1521d7816171/download) đo thời gian nhẩm phép cộng nhỏ (`1–4`) mất `640–830 ms` trước cả khi gõ phím; [Prado et al. 2013](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00189/full) ghi nhận mức tăng thời gian khi số lớn (problem-size effect) ở phép nhân chỉ `52 ms` với nhóm học thuộc bảng cửu chương, khớp thứ tự `rain.js` mở phép nhân từ L6.
  - Khi thêm phép tính có nhớ, phép tính 2 bước và gõ số `2–3` chữ số, tổng thời gian giải + nhập bàn phím chạm ngưỡng `~1.7–2.1 s/giọt`. Để hàng đợi không mất kiểm soát, sàn cứng đặt ở **`every ≥ 2.15 s`** (L30 `2.35 s`), **`fall ≥ 5.0 s`** (L30 `5.60 s`), `maxDrops ≤ 6`, mọi đáp án bắt buộc thuộc `[0, 999]`.
- **14 bậc phép tính (`opTier`):**
  - `T1..T10` (L1–10): giữ nguyên 10 mô tả trong `LVINFO[1..10]` hiện tại; chỉ thêm `+0.6 s fall / +0.35 s every` tại L6 làm nhịp thở khi mở bảng nhân.
  - `T11` (L11–15): đủ 4 phép cộng/trừ `≤ 300`, nhân/chia tới `15 × 12`, tăng `carryBias` (ép phép cộng/trừ có nhớ qua hàng chục).
  - `T12` (L16–20): thêm biểu thức 2 bước `a × b ± c` (`a, b ∈ [2, 9]`, `c ≤ 20`, ưu tiên nhân trước).
  - `T13` (L21–25): 4 phép `≤ 500`, mở `maxDrops = 6` và giọt bão `storm` rơi nhanh `1.28×` (đổi viền cam báo trước).
  - `T14` (L26–30): thêm bài toán ngược `missingOp` (`? + 18 = 53`, `? × 7 = 56`, giữ đáp án nguyên dương `0..999`).

| Lv | Vai trò | D(L) | opTier | fall (s) | every (s) | target | maxDrops | carryBias | twoStep | storm | missingOp |
|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Mở màn | 0.000 | T1 | 13.00 | 4.60 | 11 | 5 | 0% | 0% | 0% | 0% |
| 2 | Mở màn | 0.055 | T2 | 12.45 | 4.40 | 12 | 5 | 0% | 0% | 0% | 0% |
| 3 | Mở màn | 0.107 | T3 | 11.90 | 4.20 | 13 | 5 | 0% | 0% | 0% | 0% |
| 4 | Mở màn | 0.155 | T4 | 11.35 | 4.00 | 14 | 5 | 0% | 0% | 0% | 0% |
| 5 | Đỉnh | 0.244 | T5 | 10.80 | 3.80 | 15 | 5 | 0% | 0% | 0% | 0% |
| 6 | Thở/Mở | 0.187 | T6 | 10.85 | 3.95 | 16 | 5 | 20% | 0% | 0% | 0% |
| 7 | Tăng | 0.273 | T7 | 9.70 | 3.40 | 17 | 5 | 20% | 0% | 0% | 0% |
| 8 | Tăng | 0.326 | T8 | 9.15 | 3.20 | 18 | 5 | 20% | 0% | 0% | 0% |
| 9 | Tăng | 0.375 | T9 | 8.60 | 3.00 | 19 | 5 | 20% | 0% | 0% | 0% |
| 10 | Đỉnh | 0.437 | T10 | 8.05 | 2.80 | 20 | 5 | 20% | 0% | 0% | 0% |
| 11 | Thở/Mở | 0.390 | T11 | 8.20 | 2.90 | 20 | 5 | 35% | 0% | 0% | 0% |
| 12 | Tăng | 0.461 | T11 | 7.90 | 2.85 | 21 | 5 | 40% | 0% | 0% | 0% |
| 13 | Tăng | 0.505 | T11 | 7.70 | 2.80 | 22 | 5 | 40% | 0% | 0% | 0% |
| 14 | Tăng | 0.547 | T11 | 7.50 | 2.75 | 22 | 5 | 45% | 0% | 0% | 0% |
| 15 | Đỉnh | 0.601 | T11 | 7.30 | 2.70 | 23 | 5 | 45% | 0% | 0% | 0% |
| 16 | Thở/Mở | 0.560 | T12 | 7.50 | 2.75 | 22 | 5 | 45% | 10% | 0% | 0% |
| 17 | Tăng | 0.622 | T12 | 7.20 | 2.70 | 23 | 5 | 50% | 15% | 0% | 0% |
| 18 | Tăng | 0.661 | T12 | 7.00 | 2.65 | 24 | 5 | 50% | 15% | 0% | 0% |
| 19 | Tăng | 0.698 | T12 | 6.90 | 2.60 | 24 | 5 | 55% | 15% | 0% | 0% |
| 20 | Đỉnh | 0.746 | T12 | 6.70 | 2.60 | 25 | 5 | 55% | 20% | 0% | 0% |
| 21 | Thở/Mở | 0.710 | T13 | 6.80 | 2.60 | 24 | 6 | 55% | 15% | 10% | 0% |
| 22 | Tăng | 0.765 | T13 | 6.60 | 2.55 | 25 | 6 | 55% | 20% | 15% | 0% |
| 23 | Tăng | 0.800 | T13 | 6.50 | 2.55 | 25 | 6 | 60% | 20% | 15% | 0% |
| 24 | Tăng | 0.835 | T13 | 6.30 | 2.50 | 26 | 6 | 60% | 25% | 15% | 0% |
| 25 | Đỉnh | 0.878 | T13 | 6.10 | 2.45 | 26 | 6 | 65% | 25% | 20% | 0% |
| 26 | Thở/Mở | 0.845 | T14 | 6.30 | 2.50 | 26 | 6 | 60% | 25% | 15% | 10% |
| 27 | Tăng | 0.896 | T14 | 6.00 | 2.45 | 27 | 6 | 65% | 25% | 20% | 15% |
| 28 | Tăng | 0.928 | T14 | 5.90 | 2.40 | 27 | 6 | 65% | 25% | 20% | 20% |
| 29 | Tăng | 0.960 | T14 | 5.80 | 2.40 | 27 | 6 | 70% | 30% | 25% | 20% |
| 30 | Đỉnh | 1.000 | T14 | 5.60 | 2.35 | 28 | 6 | 70% | 30% | 25% | 25% |

---

### 2.5. `word` — Đoán Cụm Từ (`js/word.js`)

- **Hiện trạng (`word.js:8-22`):** Kho gốc có `49` cụm 2 từ tiếng Việt do Duy biên soạn, nhưng hiện tại chỉ xếp theo độ dài chuỗi `n = 5..11`. Lỗi lớn nhất là độ dài không phản ánh đúng độ khó: *"ước mơ"* chỉ `5` chữ (`3` dấu phụ, trừu tượng) nhưng xếp ngang *"cà phê"*, trong khi *"điện thoại"* (`9` chữ) rất quen thuộc lại bị đẩy xuống cuối. Ngoài ra `core.js:203` ghi nhầm `LV_MAX.word = 12`.
- **Công thức chấm độ khó từ `S_word(p)`:** kế thừa 4 nhóm yếu tố dự báo độ khó Wordle từ [DiSilvio, Ozerov & Zhou 2023](https://arxiv.org/abs/2311.16777v1) (`CC BY 4.0`) — độ thông dụng, số chữ lặp, số ô trung gian lộ ra và entropy tập ứng viên — bổ sung độ phức tạp thanh điệu/dấu mũ tiếng Việt (`[Đề xuất thiết kế]` trọng số để hiệu chỉnh lại khi có solver đầy đủ và log người thật):
  $$S_{\text{word}}(p) = 0.28\cdot\text{normLen} + 0.22\cdot\text{normRep} + 0.22\cdot\text{normDiac} + 0.14\cdot(1 - \text{famScore}) + 0.14\cdot\text{normAmb}$$
  - `normLen = clamp((n - 5) / 6, 0, 1)`.
  - `normRep = clamp(repeats / 3, 0, 1)` (đếm chữ lặp theo họ chữ `fam()` trong `word.js:39`).
  - `normDiac = clamp((tones + 0.6·hỏiNgã + 0.7·mods) / 5.5, 0, 1)` (đếm thanh sắc/huyền/hỏi/ngã/nặng và nguyên âm phụ `ă â ê ô ơ ư đ`).
  - `famScore ∈ {1.00, 0.70, 0.35}` (phân 3 tầng quen thuộc đời thường tạm thời, thay thế bằng `rank tần suất` khi chọn được corpus tiếng Việt mở).
  - `normAmb` (mật độ nguyên âm + độ dài âm tiết dài nhất; ở Node calibrator thay bằng subset entropy còn lại sau 2 lượt đoán chuẩn).
- **Nhịp knob 6 chương (`maxTries = 6` giữ tới L30; giữ `maxTries = 5` và `blueCue = 'posOnly'` cho L31..L40):**
  - `hintMode`: `free` (L1–15, bấm xem gợi ý chủ đề bất kỳ lúc nào) → `after2` (L16–20, chỉ mở sau lượt 2) → `after3` (L21–25, mở sau lượt 3, dùng gợi ý hạ trần 2 sao) → `none` (L26–30, tắt ở chế độ chuẩn, chỉ mở ở bản nhẹ).
  - `strict` (Hard Mode): `off` (L1–20) → `on` (L21–30, buộc giữ nguyên mọi chữ xanh lá đã tìm ra ở các lượt kế tiếp).
  - `blueCue`: `any` (L1–30, giữ nguyên cơ chế đánh dấu xanh dương toàn cụm như `word.js:110-115`).

| Lv | Vai trò | D(L) | Cụm từ | Cấu trúc | Thanh | Dấu chữ | Lặp họ | S_word | maxTries | hintMode | strict | blueCue |
|---:|---|---:|---|---|---:|---:|---:|---:|---:|---|---|---|
| 1 | Mở màn | 0.000 | cà phê | 2+3=5 | 1 | 1 | 0 | 0.068 | 6 | free | off | any |
| 2 | Mở màn | 0.055 | du lịch | 2+4=6 | 1 | 0 | 0 | 0.110 | 6 | free | off | any |
| 3 | Mở màn | 0.107 | bà nội | 2+3=5 | 2 | 1 | 0 | 0.126 | 6 | free | off | any |
| 4 | Mở màn | 0.155 | bún chả | 3+3=6 | 2 | 0 | 0 | 0.151 | 6 | free | off | any |
| 5 | Đỉnh | 0.244 | con mèo | 3+3=6 | 1 | 0 | 1 | 0.177 | 6 | free | off | any |
| 6 | Thở/Mở | 0.187 | mùa thu | 3+3=6 | 1 | 0 | 1 | 0.177 | 6 | free | off | any |
| 7 | Tăng | 0.273 | áo dài | 2+3=5 | 2 | 0 | 1 | 0.188 | 6 | free | off | any |
| 8 | Tăng | 0.326 | máy tính | 3+4=7 | 2 | 0 | 0 | 0.214 | 6 | free | off | any |
| 9 | Tăng | 0.375 | kính râm | 4+3=7 | 1 | 1 | 0 | 0.227 | 6 | free | off | any |
| 10 | Đỉnh | 0.437 | trà sữa | 3+3=6 | 2 | 1 | 1 | 0.270 | 6 | free | off | any |
| 11 | Thở/Mở | 0.390 | âm nhạc | 2+4=6 | 1 | 1 | 1 | 0.253 | 6 | free | off | any |
| 12 | Tăng | 0.461 | thư viện | 3+4=7 | 1 | 2 | 0 | 0.272 | 6 | free | off | any |
| 13 | Tăng | 0.505 | ước mơ | 3+2=5 | 1 | 3 | 1 | 0.306 | 6 | free | off | any |
| 14 | Tăng | 0.547 | cầu vồng | 3+4=7 | 2 | 2 | 0 | 0.312 | 6 | free | off | any |
| 15 | Đỉnh | 0.601 | bầu trời | 3+4=7 | 2 | 2 | 0 | 0.330 | 6 | free | off | any |
| 16 | Thở/Mở | 0.560 | mưa phùn | 3+4=7 | 1 | 1 | 1 | 0.318 | 6 | after2 | off | any |
| 17 | Tăng | 0.622 | mặt trời | 3+4=7 | 2 | 2 | 1 | 0.344 | 6 | after2 | off | any |
| 18 | Tăng | 0.661 | nụ cười | 2+4=6 | 2 | 2 | 1 | 0.356 | 6 | after2 | off | any |
| 19 | Tăng | 0.698 | bạn thân | 3+4=7 | 1 | 1 | 2 | 0.373 | 6 | after2 | off | any |
| 20 | Đỉnh | 0.746 | khiêu vũ | 5+2=7 | 1 | 1 | 1 | 0.431 | 6 | after2 | off | any |
| 21 | Thở/Mở | 0.710 | sinh nhật | 4+4=8 | 1 | 1 | 2 | 0.378 | 6 | after3 | on | any |
| 22 | Tăng | 0.765 | thành phố | 5+3=8 | 2 | 1 | 2 | 0.441 | 6 | after3 | on | any |
| 23 | Tăng | 0.800 | pháo hoa | 4+3=7 | 1 | 0 | 3 | 0.454 | 6 | after3 | on | any |
| 24 | Tăng | 0.835 | trường học | 6+3=9 | 2 | 2 | 1 | 0.484 | 6 | after3 | on | any |
| 25 | Đỉnh | 0.878 | điện thoại | 4+5=9 | 2 | 2 | 1 | 0.495 | 6 | after3 | on | any |
| 26 | Thở/Mở | 0.845 | ánh trăng | 3+5=8 | 1 | 1 | 2 | 0.492 | 6 | none | on | any |
| 27 | Tăng | 0.896 | bệnh viện | 4+4=8 | 2 | 2 | 2 | 0.506 | 6 | none | on | any |
| 28 | Tăng | 0.928 | giáng sinh | 5+4=9 | 1 | 0 | 3 | 0.553 | 6 | none | on | any |
| 29 | Tăng | 0.960 | thanh xuân | 5+4=9 | 0 | 1 | 3 | 0.590 | 6 | none | on | any |
| 30 | Đỉnh | 1.000 | truyền thống | 6+5=11 | 2 | 2 | 2 | 0.759 | 6 | none | on | any |

*(19 cụm còn lại trong `PHRASES` gốc được giữ nguyên trong `SPARE_POOL` cho Daily Challenge và làm hạt giống cho đợt mở rộng L31..L40: `xe đạp`, `bánh mì`, `bóng đá`, `sân bay`, `phở bò`, `học sinh`, `tình yêu`, `gia đình`, `đồng hồ`, `núi lửa`, `hoa hồng`, `trái tim`, `nhà hàng`, `đại dương`, `hạnh phúc`, `bánh chưng`, `bãi biển`, `nông thôn`, `nghệ thuật`.)*

---

## 3. Mô hình người chơi mô phỏng & Vòng hiệu chỉnh

### 3.1. Mô hình người chơi chung (`scripts/sim/human.mjs`)

Theo [Roohi et al. 2020](https://arxiv.org/abs/2008.12937), không được tối ưu cho một bot duy nhất mà phải chạy một quần thể gồm 3 persona đại diện: `novice` (người mới / lớn tuổi / chậm tay), `median` (người chơi phổ thông) và `skilled` (người chơi thạo game).

| Tham số persona | `novice` | `median` | `skilled` | Cơ sở & trạng thái xác minh |
|---|---:|---:|---:|---|
| Ex-Gaussian RT `(μ, σ, τ)` (s) | `(0.56, 0.08, 0.20)` | `(0.45, 0.05, 0.15)` | `(0.36, 0.04, 0.10)` | Gợi ý từ ví dụ go/no-go của [Moret-Tatay et al.](https://arxiv.org/abs/1707.05759); `[Prior sơ khởi — chưa đo trên game]` |
| Dung lượng Working Memory `K` | `3.3` | `4.2` | `5.2` | `≈ 4` object/chunk ([Luck & Vogel 1997](https://www.doi.org/10.1038/36846); [Cowan 2001](https://pubmed.ncbi.nlm.nih.gov/11515286/)) |
| Corsi sequential span | `5.1` | `6.2` | `7.4` | Chuẩn `6.2 ± 1.3` ([Kessels 2000 qua PsyToolkit](https://www.psytoolkit.org/library/corsi.html)) |
| Nhiễu thời điểm bấm `σ_m` (ms) | `55` | `35` | `22` | Trong dải `20..60 ms` ([Isaksen & Nealen 2015](https://ojs.aaai.org/index.php/AIIDE/article/view/12846)) |
| Thời gian chạm Fitts `t_tap` (s) | `0.40` | `0.28` | `0.20` | Dạng hàm [Fitts 1954](https://doi.org/10.1080/17470215208416600); `[Prior sơ khởi]` |
| Tỉ lệ sẩy tay `λ` | `4.5%` | `2.2%` | `1.0%` | Lapse rate theo màn; `[Prior sơ khởi]` |
| Hệ số tốc độ tính nhẩm `arithMult` | `1.28` | `1.00` | `0.78` | Nhân trên baseline RT; `[Prior sơ khởi]` |
| Độ phủ từ / nhầm dấu (`word`) | `0.72` / `14%` | `0.90` / `7%` | `0.98` / `2.5%` | `[Prior sơ khởi]` |

**Cách lấy mẫu & Hiệu ứng học:**
- Thời gian phản ứng ex-Gaussian: `Z = μ + σ·N(0,1) - τ·ln(U)`, với `U ~ Uniform(0,1)` (chỉ dùng làm mô hình mô tả đầu ra như lưu ý của Matzke & Wagenmakers trong [arXiv:1707.05759](https://arxiv.org/abs/1707.05759)).
- Hiệu ứng luyện tập theo *power law of practice* `T = A + B(n+E)^(-R)` của [Isaksen & Nealen 2015](https://ojs.aaai.org/index.php/AIIDE/article/view/12846): người chơi lên tới màn `L` đã tích luỹ kinh nghiệm qua `L - 1` màn, làm giảm `μ, τ, t_tap, arithMult` theo hệ số `f(L) = 0.86 + 0.14·(L + 1)^(-0.30)` (`[Prior sơ khởi]`). Mô phỏng tách riêng **first-attempt pass rate** và **pass trong ≤ 3 lần thử** (tăng mức luyện theo số lần thử lại tại cùng màn).

### 3.2. Mô hình bot riêng cho từng game

Ngoài biến nhị phân `pass/fail`, mọi bot đều xuất thêm chỉ số biên **`margin`** theo khuyến nghị của [Kristensen et al. 2021](https://arxiv.org/abs/2107.03305) để phân biệt các màn thắng chật vật với các màn thắng dư dả:

1. **`train`:** mô phỏng hàng đợi chuyển ngã rẽ theo thời gian thực với khóa `rootLockUntil` (ngã rẽ gốc không thể gạt cho tàu sau khi tàu trước chưa thoát khỏi ô tròn `Switch 0`). Mỗi tàu cộng chi phí nhận diện Hick–Hyman `b_hick·log2(stations)` ([Proctor & Schneider 2018](https://www.pubmed.gov/28434379/)), chi phí quét `twoTone`, thời gian bấm các công tắc theo Fitts, và xác suất lỗi tăng khi số tàu đang chạy vượt `K`. `margin = pct - 80`.
2. **`koi`:** mô phỏng theo bài toán MOT ([Alvarez & Franconeri 2007](https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f)). Dung lượng theo dõi hiệu dụng `K_mot` suy giảm theo tỷ số `swimSpeed / 36`, `turnMax / 1.6` và `scatter`. Tại mỗi bước cho ăn, số đối tượng cần theo dõi là `min(fed, koi - fed)` chịu nhiễu giao cắt quỹ đạo tỷ lệ với mật độ đàn cá nhân `cd`, cộng rủi ro bấm nhầm cá giả theo `decoyTier`. `margin = 1 - mistakes`.
3. **`mem`:** chạy tối đa `3` lượt (dừng sớm khi đạt `2` lượt hoàn hảo hoặc hết cửa). Ở mode `any`, số chunk hiệu dụng tăng theo `t` và độ phân tán `disp`, so sánh với `K` bị suy giảm nếu `show` ngắn hơn thời gian mã hoá hoặc có `delay`/`decoys`. Ở mode `seq`, so sánh `t` với `Corsi span` chịu phạt bởi nhịp sáng ngắn (`show < 0.46 s`), `delay` và `decoys`. `margin = perfect - 2`.
4. **`rain`:** mô phỏng sự kiện rời rạc (`event-driven`, không lệ thuộc tốc độ khung hình 60/120 Hz). RT cơ sở theo 14 tier bám mốc cộng nhỏ `0.72–0.80 s` ([Barrouillet & Thevenot 2013](https://access.archive-ouverte.unige.ch/access/metadata/2c3ad80b-2334-48ee-8cc9-1521d7816171/download)) và mức nhân bảng nhỏ ([Prado 2013](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00189/full)), cộng thêm chi phí có nhớ (`+0.22 s`), bài 2 bước (`+0.45 s`), tìm số thiếu (`+0.36 s`), thời gian gõ phím số (`0.22 s/chữ số`), và phạt `0.60 s` khi sẩy tay. `margin = 3 - misses`.
5. **`word`:** bot entropy có nhiễu (*noisy information-gain solver*), khởi tạo bất định `H_0` tăng theo `S_word(p)`, `strict`, và thiếu vốn từ `(1 - vocabCov)`, giảm nhờ gợi ý `hintMode`. Mỗi lượt đoán giảm entropy theo mức đạt trung bình (~`2.3 bit/lượt`, giảm khi có chữ lặp hoặc sẩy dấu thanh `diacSlip`). Ghi đồng thời tỉ lệ giải trong `6` lượt và số lượt kỳ vọng `E[tries]`. `margin = 6 - tries`.

### 3.3. Dải pass rate mục tiêu & Vòng lặp calibration (`scripts/sim/calibrate.mjs`)

- **Đường mục tiêu lượt thử đầu cho persona `median`** (`[Đề xuất thiết kế]` dựa trên kết quả người chơi thích mức dễ vừa phải của [Lomas et al. 2013](https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf), chống bỏ game sớm của [Roohi 2020](https://arxiv.org/abs/2008.12937), và dải học tốt [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) / [Wilson 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/)):
  $$p^*(L) = \max\big(0.45,\; 0.94 - 0.36\cdot D(L)\big)$$
  *(Mốc cụ thể: L1 = `94%`, L5 = `85%`, L6 thở = `87%`, L10 = `78%`, L15 = `72%`, L20 = `67%`, L25 = `62%`, L30 = `58%`, L40 = `50%`.)*
- Trong suốt 30 màn, **độ chính xác từng thao tác** (tỉ lệ tàu đúng, tỉ lệ chạm đúng cá, tỉ lệ giọt đúng) duy trì trong khoảng `82–96%`, bám sát vùng học tối ưu `~85%` của [Wilson et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/).

**Quy trình 5 bước của `calibrate.mjs`:**
1. Sinh cấu hình ban đầu từ `evalGameSpec(BB_SPEC[g], L, dOffset = 0)`.
2. Chạy `n = 1.200` seed (`mulberry32` sinh màn, `sfc32` sinh bot) cho mỗi cặp `(game, L, persona)`. Với `n = 1.200`, sai số chuẩn lớn nhất là `0.5 / sqrt(1200) = 1.44%`, tương ứng khoảng tin cậy **Wilson 95% CI** nửa bề rộng `≤ ±2.83 điểm %` ([Wilson 1927](https://doi.org/10.1080/01621459.1927.10502953)).
3. Nếu `p_median(L)` lệch quá `±4 điểm %` so với `p*(L)`, chạy **stochastic bisection** (hoặc staircase 3-down-1-up tự viết `~20` dòng kiểu [Levitt 1971](https://link.springer.com/article/10.3758/BF03204988) để tìm nhanh ngưỡng `79.4%`) điều chỉnh `dOffset[L] ∈ [-0.08, +0.08]`, tuyệt đối không vượt `hardCap`.
4. Chạy lưới 7 mức năng lực `θ ∈ {-2.4, -1.6, -0.8, 0.0, +0.8, +1.6, +2.4}` (`300` seed/mức) để fit tham số độ khó `b_L` và độ dốc phân biệt `a_L` theo mô hình **IRT 2PL** `p(θ) = 1 / (1 + exp(-a_L(θ - b_L)))` ([Wikipedia IRT](https://en.wikipedia.org/wiki/Item_response_theory)), sau đó ghi đóng băng vào `js/levels-data.js` (có thể kiểm chéo thứ tự `b_L` bằng [`mmai/glicko2js`](https://github.com/mmai/glicko2js) `MIT` theo mô hình Lichess coi mỗi màn là một player).
5. **Kiểm tra 6 cổng chấp nhận tự động (Gate T0):**
   - **G1:** `p_novice(L) ≥ 85%` trên toàn bộ `L = 1..5` (chặn churn đầu game).
   - **G2:** `|p_median(L) - p*(L)| ≤ 5 điểm %` cho L11..L30 (L1..L10 ưu tiên giữ đúng thông số hiện hành nếu `p_median ≥ 90%`).
   - **G3:** `p_skilled(L_max) ≥ 80%` (khẳng định màn cuối thắng nhờ kỹ năng).
   - **G4:** Răng cưa đúng chiều: trong mỗi chương, `b_{L+1} ≥ b_L - 0.05`; tại màn thở `5k + 1`, `b_{5k+1} < b_{5k}` và `p_median(5k+1) > p_median(5k)`.
   - **G5:** 100% knob nằm trong `[min, hardCap]` và mọi mục tiêu chạm `≥ 44 px`.
   - **G6:** Playwright smoke-test chạy trình duyệt thật với 3 seed (`L1, L15, L30`) xác nhận không kẹt UI và khớp tốc độ với Node.

**Kết quả chạy thử sơ khởi với 4 game đầu & `word` (600–1.000 seed/màn trên bộ thông số Bảng mục 2):**

| Game | L1 (Nov / Med / Skl) | L10 (Nov / Med / Skl) | L15 (Med) | L20 (Med) | L25 (Med) | L26 Thở (Med) | L30 (Nov / Med / Skl) |
|---|---|---|---|---|---|---|---|
| `train` | 100% / 100% / 100% | 97% / 100% / 100% | 100% | 97% | 72% | 82% | **1.8% / 41.2% / 91.6%** |
| `koi` | 100% / 100% / 100% | 91% / 95% / 98% | 91% | 85% | 82% | 89% | **57% / 68% / 77%** |
| `mem` | 99% / 100% / 100% | 60% / 96% / 100% | 69% | 88% | 56% | 85% | **7.1% / 43.0% / 89.6%** |
| `rain` | 100% / 100% / 100% | 100% / 100% / 100% | 100% | 100% | 95% | 96% | **0% / 53% / 99%** |
| `word` | 100% / 100% / 100% | 100% / 100% / 100% | 100% | 100% | 96% | 87% | **30% / 60% / 72%** (`6.18` lượt TB) |

*(Số liệu ở bảng trên dùng bộ prior sơ khởi của simulator trước khi đo người thật; khi hoàn tất `calibrate.mjs` với `dOffset`, mọi màn `L11..L29` còn cao hơn `p*(L)` như L15 `train`/`rain` sẽ được đẩy nhẹ qua `dOffset` trong bước bisection.)*

---

## 4. Quy tắc lặp lại cho "thêm 10 màn" và "game mới"

### 4.1. Quy tắc A — Khi Duy yêu cầu: *"Thêm 10 màn cho mỗi game"*

Giả sử mỗi game đang có `L_max` màn (`30`), cần thêm `L_max + 1 .. L_max + 10` (`31..40`). Thực hiện tuần tự 4 bước sau, **tuyệt đối không sửa thông số của `L = 1..L_max`**:

1. **Kéo dài trục `D(L)`:** giữ nguyên hằng số mẫu `6 - √6`, tính `D(L)` cho `L = 31..40` (`D(31) = 0.981 → D(40) = 1.222`). Sóng `W(L)` tự tạo 2 chương mới: màn thở `L31, L36` và màn đỉnh `L35, L40`.
2. **Kiểm trần `hardCap` & xoay cơ chế ở màn thở `L31` / `L36`:** nếu ≥ 2 knob chính đã chạm `hardCap`, **không** phá trần nhận thức mà mở 1 cơ chế mới đã dự trữ kèm 1 dòng `reliefOnUnlock`:
   - `train`: mở nhánh rẽ cấp 4 / **tàu đôi cùng màu** ở L36 (giữ `stations = 15`, `leadCells = 5`, `spawnMean ≥ 2.35 s`).
   - `koi`: đẩy `swimSpeed` tới `58 px/s`, `decoys` lên `5`, hoặc mở **lá sen che thoáng qua vùng mép hồ** ở L36 (giữ `koi ≤ 13`).
   - `mem`: mở **`mode = 'rev'` (Corsi bấm ngược từ cuối về đầu, `t = 4 → 6`)** ở L31 và `t = 7` sạch (0 mồi) ở L36, vẫn giữ lưới `6×6`.
   - `rain`: đẩy `twoStep` tới `45%`, `missingOp` tới `35%`, hoặc mở **giọt băng (cần giải 2 phép tính chồng nhau)** ở L36 (vẫn giữ `every ≥ 2.15 s`, đáp án `0..999`).
   - `word`: rút 10 cụm từ từ `SPARE_POOL` (hoặc tự biên soạn thêm cụm 2 từ thông dụng nguyên tác — tuyệt đối không cào từ điển có bản quyền), bật `blueCue = 'posOnly'` ở L31 và giảm `maxTries = 5` kèm cụm ngắn ở L36.
3. **Chạy hiệu chỉnh Node:** chạy `node scripts/sim/calibrate.mjs --from=31 --to=40` nhắm đường `p*(L) = max(0.45, 0.94 - 0.36·D(L))` (`~55% → 45%` ở `median`).
4. **Kiểm 6 cổng Gate T0 & cập nhật tĩnh:** toàn bộ G1–G6 đạt mới cập nhật `js/levels-data.js` (`BB.LV_MAX` tự cập nhật theo độ dài mảng), mở nhánh mới và tạo PR để Duy duyệt.

### 4.2. Quy tắc B — Khi Duy đưa: *"Một ý tưởng game mới"*

1. **Định vị họ nhận thức (chọn 1 trong 5 khuôn mẫu):** (a) Phản xạ – chọn đường (Hick + Fitts), (b) Theo dõi đa vật thể (MOT), (c) Trí nhớ thị giác / chuỗi (WM / Corsi), (d) Tính nhẩm – hàng đợi thời gian thực (Arithmetic + Queue), (e) Suy luận rời rạc / từ vựng (Entropy / Info Gain).
2. **Viết phiếu `BB_SPEC[newGame]`:** chọn `4–6` knob (bắt buộc có `1` knob tải chính, `1` knob áp lực thời gian/nhịp, và `2–3` cơ chế phụ mở dần ở `L11, L16, L21, L26`); ghi rõ `hardCap` theo giới hạn sinh lý và giữ mọi mục tiêu chạm `≥ 44 px`.
3. **Tách lõi thuần ngay từ dòng code đầu tiên:** viết `js/levels/<newGame>-core.js` nhận `(spec, rng)`, cấm dùng `Math.random()` hay gọi DOM trong lõi; file UI `js/<newGame>.js` chỉ đọc `BB_LEVELS[newGame][L]` và vẽ lên màn hình.
4. **Viết bot `scripts/sim/bots/<newGame>.mjs`:** lắp ghép trực tiếp các khối từ `human.mjs` (`sampleExGauss`, `K`, `corsi`, `motorSigma`, `lapse`, `f(L)`), xuất `{ pass, margin, acc }`.
5. **Calibrate & Gắn Hub:** chạy `calibrate.mjs --game=<newGame> --to=30`, kiểm đạt đủ G1–G6, thêm tên game vào `BB.GAMES`, `BB.GAME_NAME`, `hub.js`, `index.html`, `sw.js`.

---

## 5. Rủi ro, giới hạn & Kế hoạch đo dữ liệu người thật

### 5.1. Ranh giới trung thực: Đã xác minh vs Suy luận thiết kế vs Chưa có nguồn

- **Đã xác minh từ nguồn sơ cấp / thứ cấp trong `RESEARCH-KEPT.json`:** `K ≈ 4` object/chunk ([Luck & Vogel](https://www.doi.org/10.1038/36846); [Cowan](https://pubmed.ncbi.nlm.nih.gov/11515286/)); Corsi `6.2 ± 1.3` ([Kessels qua PsyToolkit](https://www.psytoolkit.org/library/corsi.html)); MOT `4 → 8` đánh đổi tốc độ ([Alvarez & Franconeri](https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f)); cộng nhỏ `640–830 ms` ([Barrouillet & Thevenot](https://access.archive-ouverte.unige.ch/access/metadata/2c3ad80b-2334-48ee-8cc9-1521d7816171/download)); nhân PSE `52 ms` ([Prado](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00189/full)); chạm `≥ 9.2–9.6 mm` ([Parhi](https://dx.doi.org/10.1145/1152215.1152260)); công thức ex-Gaussian, power-law learning, Wilson CI, Elo `U(n)`, và mapping phi tuyến bot → người ([King 2018](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf)).
- **Lựa chọn thiết kế / Prior sơ khởi (chưa có nguồn chứng minh cho game giải trí):** đường `p*(L) = max(0.45, 0.94 - 0.36·D(L))`; ngưỡng quy tắc `85%` áp cho game hành động thời gian thực; toàn bộ bảng thông số `(μ, σ, τ, t_tap, λ, arithMult, vocabCov, diacSlip)` của 3 persona; trọng số hàm `S_word(p)`.
- **Khoảng trống bắt buộc phải đo từ người chơi Việt thật:** độ dốc Hick–Hyman `b` (ms/bit) trên thao tác chạm ngã rẽ `train`; quy đổi ngưỡng tốc độ MOT từ `deg/s` sang `px/s` màn điện thoại ở `koi`; thời gian giải cộng có nhớ / trừ / chia / tìm số thiếu ở `rain`; tốc độ mã hoá `ms/ô` trong chế độ đồng thời của `mem`; và phân bố tần suất cụm 2 từ tiếng Việt có licence mở cho `word`.

### 5.2. Bảy rủi ro kỹ thuật – sản phẩm & Cách khóa rủi ro

1. **Lệch giữa Bot và Người ([King 2018](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf)):** tỷ lệ thắng của bot chỉ bảo đảm *thứ tự tương đối* giữa các màn, không chắc khớp đúng tuyệt đối với người Việt trên điện thoại. *Biện pháp:* đặt tầng hiệu chỉnh logistic `ρ_người = σ(β_0 + β_1·logit(ρ_bot))` (khởi tạo `β_0 = 0, β_1 = 1`), fit lại ngay sau đợt playtest đầu tiên.
2. **Khác biệt khung hình 60/120 Hz & Tách DOM:** logic game hiện gắn vào Canvas/rAF. Nếu bot Node chạy lệch bước thời gian `dt` hoặc lệch hình học đường cong so với trình duyệt, calibration sẽ sai. *Biện pháp:* chuẩn hoá bước thời gian cố định `dt = 1/60 s` trong cả core lẫn bot, kèm Playwright parity kiểm chéo seed thật.
3. **Bất công khi mở bản nhẹ & Mất dữ liệu `localStorage`:** người chơi xóa cache sẽ mất lịch sử `bb_log` và `θ_g` (mô tả đúng trong UI là *"lưu trên máy, không tự đồng bộ đám mây"*). *Biện pháp:* khoá bản nhẹ tối đa `1` sao với nhãn riêng và cung cấp nút sao lưu / phục hồi file JSON trong Cài đặt.
4. **Hiệu ứng học khi chơi lại (Learning Effect):** người chơi thử lại lần 2–3 thuộc nhịp xuất hiện hơn bot không có trí nhớ màn. *Biện pháp:* tách riêng chỉ số `first-attempt` và `within-3-attempts` trong báo cáo calibration, cộng đổi seed từ `attemptIdx ≥ 1`.
5. **Áp lực từ điểm Elo:** hiển thị điểm số kiểu cờ vua có thể làm trẻ em hoặc người chơi giải trí ngại thử màn khó. *Biện pháp:* giữ Elo chạy ngầm cho Daily/gợi ý, không đưa ra màn hình chính.
6. **Cạn kho cụm từ `word` & Bản quyền:** 49 cụm gốc chỉ đủ cho `L1..30` cộng `19` cụm dự phòng. *Biện pháp:* tự biên soạn thêm cụm 2 từ phổ thông khi mở L31+, qua bộ test không trùng đáp án/gợi ý như `tests/word.spec.js`, tuyệt đối không lấy từ điển đóng hoặc nguồn không rõ licence.
7. **Tương thích tiến độ người chơi cũ:** người chơi cũ đã qua L11 `train`, L13 `mem`, hoặc L31–49 `word`. *Biện pháp:* giữ L1..10 sát nguyên bản hiện tại; chạy migration một lần trong `core.js`/`hub.js` để giữ nguyên trạng thái đã hoàn thành và số sao đã có khi nâng trần `LV_MAX` lên `30`.

### 5.3. Giao thức thu thập dữ liệu người thật không cần Server

Để thay toàn bộ các `[Prior sơ khởi]` bằng số đo thực tế mà vẫn giữ lời hứa không tracking, không backend trên GitHub Pages:

1. **Nút xuất log cục bộ:** thêm mục *"Xuất nhật ký chơi thử (JSON)"* trong Cài đặt. File JSON xuất ra từ `bb_log` ghi bổ sung 5 trường tóm tắt mỗi ván: `trialAcc` (tỉ lệ thao tác đúng), `meanRT` (ms phản ứng trung vị tại `train`/`rain`/`koi`), `margin` (biên thắng/thua), `assist` (`true/false`), và `attemptsOnLevel`. Toàn bộ nằm trong `localStorage` cho tới khi người chơi chủ động bấm gửi file cho Duy.
2. **Mẫu tối thiểu đợt 1:** Duy cùng `3–5` người quen thuộc đủ 3 nhóm (`mới chơi`, `trung bình`, `chơi tốt`), mỗi người chơi **5 màn neo mỗi game** (`L1, L5, L10, L20, L30` → `25` màn/người, khoảng `35–40` phút, thu tối thiểu `25–30` lượt chơi thật tại mỗi màn neo).
3. **Vòng hiệu chỉnh một buổi sau khi gom JSON:**
   - Fit `(β_0, β_1)` trong `ρ_người = σ(β_0 + β_1·logit(ρ_bot))` bằng hồi quy logistic ([King 2018](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf)).
   - Fit lại `(μ, σ, τ)` từ `meanRT` thực tế, đo hệ số `b_hick` của `train`, ngưỡng mất dấu `K_mot` của `koi`, và số lượt đoán trung bình `E[tries]` của `word`.
   - Chạy lại `node scripts/sim/calibrate.mjs` một lần duy nhất → xuất `js/levels-data.js` bản `v1.1` đã neo theo người chơi Việt Nam thật.
