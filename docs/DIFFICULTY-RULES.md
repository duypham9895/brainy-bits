# Luật độ khó Brainy Bits — làm theo khi Duy nói "thêm 10 màn" hoặc đưa ý tưởng game mới

Viết 2026-11-21. Nguồn: `docs/difficulty/MERGED-SPEC.md` §4, `gates/01-spec/DIFFICULTY-DECISIONS.md`.
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
| 5 | `node scripts/sim/calibrate.mjs <g> --from N-4` | Exit 0: gate B, G1–G6, G8 xanh (bảng gate ở Phụ lục B) |
| 6 | Gate trượt: chỉnh `max`, `start`, `peak`, `relief` hoặc `overrides` của màn thở trong bảng knob, chạy lại. Không chỉnh tham số người chơi trong `human.mjs` để gate xanh. | Exit 0 |
| 7 | `node --test scripts/sim/difficulty.test.mjs` và `PW_PORT=8920 npx playwright test` | Xanh hết |
| 8 | Hub và game đọc `BBD.maxLevel(g)` thay cho `BB.LV_MAX` (sau bước tích hợp). Nếu chưa tích hợp, sửa `LV_MAX` trong `js/core.js:203` cho khớp. Thêm `js/difficulty.js` và `js/levels/*.js` vào danh sách cache của `sw.js`. | Màn mới hiện trong hub |
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
| 7 | `BBD.register` trong `js/levels/<g>.js`, thêm vào `GAMES` của `load-bbd.mjs`, thêm test. | — |
| 8 | Kiểm licence mọi thứ mượn: chỉ MIT/BSD/ISC/CC0/Apache/PD. | `legal/licences.json` |

## 4. Bối cảnh từng game hiện có

| Game | Chơi gì | Knob | Màn hiện có | Bảng | Adapter |
|---|---|---|---|---|---|
| `train` Đường Ray | Bẻ ghi cho tàu về đúng ga cùng màu trong 90 s, cần ≥ 80% | stations, base (khoảng cách tàu), speedF, burstP | 11 | `js/levels/train.js` | TODO |
| `koi` Cá Koi | Cho mỗi con cá ăn đúng một lần, tránh cá mồi | koi, cd, decoys, spdMul, turnMul | 10 | `js/levels/koi.js` | TODO |
| `mem` Ô Sáng | Nhớ ô sáng rồi chạm lại; 3 lượt, cần 2 lượt hoàn hảo | t, size, k (giây nhìn/ô), disp; show = 1 + k·t | 13 | `js/levels/mem.js` | làm đủ |
| `rain` Mưa Phép Tính | Giải phép tính trên giọt mưa trước khi rơi, 3 mạng | ops (tầng 1–14), fall, every, target | 10 | `js/levels/rain.js` | TODO |
| `word` Đoán Cụm Từ | Đoán cụm 2 từ trong 6 lượt | không có knob: màn = cụm thứ L theo số chữ | 49 (E2) | `js/levels/word.js` | TODO |

Màn mới của train cần sửa ô < 44 px ở viewport 320 (MERGED-SPEC A-5). Màn mới của koi cần nâng vùng chạm
`a ≥ 24, b ≥ 22` (koi.js:270). Hai việc này đi trước khi mở L12+ / L11+.

## 5. Chưa xác minh được

- Mọi tham số người chơi ghi `[NEW]` trong `human.mjs` (lapse, tapSlip, encodeSec, độ lệch K, chi phí chunk) là prior, chưa đo.
- Chi phí chunk của mem (`GAMMA = 0.1`) được chọn để đường L1–13 đã ship nằm gần `p*`. Với 0.25, median ở L13 rơi xuống 27% và mọi màn mới trượt gate B. Playtest quyết định giá trị nào đúng.
- Gate G7 (so bot với game thật trên Playwright) chưa chạy được cho tới khi game đọc `BBD.level()`.
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
| G7 | bot khớp game thật, 3 seed ở L1/L15/L30 | SKIP tới khi tích hợp |
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
