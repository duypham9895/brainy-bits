# So sánh hai thiết kế độ khó Brainy Bits: A (Claude) và B (Gemini Neon)

Nguồn đã đọc: `diff-design-claude.md` (A), `design-neon.md` (B), `diff-research-kept.json` (6 mũi: dda, rating, staircase, cognitive, simulation, oss), và code thật trong `brainy-bits/js/` (core.js, train.js, train-map.js, koi.js, mem.js, rain.js, word.js). Mọi số "code" bên dưới đọc trực tiếp từ file, có số dòng.

Review: same vendor, same priors — no external verifier ran. B do Gemini viết nên A↔B là cross-vendor, nhưng bản so sánh này do Claude viết, tức cùng họ với A. Đọc phần chấm điểm A với độ nghi ngờ tương ứng.

---

## 1. Chỗ hai bản ĐỒNG Ý (độ tin cao, đưa thẳng vào spec)

| # | Điểm chung | Gốc research |
|---|---|---|
| 1 | Một engine chung. Mỗi game chỉ khai bảng knob + hàm sinh màn thuần (không DOM, rng truyền vào). Node nạp cùng file qua `node:vm`, không build step. | dda, simulation, oss |
| 2 | Đường nền dạng căn bậc hai (đầu dốc, cuối thoải) + răng cưa chu kỳ 5: màn `5k` là đỉnh, `5k+1` là màn thở. Màn thở dễ hơn đỉnh liền trước nhưng khó hơn `5k−1`. | abagames (MIT), Oscillation Method |
| 3 | `p*` đo trên persona median. Novice phải ≥85% ở L1–5. Accuracy từng thao tác bám quanh 85%, chỉ là heuristic. | dda, Wilson 2019, Roohi 2020 |
| 4 | 3 persona (novice/median/skilled). RT ex-Gaussian, median ≈ 450/50/150 ms. σ_m trong dải 20–60 ms. K ≈ 4. Có lapse λ. Learning theo power law. Slope Hick và Fitts phải fit từ playtest. | simulation, cognitive |
| 5 | 1.200 seed/màn, Wilson 95% CI, bisection, Levitt 3-down-1-up để dò ngưỡng persona. Gate: đơn điệu (trừ màn thở), không vượt `hardCap`, báo riêng first-attempt và pass trong ≤3 lần. | simulation, staircase |
| 6 | Map bot→người `ρ = σ(β0 + β1·logit ρ_bot)`, khởi tạo β0=0, β1=1, fit lại sau playtest bằng nút xuất JSON cục bộ. Không server. | King/Gudmundsson 2018 |
| 7 | Runtime: Elo/Rasch của Pelánek, `U(n)=1/(1+0.05n)`, trạng thái tính lại từ `bb_log`. Độ khó màn đóng băng. Bỏ Glicko-2 và TrueSkill. | rating |
| 8 | Nút "Thử bản nhẹ hơn" do người chơi bấm, giảm tối đa −15%, không bao giờ hạ âm thầm. KHÔNG adapt trong ván ở campaign (García-Pérez 1998, rubber band). Kaernbach để phase 2. Ẩn θ. | dda, staircase, Hunicke, Chen |
| 9 | Mô phỏng chạy bước cố định `dt = 1/60`. | simulation (mục missing) |
| 10 | Gom 3 bản `mulberry32` về `BB.mulberry32`, ghi bryc (PD, fallback MIT) vào `legal/licences.json`. Seed = hash(game, L, attempt). | oss |
| 11 | Phát hiện từ code (cả hai đều đúng): `LV_MAX.word = 12` (core.js:203) nhưng word.js:22 `LV_MAX = PHRASES.length` = 49; mem `t=2+L` đảo độ khó ở L30 (32/36 ô); knob chạm trần trước L30; vùng chạm koi dưới 44 px khi cá co; `LEVEL_TIME=90` và ngưỡng pass 80% giữ cố định; kích thước target không phải trục khó. | code |
| 12 | Hướng knob từng game: mem `size ≤ 6`; koi không tăng số cá và tốc độ cùng lúc; rain coi `every` + tầng phép tính là trục khó, `fall` không phải nút cổ chai. Mốc L30 hội tụ một cách tình cờ: train `speedFactor` 0.54–0.55, `burst` 0.28; tốc độ koi ×1.40–1.42; koi `cd` trần 3.2. | cognitive, code |
| 13 | Rule "+10 màn": kéo L, giữ nhịp 5, tăng knob tới `hardCap`, mở knob dự trữ kế tiếp, chạy calibrate, gate xanh rồi mới qua branch + PR. `LV_MAX` lấy từ độ dài bảng. Game mới phải khai knob có `hardCap` và nguồn, core thuần, bot ghép từ `human.mjs`. | dda, simulation |

---

## 2. Chỗ hai bản KHÁC NHAU

Cột "Leo lên Duy?": **Có** nghĩa là chỗ khác nhau đến từ yêu cầu chưa nói rõ. Loại này không quyết bằng phiếu.

| # | Chủ đề | A | B | Research / code ủng hộ bên nào | Leo lên Duy? |
|---|---|---|---|---|---|
| D1 | **Công thức D(L)** | `sqrt((L−1)/29)`, răng cưa đặt lên `p*`, không đặt lên D | `(sqrt(L_eff+5)−√6)/(6−√6)`, răng cưa nằm ngay trong D qua `L_eff = L + W(L)` | **A**. Mũi dda ghi đúng công thức của A. Phép tịnh tiến +5 của B không có nguồn: Roohi chỉ nói người yếu bỏ game khi khó, không nói gì về độ dốc L1→L2. Thêm nữa, nội suy knob theo D (cách của B) sẽ tính lại cả màn legacy. | Không |
| D2 | **Dải pass rate mục tiêu** | 92% → 69% (L30 là đỉnh). Không xuống dưới 65% khi kéo dài. | 94% → 58%. Sàn 45%. | **Research tự mâu thuẫn**: dda 92→75, staircase ≈90→70–75, cognitive 95→55–60, simulation 95→45, oss 90→40–50. Mọi mũi đều ghi "lựa chọn thiết kế, chưa có nguồn". Lomas 2013 nghiêng về phía dễ (thành công 63% cho nhiều lượt hơn 29%) nhưng không cho ra một con số ở L30. | **Có (E1)** |
| D3 | Độ lớn răng cưa | đỉnh −0.06, thở +0.02 trên `p*` | đỉnh +1.0 bậc, thở −1.3 bậc trên `L_eff` | dda đề xuất −0.07/+0.05. Công thức của A **tự vi phạm luật (b) của chính A** từ L16 (xem §3). | Không. Sửa: thở = 0 |
| D4 | **Knob mới mở ở đâu** | màn đỉnh `5k`, màn đó hạ knob cũ một nấc | màn thở `5k+1`, kèm `reliefOnUnlock` | Research chia đôi: dda nói mở ở đỉnh, simulation nói "màn ngay sau relief giới thiệu cơ chế mới". B khớp với chính khẩu hiệu "dạy trước, thử sau" mà A dùng. A mở ở đỉnh, tức là người chơi gặp luật mới lần đầu ngay ở màn áp lực nhất. | Không. Chọn B, đảo được, bot đo được |
| D5 | **Màn legacy** | Đóng băng từng giá trị. Bot chỉ đo. | Sửa nhiều chỗ ở L1–13 (§3), sắp lại toàn bộ word | **A**. Brief yêu cầu "giữ màn hiện có gần như nguyên". Sao lưu theo index màn (`stars[L]`, word.js:88; `bb_stats` core.js:200), nên đổi nội dung màn là lệch sao người chơi đã có. | Chỉ ngoại lệ (E3) |
| D6 | Trigger "bản nhẹ" | thua 2 lần liên tiếp và `σ(θ−b_L) < 0.5`; thua 3 lần thì gợi ý L−1 | thua 3 lần, hoặc thua 2 lần và P < 0.45; bản nhẹ = `L_eff − 2`, kẹp −15% | **A** khớp nguyên văn mũi dda ("P < 0,5 sau 2 lần thua"). 0.45 của B không có nguồn. | Không |
| D7 | Sao và mở khoá khi thắng bằng bản nhẹ | để Duy quyết | B tự quyết: tối đa 1 sao, vẫn mở L+1, θ không vượt `b_L − 0.5` | Research không có. Đây là quyết định sản phẩm. | **Có (E4)** |
| D8 | Daily chọn màn theo θ (target 75%, Papoušek) | không đổi Daily | thay `best+1` (core.js:257) bằng màn có `b_L` gần `θ − 1.10` | Research rating có đề xuất, nhưng đây là đổi hành vi đang chạy. | **Có (E5)** |
| D9 | **Cơ chế/luật mới cho L11–30** | ít: `turnMul` koi, tầng phép rain (O11–O14), tách `speedF`/`burstP` train | nhiều: train `twoTone`/`express`/`oppositeRate`; koi `decoyTier` (art mới) + `scatter`; mem chế độ `seq` Corsi + ô đỏ mồi + `delay`; rain `storm` + `maxDrops 6`; word `hintMode` + `strict` + gợi ý hạ trần 2 sao | Research cognitive/staircase có gợi ý (thứ tự Corsi, ô mồi) nhưng không nói chúng nằm trong scope. Một chế độ mới làm đổi bản chất game, không phải chỉnh knob. | **Có (E5)** |
| D10 | `b_L` cho Elo | `b_L = logit(1 − p_median)` (ngầm hiểu θ_median = 0, a = 1) | fit **IRT 2PL** trên lưới 7 mức θ × 300 seed ra `b_L`, `a_L` | **B**. Mũi rating đề xuất đúng 2PL. Cách của A bỏ mất độ dốc `a_L`. | Không |
| D11 | Gate skilled ở L30 | ≥50% | ≥80% | Phụ thuộc E1. Research không có số. | Theo E1 |
| D12 | Gate novice ở màn thở | ≥60% | không có | A. Mũi simulation đề xuất 60% (ghi rõ là đề xuất). | Không |
| D13 | Gate Playwright parity | không có | G6: 3 seed L1/L15/L30 trên browser thật | B. Mũi simulation: "Playwright chỉ để smoke-test". | Không |
| D14 | Persona | novice = median×1.3, skilled ×0.8; `K ~ N(3.5/4/4.5, 1)` cắt [2,7]; λ 5/3/1.5% | novice 560/80/200, skilled 360/40/100; K cố định 3.3/4.2/5.2; λ 4.5/2.2/1%; có `arithMult`, Corsi span, `f(L)` | **K**: A, vì research ghi `K ~ N(4,1)` cắt [2,7]. **RT novice**: không bên nào dùng số có nguồn. Research có sẵn bộ người lớn tuổi 526/93/305 ms (ExGUtils, arXiv 1707.05759), dùng bộ này. λ, skilled, `f(L)`: cả hai đều không có nguồn. | Không |
| D15 | Học (learning) | `T = A + B(n+E)^−R`, chưa có tham số | `f(L) = 0.86 + 0.14(L+1)^−0.30`, tự ghi là prior | Hai bên đều không có nguồn cho tham số. Chọn A: để trống và fit từ playtest. | Không |
| D16 | Seed | `cyrb53(game|L|n)` | FNV-1a; 3 luồng: daily, campaign (`attemptIdx` 0 cố định), trang trí `^0x9E3779B9` | Cả hai đều PD. Tách luồng như B đầy đủ hơn. Hash thì chọn cyrb53, vì cùng repo bryc với mulberry32 nên chỉ cần một dòng licence. | Không |
| D17 | Rule "+10" khi hết knob | DỪNG, đề xuất knob mới cho Duy kèm mockup (Quy tắc 9) | danh sách cơ chế dự trữ viết sẵn cho L31–40 | A khớp quy tắc Vibe 9 và §3 RULES (đổi scope phải hỏi). | Không |
| D18 | word | giữ thứ tự 49 cụm; solver đo D_word; chỉ cụm mới (50+) mới xếp theo D | chọn 30 trong 49, sắp lại theo `S_word`, 19 cụm đưa vào `SPARE_POOL` | **A** về thứ tự (sao gắn index). Chọn 30 hay 49 là chuyện yêu cầu. | **Có (E2)** |

### Knob ở L10 / L20 / L30

| Game | Mốc | A | B | Code hiện tại (L10) |
|---|---|---|---|---|
| train | L10 | 14 ga · spawn 3.21 · .45 · burst .15 | 14 · **3.65** · .45 · .15 | 14 · 3.21 · .45 · .15 |
| | L20 | 15 · 2.78 · .50 · .22 | 15 · 3.15 · .51 · .23 · twoTone 30% | — |
| | L30 | 15 · 2.40 · .55 · .28 | 15 · 2.75 · .54 · .28 · tt 45% · express 20% · opp 80% | — |
| koi | L10 | 15 cá · cd 2.80 · 4 decoy | 15 · **2.60** · **2** | 15 · 2.80 · 4 |
| | L20 | 15 · 3.20 · 5 · spd ×1.15 · turn ×1.0 | 14 · 3.05 · 3 · 46 px/s (×1.28) · turn 2.0 | — |
| | L30 | 15 · 3.20 · 6 · ×1.40 · turn ×1.5 | 12 · 3.15 · 4 · 51 px/s (×1.42) · 2.3 · T2 · scatter 30 | — |
| mem | L10 | 6×6 · t 12 · show 4.60 | giống A | 6×6 · 12 · 4.60 |
| | L20 | t 17 · k .26 · 5.42 s | t 10 · show 3.0 · disp .25 · 3 ô đỏ · delay .6 | — |
| | L30 | t 18 · k .18 · 4.24 s | `seq` 6 ô · 0.44 s/ô · 1 ô đỏ · delay .3 | — |
| rain | L10 | O10 · 8.05 · 2.80 · 20 | T10 · 8.05 · 2.80 · 20 · **carry 20%** | 8.05 · 2.80 · 20 |
| | L20 | O12 · 7.60 · 2.50 · 24 | T12 · 6.70 · 2.60 · 25 · carry 55% · twoStep 20% | — |
| | L30 | O14 · 6.80 · 2.25 · 25 · 5 giọt | T14 · 5.60 · 2.35 · 28 · 6 giọt · storm 25% · missing 25% | — |
| word | L30 | "mưa phùn" (index 30 hiện tại) | "truyền thống" (index 49 hiện tại) | "mưa phùn" |

Số in đậm ở cột B là chỗ B khác code ở màn legacy.

---

## 3. Lỗi thực tế

### Lỗi của A

| # | Lỗi | Bằng chứng |
|---|---|---|
| A-1 | **Công thức `p*` vi phạm luật (b) của chính A** ("thở không được dễ hơn màn L−4") ở mọi màn thở từ L16 trở đi | Tính lại: p*(16)=0.8177 > p*(12)=0.8153; p*(21)=0.7988 > p*(17)=0.7937; p*(26)=0.7822 > p*(22)=0.7753; L31, L36 cũng vi phạm. Bảng của A làm tròn nên che được L16, nhưng vẫn lộ ra ở L21B=80 > L17=79. Sửa: offset màn thở = 0. |
| A-2 | "Số tàu ≈ 90/spawnS: khoảng 21 ở L1". Thực ra `m` không phải khoảng cách trung bình. | train.js:274–280: mỗi khoảng là hỗn hợp burst (~13%, ×0.625), nghỉ (~20%, ×1.8) và thường (67%, ×1.05), nên trung bình ≈ 1.14·m. L1 ≈ 4.95 s/tàu, tức ~18 tàu, khớp comment trong code "~5s/tàu ở level 1 … 18→25 tàu". B cũng gọi `m` là `spawnMean`, nên lỗi tên này có ở cả hai bản. |
| A-3 | "34 lời gọi `Math.random`" | Có 39 lời gọi nằm trên 34 dòng (koi 9, rain 9, train 8, train-map 7, mem 1). Không đổi kết luận. B có cùng lỗi. |
| A-4 | Lệch khỏi dda (−0.07/+0.05 → −0.06/+0.02) mà không nói | Không sai, nhưng là chỉnh research mà không ghi lại. |
| A-5 | Đặt `hardCap` stations = 15 nhưng chưa kiểm luật ≥44 px của chính A cho train | train-map.js:30 cho 8 cột khi n≥12; train.js:67 `cell = W/(C−1+1.3)` ra 47 px ở 390 px nhưng chỉ **38.5 px ở 320 px**. B cũng bỏ sót (chỉ tính ở 390). Màn legacy L8–11 đã vướng chuyện này. |

### Lỗi của B

| # | Lỗi | Bằng chứng |
|---|---|---|
| B-1 | **Đổi màn legacy dù tự tuyên bố "giữ L1..10 sát nguyên bản"** | train: spawn L2–11 lệch, ví dụ L10 3.65 so với code 3.21 và L11 3.75 so với 3.08 (train.js:274); L11 có 14 ga so với 15 (train-map.js:25); L11 speedFactor .46 so với .45 (train.js:25). koi: cd ở L2/L5/L10 là 1.65/2.20/2.60 so với 1.60/2.05/2.80; L6 có 10 cá so với 11; decoy L6–10 là 1/2/2/2/2 so với 2/3/3/4/4 (koi.js:46–50). mem: L6 show 3.80 so với 3.40; L11–13 t=11/12/12 so với 13/14/15 (mem.js:31–35). rain: L6 fall/every 10.85/3.95 so với 10.25/3.60; thêm `carryBias` 20% vào L6–10, tức là đổi đề. word: sắp lại cả 49 cụm trong khi sao lưu theo index (word.js:88). |
| B-2 | **Bảng "kết quả chạy thử sơ khởi" và câu "kết quả chạy mô phỏng cho thấy … dưới 10%" không có artifact nào chống lưng** | Worktree `wt-agy-design/` chỉ có thêm `DESIGN-NEON.md`, không có `scripts/sim/`. `agy-design.log` xác nhận chỉ ghi một file đó. Bảng còn tự mâu thuẫn: word "6.18 lượt TB" lớn hơn `MAX_TRIES = 6` (word.js:5); và nó làm trượt chính các gate của B (train L15 median 100% so với p* 72%; koi skilled L30 77% < G3 80%). **Không được dùng làm bằng chứng.** |
| B-3 | D(31) = 0.981 | Tính lại theo công thức của B: L31 là màn thở nên L_eff = 29.7, ra D = 0.969. |
| B-4 | "`turnMax = 1.6 rad/s`" | koi.js:227: `turnTarget = (rand−0.5)·1.6`, tức ±0.8 rad/s. Khi né tường (koi.js:232) có thể quay mạnh hơn. 1.6 là bề rộng dải, không phải giá trị max. |
| B-5 | "`leadCells = 5` — ngã rẽ đầu cách hầm tối thiểu 5 ô" | train-map.js:185 chỉ là điểm phạt mềm trong `styleScore`, với target `max(5, round(R·0.4))`, không phải ràng buộc cứng. |
| B-6 | "`makeEq` viết cứng `switch(L)` tới 10" | rain.js: case 1–9, còn L≥10 đi nhánh `default`. Không quan trọng. |
| B-7 | Prado 52 ms được gán cho "nhóm học thuộc bảng cửu chương", rồi dùng để biện minh thứ tự L6 | Research ghi 52 ms là mẫu người Trung Quốc, 144 ms là mẫu Mỹ. Nối sang người Việt là suy luận, research ghi rõ "chưa đo". |
| B-8 | Trần gọi là "sinh lý" nhưng không có nguồn: `speedFactor ≤ .62`, koi ≤ 58 px/s, `fall ≥ 5.0`, `every ≥ 2.15`; thêm θ₀ = −1.5, dải "Vừa sức" [0.68, 0.86], chi phí rain (+0.22 / +0.45 / +0.36 s, 0.22 s/chữ số), 2.3 bit/lượt, trọng số `S_word` | Mấy số trần không gắn nhãn prior như các số persona. A cũng đoán trần (spdMul 1.5) nhưng có ghi là đoán (R9). |
| B-9 | Phần đọc code của B đúng ở nhiều chỗ | Đúng: `st.two` có sẵn (train.js:45/186), 8 cột → 47 px ở 390 px, vùng chạm koi `b ≥ 16` (koi.js:270), Daily bị kẹp ở 12 cho word (core.js:257), input tối đa 3 chữ số (rain.js:158). |

---

## 4. Spec gộp, đề xuất cho engineer

Nhãn nguồn: **A**, **B**, **R:<mũi>** (research), **code:<file:dòng>**, **MỚI** (chỗ gộp tự đặt, chưa có nguồn, bot sẽ chỉnh). Mọi giá trị của L12–30 là điểm khởi đầu. Bot calibrate trước khi ship.

**Còn chờ Duy:** E1 quyết `p_bottom`. E5 quyết các cơ chế đánh dấu `[E5]`. Phần dưới viết theo mặc định đề xuất.

### 4.1 Engine (`js/difficulty.js`, IIFE, chạy trên browser và `node:vm`)

```
D(L)    = sqrt((L−1)/29)                                   // A, R:dda (abagames MIT). L>30 → D>1
kind(L) = L≥5 && L%5==0 ? 'peak' : (L>5 && L%5==1 ? 'breather' : 'step')   // A=B
p*(L)   = max(p_floor, p_top − (p_top − p_bottom)·D(L) − 0.06·[peak])     // A, sửa lỗi A-1
          p_top = 0.92 (R:dda); p_bottom = 0.75 (R:dda) ⇒ L30 peak = 0.69   ← CHỜ E1
          màn thở: offset 0 ⇒ luôn dễ hơn đỉnh liền trước, khó hơn L−4 (đã kiểm L6..L36)
          p_floor = 0.65 (A) ← CHỜ E1
```

- Bảng knob tĩnh `js/levels/<game>.js`: `{legacyN, knobs[{name,dir,hardCap,step,unlockAt,source}], table[L1..L30], calibratedAt, simVersion}` (A). Màn `1..legacyN` sinh lại đúng công thức trong code hiện tại (A, rule 1).
- Luật bậc thang:
  - mỗi màn step đổi 1 knob chính, tối đa 2 (A, R:staircase);
  - **knob mới mở ở màn thở `5k+1`**, kèm nới knob tải chính một nấc (B `reliefOnUnlock`, R:simulation);
  - màn đỉnh đẩy knob đang có thêm một nấc (MỚI);
  - knob đếm được mà người chơi thấy không đổi giữa ván (A, R:staircase);
  - target ≥ 44 px, không bao giờ là trục khó (A=B, Parhi 2006).
- Feedforward: so `spec(L)` với `spec(L−1)` để in một dòng "Tăng: …" trên nút chơi (B, R:staircase Lomas).
- Seed: `BB.mulberry32(cyrb53(...))`, 3 luồng (B + A):
  - `daily|dayKey|game|L`;
  - `camp|game|L|attemptIdx`, lần thử 0 cố định để QA;
  - trang trí `seed ^ 0x9E3779B9`.
  - Ghi bryc vào `legal/licences.json` (R:oss).
- `BB.DIFF.max(game) = table.length`, thay `LV_MAX` hard-code ở core.js:203 (A=B).

### 4.2 Bảng knob L1..L30

Quy ước: L1..legacyN = code hiện tại (không sửa). **Đậm** = knob đổi ở màn đó. B = thở, P = đỉnh.

#### train (legacyN = 11). Nguồn bảng: A; dời màn mở knob sang màn thở.

Định nghĩa:
- `base` = `m` hiện tại (train.js:274). Khoảng trung bình thật ≈ 1.14·base (lỗi A-2).
- Từ L12, `base` tách khỏi công thức cũ (A).

`hardCap` (đều là đoán, bot kiểm):
- base ≥ 2.30 (A);
- speedF ≤ 0.58 (A);
- burstP ≤ 0.30 (A);
- stations 15 (code:train-map.js:6).

**Trước khi ship L12+, SWE phải sửa ô < 44 px ở viewport 320 (A-5).**

| L | st | base | speedF | burstP | | L | st | base | speedF | burstP |
|---|---|---|---|---|---|---|---|---|---|---|
| 1–11 | 4+L | `max(1.8,2.6−.075(L−1))×1.667` | .45 | .15 | | 21B | 15 | **2.85** | .50 | **.22** |
| 12 | 15 | **3.00** | .45 | .15 | | 22 | 15 | **2.78** | .50 | .22 |
| 13 | 15 | **2.92** | .45 | .15 | | 23 | 15 | **2.70** | .50 | .22 |
| 14 | 15 | **2.85** | .45 | .15 | | 24 | 15 | **2.62** | .50 | .22 |
| 15P | 15 | **2.78** | .45 | .15 | | 25P | 15 | **2.55** | .50 | .22 |
| 16B | 15 | **3.00** | **.50** | .15 | | 26B | 15 | **2.78** | **.55** | .22 |
| 17 | 15 | **2.92** | .50 | .15 | | 27 | 15 | **2.70** | .55 | .22 |
| 18 | 15 | **2.85** | .50 | .15 | | 28 | 15 | **2.62** | .55 | .22 |
| 19 | 15 | **2.78** | .50 | .15 | | 29 | 15 | **2.55** | .55 | .22 |
| 20P | 15 | **2.70** | .50 | .15 | | 30P | 15 | **2.48** | .55 | **.28** |

- Knob dự trữ cho L31+ (A): ga hai màu, dùng `st.two` có sẵn (code:train.js:45/186).
- `[E5]` Nếu Duy cho thêm cơ chế: `twoTone` của B có thể mở ở L21B thay cho burst.

#### koi (legacyN = 10). Bảng gộp: legacy từ code; số cá giảm ở màn thở theo B (Alvarez & Franconeri: tốc độ đổi lấy số mục tiêu); tốc độ/quay theo A.

`hardCap`:
- koi 15 (code), cd 3.2 (code:koi.js:48);
- decoys 6, spdMul 1.5, turnMul 1.6 (A, đều là đoán).

`spdMul` nhân lên `spd` (code:koi.js:67). `turnMul` nhân lên tần suất đổi `turnTarget` (A).

**Trước khi ship L11+: nâng sàn vùng chạm lên `a ≥ 24, b ≥ 22`** (B, sửa F2 / koi.js:270).

| L | koi | cd | decoys | spdMul | turnMul | | L | koi | cd | decoys | spdMul | turnMul |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1–10 | 5+L | 1.3+.15L | code | 1.00 | 1.0 | | 21B | **12** | 3.20 | **5** | 1.25 | 1.0 |
| 11B | **12** | 2.80 | 4 | **1.05** | 1.0 | | 22 | 12 | 3.20 | 5 | **1.30** | 1.0 |
| 12 | **13** | **2.95** | 4 | 1.05 | 1.0 | | 23 | **13** | 3.20 | 5 | 1.30 | 1.0 |
| 13 | **14** | **3.10** | 4 | 1.05 | 1.0 | | 24 | 13 | 3.20 | 5 | **1.35** | 1.0 |
| 14 | 14 | **3.20** | 4 | **1.10** | 1.0 | | 25P | **14** | 3.20 | 5 | 1.35 | 1.0 |
| 15P | **15** | 3.20 | 4 | 1.10 | 1.0 | | 26B | **12** | 3.20 | 5 | 1.35 | **1.2** |
| 16B | **12** | 3.20 | 4 | **1.15** | 1.0 | | 27 | 12 | 3.20 | 5 | 1.35 | **1.3** |
| 17 | **13** | 3.20 | 4 | 1.15 | 1.0 | | 28 | 12 | 3.20 | 5 | **1.40** | 1.3 |
| 18 | 13 | 3.20 | 4 | **1.20** | 1.0 | | 29 | 12 | 3.20 | **6** | 1.40 | 1.4 |
| 19 | **14** | 3.20 | 4 | 1.20 | 1.0 | | 30P | **13** | 3.20 | 6 | 1.40 | **1.5** |
| 20P | 14 | 3.20 | 4 | **1.25** | 1.0 | | | | | | | |

- Mốc L30 ×1.40 tốc độ là chỗ A và B tình cờ trùng nhau.
- Rủi ro lớn nhất vẫn như A nói: nếu bot thấy L10 legacy đã dưới `p*`, phải hạ trần `spdMul` (≈1.25).
- `[E5]`: `decoyTier` (art mới) và `scatter` của B.

#### mem (legacyN = 13). Hướng theo B và R:cognitive/staircase (không tăng t nữa, chuyển sang knob khác); giá trị theo A (`k` = giây nhìn mỗi ô) + `disp` của B.

Ràng buộc:
- `t ≤ 15`: giữ mức legacy L13, không đi tiếp như A (R:cognitive khuyên t ≤ 10–12, nhưng legacy đã ở 15).
- Luật chống đảo của A: `t ≤ floor(size²/2)`.
- `show = 1.0 + k·t` (A).
- `disp` = xác suất ép ô sáng không kề nhau, để chặn gộp cụm (B).
- Sàn `k` = 0.18 (A, chưa có nguồn, phải đo).

| L | size | t | k | disp | show s | | L | size | t | k | disp | show s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1–13 | code | 2+L | .30 | 0 | 1+.3t | | 22 | 6 | **14** | .26 | .20 | 4.64 |
| 14 | 6 | 15 | **.28** | 0 | 5.20 | | 23 | 6 | 14 | **.25** | .20 | 4.50 |
| 15P | 6 | 15 | **.26** | 0 | 4.90 | | 24 | 6 | 14 | **.24** | .20 | 4.36 |
| 16B | 6 | **13** | **.28** | **.10** | 4.64 | | 25P | 6 | **15** | .24 | .20 | 4.60 |
| 17 | 6 | **14** | .28 | .10 | 4.92 | | 26B | 6 | **13** | .24 | **.30** | 4.12 |
| 18 | 6 | 14 | **.27** | .10 | 4.78 | | 27 | 6 | **14** | .24 | .30 | 4.36 |
| 19 | 6 | 14 | **.26** | .10 | 4.64 | | 28 | 6 | 14 | **.22** | .30 | 4.08 |
| 20P | 6 | **15** | .26 | .10 | 4.90 | | 29 | 6 | 14 | **.20** | .30 | 3.80 |
| 21B | 6 | **13** | .26 | **.20** | 4.38 | | 30P | 6 | **15** | **.18** | .30 | 3.70 |

- `ROUNDS=3`, `NEED=2` giữ nguyên. Stagger 25 ms/ô cộng thêm như code hiện tại (mem.js:137–144).
- `[E5]`: chế độ `seq` Corsi (B, R:cognitive), ô đỏ mồi, `delay`. Mặc định để dành cho L31+, như A.

#### rain (legacyN = 10). Số `fall`/`every`/`target` theo A. Tầng phép tính gộp A+B, đặt ở màn thở. Phép mới chiếm 30% số giọt (A).

`hardCap` (A):
- every ≥ 2.20;
- fall ≥ 6.80;
- target ≤ 25;
- tối đa 5 giọt (code:rain.js:78), không lên 6 như B.

| Tầng | Nội dung | Nguồn |
|---|---|---|
| O10 | nhánh `default` hiện tại | code:rain.js |
| O11 | O10 + ép cộng/trừ có nhớ | B `carryBias`, R:cognitive liệt kê "có nhớ" |
| O12 | O11 + tìm số thiếu `? + b = c`, `? × b = c` | A=B |
| O13 | O12 + hai bước `a × b ± c` (a,b 2–9, c ≤ 20) | B; A có bản `a+b−c` |
| O14 | O13 + 2 chữ số × 1 chữ số (11–25 × 2–9) | A |

| L | ops | fall | every | target | | L | ops | fall | every | target |
|---|---|---|---|---|---|---|---|---|---|---|
| 1–10 | code | 13−.55(L−1) | 4.6−.2(L−1) | 10+L | | 21B | **O13** | **7.80** | **2.60** | 24 |
| 11B | **O11** | **8.60** | **3.00** | 20 | | 22 | O13 | **7.60** | **2.50** | **25** |
| 12 | O11 | **8.30** | **2.85** | **21** | | 23 | O13 | **7.40** | **2.40** | 25 |
| 13 | O11 | **8.05** | **2.75** | 21 | | 24 | O13 | **7.20** | **2.35** | 25 |
| 14 | O11 | 8.05 | **2.65** | **22** | | 25P | O13 | **7.00** | **2.30** | 25 |
| 15P | O11 | **7.80** | **2.55** | 22 | | 26B | **O14** | **7.40** | **2.50** | 25 |
| 16B | **O12** | **8.30** | **2.80** | 22 | | 27 | O14 | **7.20** | **2.40** | 25 |
| 17 | O12 | **8.05** | **2.65** | **23** | | 28 | O14 | **7.00** | **2.30** | 25 |
| 18 | O12 | **7.80** | **2.55** | 23 | | 29 | O14 | **6.80** | **2.25** | 25 |
| 19 | O12 | **7.60** | **2.45** | **24** | | 30P | O14 | 6.80 | **2.20** | 25 |
| 20P | O12 | **7.40** | **2.40** | 24 | | | | | | |

- `fall` và `every` đi cặp, vì tỉ số của chúng là số giọt trên màn hình. Rain được miễn luật 1 knob (A).
- Đáp án luôn nằm trong 0..999, vì input tối đa 3 chữ số (code:rain.js:158).
- `[E5]`: `storm` của B.

#### word (đang có 49 màn). Theo A.

- Không sắp lại, vì sao lưu theo index (code:word.js:88).
- Solver bot đo D_word cho cả 49 cụm, báo chỗ không đơn điệu (A).
- Cụm mới (50+) xếp theo D_word. Các predictor lấy từ DiSilvio 2023 (CC BY 4.0): n, số chữ lặp, dấu, entropy. `S_word` của B làm ứng viên, nhưng trọng số chưa có nguồn.
- `MAX_TRIES = 6` giữ nguyên.
- 30 hay 49 là **E2**.
- `[E5]`: `hintMode`, `strict`, luật gợi ý hạ trần 2 sao (B).

### 4.3 Người chơi mô phỏng (`scripts/sim/human.mjs`)

| Tham số | novice | median | skilled | Nguồn |
|---|---|---|---|---|
| RT ex-Gaussian μ/σ/τ (ms) | **526/93/305** | **451/47/147** | 360/50/120 | novice + median: R:simulation (ExGUtils, arXiv 1707.05759; task go/no-go, không phải game). skilled: A, đoán |
| Motor σ_m (ms) | 60 | 40 | 20 | A, R:simulation (Isaksen 2015 quét 20–60) |
| K | N(3.5,1) | N(4,1) | N(4.5,1), cắt [2,7] | A, R:cognitive |
| Corsi span (chỉ khi có `seq`) | 5.1 | 6.2 | 7.4 | B, R:cognitive (6.2 ± 1.3) |
| Lapse λ | .05 | .03 | .015 | A, chưa có nguồn (R:staircase nhắc 2–5%, chưa kiểm) |
| Learning | `T = A + B(n+E)^−R` áp lên σ_m, τ, λ; tham số fit từ playtest | | | A, R:simulation (Isaksen, Lane 1987) |
| Hick `a + b·log2 n`, Fitts | fit từ playtest | | | A=B |
| Chi phí phép tính rain | cộng nhỏ 0.64–0.83 s; PSE nhân 52–144 ms; có nhớ +0.22, tìm số thiếu +0.36, hai bước +0.45, gõ 0.22 s/chữ số | | | 2 số đầu: R:cognitive. Còn lại: B, prior chưa có nguồn |
| word | vốn từ .72/.90/.98; sót dấu 14/7/2.5% | | | B, prior |

Bot từng game:
- train/koi/mem/word: theo bảng §3.2 của A.
- rain: event-driven như B.
- Thêm `margin` cho mọi bot (B, Kristensen 2021). Ví dụ train `pct − 80`, rain `3 − misses`.
- train phải mô phỏng khoảng spawn hỗn hợp thật, không dùng `m` (lỗi A-2).

### 4.4 Calibration và gate (`scripts/sim/calibrate.mjs`)

1. Tách gen thuần ra `js/levels/<g>.js`, rng tiêm vào, `dt = 1/60` (A=B).
2. 1.200 seed cho mỗi (game, L, persona). Báo p, Wilson CI, E[attempts] (A=B, R:simulation).
3. Màn legacy: chỉ đo, không sửa (A).
4. Màn mới: bisection trên knob in đậm cho tới khi `|p_median − p*| ≤ 5` điểm và CI nằm trọn trong dải (A). Knob chạm `hardCap` thì chuyển knob kế tiếp.
5. Fit IRT 2PL trên lưới θ ∈ {−2.4 … +2.4} × 300 seed để ra `b_L`, `a_L`, ghi vào `levels-<g>.json` cho Elo runtime (B, R:rating).
6. Gate T0, FAIL nếu vi phạm:
   - G1: novice ≥85% ở L1–5 (A=B);
   - G2: `p_median` không tăng giữa hai màn step liên tiếp (A=B);
   - G3: màn thở dễ hơn đỉnh liền trước và khó hơn L−4 (A, sau khi sửa A-1);
   - G4: novice ≥60% ở mọi màn thở (A, R:simulation);
   - G5: skilled ở L30 ≥ ngưỡng **chờ E1** (A 50% / B 80%);
   - G6: mọi knob trong `hardCap`, mọi target ≥44 px ở **cả 320 và 390 px** (A=B + A-5);
   - G7: Playwright parity 3 seed L1/L15/L30 (B);
   - G8: báo first-attempt và pass trong ≤3 lần (A=B).
7. Map bot→người: β0=0, β1=1. Fit lại sau playtest. Giao thức playtest theo B §5.3: 3–5 người, 5 màn neo mỗi game (L1/5/10/20/30), xuất JSON từ `bb_log`.

### 4.5 Lớp runtime

- `θ_g` theo Pelánek, `U(n) = 1/(1+0.05n)`, tính lại từ `bb_log`. Ván có `assist: true` không được cập nhật θ (A=B).
- Nút "Thử bản nhẹ hơn": hiện khi thua 2 lần liên tiếp và `σ(θ−b_L) < 0.5` (A, R:dda). Bản nhẹ = một nấc trên knob chính, kẹp −15% (A=B, Hunicke). Thua 3 lần liên tiếp thì gợi ý L−1 (A=B, Brain Workshop).
- Sao, mở khoá và nút "Nhịp chậm 0.85×": **chờ E4**.
- Daily giữ `best+1`: **chờ E5**.
- Ẩn θ (A=B).

### 4.6 Rule "thêm 10 màn" và "game mới" (lưu vào "gates/03-build/DIFFICULTY-RULE.md" — bản chốt hiện tại: `docs/DIFFICULTY-RULES.md` sau khi Duy duyệt)

"Thêm 10 màn":
1. Đọc `js/levels/<g>.js` và báo cáo calibrate gần nhất.
2. Kéo L tới N+10, D > 1 được phép. `p*` dùng cùng công thức, không dưới `p_floor` (chờ E1). Giữ lịch đỉnh/thở.
3. Tăng knob theo `step` tới `hardCap`. Knob dự trữ mở ở màn thở `5k+1`, kèm nới knob tải chính.
4. **Hết knob thì DỪNG**, đề xuất knob mới cho Duy kèm mockup HTML (A, Quy tắc Vibe 9).
5. `node scripts/sim/calibrate.mjs <g> --from N+1`, G1–G8 xanh.
6. Branch `feat/levels-<g>-<to>`, PR (LUẬT 12). `LV_MAX` tự tăng. Ghi một dòng có ngày vào `PIPELINE.md`.

"Game mới":
- S1 khai trục khó `{name, dir, min, hardCap, step, unlockAt, nguồn}`, pass rule, star rule, và định nghĩa một trial (A=B).
- Chọn một trong 5 họ nhận thức (B): Hick+Fitts, MOT, WM/Corsi, tính nhẩm + hàng đợi, entropy.
- Viết core thuần `(spec, rng)` và bot ghép từ `human.mjs`.
- Đặt tay L1 và L30, calibrator điền phần giữa (A).
- Kiểm licence (MIT/BSD/ISC/CC0/Apache/PD).

### 4.7 Chưa xác minh được

- Mọi số của L12–30 ở §4.2 (MỚI hoặc lấy từ A/B) đều chưa chạy bot. Chưa có `scripts/sim/` nào tồn tại.
- Mọi `hardCap`, λ, RT skilled, sàn `k`, chi phí phép tính có nhớ / hai bước / 2×1, slope Hick, quy đổi tốc độ MOT sang px/s đều không có nguồn.
- Dải `p*` và cỡ răng cưa (0.06) là lựa chọn thiết kế.
- RT novice 526/93/305 là số của task go/no-go ở người lớn tuổi, không phải số đo trên game.
- Bảng kết quả mô phỏng của B: không tái lập được (B-2).

---

## 5. Danh sách leo lên Duy (hỏi từng câu, theo thứ tự này)

| # | Câu hỏi | Vì sao không tự quyết được |
|---|---|---|
| E2 | word: cắt ở 30 hay mở cả 49? | Brief nói 30 màn/game. Code đang mở 49 và người chơi có thể đã có sao ở L13–49. Rẻ nhất và gỡ được hub/Daily, nên hỏi đầu. |
| E3 | Nếu bot thấy màn legacy nằm ngoài đường cong (nghi nhất: koi L10, mem L13), có được sửa không? | Brief nói "gần như nguyên", không nói có ngoại lệ. Sửa thì lệch sao người chơi đã có. |
| E1 | L30 khó tới đâu: median đỉnh ~69% (A) hay ~58% (B)? Kéo theo sàn cho L31+ và gate skilled. | Cả năm mũi research cho năm dải khác nhau, mũi nào cũng ghi "chưa có nguồn". Đây là câu hỏi về người chơi mục tiêu (thư giãn hay thử thách). |
| E4 | Thắng bằng bản nhẹ: được mấy sao, có mở L+1 không? Có thêm tuỳ chọn "Nhịp chậm 0.85×" không? | Quyết định sản phẩm. Research không có. |
| E5 | L11–30 chỉ chỉnh knob, hay được thêm cơ chế/luật mới? Danh sách: mem `seq`/ô đỏ, rain `storm`, koi `scatter`/`decoyTier`, train `twoTone`/`express`, word `strict`/khoá gợi ý, Daily theo θ. | Thêm luật là đổi bản chất game. Cần mockup cho từng cơ chế (Quy tắc 9). Mặc định trong spec: chỉ chỉnh knob, cơ chế để dành cho L31+. |
