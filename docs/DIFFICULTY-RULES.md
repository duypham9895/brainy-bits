# Luật độ khó Brainy Bits — làm theo khi Duy nói "thêm 10 màn" hoặc đưa ý tưởng game mới

Viết 2026-11-21, viết lại cùng ngày sau khi Duy gỡ E3 (màn cũ được chỉnh theo một khuôn chung).
Nguồn: `docs/difficulty/MERGED-SPEC.md` §4, `gates/01-spec/DIFFICULTY-DECISIONS.md`. Đọc khoảng 7 phút.

**TL;DR.**
- Mọi game theo **một khuôn**: răng cưa từ L1 (đỉnh ở `5k`, màn thở ở `5k+1`, còn lại là bước), tỉ lệ qua
  mục tiêu `p*(L)`, và mọi gate (B, G1–G6, G8) chấm **mọi màn** ở N đầy đủ (1200, koi 2000).
- Màn nằm trong `js/levels/<game>.js`: `levels: [...]` cho L1..n viết tay, engine `js/difficulty.js`
  (`window.BBD`) sinh tiếp từ dòng n.
- Đổi màn đã ship = tăng `version` + migration giữ số màn đã qua (§5). Thêm màn ở cuối thì không cần.
- **Chưa game nào xanh hết.** train, koi, mem cùng trượt G1 ở L5, vì B và G1 không thể cùng đúng ở đó.
  rain trượt B/G3 ở màn đầu và màn thở, word trượt B ở cả 49 màn. Tất cả đang chờ Duy (§3).

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
| Nhịp | `kind(L)`: `5k` = đỉnh, `5k+1` = màn thở, còn lại = bước. Áp từ L1. | `BBD.kind` |
| Mục tiêu | `p*(L)` từ `D(L) = sqrt((L−1)/29)`; đỉnh trừ thêm, màn thở cộng thêm; không xuống dưới sàn E1 (0.65 với A). | `BBD.pStar` |
| Màn thở | Phải cắt chuỗi khó: nới knob chính (`relief`), có thể thêm mạng hoặc bớt mục tiêu (E4, chỉ là knob, không thêm luật mới). | `relief` trong spec |
| Đỉnh | Đẩy một nấc (`peak`). | `peak` trong spec |
| Gate | B, G1–G6, G8 trên mọi màn; G7 còn SKIP. Ngưỡng ở Phụ lục B. Không nới gate, không sửa `human.mjs`, không sửa adapter để cho xanh. | `scripts/sim/calibrate.mjs` |
| Vượt L30 | Engine chạy tiếp theo `priority`; knob chạm `hardCap` thì knob sau chạy; hết knob thì DỪNG. | `BBD.exhausted` |

## 3. Bảng hiện tại và kết quả ở N đầy đủ (2026-11-21)

Số là % qua ngay lần đầu, weak/median/skilled. File đầy đủ: `docs/difficulty/calibration-<game>.json`.

| Game | Chơi gì | Bảng | Viết tay → max | L1 (p* 92) | L5 đỉnh (p* 80) | L30 (p* 69) | Gate trượt |
|---|---|---|---|---|---|---|---|
| `train` Đường Ray | Bẻ ghi cho tàu về đúng ga trong 90 s, cần ≥ 80% | v2 | 30 → 30 | 87/95/98 | 73/84/93 | 49/69/80 | G1 L5 |
| `koi` Cá Koi | Cho mỗi con cá ăn đúng một lần, tránh cá xám | v2 | 10 → 30 | 93/94/96 | 77/81/87 | 56/66/78 | G1 L5 |
| `mem` Ô Sáng | Nhớ ô sáng rồi chạm lại, 3 lượt cần 2 lượt đúng | v2 | 30 → 30 | 91/97/99 | 73/83/91 | 52/69/81 | B L4, G1 L5 |
| `rain` Mưa Phép Tính | Giải phép tính trên giọt mưa trước khi hết mạng | v2 | 30 → 30 | 100/100/100 | 94/100/100 | 8/69/95 | B L1–6, 11, 16, 21, 26; G3 L11, 16, 21, 26 |
| `word` Đoán Cụm Từ | Đoán cụm 2 từ trong 6 lượt | v2, khoá sao theo cụm (`p<n>`) | 49 → 49 (E2) | 94/99/100 | 89/97/100 | 67/91/96 | B 49/49 màn |

Vì sao còn đỏ, và chờ gì:
- **G1 L5 (train, koi, mem).** `p*(5) = 0.797`, nên B buộc median ≤ 0.847. G1 buộc weak ≥ 0.85, mà weak
  luôn ≤ median. Không bảng nào qua được cả hai. Duy chọn: (a) bỏ phần trừ của đỉnh L5, (b) G1 chỉ áp L1–4,
  hoặc (c) răng cưa bắt đầu từ L10.
- **mem B L4**: median 0.93 so với p* 0.87; kéo xuống thì L5 càng xa G1. Gỡ cùng lúc với câu trên.
- **rain**: L1–6 là tầng cộng/trừ dễ, median 100%; màn thở giữ G4 (weak ≥ 60%) nên dễ hơn L−4 (G3).
  Từ L7 weak chỉ còn 7–19% ở màn bước và đỉnh (vách L7). Chờ Duy: đưa tier 7–9 trở lại L7–9 hay không.
- **word**: bot qua dễ hơn p* 7–22 điểm ở mọi màn; xếp lại cụm không đủ. Chờ Duy: `maxTries` thành knob,
  miễn B cho game nội dung, hoặc mở gợi ý từ lượt k.

CI: cả năm bước calibration chạy `continue-on-error`, tên bước ghi rõ gate trượt. Test `KNOWN-FAIL` trong
`npm run test:sim` ghim đúng danh sách trượt và **có chặn**: trượt thêm hay tự hết trượt đều làm test đỏ.

## 4. "Thêm 10 màn cho mỗi game"

| Bước | Làm | Xong khi |
|---|---|---|
| 1 | Nâng `maxLevel` trong spec của `js/levels/<game>.js` lên N+10 (mặc định = max(30, số dòng `levels`)). **Không sửa dòng `levels` đã ship.** Word là game nội dung: thêm cụm mới vào cuối `PLAY` với `id` mới, không đổi thứ tự cũ. | `BBD.maxLevel(g) === N+10` |
| 2 | Nhịp và `p*` engine tự lo. `D(L)` vượt 1 sau L30 là bình thường. | — |
| 3 | `BBD.exhausted(g, N+10)` phải là `false`. | — |
| 4 | **Nếu `exhausted` là true, hoặc chỉ còn knob `rule: true`: DỪNG.** Đề xuất knob/luật mới cho Duy, mỗi phương án một mockup HTML (Quy tắc Vibe 9). Không tự nâng `hardCap`. | Duy đã chọn |
| 5 | `node scripts/sim/calibrate.mjs <g> --from N-4 --to N+10 --n 1200` (koi `--n 2000`) | Exit 0 trên các màn mới |
| 6 | Gate trượt ở màn mới: chỉnh `max`, `start`, `peak`, `relief` hoặc `overrides` của **màn mới**, chạy lại. Màn mới cần dòng viết tay thì thêm vào cuối `levels`. | Exit 0 |
| 7 | `node --test scripts/sim/difficulty.test.mjs` và `PW_PORT=8920 npx playwright test`; sửa số 30 ghi cứng trong `tests/<g>-levels.spec.js`. | Xanh hết |
| 8 | Không cần sửa game: game đọc `BBD.maxLevel(g)` và gọi `BB.setLvMax`. | Màn mới hiện trong hub |
| 9 | Nhánh `feat/levels-<g>-<to>`, PR vào `main` (LUẬT 12), một dòng có ngày vào Log của `PIPELINE.md`. | PR xanh |

Đo thử L31–40 ở N đầy đủ ngày 2026-11-21, chưa ai chỉnh, chưa ship:

| Game | L31–40 |
|---|---|
| mem | xanh mọi gate (đo thêm tới L45 cũng xanh) |
| train | B L40 (median 0.61 vs p* 0.66), G4 L36 (weak 0.58) |
| koi | B ở cả 10 màn, median thấp hơn p* 7–22 điểm (L32 0.57 vs 0.74); G3 L36; G4 L31, L36. Engine bật `spdMul` và `turnMul` cùng lúc sau L30. |
| rain | B và G3 ở màn thở L31, L36; G2 L37→38 (do seed) |

Nghĩa là "thêm 10 màn" hôm nay mới chạy thẳng được với mem. train cần chỉnh nhẹ, koi cần viết lại phần
engine sinh sau L30, rain chờ cùng quyết định về màn thở ở §3.

## 5. Đổi màn đã ship: phiên bản bảng và migration

Áp dụng khi chỉnh màn đã có (đổi giá trị, đổi thứ tự, chèn màn). Thêm màn ở cuối mà không đổi màn cũ thì không cần.

| # | Làm | Ghi chú |
|---|---|---|
| 1 | Viết lại dòng trong `levels: [...]` (mỗi dòng đủ mọi knob không phải `rule`). Chuyển bảng cũ sang `legacyLevels` để tham chiếu. | `E3_FREEZE_LEGACY: true` chơi lại `legacyLevels` |
| 2 | Tăng `version` lên 1. | `BBD.version(g)` |
| 3 | Đổi thứ tự hoặc chèn màn: gắn `id` ổn định cho từng dòng (chuỗi không phải số, không trùng, ví dụ `'p12'`). | Sao lưu theo `id`; không có `id` thì khoá = số màn |
| 4 | Sao cần dời khoá: viết `migrate({ from, to, best, stars, remapLevels }) → { best, stars }`. Không đổi thứ tự thì bỏ trống. | `remapLevels` chỉ dời khoá số; chạy lại không đổi gì |
| 5 | Game gọi `BB.migrateProgress(g)` một lần lúc tải, sau `js/levels/<g>.js`, trước khi đọc `BB.gameStats`. | Ghi cờ `bb_tablev_<g>` |
| 6 | Game đổi thứ tự màn: hub và thử thách ngày vẫn đọc `best` (số màn cao nhất đã qua), chưa đếm theo nội dung. `BB.setProgress` mà `js/word.js` gọi chưa có trong core (mở). | xem §8 |
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
- Word: hub và thử thách ngày đọc `best`, còn màn chơi đếm cụm đã qua theo id, nên hai số có thể lệch 1–2 màn. Thử nối `BB.setProgress` vào hub thì người chỉ có `best` (không sao, không `word_lv`) thấy số màn đã qua giảm, nên chưa làm.
- Dòng `bb_log` cũ ghi `lv` theo bảng v1, nên `elo.replay` tính `b_L` sai cho chúng.
- Ghi stats rồi ghi cờ là hai lệnh tách nhau; chỉ `remapLevels` an toàn khi bị chạy lại.
- Sao của "L5 cũ" hiện ở "L5 mới" (train, koi, mem, rain) dù nội dung màn đã đổi: chọn có chủ đích, chưa hỏi Duy.
- `b_L` cho Elo đang là `logit(1 − p_median)`; fit IRT 2PL chưa làm.

---

## Phụ lục A. Knob hiện tại (bảng v2)

| Game | Knob | Hướng khó | max / hardCap | Ghi chú |
|---|---|---|---|---|
| train | stations | ↑ | 15 / 15 | code `MAX_STATIONS` |
| train | base | ↓ | 3.30 / 2.30 | khoảng cách tàu; đỉnh −0.20, màn thở +0.10 |
| train | speedF | ↑ | 0.28 (giữ) / 0.28 | đo bằng sim |
| train | burstP | ↑ | 0.10 / 0.30 | dự trữ cho L31+ |
| train | twoTone | ↑ | 0.45 | `rule`, khoá bởi E5 |
| koi | koi | ↑ | 15 / 15 | màn thở bớt 3 con |
| koi | cd | ↑ | 3.2 / 3.2 | code koi.js |
| koi | decoys | ↑ | 5 / 6 | đổi ở màn thở |
| koi | spdMul | ↑ | 1.4 / 1.5 | đoán |
| koi | turnMul | ↑ | 1.3 / 1.6 | mở ở L26 |
| koi | scatter | ↑ | 0.3 | `rule`, khoá bởi E5 |
| mem | t | ↑ | 6.12 / 15 | `quad`; đỉnh +1, màn thở −1 |
| mem | size | ↑ | 6 / 6 | ô ≥ 44 px ở 320 px |
| mem | k | ↓ | 0.298 / 0.18 | giây nhìn mỗi ô, `quad` |
| mem | disp | ↑ | 0.12 / 0.50 | màn thở −0.05 |
| rain | ops | ↑ | 14 | tầng phép tính |
| rain | fall / every | ↓ | 7.64 / 6.8 · 2.60 / 2.2 | lưới 0.01; đỉnh −0.30 / −0.08; màn thở +0.95 / +0.6 |
| rain | target | ↑ | 25 / 25 | màn thở −15 |
| rain | lives | ↓ | 3 / 3 | màn thở +1 (E4) |
| rain | storm | ↑ | 0.25 | `rule`, khoá bởi E5 |

## Phụ lục B. Gate của `calibrate.mjs`

| Gate | Điều kiện | Áp cho |
|---|---|---|
| B | `|p_median − p*| ≤ 0.05` | mọi màn |
| G1 | weak ≥ 85% ở L1–5 | mọi game |
| G2 | median không tăng giữa hai màn bước liền nhau (dung sai 2·SE) | mọi màn |
| G3 | màn thở dễ hơn đỉnh trước, khó hơn L−4 | mọi màn thở |
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
| E3 | `E3_FREEZE_LEGACY: false` (Duy gỡ 2026-11-21) | chơi `levels` của bảng | `true`: chơi lại `legacyLevels` |
| E4 | `E4: { maxStars: 1, unlocksNext: true, slowTempo: 0.85 }` | 1 sao, mở màn kế, có Nhịp chậm | sửa từng trường; `slowTempo: null` tắt |
| E5 | `E5_KNOBS_ONLY: true` | knob `rule: true` luôn tắt | `false`: bật luật mới (cần mockup đã duyệt) |

Đổi một công tắc thì chạy lại `calibrate` cho mọi game, vì `p*` và gate đổi theo.
