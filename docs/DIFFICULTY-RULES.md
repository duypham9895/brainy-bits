# Luật độ khó Brainy Bits — làm theo khi Duy nói "thêm 10 màn" hoặc đưa ý tưởng game mới

Viết 2026-11-21, viết lại cùng ngày sau khi Duy gỡ E3 (màn cũ được chỉnh theo một khuôn chung).
Nguồn: `docs/difficulty/MERGED-SPEC.md` §4, `gates/01-spec/DIFFICULTY-DECISIONS.md`. Đọc khoảng 7 phút.

**TL;DR.**
- Mọi game theo **một khuôn**: L1–9 là bước tăng đều, răng cưa bắt đầu từ L10 (đỉnh ở `5k` với k ≥ 2, màn thở
  ở `5k+1` từ L11), tỉ lệ qua mục tiêu `p*(L)`, và mọi gate (B, G1–G6, G8) chấm **mọi màn** ở N đầy đủ
  (1200, koi 2000). Bảng chỉ được miễn gate B, có lý do viết ra (`gateWaivers`, §2).
- **Gate B một chiều ở hai chỗ (Duy chọn A, 2026-11-22):** L1–9 (trước đỉnh đầu) và mọi màn thở chỉ đánh trượt
  khi màn **quá khó** (median < p* − 0,05); dễ hơn p* không bị bắt. Màn thở còn bỏ vế "khó hơn L−4" của G3, giữ
  "dễ hơn đỉnh trước"; G4 (weak ≥ 60%) không đổi. Từ đỉnh đầu, màn bước vẫn hai chiều như cũ. Hai công tắc:
  `B_EASY_OK_BEFORE_SAW`, `BREATHER_EASY_OK` trong `js/difficulty.js` (Phụ lục C).
- Màn nằm trong `js/levels/<game>.js`: `levels: [...]` cho L1..n viết tay, engine `js/difficulty.js`
  (`window.BBD`) sinh tiếp từ dòng n.
- Đổi màn đã ship = tăng `version` + migration giữ số màn đã qua (§5). Thêm màn ở cuối thì không cần.
- **4 game qua mọi gate, word qua mọi gate trừ B (WAIVED) (2026-11-22, N đầy đủ, sau hai công tắc trên).** train, koi, mem xanh L1–40; word
  xanh L1–49 với B **WAIVED** (không tính là PASS); rain xanh L1–30 ở N 1200 và L26–40 ở N 4000 (ở N 1200, G2
  L37→38 lật theo seed — N lớn hơn làm dung sai G2 hẹp hơn, tức khó hơn chứ không dễ hơn). Không nới gate,
  không sửa `human.mjs`, không waiver mới. Còn mở (không phải gate trượt): từ L10, bot yếu ở rain chỉ qua
  10–20% màn bước/đỉnh — khoảng cách trong `human.mjs`, chưa đối chiếu người thật (G7 SKIP, §3).
  *(Lịch sử: 2026-11-21 → 22 trước hai công tắc trên, mem trượt B L4/L5 và rain trượt B/G3 — xem §3.)*

## 1. Đọc trước, theo thứ tự

| # | File | Tìm gì |
|---|---|---|
| 1 | `gates/01-spec/DIFFICULTY-DECISIONS.md` | Câu trả lời mới nhất của Duy cho E1–E5 và xung đột B/G1. Dòng cuối là quyết định mới nhất. |
| 2 | `js/levels/<game>.js` | `version`, số dòng `levels`, knob nào còn chỗ trước `hardCap`, knob nào là `rule: true` (khoá bởi E5). |
| 3 | `docs/difficulty/calibration-<game>.json` | Lần đo gần nhất: tỉ lệ qua từng màn, gate nào sát ngưỡng. |
| 4 | `node -e` in `BBD.level(game, L)` cho màn cuối và L+10 (xem `scripts/sim/load-bbd.mjs`) | Engine sẽ sinh gì nếu không sửa gì. |

## 2. Khuôn chung (giống nhau ở mọi game, không có ngoại lệ theo game)

| Phần | Luật | Ở đâu |
|---|---|---|
| Nhịp | `kind(L)`: đỉnh khi `L ≥ 10` và `L % 5 = 0`; màn thở khi `L > 10` và `L % 5 = 1`; còn lại là bước. L1–9 là bước, không có đỉnh L5 (Duy 2026-11-21, để G1 giữ được). Đảo lại: `SAW_FROM_PERIODS: 1`. | `BBD.kind` |
| Mục tiêu | `p*(L)` từ `D(L) = sqrt((L−1)/29)`; đỉnh trừ thêm, màn thở cộng thêm; không xuống dưới sàn E1 (0.65 với A). | `BBD.pStar` |
| Màn thở | Phải cắt chuỗi khó: nới knob chính (`relief`), có thể thêm mạng hoặc bớt mục tiêu (E4, chỉ là knob, không thêm luật mới); G3 ở màn thở chỉ cần dễ hơn đỉnh trước, bỏ vế khó hơn L−4 (`BREATHER_EASY_OK`, Phụ lục C). | `relief` trong spec |
| Đỉnh | Đẩy một nấc (`peak`). | `peak` trong spec |
| Gate | B, G1–G6, G8 trên mọi màn; G7 còn SKIP. B một chiều (chỉ bắt quá khó) ở L1–9 trước đỉnh đầu và ở mọi màn thở (Phụ lục B); từ đỉnh đầu, màn bước vẫn hai chiều. Ngưỡng đầy đủ ở Phụ lục B. Không nới gate, không sửa `human.mjs`, không sửa adapter để cho xanh. | `scripts/sim/calibrate.mjs` |
| Vượt L30 | Engine chạy tiếp theo `priority`; knob chạm `hardCap` thì knob sau chạy; hết knob thì DỪNG. | `BBD.exhausted` |
| Miễn gate | Bảng khai `gateWaivers: { B: '<lý do>' }`. Chỉ miễn được B, bắt buộc có lý do; gate khác hoặc thiếu lý do thì `register` và `calibrate` ném lỗi. Gate được miễn báo **WAIVED**, không bao giờ PASS: `pass: null`, `status: 'WAIVED'`, lý do và các màn trượt vẫn ghi trong `calibration-<game>.json`. Chỉ word được miễn (Duy 2026-11-21). | `validateWaivers` trong `calibrate.mjs` |

## 3. Bảng hiện tại và kết quả ở N đầy đủ (2026-11-22, sau `B_EASY_OK_BEFORE_SAW` + `BREATHER_EASY_OK`)

Số là % qua ngay lần đầu, weak/median/skilled. File đầy đủ: `docs/difficulty/calibration-<game>.json`.
Đo lại sau quyết định (1)–(3) + hai công tắc B/G3 trên (L5 là bước, `p*(5) = 0.857`; đỉnh đầu L10, màn thở đầu L11).

| Game | Chơi gì | Bảng | Viết tay → max | L1 (p* 92) | L5 bước (p* 86) | L30 (p* 69) | Gate L1–30 | L31–40 (engine) |
|---|---|---|---|---|---|---|---|---|
| `train` Đường Ray | Bẻ ghi cho tàu về đúng ga trong 90 s, cần ≥ 80% | v2 | 30 → 30 | 87/95/98 | 86/90/96 | 49/69/80 | xanh | xanh |
| `koi` Cá Koi | Cho mỗi con cá ăn đúng một lần, tránh cá xám | v2 | 30 → 30 | 93/94/96 | 86/87/91 | 56/66/78 | xanh | xanh |
| `mem` Ô Sáng | Nhớ ô sáng rồi chạm lại, 3 lượt cần 2 lượt đúng | v2 | 30 → 30 | 91/97/99 | 85/93/97 | 52/69/81 | xanh | xanh |
| `rain` Mưa Phép Tính | Giải phép tính trên giọt mưa trước khi hết mạng | v2 | 30 → 30 | 100/100/100 | 94/100/100 | 8/69/95 | xanh (N 1200) | xanh (N 4000; N 1200 G2 L37→38 lật theo seed) |
| `word` Đoán Cụm Từ | Đoán cụm 2 từ trong 6 lượt | v2, khoá sao theo cụm (`p<n>`) | 49 → 49 (E2) | 94/99/100 | 90/97/100 | 67/91/96 | B WAIVED, còn lại xanh (L1–49) | (viết tay, nằm trong L1–49) |

Vì sao giờ xanh, và lịch sử trước đó:
- **G1 L5 đã gỡ** (Duy chọn A, 2026-11-21): train L5 xuống 5 ga với tàu dày hơn, koi viết tay đủ L1–30, mem L5 còn 3 ô.
- **mem B L4, L5 — gỡ 2026-11-22 bằng `B_EASY_OK_BEFORE_SAW`**: weak ≥ 0.85 (G1) đẩy median lên 0.926 (L4) và
  0.932 (L5), cao hơn p* 6–7 điểm — luôn ở phía **dễ hơn**, chưa từng phía khó. B một chiều ở L1–9 chỉ bắt phía
  khó nên hai màn này qua ngay; không đổi bảng, không đổi `human.mjs`. *(Lịch sử 2026-11-21 → 22, luật B hai
  chiều cũ: median thấp nhất khi weak ≥ 0.85 là 0.926/0.929, trên trần B 0.915/0.907 — khoảng cách ~7 điểm đến
  từ `human.mjs`; lúc đó còn chờ Duy.)*
- **rain B L1–9 — gỡ 2026-11-22 cùng công tắc trên**: median L1–9 luôn ở phía dễ hơn p* (L1–8 median 100%, L9
  98% khi p* 83%), chưa từng phía khó; B một chiều cho qua ngay. Tier 7–9 vẫn ở L7–9 (quyết định 2), `every`/
  `fall` vẫn giảm dần L7 → L10 (2.60/8.00 → 2.45/7.55 → 2.40/7.30 → 2.40/7.25) để bot yếu đi 100 → 96 → 53 →
  13% thay vì rơi 87 → 13% trong một màn (nội dung và chuỗi giọt không đổi).
- **rain màn thở (L11, L16, L21, L26) — gỡ 2026-11-22 bằng `BREATHER_EASY_OK`**: weak ≥ 60% (G4) buộc median
  ~0.98–0.99, luôn dễ hơn đỉnh trước (phần G3 còn giữ) nhưng không thể vừa khó hơn L−4 (vế đã bỏ). G3 giữ đúng
  một vế, G4 không đổi; cả hai qua. *(Lịch sử 2026-11-21 → 22, luật cũ: weak ≥ 0.6 cần median ~0.93 nên luôn dễ
  hơn L−4 — B/G3/G4 không cùng giữ được; lúc đó rain dừng ở L30 chờ Duy.)*
- **word**: B **WAIVED** (Duy chọn A, 2026-11-21), không phải PASS; median vẫn cao hơn p* 7–22 điểm và số trượt vẫn
  ghi trong JSON. Luật giữ nguyên (6 lượt, gợi ý mở ngay).
- **mem L4 lệch khuôn bước**: L4 có `disp 0` trong khi L3 có `disp 0.15`, nên trên knob L4 dễ hơn L3 (test ghi ngoại lệ
  "steps (except L4)"). Đó là cái giá để giữ G1 ở biên B/G1; quyết định 1 muốn L1–9 tăng đều. Không đổi bởi hai
  công tắc trên, vẫn một ghi chú để **báo Duy**.
- **Biên mỏng** (đổi seed hay bảng là có thể lật): mem L5 weak **0.8500**, đúng sàn G1; train L4 median thấp hơn trần B
  0.005, L5 weak trên sàn 0.009, L36 weak trên sàn 0.01; koi L4, L5 weak trên sàn ~1 điểm; word G2 L5→L6 dư 0.005;
  rain G2 L37→38 ở N 1200 lật theo seed, N 4000 mới ổn định xanh.
- **Rơi ngay sau dải G1** (không gate nào bắt): weak train L5 → L6 86 → 74%, mem 85 → 78%.
- **Còn mở, không phải gate trượt**: từ L10, median rain bám p* thì bot yếu chỉ còn 10–20% đến L40 — khoảng cách
  weak/median của `human.mjs`, không gate nào bắt vì B chỉ xét median. Chưa đối chiếu người thật (G7 SKIP).

CI: train, koi, mem, rain (L1–40) và word (L1–49, B WAIVED) là bước calibration **chặn**, không còn bước
report-only. `calibrate.mjs` thoát 2 khi `--n`/`--from`/`--to` rỗng, NaN hay < 1, hoặc `--from` > `--to` (kể cả
`--to` bỏ trống, tức maxLevel), nên bound `$(node -e …)` lỗi làm bước đỏ. G1 / G5 báo SKIP (không phải PASS) khi
L1–5 / L30 nằm ngoài khoảng chạy. Test `KNOWN-FAIL` cũ (ghim danh sách trượt của mem và rain) đã thay bằng test không còn trượt nào:
`node --test scripts/sim/*.test.mjs` = 75/75 (2026-11-22).

## 4. "Thêm 10 màn cho mỗi game"

| Bước | Làm | Xong khi |
|---|---|---|
| 1 | Nâng `maxLevel` trong spec của `js/levels/<game>.js` lên N+10 (mặc định = max(30, số dòng `levels`)). **Không sửa dòng `levels` đã ship.** Word là game nội dung: thêm cụm mới vào cuối `PLAY` với `id` mới, không đổi thứ tự cũ. | `BBD.maxLevel(g) === N+10` |
| 2 | Nhịp và `p*` engine tự lo. `D(L)` vượt 1 sau L30 là bình thường. | — |
| 3 | `BBD.exhausted(g, N+10)` phải là `false`. Koi (`strictPeaks: true`) còn báo `true` từ đỉnh sinh ra đầu tiên không khó hơn màn trước nó hoặc đỉnh trước (hiện là L65). | — |
| 4 | **Nếu `exhausted` là true, hoặc chỉ còn knob `rule: true`: DỪNG.** Đề xuất knob/luật mới cho Duy, mỗi phương án một mockup HTML (Quy tắc Vibe 9). Không tự nâng `hardCap`. | Duy đã chọn |
| 5 | `node scripts/sim/calibrate.mjs <g> --from N-4 --to N+10 --n 1200` (koi `--n 2000`) | Exit 0 trên các màn mới |
| 6 | Gate trượt ở màn mới: chỉnh `max`, `start`, `peak`, `relief` hoặc `overrides` của **màn mới**, chạy lại. Màn mới cần dòng viết tay thì thêm vào cuối `levels`. `start` chỉ áp dụng khi `levels` có đúng `startAt` dòng: thêm dòng thì màn sinh ra kế tiếp neo vào dòng mới; dòng mới là đỉnh thì đặt `start`/`startAt` mới. | Exit 0 |
| 7 | `node --test scripts/sim/difficulty.test.mjs` và `PW_PORT=8920 npx playwright test`; sửa số 30 ghi cứng trong `tests/<g>-levels.spec.js`. | Xanh hết |
| 8 | Không cần sửa game: game đọc `BBD.maxLevel(g)` và gọi `BB.setLvMax`. | Màn mới hiện trong hub |
| 9 | Nhánh `feat/levels-<g>-<to>`, PR vào `main` (LUẬT 12), một dòng có ngày vào Log của `PIPELINE.md`. | PR xanh |

Đo L31–40 ở N đầy đủ ngày 2026-11-22 (engine sinh, chưa ship). Chỉnh bằng tham số engine, không thêm dòng viết tay:

| Game | L31–40 | Chỉnh gì |
|---|---|---|
| train | xanh (cả L1–40 một lượt) | `base.max` 3.30 → 3.36, `burstP.max` 0.10 → 0.05, `relief` base 0.10 → 0.08 |
| koi | xanh (cả L1–40 một lượt) | `koi` start 12 / max 12.3 `quad`, `turnMul` start 1.2, +0.05 mỗi màn thở, `spdMul.max` 1.42, `decoys.max` 5.4, `peak` koi +1 và turnMul +0.1, `relief` spdMul −0.1; đỉnh sau luôn khó hơn đỉnh trước (2026-11-22) |
| mem | xanh | `disp` start 0.05 → 0.1 (bằng L29), `quad` max 0.13: bước L31+ không dễ hơn L29, màn thở L31 bằng L26 (2026-11-22) |
| rain | xanh ở N 4000 (L31, L36 là màn thở, qua nhờ `BREATHER_EASY_OK`); ở N 1200 chỉ G2 L37→38 lật theo seed | `B_EASY_OK_BEFORE_SAW` / `BREATHER_EASY_OK` (§3); chạy ở N 4000 để G2 ổn định |
| word | không có màn engine sinh; L31–40 là cụm viết tay, xanh với B WAIVED | — |

Nghĩa là "thêm 10 màn" hôm nay chạy thẳng từ luật ở cả 5 game; rain cần chạy calibration ở N 4000 (không phải
N 1200) để G2 L37→38 ổn định xanh (§3).

## 5. Đổi màn đã ship: phiên bản bảng và migration

Áp dụng khi chỉnh màn đã có (đổi giá trị, đổi thứ tự, chèn màn). Thêm màn ở cuối mà không đổi màn cũ thì không cần.

| # | Làm | Ghi chú |
|---|---|---|
| 1 | Viết lại dòng trong `levels: [...]` (mỗi dòng đủ mọi knob không phải `rule`). Chuyển bảng cũ sang `legacyLevels` để tham chiếu. | `legacyLevels` chỉ là dữ liệu tham chiếu; `E3_FREEZE_LEGACY: true` không còn là đường lùi (Phụ lục C) |
| 2 | Tăng `version` lên 1. | `BBD.version(g)` |
| 3 | Đổi thứ tự hoặc chèn màn: gắn `id` ổn định cho từng dòng (chuỗi không phải số, không trùng, ví dụ `'p12'`). | Sao lưu theo `id`; không có `id` thì khoá = số màn |
| 4 | Sao cần dời khoá: viết `migrate({ from, to, best, stars, remapLevels }) → { best, stars }`. Không đổi thứ tự thì bỏ trống. | `remapLevels` chỉ dời khoá số; chạy lại không đổi gì |
| 5 | Game gọi `BB.migrateProgress(g)` một lần lúc tải, sau `js/levels/<g>.js`, trước khi đọc `BB.gameStats`. | Ghi cờ `bb_tablev_<g>` |
| 6 | Game đổi thứ tự màn: đăng ký cách đếm bằng `BB.setProgress(g, () => ({ done, next, best }))`. Hub, thử thách ngày và thẻ chia sẻ đọc `BB.progressOf(g)`; game không đăng ký thì vẫn đọc `best`. Word đã đăng ký. | xem §8 |
| 7 | Thêm test: dữ liệu version cũ → mới, số màn đã qua không giảm, dữ liệu hỏng không làm sập. | `scripts/sim/difficulty*.test.mjs` |

Engine bảo đảm: `best` (số màn đã qua) không bao giờ giảm; `bb_stats` hỏng (`'{bad'`, `'[]'`, `'5'`) đọc thành
rỗng; cờ thiếu hoặc hỏng coi như version 1; cờ mới hơn bảng thì để nguyên; mapper ném lỗi thì giữ dữ liệu và
cờ cũ, lần tải sau chạy lại. Khoá cũ `rtd_best3`, `koi_lv2`, `mem_lv`, `rain_lv`, `word_lv` không bị đụng.

Ví dụ thật của PR này (v1 → v2):

| Trước | Sau |
|---|---|
| `bb_stats.koi = {best: 7, stars: {L1, L2, L7}}`, `koi_lv2 = '8'`, không có cờ | `best`, sao và `koi_lv2` giữ nguyên, `bb_tablev_koi = '2'`; chạy lần hai báo `current` |
| `bb_stats.word = {best: 2, stars: {1:3, 2:1}}` (thứ tự cũ) | sao dời sang id cụm: `{best: 2, stars: {p<cụm L1 cũ>: 3, p<cụm L2 cũ>: 1}}`, cờ `'2'` |
| `bb_tablev_rain = '3'` (bản mới hơn từng chạy) | không đụng, `reason: 'newer'` |
| `bb_stats = '{bad'` | không lỗi, đọc thành `{best: 0, stars: {}}` |

## 6. Game mới

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Chọn họ nhận thức: Hick+Fitts, MOT, WM/Corsi, tính nhẩm + hàng đợi, entropy (đoán chữ). | Quyết định hàm trong `human.mjs` |
| 2 | Khai knob `{ name, min, max, hardCap, step/int, curve, unlockAt, source }`. Mỗi `hardCap` có nguồn trong `research-kept.json` hoặc ghi "đoán, bot kiểm". Mục tiêu chạm không phải trục khó, luôn ≥ 44 px ở 320 và 390 px. | K≈4 (Luck & Vogel), Corsi 6.2±1.3, MOT 1–8 |
| 3 | Luật qua, luật sao, định nghĩa "một lượt"; có knob cho màn thở cắt chuỗi (mạng, số mục tiêu). | PRD S1 |
| 4 | Sinh màn thuần `(spec, rng)`: không DOM, không `Math.random`. | Bot và game dùng chung |
| 5 | `scripts/sim/adapters/<g>.mjs` theo interface ở đầu `adapters/mem.mjs`. | `simulate` + `geometry` |
| 6 | Viết `levels` cho L1..10 theo khuôn §2, để engine sinh tiếp, chạy `calibrate` tới L30. | Exit 0, `version: 1` |
| 7 | `BBD.register` trong `js/levels/<g>.js`, thêm vào `GAMES` của `load-bbd.mjs`, thêm test. Game đọc `BBD.level`, gọi `BB.setLvMax` và `BB.migrateProgress`, tự lui về công thức cũ khi thiếu BBD. | — |
| 8 | Nối dây: thẻ `<script>` sau `js/difficulty.js` trong `index.html`; thêm file vào `PRECACHE` của `sw.js`, tăng `VERSION` và sửa tên cache trong `tests/core.spec.js`; thêm `sim:<g>` vào `package.json` và một bước calibration **chặn** trong `.github/workflows/ci.yml`. | CI chạy gate |
| 9 | Licence mọi thứ mượn: chỉ MIT/BSD/ISC/CC0/Apache/PD, ghi `legal/licences.json`. | — |

Chữ menu không được hứa một luật theo từng màn ("mỗi level thêm 1 …") trừ khi bảng giữ đúng luật đó.
Viết chung ("đông dần rồi nhanh dần") hoặc sinh từ bảng như `renderKHow()` của koi.

## 7. Automation hằng ngày (`docs/automation/daily-level-prompt.md`)

Chỉ **thêm** một màn ở cuối mỗi game theo §4. Không bao giờ chỉnh màn đã ship. Muốn chỉnh màn cũ thì đó là
một PR riêng theo §5 (tăng `version` + migration + test), do người hoặc phiên có Duy duyệt, không phải run hằng ngày.
Game mà calibrate đang trượt ở màn cũ: run vẫn thêm màn mới nếu màn mới xanh, và ghi rõ gate cũ còn đỏ.

## 8. Chưa xác minh được

- Mọi tham số người chơi ghi `[NEW]` trong `human.mjs` là prior, chưa đo trên người thật.
- G7 (bot khớp game thật) vẫn SKIP; chỉ word có parity Playwright.
- Word: hub, thử thách ngày và thẻ chia sẻ đếm cụm đã qua theo id (`BB.setProgress`, 2026-11-22). Người chỉ có `best` mà không có sao lẫn `word_lv` (dữ liệu bị xoá một phần) sẽ thấy số màn đã qua ở hub giảm; chưa gặp trường hợp thật.
- Dòng `bb_log` cũ ghi `lv` theo bảng v1, nên `elo.replay` tính `b_L` sai cho chúng.
- Ghi stats rồi ghi cờ là hai lệnh tách nhau; chỉ `remapLevels` an toàn khi bị chạy lại.
- Sao của "L5 cũ" hiện ở "L5 mới" (train, koi, mem, rain) dù nội dung màn đã đổi: chọn có chủ đích, chưa hỏi Duy.
- `b_L` cho Elo đang là `logit(1 − p_median)`; fit IRT 2PL chưa làm.

---

## Phụ lục A. Knob hiện tại (bảng v2)

| Game | Knob | Hướng khó | max / hardCap | Ghi chú |
|---|---|---|---|---|
| train | stations | ↑ | 15 / 15 | code `MAX_STATIONS` |
| train | base | ↓ | 3.36 / 2.30 | khoảng cách tàu; đỉnh −0.20, màn thở +0.08 |
| train | speedF | ↑ | 0.28 (giữ) / 0.28 | đo bằng sim |
| train | burstP | ↑ | 0.05 / 0.30 | dự trữ cho L31+ |
| train | twoTone | ↑ | 0.45 | `rule`, khoá bởi E5 |
| koi | koi | ↑ | 12.3 (start 12, `quad`) / 15 | L1–30 viết tay; L31+ đỉnh +1 con; cá ≥ ×1.25 thì tối đa 14 con (`derive`) |
| koi | cd | ↑ | 3.2 / 3.2 | code koi.js |
| koi | decoys | ↑ | 5.4 / 6 | đổi ở màn thở |
| koi | spdMul | ↑ | 1.42 / 1.5 | đoán; màn thở L31+ −0.1 |
| koi | turnMul | ↑ | start 1.2, +0.05 mỗi màn thở / 1.6 | viết tay từ L9; đỉnh L31+ +0.1 |
| koi | scatter | ↑ | 0.3 | `rule`, khoá bởi E5 |
| mem | t | ↑ | 6.12 / 15 | `quad`; đỉnh +1, màn thở −1 |
| mem | size | ↑ | 6 / 6 | ô ≥ 44 px ở 320 px |
| mem | k | ↓ | 0.298 / 0.18 | giây nhìn mỗi ô, `quad` |
| mem | disp | ↑ | 0.13 (start 0.1, `quad`) / 0.50 | màn thở −0.05 |
| rain | ops | ↑ | 14 | tầng phép tính |
| rain | fall / every | ↓ | 7.64 / 6.8 · 2.60 / 2.2 | lưới 0.01; đỉnh −0.30 / −0.08; màn thở +0.95 / +0.6 |
| rain | target | ↑ | 25 / 25 | màn thở −15 |
| rain | lives | ↓ | 3 / 3 | màn thở +1 (E4) |
| rain | storm | ↑ | 0.25 | `rule`, khoá bởi E5 |

## Phụ lục B. Gate của `calibrate.mjs`

| Gate | Điều kiện | Áp cho |
|---|---|---|
| B | Hai chiều: `|p_median − p*| ≤ 0.05`. Một chiều, chỉ bắt `p_median < p* − 0.05` (dễ hơn không bắt), ở L1–9 trước đỉnh đầu (`B_EASY_OK_BEFORE_SAW`) và ở mọi màn thở (`BREATHER_EASY_OK`); từ đỉnh đầu, màn bước vẫn hai chiều. | mọi màn; bảng có `gateWaivers.B` thì báo WAIVED (chỉ word) |
| G1 | weak ≥ 85% ở L1–5 | mọi game |
| G2 | median không tăng giữa hai màn bước liền nhau (dung sai 2·SE) | mọi màn |
| G3 | Mọi màn thở: dễ hơn đỉnh trước. Vế "khó hơn L−4" chỉ áp khi `BREATHER_EASY_OK: false` (luật cũ); mặc định đã bỏ (Duy 2026-11-22), G4 không đổi. | mọi màn thở |
| G4 | weak ≥ 60% ở mọi màn thở | mọi màn thở |
| G5 | skilled ≥ 50% ở L30 (80% nếu E1 = B) | L30 |
| G6 | knob trong hardCap; mục tiêu chạm ≥ 44 px ở 320 và 390 px | mọi màn |
| G7 | bot khớp game thật, 3 seed ở L1/L15/L30 | SKIP; word kiểm bằng Playwright |
| G8 | báo qua lần đầu và trong ≤ 3 lần | mọi màn |

Gate B có ngưỡng cố định ±0,05, không tính sai số mẫu, nên N nhỏ có thể trượt giả. CI luôn chạy N đầy đủ.

## Phụ lục C. Công tắc quyết định trong `js/difficulty.js`

| Câu | Dòng | Hiện tại | Đổi thành |
|---|---|---|---|
| E1 | `E1: 'A'` | L30 ≈ 69%, sàn 0.65, G5 50% | `'B'`: 58%, sàn 0.45, G5 80% |
| E2 | `E2_WORD_LEVELS: 49` | giữ 49 | `30` |
| E3 | `E3_FREEZE_LEGACY: false` (Duy gỡ 2026-11-21) | chơi `levels` của bảng | `true` **không còn là đường lùi**: `max`/`start`/`relief` của knob đã chỉnh cho 30 dòng `levels`, nên với `legacyLevels` (10–13 dòng) các màn sau đó dễ đi (train L12–30, koi L11, mem L14, rain L11). Muốn lùi thì revert commit. |
| E4 | `E4: { maxStars: 1, unlocksNext: true, slowTempo: 0.85 }` | 1 sao, mở màn kế, có Nhịp chậm | sửa từng trường; `slowTempo: null` tắt |
| E5 | `E5_KNOBS_ONLY: true` | knob `rule: true` luôn tắt | `false`: bật luật mới (cần mockup đã duyệt) |
| Đỉnh L5 | `SAW_FROM_PERIODS: 2` (Duy 2026-11-21) | đỉnh đầu L10, màn thở đầu L11 | `1`: đỉnh L5, màn thở L6 như cũ |
| Gate B trước đỉnh đầu | `B_EASY_OK_BEFORE_SAW: true` (Duy 2026-11-22) | ở L1–9, B chỉ bắt `median < p* − 0.05` (quá khó) | `false`: trả B về hai chiều ở L1–9 |
| Gate B/G3 màn thở | `BREATHER_EASY_OK: true` (Duy 2026-11-22) | mọi màn thở: B chỉ bắt quá khó; G3 bỏ vế khó hơn L−4, giữ dễ hơn đỉnh trước; G4 không đổi | `false`: trả về luật cũ (B hai chiều, G3 đủ cả hai vế) |

Đổi một công tắc thì chạy lại `calibrate` cho mọi game, vì `p*` và gate đổi theo.
