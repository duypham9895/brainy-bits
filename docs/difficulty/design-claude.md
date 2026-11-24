# Đề xuất thiết kế: hệ điều khiển độ khó "Ladder" cho Brainy Bits

Đây là bản đề xuất, chưa có code nào được viết. Mọi giá trị knob của màn 12 đến 30 là điểm khởi đầu do tác giả đặt tay. Bot Monte Carlo sẽ chỉnh lại các giá trị này trước khi ship. Review: same vendor, same priors — no external verifier ran. Phần kiểm tra mới là tác giả tự soát.

Mã nguồn đã đọc trước khi viết: `js/core.js`, `js/train.js`, `js/train-map.js`, `js/koi.js`, `js/mem.js`, `js/rain.js` và `js/word.js`, tất cả trong ``.

## 0. Sự thật từ code (đọc trực tiếp, không suy luận)

| Game | Màn hiện có | Knob thật trong code |
|---|---|---|
| train | 11 (`LV_MAX` trong core.js:203) | `stationsFor = min(4+L, 15)` (train-map.js:25). Spawn mean = `max(1.8, 2.6−0.075(L−1)) × 0.75/speedFactor`. `speedFactor = 0.45` cố định, tức tốc độ = `cell×2.6×0.45`. `burst` 15% (train.js:274). `LEVEL_TIME = 90`. Pass khi `pct ≥ 80`. Sao: 100/90/80. |
| koi | 10 | `params(d)`: koi `min(5+d, 15)`, cd `min(1.3+0.15d, 3.2)`, decoys `d≥3 ? min(1+((d−3)/2\|0), 4) : 0`. Tốc độ cá 30–42 px/s, decoy 24–36. Seed lấy từ `Math.random`. Vùng chạm là ellipse bán trục `max(0.52L, 20)` × `max(0.32L, 16)`. |
| mem | 13 | `spec(L)`: t = 2+L. size: t≤4 → 3, ≤7 → 4, ≤11 → 5, còn lại 6. `show = 1.0 + 0.3t`. `ROUNDS=3`, `NEED=2`. |
| rain | 10 | `spec(L)`: fall `max(8, 13−0.55(L−1))`, every `max(2.7, 4.6−0.2(L−1))`, target `10+L`. `makeEq` chia theo case L1..9, L≥10 dùng nhánh default (+/− ≤200, × 2–12, ÷ 2–12). Tối đa 5 giọt cùng lúc, 3 mạng. |
| word | **49** trong `word.js` (`LV_MAX = PHRASES.length`), nhưng `core.js` ghi **12** | 49 cụm sắp theo tổng số chữ cái n (5→11). `MAX_TRIES=6`. Nút gợi ý chủ đề luôn mở. |

Phát hiện cần báo, chưa sửa (đây là báo cáo, không phải yêu cầu sửa):

- **F1. word:** hub và core cắt ở 12, nhưng trong game mở được 49 màn. Người chơi có thể đã có sao ở màn 13 trở lên, nên không được sắp xếp lại 49 cụm hiện có.
- **F2. koi:** khi `fishLen` co xuống khoảng 29 px, vùng chạm còn khoảng 40×32 px. Mức này dưới 44 px (Parhi 2006, 9,2–9,6 mm, https://dx.doi.org/10.1145/1152215.1152260; quy đổi sang px là suy luận).
- **F3.** Có 3 bản `mulberry32`: core.js:192, koi.js:42 và train-map.js:11. `legal/licences.json` chưa ghi nguồn bryc (public domain, fallback MIT, https://github.com/bryc/code/blob/master/jshash/PRNGs.md).
- **F4.** Nhiều knob đã chạm trần trước màn 30: rain fall chạm 8 ở L≈10, train spawn chạm floor 1.8 ở L≈12, koi chạm 15 con ở L10. Muốn lên màn 30 thì phải mở knob mới, không thể chỉ nới `min()`/`max()`.

---

## 1. Kiến trúc: một engine chung `js/difficulty.js`

Chọn **một thuật toán chung**. Mỗi game chỉ khai báo dữ liệu (knob, trần, bảng màn) và một hàm `sim()`. Lý do: cả năm mũi research hội tụ về cùng một khung "target curve + Monte Carlo calibration". Riêng word cần một hàm đo khác (solver), nhưng vẫn cắm vào cùng một API.

### 1.1 Bốn lớp

| Lớp | Chạy ở đâu | Việc | Nguồn |
|---|---|---|---|
| L-A. Target curve | dữ liệu, tất định | Cho biết màn L cần pass rate mục tiêu p*(L) bao nhiêu và thuộc loại step, peak hay breather | abagames sqrt curve, MIT (https://abagames.github.io/joys-of-small-game-development-en/difficulty/curve.html); flow / oscillation (https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design) |
| L-B. Bảng knob tĩnh | `js/levels/<game>.js`, module thuần không DOM | `spec(L) → knobs`. Màn legacy bị đóng băng. Màn mới đọc từ bảng đã calibrate. | robatron/sudoku.js, MIT, làm phản ví dụ cho bước tuyến tính đều (https://github.com/robatron/sudoku.js) |
| L-C. Calibrator offline | `scripts/sim/*.mjs`, Node, không dependency | Bot persona chơi 1.200 seed mỗi màn, rồi bisection knob cho tới khi p ≈ p*(L) | King/Gudmundsson 2018 (https://doi.org/10.1109/CIG.2018.8490442); Roohi 2020 (https://arxiv.org/abs/2008.12937) |
| L-D. Lớp gợi ý runtime | localStorage qua `BB` | Elo/Rasch θ cho từng game. Không tự hạ độ khó âm thầm. Chỉ **hiện** gợi ý. | Pelánek 2016 (https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf); Chen Active DDA (https://www.engadget.com/2006/09/18/joystiq-qanda-jenova-chen/); Brain Workshop thresholds, GPL nên chỉ dùng ý tưởng (https://github.com/brain-workshop/brainworkshop/blob/master/brainworkshop.py) |

### 1.2 Target curve chung

```
D(L)   = sqrt((L−1)/29)                       // L=1..30 → 0..1. L>30 thì D>1 (ngoại suy)
kind(L)= L%5==0 && L>=5 ? 'peak' : (L%5==1 && L>5 ? 'breather' : 'step')
p*(L)  = 0.92 − 0.17·D(L)  − 0.06·[peak]  + 0.02·[breather]
```

| L | 1 | 2 | 3 | 4 | 5P | 6B | 7 | 8 | 9 | 10P | 11B | 12 | 13 | 14 | 15P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| p* % | 92 | 89 | 88 | 87 | 80 | 87 | 84 | 84 | 83 | 77 | 84 | 82 | 81 | 81 | 74 |

| L | 16B | 17 | 18 | 19 | 20P | 21B | 22 | 23 | 24 | 25P | 26B | 27 | 28 | 29 | 30P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| p* % | 82 | 79 | 79 | 79 | 72 | 80 | 78 | 77 | 77 | 71 | 78 | 76 | 76 | 75 | 69 |

- **Đường cong sqrt:** đầu dốc, cuối thoải (abagames, MIT).
- **Răng cưa chu kỳ 5:** lấy từ "Oscillation Method" (tense và release). Một breather được dễ hơn màn ngay trước peak, nhưng không được dễ hơn màn L−4. Như vậy mỗi chu kỳ vẫn cao hơn chu kỳ trước. Ví dụ: L11 đặt 84%, L7 là 84%.
- **Vì sao chọn 92→69% mà không chọn 95→45%** (mũi simulation đề xuất): Lomas et al. 2013 (https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf) đo trên 10K và 70K người chơi online. Họ thấy người chơi ở lại lâu hơn khi game dễ. Ví dụ: target có tỉ lệ thành công 63% cho số lượt nhiều hơn 34% so với target 29%. Roohi 2020 cho thấy nhóm yếu bỏ game sớm khi gặp độ khó cao.
- **Dải 92→69 là lựa chọn thiết kế, CHƯA có nguồn cho game.**
- **Accuracy từng thao tác** (từng giọt, từng cá, từng tàu) giữ trong 80–88%. Neo là quy tắc 85% (Wilson 2019, CC BY 4.0, https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/). Quy tắc này chỉ được chứng minh cho phân loại nhị phân học bằng SGD, nên ở đây nó là heuristic.

### 1.3 Quy tắc bậc thang (luật thiết kế, áp cho mọi game)

1. **Màn legacy đóng băng.** Màn 1..N của hôm nay giữ nguyên từng giá trị. Bot chỉ đo, không sửa. Nếu bot thấy legacy bị đảo độ khó, đưa lên Duy quyết.
2. **Mỗi màn step chỉ đổi 1 knob chính**, tối đa 2.
3. **Knob mới chỉ mở ở màn peak.** Màn peak đó hạ knob cũ một nấc (dạy trước, thử sau). Màn breather ngay sau giữ knob mới, nới knob cũ thêm một nấc.
4. **Không knob nào vượt `hardCap`.** `hardCap` lấy từ giới hạn người: K≈4 (Luck & Vogel, https://www.doi.org/10.1038/36846; Cowan, https://pubmed.ncbi.nlm.nih.gov/11515286/), MOT, target ≥44 px.
5. **Kích thước target không bao giờ là trục khó** (Parhi 2006).
6. **Knob đếm được mà người chơi nhìn thấy** (số ga, số cá, số ô, độ dài cụm từ) không bao giờ đổi giữa ván.

### 1.4 API đề xuất (vanilla, không build step)

```js
// js/levels/koi.js — chạy được cả browser (globalThis) lẫn Node (import qua vm/require)
globalThis.BB_LEVELS = globalThis.BB_LEVELS || {};
BB_LEVELS.koi = {
  legacyN: 10,
  knobs: [ // thứ tự = priority khi knob trước chạm trần
    { name:'cd',     dir:+1, hardCap:3.2,  step:0.15 },
    { name:'spdMul', dir:+1, hardCap:1.5,  step:0.05, unlockAt:15 },
    { name:'decoys', dir:+1, hardCap:6,    step:1,    unlockAt:20 },
    { name:'turnMul',dir:+1, hardCap:1.6,  step:0.1,  unlockAt:25 },
  ],
  table: [ /* L1..30, mỗi phần tử {koi, cd, decoys, spdMul, turnMul} */ ],
  calibratedAt: '2026-11-2x', simVersion: 1,
};

// js/difficulty.js
BB.DIFF = {
  curve(L)          // → {D, kind, pStar}
  spec(game, L)     // → bảng knob của màn L (đọc từ BB_LEVELS[game].table)
  max(game)         // → table.length (thay LV_MAX hard-code, sửa luôn F1)
  rng(game, L, n)   // → mulberry32(cyrb53(`${game}|${L}|${n}`)), n = số lần thử
  rate(game, L, won)// Elo cục bộ, xem §1.5
  suggest(game)     // → {next, easier?:bool}
};
```

- **Seed tất định:** `seed = hash(game, L, attemptNo)`. Mỗi lần thử khác nhau nhưng tái lập được, nên bot và trang web chạy đúng cùng một màn. Daily vẫn giữ `BB.dayKey`. Thay 34 lời gọi `Math.random` trong logic sinh màn bằng rng được truyền vào. Phần hiệu ứng (particles) giữ nguyên.
- **Game mới cắm vào** bằng cách khai `BB_LEVELS.<g>` và một hàm `sim()` trong `scripts/sim/<g>.mjs` (§4.2).

### 1.5 Lớp runtime (nhẹ, không âm thầm)

- `θ_g` (logit) cho từng game. Công thức: `θ += U(n)·(won − σ(θ − b_L))`, với `U(n)=1/(1+0.05n)` (Pelánek 2016).
- `b_L = logit(1 − p_bot(L))` lấy từ calibration. Độ khó màn đóng băng vì không có server để học từ đám đông như Lichess (lila là AGPL, chỉ mượn ý tưởng).
- Trạng thái `{θ, n}` tính lại được từ `bb_log` có sẵn.
- **Gợi ý lùi:** nếu thua 2 lần liên tiếp **và** `σ(θ−b_L) < 0.5`, hiện nút "Thử bản nhẹ hơn". Đây là một nấc trên knob chính của màn, tối đa −15% (clamp theo cảnh báo rubber band, Hunicke/Hamlet, https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf). Người chơi tự bấm (Chen). Thua 3 lần liên tiếp thì gợi ý quay lại L−1 (hysteresis kiểu Brain Workshop: lên ≥80%, lùi khi <50% ba lần).
- **Không bật lớp thích nghi trong ván** (Kaernbach weighted up-down) ở phase 1. Lý do: sao và điểm sẽ không còn gắn với một spec cố định. Ván ngắn (train 90 s, mem 3 lượt) cũng làm staircase bị bias (García-Pérez 1998: ≤20 reversals thì lệch). Để lại làm tuỳ chọn phase 2.
- **Cần Duy quyết:** thắng bằng "bản nhẹ" có tính sao riêng không, và có hiện số θ cho người chơi không.

---

## 2. Bảng 30 màn cho từng game

Quy ước: **in đậm = knob đổi ở màn đó**. P = peak, B = breather.

### 2.1 train (legacyN = 11)

Knob mới tách khỏi công thức cũ. `spawnS` là spawn mean thực tế tính bằng giây. Legacy tính bằng `m×0.75/0.45`. `speedF` được tách ra để tăng tốc tàu không kéo theo tăng spawn. `burstP` là xác suất "dồn dập".

`hardCap`:
- stations 15: giữ `MAX_STATIONS`. Hick H = log2 15 ≈ 3,9 bit. Slope ms/bit **chưa xác minh**.
- spawnS ≥ 2.3 s.
- speedF ≤ 0.58. Thời gian tàu đi qua một ô là `1/(2.6·speedF)`: 0,85 s ở 0.45 và 0,66 s ở 0.58, so với RT ex-Gaussian mean khoảng 0,6 s.
- burstP ≤ 0.30.
- Timer 90 s và ngưỡng pass 80% **không phải knob**, vì sao gắn với 80/90/100.

| L | stations | spawnS | speedF | burstP | | L | stations | spawnS | speedF | burstP |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5 | 4.33 | .45 | .15 | | 16B | 15 | **3.00** | .50 | .15 |
| 2 | 6 | 4.21 | .45 | .15 | | 17 | 15 | **2.85** | .50 | .15 |
| 3 | 7 | 4.08 | .45 | .15 | | 18 | 15 | **2.78** | .50 | .15 |
| 4 | 8 | 3.96 | .45 | .15 | | 19 | 15 | **2.70** | .50 | .15 |
| 5 | 9 | 3.83 | .45 | .15 | | 20P | 15 | **2.78** | .50 | **.22** |
| 6 | 10 | 3.71 | .45 | .15 | | 21B | 15 | **2.85** | .50 | .22 |
| 7 | 11 | 3.58 | .45 | .15 | | 22 | 15 | **2.70** | .50 | .22 |
| 8 | 12 | 3.46 | .45 | .15 | | 23 | 15 | **2.62** | .50 | .22 |
| 9 | 13 | 3.33 | .45 | .15 | | 24 | 15 | **2.55** | .50 | .22 |
| 10 | 14 | 3.21 | .45 | .15 | | 25P | 15 | **2.62** | **.55** | .22 |
| 11 | 15 | 3.08 | .45 | .15 | | 26B | 15 | **2.70** | .55 | .22 |
| 12 | 15 | **3.00** | .45 | .15 | | 27 | 15 | **2.55** | .55 | .22 |
| 13 | 15 | **2.92** | .45 | .15 | | 28 | 15 | **2.48** | .55 | .22 |
| 14 | 15 | **2.85** | .45 | .15 | | 29 | 15 | **2.40** | .55 | .22 |
| 15P | 15 | **2.92** | **.50** | .15 | | 30P | 15 | 2.40 | .55 | **.28** |

Số tàu mỗi màn khoảng 90/spawnS: khoảng 21 ở L1 và khoảng 37 ở L30. Floor của burst trong code (`max(2.0, …)`) vẫn giữ.

### 2.2 koi (legacyN = 10)

Số koi dừng ở 15 vì L10 đã gấp khoảng 2 lần mốc MOT 4. Theo dõi tới 8 chỉ được khi cá chậm (Alvarez & Franconeri 2007, https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f). Vì vậy trục mới là tốc độ (`spdMul`), decoy và độ đổi hướng (`turnMul`, knob mới: nhân tần suất `turnTarget`). Không tăng số cá cùng lúc với tốc độ.

`hardCap`: koi 15, cd 3.2, spdMul 1.5, decoys 6, turnMul 1.6. Vùng chạm ≥44 px (sửa F2 trước).

| L | koi | cd | decoys | spdMul | turnMul | | L | koi | cd | decoys | spdMul | turnMul |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6 | 1.45 | 0 | 1.00 | 1.0 | | 16B | 15 | **3.00** | 4 | 1.10 | 1.0 |
| 2 | 7 | 1.60 | 0 | 1.00 | 1.0 | | 17 | 15 | **3.20** | 4 | 1.10 | 1.0 |
| 3 | 8 | 1.75 | 1 | 1.00 | 1.0 | | 18 | 15 | 3.20 | 4 | **1.15** | 1.0 |
| 4 | 9 | 1.90 | 1 | 1.00 | 1.0 | | 19 | 15 | 3.20 | 4 | **1.20** | 1.0 |
| 5 | 10 | 2.05 | 2 | 1.00 | 1.0 | | 20P | 15 | 3.20 | **5** | **1.15** | 1.0 |
| 6 | 11 | 2.20 | 2 | 1.00 | 1.0 | | 21B | 15 | 3.20 | 5 | **1.10** | 1.0 |
| 7 | 12 | 2.35 | 3 | 1.00 | 1.0 | | 22 | 15 | 3.20 | 5 | **1.20** | 1.0 |
| 8 | 13 | 2.50 | 3 | 1.00 | 1.0 | | 23 | 15 | 3.20 | 5 | **1.25** | 1.0 |
| 9 | 14 | 2.65 | 4 | 1.00 | 1.0 | | 24 | 15 | 3.20 | 5 | **1.30** | 1.0 |
| 10 | 15 | 2.80 | 4 | 1.00 | 1.0 | | 25P | 15 | 3.20 | 5 | **1.25** | **1.3** |
| 11B | 15 | **2.65** | **3** | 1.00 | 1.0 | | 26B | 15 | 3.20 | 5 | **1.20** | 1.3 |
| 12 | 15 | **2.95** | **4** | 1.00 | 1.0 | | 27 | 15 | 3.20 | 5 | **1.30** | 1.3 |
| 13 | 15 | **3.10** | 4 | 1.00 | 1.0 | | 28 | 15 | 3.20 | **6** | **1.35** | 1.3 |
| 14 | 15 | **3.20** | 4 | 1.00 | 1.0 | | 29 | 15 | 3.20 | 6 | **1.40** | 1.3 |
| 15P | 15 | **3.10** | 4 | **1.10** | 1.0 | | 30P | 15 | 3.20 | 6 | 1.40 | **1.5** |

Lưu ý: L28 đổi 2 knob, vẫn trong giới hạn. Nếu bot cho thấy L10 với legacy đã dưới p* (77%), thì L11–30 phải phẳng hơn, tức `spdMul` tối đa khoảng 1.25. **Đây là rủi ro lớn nhất của koi.**

### 2.3 mem (legacyN = 13)

Công thức `t = 2+L` không được kéo tiếp. L30 sẽ ra 32/36 ô, khi đó người chơi chỉ cần nhớ 4 ô tối, tức độ khó đảo ngược.

Luật trần: `t ≤ floor(size²/2)`. `size ≤ 6`, vì 7 cột trên viewport 320 px trừ gutter còn khoảng 41 px/ô, dưới 44 px. Trục mới là `k`, số giây nhìn cho mỗi ô: `show = 1.0 + k·t`. k có floor 0.18 (thời gian encoding mỗi item **chưa có nguồn**, phải đo). Chế độ nhớ theo thứ tự kiểu Corsi (6,2 ± 1,3, https://www.psytoolkit.org/library/corsi.html; jspsych plugin-corsi-blocks là MIT) để dành làm knob kế tiếp khi t và k chạm trần (L31+).

| L | size | t | k | show s | | L | size | t | k | show s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 3 | .30 | 1.90 | | 16B | 6 | **15** | **.27** | 5.05 |
| 2 | 3 | 4 | .30 | 2.20 | | 17 | 6 | **16** | .27 | 5.32 |
| 3 | 4 | 5 | .30 | 2.50 | | 18 | 6 | 16 | **.26** | 5.16 |
| 4 | 4 | 6 | .30 | 2.80 | | 19 | 6 | 16 | **.25** | 5.00 |
| 5 | 4 | 7 | .30 | 3.10 | | 20P | 6 | **17** | **.26** | 5.42 |
| 6 | 5 | 8 | .30 | 3.40 | | 21B | 6 | **16** | **.24** | 4.84 |
| 7 | 5 | 9 | .30 | 3.70 | | 22 | 6 | **17** | .24 | 5.08 |
| 8 | 5 | 10 | .30 | 4.00 | | 23 | 6 | 17 | **.23** | 4.91 |
| 9 | 5 | 11 | .30 | 4.30 | | 24 | 6 | 17 | **.22** | 4.74 |
| 10 | 6 | 12 | .30 | 4.60 | | 25P | 6 | **18** | **.23** | 5.14 |
| 11 | 6 | 13 | .30 | 4.90 | | 26B | 6 | **17** | **.21** | 4.57 |
| 12 | 6 | 14 | .30 | 5.20 | | 27 | 6 | **18** | .21 | 4.78 |
| 13 | 6 | 15 | .30 | 5.50 | | 28 | 6 | 18 | **.20** | 4.60 |
| 14 | 6 | 15 | **.28** | 5.20 | | 29 | 6 | 18 | **.19** | 4.42 |
| 15P | 6 | **16** | .30 | 5.80 | | 30P | 6 | 18 | **.18** | 4.24 |

`ROUNDS=3` và `NEED=2` giữ nguyên. Stagger `t*step` vẫn cộng thêm vào show như code hiện tại.

### 2.4 rain (legacyN = 10)

Thời gian rơi không phải nút cổ chai. Một phép cộng nhỏ chỉ mất khoảng 0,64–0,83 s (Barrouillet & Thevenot 2013, https://access.archive-ouverte.unige.ch/access/metadata/2c3ad80b-2334-48ee-8cc9-1521d7816171/download). Trục khó là `every` (độ dày giọt) và tầng phép tính `ops`.

Phép tính mới chỉ chiếm **30%** số giọt, 70% còn lại là bộ O10 hiện có. Lý do: hiệu ứng problem-size (Prado 2013, https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00189/full) và thời gian giải phép 2 chữ số × 1 chữ số **chưa có số đo**.

`hardCap`: every ≥ 2.2 s, fall ≥ 6.8 s, target ≤ 25 (giữ màn khoảng 1 phút), tối đa 5 giọt (giữ nguyên).

Các tầng phép tính:

| Tầng | Nội dung |
|---|---|
| O10 | Bộ default hiện tại |
| O11 | O10 + tìm số thiếu `? + b = c` (c ≤ 50) |
| O12 | O10 + ba số hạng trong 50 (`a + b − c`) |
| O13 | O10 + 2 chữ số × 1 chữ số (11–25 × 2–9) |
| O14 | Trộn O11 + O12 + O13 (mỗi loại 10%) |

| L | ops | fall | every | target | | L | ops | fall | every | target |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | L1 | 13.00 | 4.6 | 11 | | 16B | O11 | **8.30** | **2.80** | 22 |
| 2 | L2 | 12.45 | 4.4 | 12 | | 17 | O11 | **8.05** | **2.60** | **23** |
| 3 | L3 | 11.90 | 4.2 | 13 | | 18 | O11 | **7.80** | **2.50** | 23 |
| 4 | L4 | 11.35 | 4.0 | 14 | | 19 | O11 | **7.60** | **2.40** | **24** |
| 5 | L5 | 10.80 | 3.8 | 15 | | 20P | **O12** | 7.60 | **2.50** | 24 |
| 6 | L6 | 10.25 | 3.6 | 16 | | 21B | O12 | **7.80** | **2.60** | 24 |
| 7 | L7 | 9.70 | 3.4 | 17 | | 22 | O12 | **7.60** | **2.40** | **25** |
| 8 | L8 | 9.15 | 3.2 | 18 | | 23 | O12 | **7.40** | **2.35** | 25 |
| 9 | L9 | 8.60 | 3.0 | 19 | | 24 | O12 | **7.20** | **2.30** | 25 |
| 10 | O10 | 8.05 | 2.8 | 20 | | 25P | **O13** | **7.40** | **2.40** | 25 |
| 11B | O10 | **8.60** | **3.00** | 20 | | 26B | O13 | **7.60** | **2.50** | 25 |
| 12 | O10 | **8.30** | **2.80** | **21** | | 27 | O13 | **7.20** | **2.30** | 25 |
| 13 | O10 | **8.05** | **2.70** | 21 | | 28 | O13 | **7.00** | **2.25** | 25 |
| 14 | O10 | 8.05 | **2.60** | **22** | | 29 | O13 | **6.80** | **2.20** | 25 |
| 15P | **O11** | 8.05 | **2.70** | 22 | | 30P | **O14** | 6.80 | **2.25** | 25 |

Rain là ngoại lệ có chủ đích của luật "1 knob mỗi màn". fall và every luôn đi cặp, vì fall/every ≈ số giọt trên màn hình, và đây là biến mà người chơi cảm nhận. Ngoài ra target tăng chậm. Bot phải kiểm lại cặp này.

### 2.5 word (đã có 49 màn, không sắp lại)

Đề xuất: **giữ nguyên thứ tự 49 cụm** (F1: sao có thể đã gắn với index). Việc cần làm:
- (a) sửa `core.js LV_MAX.word` để lấy theo `PHRASES.length`, hoặc cắt word ở 30, việc này cần Duy chốt;
- (b) chạy solver bot đo D_word cho cả 49 cụm và báo chỗ nào không đơn điệu;
- (c) mọi cụm thêm mới (50+) được xếp theo D_word.

Knob đo được của mỗi cụm: n (tổng chữ cái), số dấu thanh khác "ngang", số chữ lặp, tần suất từ (chưa có corpus tiếng Việt kiểm được licence), entropy còn lại sau lượt 1. Các predictor này lấy theo DiSilvio et al. 2023, CC BY 4.0 (https://arxiv.org/abs/2311.16777v1). Gợi ý chủ đề: giữ mở ở 1–49. Từ màn 50, gợi ý chỉ mở sau lượt 3. Việc này cần Duy chốt.

| L | cụm | n | dấu | lặp | | L | cụm | n | dấu | lặp |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | bà nội | 5 | 2 | 0 | | 16 | đồng hồ | 6 | 2 | 1 |
| 2 | cà phê | 5 | 1 | 0 | | 17 | du lịch | 6 | 1 | 0 |
| 3 | áo dài | 5 | 2 | 1 | | 18 | âm nhạc | 6 | 1 | 1 |
| 4 | phở bò | 5 | 2 | 1 | | 19 | khiêu vũ | 7 | 1 | 1 |
| 5 | ước mơ | 5 | 1 | 1 | | 20 | hoa hồng | 7 | 1 | 2 |
| 6 | xe đạp | 5 | 1 | 0 | | 21 | bãi biển | 7 | 2 | 2 |
| 7 | bánh mì | 6 | 2 | 0 | | 22 | gia đình | 7 | 1 | 1 |
| 8 | trà sữa | 6 | 2 | 1 | | 23 | học sinh | 7 | 1 | 1 |
| 9 | mùa thu | 6 | 1 | 1 | | 24 | bầu trời | 7 | 2 | 0 |
| 10 | con mèo | 6 | 1 | 1 | | 25 | mặt trời | 7 | 2 | 1 |
| 11 | bún chả | 6 | 2 | 0 | | 26 | máy tính | 7 | 2 | 0 |
| 12 | sân bay | 6 | 0 | 1 | | 27 | thư viện | 7 | 1 | 0 |
| 13 | núi lửa | 6 | 2 | 1 | | 28 | bạn thân | 7 | 1 | 2 |
| 14 | nụ cười | 6 | 2 | 1 | | 29 | cầu vồng | 7 | 2 | 0 |
| 15 | bóng đá | 6 | 2 | 0 | | 30 | mưa phùn | 7 | 1 | 1 |

Cột "lặp" được đếm theo chữ gốc sau NFD, nên chỉ là ước lượng thô. Word không theo răng cưa, vì không thể sắp lại cụm đã có.

---

## 3. Người chơi mô phỏng và vòng calibration

### 3.1 Persona dùng chung (`scripts/sim/human.mjs`)

| Tham số | novice | median | skilled | Nguồn / trạng thái |
|---|---|---|---|---|
| RT ex-Gaussian μ/σ/τ (ms) | 585/50/195 | 450/50/150 | 360/50/120 | Dạng ex-Gaussian: https://arxiv.org/abs/1707.05759. Số median mượn từ ví dụ go/no-go, **chưa calibrate cho game**. Hệ số ×1.3 và ×0.8 là đề xuất. |
| Motor noise σ_m (ms, áp lên thời điểm) | 60 | 40 | 20 | Isaksen & Nealen 2015 quét 20–60 ms (https://ojs.aaai.org/index.php/AIIDE/article/view/12846) |
| WM capacity K | N(3.5,1) | N(4,1) | N(4.5,1), cắt [2,7] | Luck & Vogel 1997; Cowan 2001 |
| Lapse λ (bấm bừa hoặc bỏ lỡ) | .05 | .03 | .015 | **Đề xuất, chưa có nguồn** |
| Learning khi thử lại | `T = A + B(n+E)^−R` áp lên σ_m, τ, λ | | | Isaksen 2015 (trích Lane 1987). A, B, R chưa có số. |
| Hick `a + b·log2(n)` | b phải fit từ playtest | | | Proctor & Schneider 2018 (https://www.pubmed.gov/28434379/). Slope ms/bit **chưa xác minh**. |
| Fitts `a + b·log2(D/W+1)` | a, b fit từ playtest | | | Fitts 1954 |

### 3.2 Bot theo từng game (tự viết, không copy code)

| Game | Mô hình |
|---|---|
| train | Mỗi tàu tới switch tạo một quyết định với deadline = quãng đường tới switch / tốc độ. Bot đúng nếu `RT + Hick(stations) + Fitts + N(0,σ_m) < deadline`. Nhiều tàu cùng lúc được xử lý theo hàng đợi một luồng. Với xác suất λ, bot bật switch sai. Pass khi ≥80%. Margin = % vượt 80. |
| koi | Bot nhớ tập cá đã ăn. Với mỗi lần cho ăn, P(chọn trùng) tăng khi `|fed| > K_eff`, trong đó `K_eff = K·g(spdMul, turnMul, crowding)`. g(1,1) cho phép tới khoảng 8 khi cá chậm (Alvarez & Franconeri). **Dạng của g chưa có nguồn, phải fit.** Decoy: nhầm với xác suất phụ thuộc thời gian nhìn còn lại trước khi hết cooldown. Thời điểm chạm cộng motor noise lên vị trí cá đang bơi. Pass khi ≤1 lỗi. |
| mem | chunk = số thành phần liên thông 4 hướng của các ô sáng. Số chunk mã hoá được = `min(K, show/τ_enc)`, với τ_enc **chưa có nguồn**. Một lượt hoàn hảo khi `chunks ≤ K_eff` và không lapse trên t lần chạm, tức `(1−λ)^t`. Pass khi đúng 2/3 lượt. |
| rain | Mỗi giọt: thời gian giải = RT + chi phí phép tính (cộng nhỏ khoảng 0,7 s; problem-size tăng theo tổng; PSE của × là 52–144 ms; chi phí cho có nhớ, ba số hạng và 2×1 **ước lượng, chưa có nguồn**) + gõ phím mỗi chữ số theo Fitts. Mô phỏng hàng đợi 5 slot. Giọt hết `fall` thì mất mạng. Lỗi tính theo tầng phép. |
| word | Entropy solver chọn ngẫu nhiên trong top-k. Vốn từ giới hạn theo persona (biết k% cụm). Có xác suất bỏ sót dấu thanh. Novice mở gợi ý sau lượt 3. Đích ở màn giữa: trung bình 3,5–4,5 lượt. Mốc này mượn từ Wordle tiếng Anh, là bằng chứng yếu. |

### 3.3 Vòng calibration (`scripts/sim/calibrate.mjs`)

0. Tiền đề: tách `spec/gen/makeEq/params` ra `js/levels/<game>.js` dạng module thuần với rng được truyền vào. Mô phỏng chạy theo bước thời gian cố định (dt = 1/60) với đồng hồ giả, để tốc độ không phụ thuộc màn hình 60 hay 120 Hz.
1. Với mỗi màn L và mỗi persona, chạy **n = 1.200 seed** (mulberry32). Báo p, Wilson 95% CI (Wilson 1927) và E[attempts] = 1/p.
2. Màn legacy: chỉ đo, ghi vào báo cáo, không sửa.
3. Màn mới: bisection trên **knob chính của màn đó** (knob in đậm) cho tới khi p của median nằm trong p*(L) ± 5 điểm và CI nằm trọn trong dải. Nếu knob chạm `hardCap` thì chuyển sang knob kế tiếp trong `knobs[]`. Staircase 3-down-1-up (Levitt 1971, khoảng 79,4%) dùng để dò nhanh ngưỡng của từng persona.
4. Gate T0 (chạy trong CI), FAIL nếu vi phạm bất kỳ điều kiện nào:
   - (a) p_median không tăng giữa các màn liên tiếp, trừ màn breather;
   - (b) breather dễ hơn peak liền trước nhưng không dễ hơn màn L−4;
   - (c) novice đạt ≥85% ở L1–5 và ≥60% ở mọi breather (ngưỡng là đề xuất);
   - (d) skilled đạt ≥50% ở L30, nghĩa là "khó nhưng người làm được";
   - (e) không knob nào vượt `hardCap`;
   - (f) learning: chạy chuỗi L1→L30 liên tục, báo riêng first-attempt pass và pass trong ≤3 lần.
5. Ghi `table[]` vào `js/levels/<game>.js` kèm `calibratedAt` và `simVersion`. Ghi b_L vào `levels-<game>.json` để lớp Elo runtime đọc.
6. Ánh xạ bot sang người: `ρ_người = σ(β0 + β1·logit ρ_bot)`, khởi tạo β0=0, β1=1. Sau khi Duy và 2–3 người chơi xong L1–15 và bấm nút "Xuất JSON" (chỉ đọc `bb_log`, không gửi đi đâu), fit lại β và μ/σ/τ của persona, rồi chạy lại bước 3. Cách làm theo King 2018, nơi mapping từ bot sang người là phi tuyến.

---

## 4. Rule viết sẵn (đề xuất lưu tại "gates/03-build/DIFFICULTY-RULE.md" — bản chốt hiện tại: `docs/DIFFICULTY-RULES.md`, sau khi Duy duyệt)

### 4.1 Lệnh "thêm 10 màn cho mỗi game"

1. Đọc `js/levels/<game>.js`: `legacyN`, `knobs[]` theo thứ tự priority, `table[]` hiện có, và báo cáo calibration gần nhất.
2. Kéo L lên N+1..N+10. D(L) = sqrt((L−1)/29) được phép lớn hơn 1. p*(L) dùng cùng công thức nhưng **không bao giờ dưới 0.65**. Lịch peak (5k) và breather (5k+1) giữ nguyên.
3. Knob nào chưa chạm trần thì tăng theo `step`. Knob chạm trần thì mở knob kế tiếp ở màn peak đầu tiên. Nếu hết knob, đề xuất knob mới cho Duy kèm mockup (Quy tắc 9) và **dừng**. Knob kế tiếp đã lên sẵn:

| Game | Knob kế tiếp đã lên sẵn |
|---|---|
| train | Ga hai màu (`st.a ≠ st.b`), cần SWE kiểm lại renderer |
| koi | Cá đổi tốc độ bất chợt (`boost`) |
| mem | Chế độ thứ tự Corsi, độ dài 4→7 |
| rain | ÷ thương ≤ 25 |
| word | Gợi ý mở sau lượt 3 cho cụm mới |

4. Chạy `node scripts/sim/calibrate.mjs <game> --from N+1`. Gate T0 xanh mới được commit (branch `feat/levels-<game>-<to>`, theo LUẬT 12).
5. `BB.DIFF.max(game)` tự tăng, không sửa `LV_MAX` bằng tay.
6. Ghi một dòng có ngày vào `PIPELINE.md` Log.

### 4.2 Lệnh "game mới: <ý tưởng>"

1. S0/S1 theo `docs/stages.md` của Vibe. Ở S1 phải khai:
   - trục khó, mỗi trục có `{name, dir, min, hardCap, step, unlockAt, nguồn trần người}`;
   - pass rule và star rule;
   - một trial là gì, để tính accuracy 80–88%.
2. Viết `js/levels/<g>.js` (spec và gen thuần, rng truyền vào) và `scripts/sim/<g>.mjs` với `sim(spec, persona, rng) → {pass, margin, trials, correct}`, chỉ ghép các khối có sẵn trong `human.mjs`.
3. Đặt tay L1 (p* ≈ 92%) và L30 (skilled ≥50%), để calibrator điền L2–29 theo §3.3.
4. Kiểm licence mọi ý tưởng và code. Chỉ dùng MIT, BSD, ISC, CC0, Apache hoặc public domain, và ghi `legal/licences.json`.

---

## 5. Rủi ro, chưa xác minh, cần dữ liệu người thật

| # | Rủi ro / chưa xác minh | Hậu quả | Cách xử lý |
|---|---|---|---|
| R1 | Pass rate thật của các màn legacy (koi L10 với 15 cá, mem L13 với 15 ô) chưa ai đo. Cả hai đã vượt K≈4 rất xa. | Nếu legacy đã quá khó thì L11–30 xây trên nền sai | Đo legacy bằng bot trước, rồi Duy chơi thử. Nếu lệch, đưa thành một câu hỏi cho Duy, không tự sửa. |
| R2 | Mọi tham số người (μ/σ/τ, σ_m, λ, τ_enc, slope Hick, g() của koi, chi phí phép có nhớ và 2×1) đều mượn từ lab hoặc là đề xuất | Bot pass ≠ người pass | Playtest 2–3 người, xuất JSON, fit β (King 2018) |
| R3 | Dải p* 92→69, chu kỳ 5, offset −0.06/+0.02 là lựa chọn thiết kế, không có nguồn cho game | Đường cong có thể "cảm" sai | Chỉnh sau khi có dữ liệu `bb_log` thật |
| R4 | Quy tắc 85% chỉ chứng minh cho phân loại nhị phân bằng SGD; Levitt và García-Pérez mới đọc qua nguồn thứ cấp | Neo per-trial có thể lệch | Coi là heuristic |
| R5 | word: chưa có corpus tần suất tiếng Việt được kiểm licence, chưa có solve rate tiếng Việt; mốc 4,5 lượt chỉ dựa trên một ngày Wordle | D_word thiếu một predictor | Tạm bỏ tần suất, dùng n, dấu, lặp và entropy |
| R6 | F1: word 49 so với core 12 | Hub hiển thị sai tiến độ | Duy chốt cắt 30 hay mở 49 |
| R7 | F2: vùng chạm koi < 44 px khi cá co | Lỗi bấm trượt bị người chơi đọc là game sai | Sửa trước khi tăng `spdMul` |
| R8 | Bot không mô hình được mệt mỏi, tilt, và sự phụ thuộc giữa các trial (vi phạm giả định i.i.d. của staircase) | Train 90 s có thể khó hơn mô phỏng | Thêm tham số fatigue sau khi có log |
| R9 | ε của MOT tính bằng deg/s chưa lấy được (PDF lỗi 403) | Trần `spdMul` 1.5 là đoán | Fit bằng playtest |
| R10 | Mọi rating nằm trong localStorage | Xoá dữ liệu trình duyệt là mất θ, nhưng tính lại được từ `bb_log` nếu log còn | Ghi rõ, không hứa "bền" |

**Việc chỉ Duy làm được:** chơi thử L1–15 mỗi game rồi xuất JSON; chốt word 30 hay 49; chốt sao cho bản nhẹ và việc có hiện θ hay không; duyệt rule §4 trước khi lưu vào `gates/`.