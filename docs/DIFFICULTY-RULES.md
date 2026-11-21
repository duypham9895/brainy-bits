# Luật độ khó Brainy Bits — làm theo khi Duy nói "thêm 10 màn" hoặc đưa ý tưởng game mới

Viết 2026-11-21, cập nhật cùng ngày sau khi tích hợp 5 game. Nguồn: `docs/difficulty/MERGED-SPEC.md` §4, `gates/01-spec/DIFFICULTY-DECISIONS.md`.
Đọc khoảng 6 phút. Bảng dài nằm ở Phụ lục.

**TL;DR.** Độ khó của mọi game nằm trong một bảng knob ở `js/levels/<game>.js`, do một engine chung
`js/difficulty.js` (`window.BBD`) tính. Thêm màn = sửa vài số trong bảng knob, chạy bot, gate xanh thì mở PR.
Hết knob thì DỪNG và hỏi Duy. Không bao giờ sửa màn đã có (E3).

## 1. Đọc trước, theo thứ tự

| # | File | Tìm gì |
|---|---|---|
| 1 | `gates/01-spec/DIFFICULTY-DECISIONS.md` | Duy đã trả lời E1–E5 chưa. Câu nào đã trả lời thì sửa đúng một dòng trong `BBD.CONFIG` (Phụ lục C). |
| 2 | `js/levels/<game>.js` | Knob nào còn chỗ chạy trước `hardCap`, knob nào là `rule: true` (luật mới, bị khoá bởi E5). |
| 3 | `docs/difficulty/calibration-<game>.json` | Lần chạy gần nhất: pass rate từng màn, gate nào sát ngưỡng. |
| 4 | `node -e` in thử `BBD.level(game, L)` cho màn cuối và L+10 (xem `scripts/sim/load-bbd.mjs`) | Engine sẽ sinh ra gì nếu không sửa gì. |

## 2. "Thêm 10 màn cho mỗi game"

Engine đã sinh được mọi L ≥ 1, nên phần việc thật là kiểm và chỉnh, không phải viết công thức.

| Bước | Làm | Xong khi |
|---|---|---|
| 1 | Nâng `maxLevel` của game (mặc định 30) lên N+10 trong `js/levels/<game>.js`. Word là game nội dung: phải thêm cụm từ mới vào cuối, xếp theo D_word, không đổi thứ tự cũ. | `BBD.maxLevel(g) === N+10` |
| 2 | Giữ nhịp 5: màn `5k` là đỉnh, `5k+1` là màn thở. `D(L) = sqrt((L−1)/29)` vượt 1 sau L30 là bình thường; `p*(L)` không xuống dưới sàn của E1 (0.65 với A). | Không phải làm gì, engine tự lo |
| 3 | Knob chạm `hardCap` thì knob kế tiếp trong `priority` chạy. Knob dự trữ mở ở màn thở, kèm nới knob chính (`relief`). | `BBD.exhausted(g, N+10) === false` |
| 4 | **Nếu `exhausted` là true, hoặc chỉ còn knob `rule: true`: DỪNG.** Đề xuất knob/luật mới cho Duy, mỗi phương án một mockup HTML (Quy tắc Vibe 9). Không tự nâng `hardCap`. | Duy đã chọn |
| 5 | `node scripts/sim/calibrate.mjs <g> --from N-4` (hoặc `npm run sim:<g>`, đã cài sẵn N của từng game) | Exit 0: gate B, G1–G6, G8 xanh (bảng gate ở Phụ lục B) |
| 6 | Gate trượt: chỉnh `max`, `start`, `peak`, `relief` hoặc `overrides` của màn thở trong bảng knob, chạy lại. Không chỉnh tham số người chơi trong `human.mjs` để gate xanh. | Exit 0 |
| 7 | `node --test scripts/sim/difficulty.test.mjs` và `PW_PORT=8920 npx playwright test` | Xanh hết |
| 8 | Không sửa game: mọi game đã đọc `BBD.maxLevel(g)` và gọi `BB.setLvMax(g, …)`, nên hub và thử thách ngày tự theo. Chỉ kiểm test Playwright `tests/<g>-levels.spec.js` còn đúng con số mới (chúng đang ghi cứng 30). | Màn mới hiện trong hub |
| 9 | Nhánh `feat/levels-<g>-<to>`, PR vào `main` (LUẬT 12). Thêm một dòng có ngày vào bảng Log của `PIPELINE.md`: game, màn cũ → mới, knob nào chạy, gate nào sát ngưỡng. | PR xanh |

## 3. Game mới

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Chọn một họ nhận thức: Hick+Fitts (chọn nhanh), MOT (theo dõi vật chuyển động), WM/Corsi (nhớ vị trí), tính nhẩm + hàng đợi, entropy (đoán chữ). | Họ quyết định dùng hàm nào trong `human.mjs` |
| 2 | Khai knob `{ name, min, max, hardCap, step/int, curve, unlockAt, source }`. **Mỗi `hardCap` phải có nguồn** trong `research-kept.json` hoặc ghi rõ "đoán, bot kiểm". Mục tiêu chạm không bao giờ là trục khó, luôn ≥ 44 px ở 320 và 390 px. | Nguồn gợi ý: K≈4 (Luck & Vogel), Corsi 6.2±1.3, MOT 1–8 theo tốc độ |
| 3 | Viết luật pass, luật sao, định nghĩa một "lượt". | Vào PRD S1 |
| 4 | Viết phần sinh màn thuần `(spec, rng)`: không DOM, không `Math.random`. | Bot và game dùng chung |
| 5 | Viết `scripts/sim/adapters/<g>.mjs` theo interface ở đầu `adapters/mem.mjs`. | `simulate` + `geometry` |
| 6 | Đặt tay L1 và L30 (`overrides`), để engine điền giữa, chạy `calibrate`. | Gate xanh |
| 7 | `BBD.register` trong `js/levels/<g>.js`, thêm vào `GAMES` của `load-bbd.mjs`, thêm test. Game đọc `BBD.level(g, L)`, gọi `BB.setLvMax(g, BBD.maxLevel(g))`, và tự lui về công thức cũ khi thiếu BBD. | — |
| 7b | Nối dây: thẻ `<script src="js/levels/<g>.js">` trong `index.html` ngay sau `js/difficulty.js` (xem `docs/difficulty/INDEX-TAGS.md`); thêm file vào `PRECACHE` của `sw.js` và tăng `VERSION` (nhớ sửa tên cache trong `tests/core.spec.js`); thêm `sim:<g>` vào `package.json` và một dòng vào bước calibration của `.github/workflows/ci.yml`. | CI chạy gate của game mới |
| 8 | Kiểm licence mọi thứ mượn: chỉ MIT/BSD/ISC/CC0/Apache/PD. | `legal/licences.json` |

## 4. Bối cảnh từng game hiện có

| Game | Chơi gì | Knob | Màn (cũ → nay) | Bảng | Adapter |
|---|---|---|---|---|---|
| `train` Đường Ray | Bẻ ghi cho tàu về đúng ga cùng màu trong 90 s, cần ≥ 80% | stations, base (khoảng cách tàu), speedF, burstP | 11 → 30 | `js/levels/train.js` | `adapters/train.mjs`, dùng `RTD_MAP.generate` + `spawnGap` thật |
| `koi` Cá Koi | Cho mỗi con cá ăn đúng một lần, tránh cá mồi | koi, cd, decoys, spdMul, turnMul | 10 → 30 | `js/levels/koi.js` | `adapters/koi.mjs`, có chạm nhầm cá bên cạnh |
| `mem` Ô Sáng | Nhớ ô sáng rồi chạm lại; 3 lượt, cần 2 lượt hoàn hảo | t, size, k (giây nhìn/ô), disp; show = 1 + k·t | 13 → 30 | `js/levels/mem.js` | `adapters/mem.mjs` (mẫu) |
| `rain` Mưa Phép Tính | Giải phép tính trên giọt mưa trước khi rơi, 3 mạng | ops (tầng 1–14), fall, every, target | 10 → 30 | `js/levels/rain.js` | `adapters/rain.mjs` |
| `word` Đoán Cụm Từ | Đoán cụm 2 từ trong 6 lượt | không có knob: màn = cụm thứ L theo số chữ | 49 → 49 (E2) | `js/levels/word.js` | `adapters/word.mjs`, đếm đáp án còn khả dĩ |

Mỗi game giữ nguyên màn cũ (E3, có test so công thức cũ với `BBD.level` từng màn) và khoá tiến độ cũ
(`rtd_*`, `koi_*`, `mem_lv`, `rain_lv`, `word_lv`). Đã làm hai việc đi trước khi mở màn mới: vòng ghi của
train vẽ ≥ 44 px ở 320 px (`DISC_MIN_R`), vùng chạm koi có sàn cho mọi màn (kể cả màn cũ, vì G6 kiểm mọi màn).

Nối dây chung: `index.html` cần 6 thẻ script (`docs/difficulty/INDEX-TAGS.md`); `sw.js` đã cache
`js/difficulty.js` + `js/levels/*.js` (`bb-v5`); CI chạy `npm run test:sim` và gate calibration.

## 5. Kết quả calibration 2026-11-21

Số là % qua ngay lần đầu của bot median. File đầy đủ: `docs/difficulty/calibration-<game>.json`.

| Game | N | Median L30 (p* 69) | Gate trượt | Lý do / chờ gì |
|---|---|---|---|---|
| mem | 400 | 66 | không | ở N=1200 trượt G2 L7→8 và G3 L6, đều là màn cũ |
| koi | 2000 | 66 | không | ở N=400 trượt B L15 (69 vs 74) do nhiễu mẫu, nên CI chạy N=2000 |
| train | 1200 | 68 | B L26 (83 vs 76); G3 L11 (màn cũ) | giữ weak ≥ 60% ở L26 (G4) hay kéo median về p*: chờ Duy |
| rain | 400 | 71 | G3 L11; G4 weak 11–24% ở L11/16/21/26 | màn thở chỉ nới ~0,05 s; chưa có lưới đỡ E4 trong game: chờ Duy |
| word | 400 | 94 | G1, G2, G3, G4, tất cả ở màn cũ | E3 cấm đổi thứ tự cụm; mô hình từ vựng của bot chưa có nguồn |

CI: mem và koi chặn merge; train, rain, word chạy `continue-on-error` cho tới khi Duy trả lời.
Gate B có ngưỡng cố định ±0,05, không tính sai số mẫu, nên N nhỏ có thể trượt giả (koi ở N=400).

## 6. Chưa xác minh được

- Mọi tham số người chơi ghi `[NEW]` trong `human.mjs` (lapse, tapSlip, encodeSec, độ lệch K, chi phí chunk) là prior, chưa đo.
- Chi phí chunk của mem (`GAMMA = 0.1`) được chọn để đường L1–13 đã ship nằm gần `p*`. Với 0.25, median ở L13 rơi xuống 27% và mọi màn mới trượt gate B. Playtest quyết định giá trị nào đúng.
- Gate G7: game đã đọc `BBD.level()`, nhưng `calibrate.mjs` vẫn in SKIP. Chỉ word có parity Playwright (3 seed ở L1/L15/L30). Không bot nào đã được so với người thật.
- `b_L` cho Elo đang là `logit(1 − p_median)`; fit IRT 2PL (MERGED-SPEC §4.4 bước 5) chưa làm.

---

## Phụ lục A. Knob hiện tại

| Game | Knob | Hướng khó | hardCap | Ghi chú |
|---|---|---|---|---|
| train | stations | ↑ | 15 | code `MAX_STATIONS` |
| train | base | ↓ | 2.30 | đoán; nới 0.22 ở màn thở |
| train | speedF | ↑ | 0.58 | đoán; chỉ đổi ở màn thở |
| train | burstP | ↑ | 0.30 | đoán; chỉ đổi ở màn thở |
| train | twoTone | ↑ | 0.45 | `rule`, khoá bởi E5 |
| koi | koi | ↑ | 15 | màn thở bớt 3 con (đổi số con lấy tốc độ, Alvarez & Franconeri) |
| koi | cd | ↑ | 3.2 | code koi.js:48 |
| koi | decoys | ↑ | 6 | đoán |
| koi | spdMul | ↑ | 1.5 | đoán |
| koi | turnMul | ↑ | 1.6 | mở ở L26 |
| koi | scatter | ↑ | 0.3 | `rule`, khoá bởi E5 |
| mem | t | ↑ | 15 | màn thở bớt 2 ô |
| mem | size | ↑ | 6 | ô ≥ 44 px ở 320 px |
| mem | k | ↓ | 0.18 | bắt đầu 0.25 ở L14, đỉnh trừ thêm 0.02 |
| mem | disp | ↑ | 0.50 | mở ở L16 |
| rain | ops | ↑ | 14 | mỗi màn thở lên một tầng (O11–O14) |
| rain | fall / every | ↓ | 6.8 / 2.2 | đi cặp, màn thở nới 0.5 / 0.2 |
| rain | target | ↑ | 25 | — |
| rain | storm | ↑ | 0.25 | `rule`, khoá bởi E5 |

## Phụ lục B. Gate của `calibrate.mjs`

| Gate | Điều kiện | Áp cho |
|---|---|---|
| B | `|p_median − p*| ≤ 0.05` | màn mới (màn cũ chỉ đo, E3) |
| G1 | weak ≥ 85% ở L1–5 | mọi game |
| G2 | median không tăng giữa hai màn step liền nhau (dung sai 2·SE) | mọi màn |
| G3 | màn thở dễ hơn đỉnh trước, khó hơn L−4 | mọi màn thở |
| G4 | weak ≥ 60% ở mọi màn thở | mọi màn thở |
| G5 | skilled ≥ 50% ở L30 (80% nếu E1 = B) | L30 |
| G6 | knob trong hardCap; mục tiêu chạm ≥ 44 px ở 320 và 390 px | màn mới |
| G7 | bot khớp game thật, 3 seed ở L1/L15/L30 | `calibrate` vẫn SKIP; word kiểm bằng Playwright |
| G8 | báo pass lần đầu và trong ≤ 3 lần | mọi màn |

## Phụ lục C. Công tắc quyết định trong `js/difficulty.js`

| Câu | Dòng | Mặc định | Đổi thành |
|---|---|---|---|
| E1 | `E1: 'A'` | L30 ≈ 69%, sàn 0.65, G5 50% | `'B'`: 58%, sàn 0.45, G5 80% |
| E2 | `E2_WORD_LEVELS: 49` | giữ 49 | `30` |
| E3 | `E3_FREEZE_LEGACY: true` | màn cũ giữ nguyên | `false`: tính lại mọi màn bằng công thức (lệch sao đã lưu) |
| E4 | `E4: { maxStars: 1, unlocksNext: true, slowTempo: 0.85 }` | 1 sao, mở màn kế, có Nhịp chậm | sửa từng trường; `slowTempo: null` tắt |
| E5 | `E5_KNOBS_ONLY: true` | knob `rule: true` luôn tắt | `false`: bật luật mới (cần mockup đã duyệt) |

Đổi một công tắc thì chạy lại `calibrate` cho mọi game có adapter, vì `p*` và gate đổi theo.
