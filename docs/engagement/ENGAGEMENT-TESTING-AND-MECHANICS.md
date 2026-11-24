# Nghiên cứu sâu: Automation Test (Tò mò, Kích thích, Kích thước) & Cơ chế Core Game — Brainy Bits

- **Ngày:** 2026-11-24 · **Loại tài liệu:** Tham chiếu (`reference`) · **Nhánh:** `docs/engagement-and-autotest-research`
- **Route & Quy trình 4 pha:** `[Route: T3 · S=7/8 · SWEEP=3 mũi mù (Gemini 3.8 Flash) + Kiểm toán code + DEDUPE (Python T0) + REFUTE (2 lăng kính độc lập) + JUDGE]` · Tài liệu tham khảo chuẩn xưởng `docs/method.md`.
- **Review provenance:** Same vendor, same priors — no external verifier ran (Quy tắc Vibe 7). Không sửa code game hay đẩy con trỏ trong lượt này.
- **Ghi chú URL trích dẫn:** Toàn bộ URL internet bên dưới là URL chuyển hướng grounding nguyên văn do `search_web` trả về (kèm nhãn tên miền tương ứng); chưa resolve chuyển hướng tới trang đích cuối.

**TL;DR.** **Automation test không thể bảo đảm 100% cảm giác tò mò hay kích thích chủ quan của người chơi** vì định luật Goodhart, ảo giác input miễn phí của bot, và thiếu trạng thái cảm xúc. Ngược lại, automation **chặn rất rẻ và chính xác** hai nhóm lỗi thật trên `main`: (1) **cấu trúc ván phẳng lì** (`rain` L1–10 median thắng 100% với 0% thắng sát nút; `mem` L1–15 thắng nhanh 2-0 tới 68–85%; `koi` L5 chênh lệch kỹ năng bằng 0; `word` bot xếp từ 9 chữ ở L1 dễ hơn 5 chữ ở L30) và (2) **lỗi kích thước / chen chúc ở level cao** (`koi` L30 tại `320×500` có 60,9% xác suất chồng vùng chạm lân cận; `train` L15 tại `667×315` có cạnh ô `38,0 px < 44 px` đĩa gạt). Sau 4 pha lọc (`28 -> 20 -> 33` đánh giá phản biện), **4/15 hạng mục test** và **7/25 cơ chế core/meta** sống sót kèm điều kiện bắt buộc hoàn thành cổng `G7` trước.

---

## 1. Kiểm toán trực tiếp mã nguồn `brainy-bits` (`main` @ `3a4c5d3`)

### 1.1 Độ mới giữa các level, độ căng thẳng và phân tách kỹ năng (`N = 300`/mức)

| Game | Luật ẩn bị khoá (`E5`) | Số bước đơn trục <5% | Điểm yếu ván phẳng / chênh lệch kỹ năng đo được |
|---|---|---|---|
| `train` (`maxL=33`) | `twoTone` (`unlockAt=31`) | 8 bước | L1–10 thắng sát nút (`closeWin`) chỉ 3–7%; `57%` ván L1–5 qua với độ chính xác 100%; `js/levels/train.js:32` ghi nhận tàu nhanh hơn khiến adapter giải dễ hơn (ngược phản xạ người thật). |
| `koi` (`maxL=33`) | `scatter` (`unlockAt=31`) | 3 bước (`exactSameAsPrev=1`) | L5 có chênh kỹ năng `skilled - weak = 0,00` (`weak=0,95, med=0,94, sk=0,95`); L1–14 chưa có cá xám. |
| `mem` (`maxL=33`) | Không có | 0 (`exactSameAsPrev=1`) | L1–15 bản median thắng nhanh `2-0` (100% accuracy) tới `68–85%` (L1 `85%`, L5 `85%`, L10 `76%`, L15 `68%`), hiếm khi chạm lượt 3; `scripts/sim/adapters/mem.mjs:79` trả `margin = perfect - NEED = 0` cho cả `2-0` lẫn `2-1`. |
| `rain` (`maxL=33`) | `storm` (`unlockAt=31`) | 4 bước | L1–10 `med=1,00`, `closeWin=0%`; từ L15 trở đi `weak` rơi xuống `0,30` (L15) rồi `0,07–0,08` (L25–30) trong khi `skilled=0,96–0,97` (`spread=0,89`). |
| `word` (`maxL=50`) | Không có | 0 (`exactSameAsPrev=11`, `6` cấu hình) | Thứ tự phụ thuộc bot xếp cụm 9 chữ (`p46`) ở L1 (`1–2` lượt đoán chiếm `31%`, `5–6` lượt chỉ `3%`) và đẩy cụm 5 chữ (`p4`) sang L30 (`5–6` lượt chiếm `53%`); `js/word.js:459,781` giấu gợi ý chủ đề sau nút bấm miễn phí trong khi `scripts/sim/adapters/word.mjs` tính như mở sẵn từ dòng 2. |

### 1.2 Kiểm toán kích thước ("kích thước") & sai lệch parity ẩn

- **Chen chúc vùng chạm ở `koi` bị che bởi G6 tĩnh:** `scripts/sim/adapters/koi.mjs:135-140` luôn báo `44,0 px` cho mọi level. Đo hình học thực tế ở L30 (`13` koi + `5` cá xám, vùng chạm `48×44 px`):
  - `320×500` (dọc nhỏ): dài cá `35,4 px`, xác suất hai cá lân cận chồng vùng chạm lên tới **`60,9%`** (`hitAreaFill = 24,8%`); tại L15 là **`51,2%`**.
  - `667×315` (ngang ngắn): **`56,1%`** tại L30 (`46,7%` tại L15); `390×640`: **`43,1%`** tại L30.
  - Ngoài ra `js/koi.js:85` thu nhỏ cá `0,85×` khi `fish.length > 11` (tính cả cá xám), còn `scripts/sim/adapters/koi.mjs:43` chỉ kiểm `koi > 11` (bỏ quên cá xám).
- **Ô đường ray `train` nhỏ hơn đĩa nút gạt ở màn cao cấp:** `scripts/sim/adapters/train.mjs:182-191` đo kích thước ở khung `H = 1,6 × W`. Thực tế ở L15/L30 (`15` ga, `C = 8`):
  - Khung `320×512`: cạnh `cell = 38,5 px` trong khi đĩa nút gạt vẽ tối thiểu `44 px` (`visualDiscPx`).
  - Khung ngang ngắn `667×315`: cạnh `cell = 38,0 px < 44 px`.
- **`word` thiếu `geometry()`** trong `scripts/sim/adapters/word.mjs:215`; `tests/responsive.spec.js` chỉ kiểm tra duy nhất **L1** thay vì các màn dày nhất (L15/L30/`maxLevel`).
- **Tràn menu chọn màn và bất công input chờ sửa:** `.lvgrid` hiện cao `626 px` trong vùng nhìn `129 px` ở `320×568` (`1,40–2,12× vh`, ghi nhận tại `docs/difficulty/daily/2026-11-24.md:83`); `js/koi.js:347` phạt `earlyTaps++` (mất 3 sao) ngay cả khi `cooldown` chỉ còn vài chục mili-giây; `js/rain.js:206-225` để giọt rơi chạm nước mất mạng trong lúc `pendT` (`AUTO_WAIT = 0,6s`) đang giữ đúng đáp án người chơi đã gõ; `scripts/sim/calibrate.mjs:76-84` bỏ qua `margin` và `detail` mà cả 5 adapter đã trả về; cổng `G7` ở `scripts/sim/calibrate.mjs:153` vẫn `SKIP`.

---

## 2. Quy trình nghiên cứu 4 pha & Kết quả gộp trùng (`SWEEP → DEDUPE → REFUTE → JUDGE`)

Ba mũi `SWEEP` độc lập quét tài liệu học thuật, thực hành studio và chuẩn kiểm thử web đã tìm ra **28 mục gốc**, script Python `DEDUPE` gộp còn **20 ứng viên** (**8 ứng viên hội tụ từ ≥ 2 mũi**: `M-KISHO`, `T-SKILLDEPTH`, `T-ERA`, `T-DRAMA`, `T-NEARMISS`, `T-GOODHART`, `S-CROWD`, `S-MOVING`; cùng 12 ứng viên đơn mũi). Ở pha `REFUTE`, hai subagent độc lập tấn công toàn bộ ứng viên cùng từng biến thể game (**33 lượt phản biện**: 15 phương án test theo lăng kính CI/Goodhart và 18/25 nhánh cơ chế theo lăng kính người chơi/tiếp cận/calibration).

### Nguồn dẫn chứng chính từ 3 mũi `SWEEP` (URL grounding nguyên văn)

| Nhóm | Nguồn / Tác giả | Điểm rút ra cốt lõi | URL `search_web` |
|---|---|---|---|
| Curiosity / Coverage | Pathak et al. (2017) — ICM | Tự thưởng dựa trên sai số dự đoán chuyển trạng thái; bản neural đòi hỏi RL nặng | [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFTdV2acyccloxRLRdRKL8HAqDScuW848ewbL6ypGJKWGpZ_WJehDxr_zNQX-g4eFTfoeCdo3qcqc7QG77m54HMG7EKIlj-TPNUVh1zQqH0Ks9RRQPUxw==) |
| Curiosity / Coverage | EA SEED — Gordillo et al. (CoG 2021) | Tối đa hoá độ phủ trạng thái phát hiện ngõ cụt & va chạm thiếu | [ea.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEt9_O_Ak5H8mYqzaOX_hXAj67Afm1er35O5pMaNFKol1Jw58iGEcajIkDJ7SmvHV2CCsQbtUDBLuhaF3sSAXrNv2gO4APW5Jk6Qkt3n7y-0T8Qm6e89zA5g_MIKi_rhP1SHd7D5WfiOwT79NpuSEsEAR32O_JnNsiBLB4Wfv1hYvIFQ897SNa4TXHQO4g80iNmHwPxGPO_sGNdXZBqC7PyyLwhOLaIly8JR3pEPhI=) · [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFDb8dYOBx-XIhieMaZyB4oM-o4x8MvdRrxXg9DjvXhniZ0ivEAvU2woaJGzIC6w6tkidPpQwL26XGkDpekvJDpKMkopaE3PiU8TvYZnMQf1K1txVGtng==) |
| Variety / PCG | Smith & Whitehead (2010) — ERA · MAP-Elites / EDD | Bản đồ nhiệt `linearity/leniency/entropy` cho không gian PCG lớn | [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFKiMJL8DC1YYfCPkfe8WJkiMzCkrzdOYgx3d0nEsX4Fwm8R-BRMGRlA3yxjSMOf-tnMn_UzkcVZgHNwz66Xfz4F3TCGgqHsMF3t0cFwl7ZG9-rh2mUCg==) · [researchgate.net](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFvNXEIoKR_M78XEpM5qQk8RrqkdrWg7-kUVY5-gMs_bMC3jXVIR_rgvRSNw1-3yW8LsuNmXa6yoej6DOhw60eGaGF1e25NsRD3IdKUYE6b8c38g03I6IVddbBLtzQTHZQN92rvGn6Ffd2sTOGLcxEdZnKdK231tIxH6aWk-YPVH8KsGmQ9WD3X6iti1-dIZaSrnl_kfAbKkX4Y0Wl-DYtOWbK64-e5HR6jFTPmHP_LvdKoc4pp6XVS-Hl7rfcZrre6Y-YaFfQwaLT2Z4y7a-I6bJ3d_w==) |
| Drama & Margins | Browne (*Ludi*) · Kristensen et al. (CoG 2021) | Tỷ lệ qua màn nhị phân bỏ sót bức tranh hành động; `margin` hành động bắt gai ức chế | [maastrichtuniversity.nl](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGYVKRO3VkvqvnHgjUGr54vbnTrQlgjyFz6WOYUs8SCn2NjDIu4YJe5p4g9VDWfYHKJ8wlfNiefMizDwLe8_lSJ9QGjKfj4hhqLHWzjPo9D15DRhGdoWnIhlgDrdf5M4E9DwxaY3owW52aYMWrwWd1oxYNfu_iCGqa7yQo5SlKKMEOLIMRfVLxV) · [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHs7D10A4mirbtRSXGhTtIDuT0HmXxDnyS0tHgNwx9VJ5sEm3hLLrpoJnCH8fRGT7i26HB0bybY5i_LTzsmARukhE8Qf2PN0b9VP8gGvaYnDjNV4kmL) |
| Skill Depth & Personas | Isaksen & Nealen · Holmgård et al. · Random vs MCTS | Phân tầng kỹ năng (`weak/median/skilled`) phát hiện trần phẳng hoặc đảo kỹ năng | [nealen.net](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQG8jogsgKrdnU78OovMnQDan2Wyt5n_jxkLkQRXS2ZRH9hSPBG9jeKvNgIkTscxRtDwNmwIYEcqwOJOxJAATreRusJB65ZCg_Sh7Ddx-5OSQZqzmos46oLi22YcXuCAWHnxGZSJ) · [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGFcYWc18uEh6PksGnoDhNMRa94x39wNt_szhmWFk6YILuK5-DzydnC6NlvRLIGtWlLGj9wiffuad1zmPrgNXVMXMzs0iGd3jjynV6U1NEkFF94fCeDQw==) · [sbc.org.br](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH0TxOEVGdLAc7kzzfL41bxOsCcPvGG5A3w7H9hecniQ4R6f3PTXfOGd2W-aCTFd9c1N4IDiuNNmR0YXyHWzPSajuljCq0A2frXygo0Ul8LFQTcQgQeFYB6NTfmiGmyIR2uDapwG4AEMtO_EyW-pf7FvQP73LPpTjo_nwWzsaG7dUK_HOZNjQ==) |
| Limits / Goodhart | Goodhart's Law · Zero-Cost Input Fallacy | Bot bấm tức thì và tối ưu hoá chỉ số khiến proxy mất giá trị đo | [wfmlabs.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFQiKrQ6LUAAAhfAFSS_laVqTof1FKPtz1Dp09UJjAn5CoagsF-jLtGhElC2Lw-u5nZH1y2_Q0HKIpRfBe5nUISBrcXJDsB9evdwTrzL8d5t0gDk7zi1Jli3FtWrYG20VdZZ6Btk9AR5aVtPwXjtNbRVbGMBB29) · [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEiUxBkHRrJeGh4RBAbBgaTUbxJJ8QU3qLd6OM901S7rLJEvKuRuXhoxtWRLg8oYHPiSomase6ujBVjB2UteZ3yucc1J6FYngDBfXGLGOQSObjVyTdO0g==) |
| Curiosity & Mechanics | Loewenstein · Kishōtenketsu · Lumosity · NYT Games | Information gap, giọt Mặt trời / phá đôi `Raindrops`, `cd` + chuỗi `Koi`, chia sẻ không lộ đáp án | [ignorancegraph.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHEJbu5IjJY89fnkekbcaWh-hcmBgGAjIouq3VlV5g6VQjdX-nwuwf4lO3VmjgfUwLCxXimdQ7kvsGW2UfAwqQBxllbvyFFtf7qkXLlCXjzoKxUsjUTub3t3soYPG0h2gNSlePfNt33U-o3F7_-c4AbXHNpzrJeaiRW5hAU_Q==) · [timmykokke.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFWCOFCPP6UVB76atTN1tV246mNU1-jqHIqxhU3Tv0IPCSstgpF5ZUzV82vHPaf6f8EwuRsLzPYiAK3gWf8wKAWpLYJm9mBhnTd6TPX7mVo7iDxb-YALzzTfyJ6mQq0a8yL_tk7YLGiE78sTWS4sTu7) · [lumosity.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFZ_3-rBJWH_ALRd8Q6QW7OTg-etfvHiDWgSFPXxb2-387KzZnql1skjbABDWVrJfNHwhgUO4WaOcdK4VVDZ1oTzLmGPm5GWvryGNsO4gWP5V65lsjScill_Cgkkf6pGi7XziSyVLDXLVygr9J7fuqCT2sli4rMJhDlIz0e6RO_V4SOCoysvE8=) · [innotechinsider.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF6jgNtp_N_2UwOO0i5rAnIu_3Cs4XJddhJ1P42DFEitQW7N03mc_xj54MqDTP3q3YHjL9TFIVPtKOWJ1CBzDExfAXOIR4eR34jc8rWfR95ON9UiC3OykEKbawKdM53A0YjOOx75_zfUtKElVjz_LER04ZwAYMCcKs1DgHTfARzLCW2oe1H2hT5RN6KkA==) |
| Game Feel & Spatial | Coyote time · Parhi 2006 · WCAG 2.5.8 · `page.clock` | Cửa sổ ân hạn 100–200ms, mục tiêu 44px / khoảng cách 24px, kiểm bất biến hình học trong Playwright | [gdquest.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQExnfR5PNn2yEuRmQnf9Zs0f_YfYfsb_K2ieIlWdNMsvZfuJgd1o0FJ1pIhhCJuYH13aCJp_2TUpg1poG6SzQ2-ZrjQv0Jq7dTyFjWgGvAEeybD_Nm_HRbDSRy3ekdhH9vyP619SusKL1gy) · [w3.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFnbTTmgygDziNnObrLZxLXQ5oIPTvbHlp5AC62VJE0-wZUcH6R2YtbfAERI7J6w0HjXJXIOat77tczSwUNCrQKsjlKvdhuYE9SiraljFjOzJry6-pS7vfA1grpvqNhRt5TitRW84PfkffREcwHJxMiRJe0zsMSl8_N) · [playwright.dev](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGksnoI7f9KeEWgy4cU68nJzSzZ1GegJHWiQFNAccl4w_IdPMooUaqphWClVz5BjdJyyY31Zx25y9XZyVKvUzez8dJCY-pOSBBWtu9YSwhnDxKmEQG8gSXBcAN9S_YPd6N1) |

---

## 3. Bốn Cổng Automation Test sống sót (`SURVIVED_WITH_FIX`) & Đặc tả

| ID | Mục tiêu kiểm chứng | Đặc tả triển khai cho `brainy-bits` | Chi phí CI |
|---|---|---|---|
| `T-GOODHART` | Chặn tối ưu giả các biến `[NEW]` chưa hiệu chỉnh | 1) Hoàn thành cổng `G7` (Playwright parity 3 seed tại L1/L15/L30) **trước** khi bật gate mới.<br>2) Mọi cổng đo kịch tính / phân tầng kỹ năng chỉ dùng ngưỡng **cờ đỏ một chiều** (bắt màn chết phẳng), cấm tối ưu hai chiều.<br>3) In nhãn `UNVERIFIED [NEW] PRIORS` kèm báo cáo `scripts/sim/calibrate.mjs`; giữ checklist chơi tay ngắn khi đổi luật hoặc prior. | 0 ms MC thêm (thêm run G7 trong Playwright) |
| `T-DRAMA` | Chặn màn thắng áp đảo phẳng lì và màn thiếu pha nghẹt thở | Tận dụng `margin` và `detail` đã có sẵn từ 5 adapter trong vòng lặp `measure()` của `scripts/sim/calibrate.mjs`. Sửa kiểm `mem` dùng `pass && detail.round === 2` (vì `margin=0` gộp cả `2-0` lẫn `2-1`). Gộp chỉ số `clutchWin` (`T-NEARMISS` khi thắng) vào cùng histogram. Chạy báo cáo trên mọi level; chỉ cảnh báo/chặn bằng ngưỡng thô một chiều từ `L15+` (`blowoutRate > 85%` hoặc `closeWinRate === 0%`), chỉ cảnh báo nhẹ ở `L1–10` để không đụng `G1`. | 0 ms extra sim |
| `T-SKILLDEPTH` | Bảo đảm phân biệt trình độ và không đảo chiều khó | Dùng đúng 3 profile hiện có (`weak`/`median`/`skilled`): (1) kiểm đơn điệu `p_skilled + 2·SE >= p_median >= p_weak - 2·SE`; (2) ở màn ngoài trần (`p_median <= 0,85`, `L15+`), yêu cầu `p_skilled - p_weak >= 0,08`; ở màn trần (`p_median > 0,85`, `L1–14`), kiểm tách biệt theo `msMedian` hoặc `accuracy`; (3) thêm kiểm tra không-thao-tác (`0` input → không bao giờ auto-pass) trong `scripts/sim/difficulty.test.mjs`. | ~5 ms |
| `S-CROWD` | Bắt lỗi kích thước, chen chúc & che HUD ở level cao nhất | 1) Mở rộng `geometry()` trong Node `G6` (`scripts/sim/calibrate.mjs`) kiểm cả dọc (`320×568`, `390×844`) lẫn ngang ngắn (`667×375`): `train` khẳng định `cell >= visualDiscPx`; `koi` tính trần `near(N + D - 1)` chồng lấn lân cận; thêm `geometry()` cho `word`.<br>2) Thêm 1 spec Playwright gọn trong `tests/` cho L15 và `maxLevel` tại `320×568` & `667×375`, dùng lại hook sẵn có (`__koi`, `__rtd`, `__rainDebug`, `__mem`, `__word`), kiểm WCAG 2.5.8 spacing 24px cho nút tĩnh, không che HUD-canvas, và tỷ lệ chồng lấn trung bình theo thời gian cho `koi` (seed `Math.random` nếu bước frame).<br>3) Kèm 2 phần vớt từ mục bị giết: kiểm 3 dòng tỷ lệ khung hình `<canvas>` trong `tests/responsive.spec.js` và kiểm 10 dòng chống trùng cấu hình kế tiếp trong `scripts/sim/difficulty.test.mjs`. | <5 ms Node + ~15–20s Playwright |

---

## 4. Bảy Cải tiến Cơ chế Core & Meta sống sót (`SURVIVED_WITH_FIX`)

| Game / Mục | Cơ chế sống sót (`ID`) | Cơ chế cụ thể & giữ nguyên công bằng | Móc kiểm thử tự động bắt buộc |
|---|---|---|---|
| `rain` | `M-OPT-RISK-RAIN-SUN` (Giọt Mặt trời tuỳ chọn) | Tối đa 1 giọt/ván (2 nếu `target >= 22`), từ `L6+` và chỉ sinh khi trên màn đã có `>= 2` giọt; dùng tier nhẹ `ops - 3`; giải đúng cộng `+1 solved` (không tính gian tiến độ cho các giọt phụ) và làm bay hơi toàn màn (`0` mất mạng); rơi trúng nước **0 phạt, không đứt combo**; vẽ hình Mặt trời tương phản `>12:1`, tĩnh khi `prefers-reduced-motion`; mô phỏng đúng quy tắc trong `scripts/sim/adapters/rain.mjs` và calibrate `N=4000`. | Adapter & Playwright parity: cap giọt/ván, `misses === 0` khi giọt Mặt trời chạm nước, toàn màn sạch giọt, `calibrate rain` xanh. |
| `rain` | `M-KISHO-RAIN-MULTICLEAR` (Phá đôi cùng đáp án) | Từ `L6+`, gỡ chặn trùng đáp án (`js/rain.js:112` & `scripts/sim/adapters/rain.mjs:121`), thêm ~15% cơ hội sinh cặp phép tính khác biểu thức nhưng cùng đáp án khi đã có giọt; gõ đúng vỡ tất cả giọt khớp kèm popup `+2` (tĩnh khi giảm chuyển động). | Unit/Playwright test: 2 giọt khác phép cùng đáp án vỡ cùng lúc, `solved` tăng đúng số giọt, không lỗi `wrongInput`. |
| `koi` | `M-KISHO-KOI-EARLY-DECOY` + fix `fish.length` | Đưa `1` cá xám từ **L7** (giữ tối đa 1 tới L14), hạ nhẹ `koi`/`spdMul` 1 nấc ở L9–10 để `G1 >= 82%` và `B` xanh tại `N=2000`; thêm 1 dòng báo trước ở màn thắng L6 & menu L7 (*"Từ Level 7 có cá xám — đừng cho ăn"*). Đồng bộ `js/koi.js:85` và `scripts/sim/adapters/koi.mjs:43` đều tính cả cá xám hay chỉ cá koi thống nhất. | `calibrate.mjs koi --n 2000`: `G1, G2, B, G6` đều xanh; Playwright kiểm dòng báo trước L7 và kích thước cá khớp adapter. |
| `koi` · `rain` · `train` · `mem` | `M-FORGIVE` (Ân hạn kỹ thuật + Gọi tên pha kịch tính trung thực) | 1) `koi` (`js/koi.js:347`): thêm ân hạn `140 ms` cuối cooldown (`cooldown <= 0.14` vẫn cho ăn sạch, không cộng `earlyTaps++` làm mất 3 sao — khớp với `scripts/sim/adapters/koi.mjs:109`).<br>2) `rain` (`js/rain.js:206-225`): nếu `pendT > 0` trùng đáp án giọt chạm mép nước, ưu tiên `hit()` cứu mạng thay vì trừ tim.<br>3) Huy hiệu thắng/hoà trung thực (tắt rung dưới `prefers-reduced-motion`, không dùng ở màn thua): `"Kịp lúc!"` khi bẻ ghi `train` trong cửa sổ ân hạn sẵn có hoặc phá giọt `rain` ở `12%` đáy; `"Lượt quyết định (3/3)"` ở `mem` khi hoà `1-1`.<br>4) Ánh sáng ấm `0,6s` ở cửa hầm `train` ngay trước cặp tàu burst giúp người lớn tuổi chuẩn bị. | Playwright `page.clock` test `koi` tap tại `cd=0.10s` không mất 3 sao; test `rain` giọt chạm đáy khi `pendT > 0` trúng đáp án không trừ mạng; test `mem` huy hiệu `1-1`. |
| `word` | `M-KISHO-WORD-HINT-TOGGLE` (Danh hiệu không dùng gợi ý) | Giữ nguyên nút `wHint` mở tự do từ lượt 1 không trừ sao hay lượt (vì đo với `hint=0` tại `N=800`, `weak` sập từ `95,8% -> 88,6%` ở L1, `81,1% -> 46,9%` ở L15, `64,5% -> 22,4%` ở L30). Chỉ thêm nhãn tích cực `"Đoán ra không cần gợi ý"` khi thắng mà `!hintShown`. | Playwright test: thắng khi bật/tắt `wHint` kiểm sự có mặt của nhãn, giữ nguyên số sao và mở màn kế. |
| `word` | `M-META-SHARE` (Lưới emoji chia sẻ không lộ đáp án) | Thêm nút gọn `"Chia sẻ lượt đoán"` trên thẻ thắng của `word`, xuất lưới 4 màu `🟩🟨🟦⬜` không lộ chữ cái + số lượt `(k/6)` + nhãn không gợi ý nếu đạt; giữ nguyên `BB.shareText()` gọn 1 dòng/game ở Hub. | Playwright test kiểm chuỗi clipboard không chứa ký tự chữ cái đáp án và khớp số dòng đã đoán. |
| `meta / menu` | `M-META-ZEIGARNIK` (Gom chặng 5 màn cho `.lvgrid`) | Gom lưới level thành từng chặng 5 màn đóng/mở (`Chặng 1: L1–5 (k/5)`..., mở sẵn chặng đang chơi), tạo nhịp hoàn thành gần mà không thêm đồng hồ đếm ngược hay FOMO; giải quyết trực tiếp lỗi `.lvgrid` cao `626 px` ở `320×568` (`docs/difficulty/daily/2026-11-24.md:83`). | Playwright `320×568` và `667×375`: chiều cao menu giảm dưới ngưỡng cuộn dài, nút mở/đóng chặng đạt `>= 44 px` và giữ đúng trạng thái sao. |

*Ghi chú riêng cho `mem`:* Tỷ lệ thắng `2-0` cao ở `L1–15` (`68–85%`) gắn chặt với quy tắc qua `2/3` lượt + sàn `G1 >= 90%` cho người mới. Không ép thêm bẫy hay xoay bàn để làm khó gượng; giữ nguyên quy tắc an toàn cho người mới và chờ dữ liệu thật `G7`.

---

## 5. Danh sách BỊ GIẾT (`KILLED` — 11 phương án test & 18 cơ chế)

### 5.1 Phương án kiểm thử tự động bị giết (`REFUTE-A`)

| ID | Lý do bị giết (Evidence) | Đường sửa / Vớt (nếu có) |
|---|---|---|
| `T-ERA` | `E5_KNOBS_ONLY: true` nên 4/5 game chỉ có bảng 30 dòng scalar + 1D knob; `p*` mỗi màn chỉ đổi `0,005` (dưới SE `0,009` tại `N=1200`), dễ bị lách bằng `turnMul += 0,05`. | Vớt 10 dòng kiểm trùng cấu hình lượng tử hoá liên tiếp trong `scripts/sim/difficulty.test.mjs` (<1 ms). |
| `T-SURPRISE` | Không có phân bố niềm tin `P(M)` hợp lệ của người chơi; KL divergence thổi phồng điểm khi có gai RNG xấu hoặc vách khó. | `none` |
| `T-ICM` | Đòi huấn luyện RL/neural trên GPU; GitHub Actions của repo chỉ có 2 vCPU không GPU và đã ~15 phút CI cho 5 game đơn giản. | `none` |
| `T-STATECOV` | Trùng với 317 test Playwright hiện tại; độ phủ trong adapter chưa qua `G7` chỉ tự kiểm mô phỏng. | `none` |
| `T-MAPELITE` | Không có PCG tiến hoá và tối ưu hoá theo `human.mjs` (`[NEW]`) sẽ lợi dụng lỗi đảo tốc độ `train` và đảo độ dài chữ `word`. | `none` |
| `T-NEARMISS` | Trùng `T-DRAMA`; ở `p*=0,95..0,97` chỉ có 36–60 lượt thua ở `N=1200` → nhiễu Wilson ±15 điểm làm CI đỏ giả. | Gộp nhánh thắng sát nút (`clutchWin`) vào `T-DRAMA`. |
| `T-DRL-MCTS` | Không có backend hay nhãn churn thật của người chơi; MCTS không hợp 4/5 game thời gian thực. | `none` |
| `S-MOVING` | 4/5 game chạm nút đứng yên; `koi` tốc tối đa `63 px/s` chỉ trượt `3,8 px` trong `60 ms` (<8% vùng `48×44 px`), nới rộng thêm sẽ làm tăng lỗi chồng `60,9%`. | `none` |
| `S-CLUTTER` | Ép kéo cả `numpy/scipy/opencv` vào CI thuần Node; nhạy với anti-aliasing nền nước và khuyến khích giảm tương phản (đấu lại WCAG AA). | `none` |
| `S-VVP` | 5 game dùng bàn phím DOM/nút bấm tĩnh, `<input id="wIme">` trong `word` chỉ kích hoạt trên trỏ chuột desktop (`js/word.js:608-612`); giả lập `visualViewport` trên Chromium không tái lập được lỗi WebKit thật. | Vớt 3 dòng kiểm tỷ lệ khung `<canvas>` trong `tests/responsive.spec.js`. |
| `S-PERF` | Chặn CI bằng `CDP CPU 4x` trên VM 2-vCPU không GPU gây flake ngẫu nhiên khi V8 GC hoặc worker song song. | Chuyển thành lệnh chạy tay local nếu cần, giữ `rAF`-dừng-khi-pause ở CI. |

### 5.2 Cơ chế core & meta bị giết (`REFUTE-B`)

| ID | Lý do bị giết (chỉ số / xung đột quy tắc) |
|---|---|
| `M-KISHO` (toàn cục) | Mở loạt luật mới giữa chừng (`E5_KNOBS_ONLY: false`) gây thua mù cho người mới (`G1/G9`) khi `G7` chưa nối và thiếu bản mockup duyệt trước. |
| `train` `twoTone` · `express` | `twoTone`: ga/tàu `320px` chỉ còn `14,8×10,4 px`, không vẽ nổi hai hình nhận diện cho người mù màu và đẩy chi phí tìm kiếm vỡ `G9` (`weak=0,721` sát sàn `0,70`). `express`: tàu nhanh làm `adapters/train.mjs` dễ hơn (đảo chiều người thật) và kẹt sau tàu chậm trên đoạn trunk 5 ô (`js/train-map.js:109`). |
| `koi` `scatter` · `golden` | `scatter`: dồn cá ra mép làm tăng chồng lấn vốn đã `60,2–60,9%` tại L30@320px và xung đột `prefers-reduced-motion`. `golden`: mâu thuẫn luật 1 chạm, trùng bảng màu cam-vàng với cá koi dưới mắt mù màu, làm mất sao vì chạm sớm lúc `cd`. |
| `mem` `poison` · `seq` · `rotate` | `poison`: quá tải trí nhớ làm việc (`weak K=3,5`) vì bấm nhầm 1 ô kết thúc cả lượt (`js/mem.js:192`). `seq` (Corsi): ngược triết lý gom cụm gestalt và dãn đôi chênh `weak/median` (`5,1` vs `6,2`). `rotate`: phân biệt nặng theo tuổi và hỏng khi tắt chuyển động. |
| `rain` `storm` · `mystery-op` | `storm`: gió lắc làm nhức mắt khi đọc phép tính `16 px` và đạp mạnh `weak` vốn đang tụt `8,5–31,8%` ở `L15–30`. `mystery-op`: thiếu chỗ đặt thêm 4 phím phép tính ở bàn phím `3×4` trên `320px`; dạng tìm số `?` đã có từ `O12` (`L16`). |
| `word` `packs` · `endless` · `3word` | `packs`: 50 cụm rải 17 chủ đề (7 chủ đề chỉ có 1 cụm) gây lộ đáp án và tràn menu. `endless`: lặp lại cụm cũ hoặc lộ cụm khó tương lai. `3word`: ô chữ co còn `~18 px` ở `320px`, gãy dấu phụ tiếng Việt (`LUẬT 13`). |
| `M-OPT-RISK` ở `mem` (`gold`) & `train` (`express`) | Ở `mem`, ô vàng chiếm mất `encodeSec=0,33s` và chạm hụt 1 ô là thua trắng cả lượt (`js/mem.js:192`). Ở `train`, tàu thưởng cản đường vật lý các tàu thường trên ray chung và rối công thức `% >= 80%`. |
| `M-DIRECTOR` (DDA trong ván) | Xoá bản sắc cố định `b_L` của level, phạt người chơi giỏi đang giữ chuỗi 3 sao, thưởng hành vi cố tình làm sai để hạ tốc, và tạo cảm giác game can thiệp lộ. |
| `M-META-TEASER` · `M-META-RADAR` | `TEASER`: L10/L15 của `train/mem/word` không có cơ chế mới nên ổ khoá hứa hão sẽ phản tác dụng và kéo dài `.lvgrid`. `RADAR`: thiếu chuẩn đo tâm lý (thêm rủi ro tuyên bố khoa học kiểu Lumosity), gán mác kém toán khi `rain` đang tụt `weak` còn `8%`, và chật chội ở `320px`. |

---

## 6. Lộ trình đề xuất 2 đợt

| Đợt | Phạm vi & Mục tiêu | Vì sao phải làm theo thứ tự này |
|---|---|---|
| **Đợt 1 — Testing, Sizing & Parity (`PR` hạ tầng kiểm định)** | Triển khai `G7` (Playwright parity 3 seed/game), 3 cổng test/sizing zero-cost (`T-DRAMA`, `T-SKILLDEPTH`, `S-CROWD` ở L15/`maxLevel` 320×568 & 667×375 + `T-GOODHART`), và sửa các sai lệch sim/parity thật (`koi` `fish.length > 11`, `rain` `AUTO_WAIT`, lỗi `train` `cell < disc`, chen lấn `koi` L30@320px). | Nếu không nối `G7` và đóng lỗ hổng kích thước trước, mọi cơ chế mới ở Đợt 2 sẽ được calibrate trên giả lập sai chiều (đảo tốc độ `train`, đảo độ dài `word`) và chen chật hơn trên màn `320 px`. |
| **Đợt 2 — Core & Meta Curiosity/Excitement (`PR` tính năng)** | Triển khai 7 cải tiến sống sót: giọt Mặt trời + phá đôi ở `rain`; cá xám sớm L7 + ân hạn `140 ms` ở `koi`; ân hạn nước & huy hiệu `"Kịp lúc!"` / sáng cửa hầm; huy hiệu không gợi ý + lưới emoji share ở `word`; gom chặng 5 màn `.lvgrid`. | Có lưới `G7` + `S-CROWD` + `T-DRAMA` làm chuẩn giữ `G1/G4/G9` và độ thoáng màn hình `320 px` ngay lúc mở tính năng. |

---

## 7. Chưa xác minh được (`Not Verified`)

1. **Tham số người chơi thật trong `scripts/sim/human.mjs`:** Toàn bộ hằng số gắn nhãn `[NEW]` (tỷ lệ lơ đãng `lapse`, thời gian đọc, `speedSd`, tốc độ nhẩm `ARITH`) vẫn là giả định ban đầu, chưa khớp với telemetry người chơi Việt Nam.
2. **Cổng `G7` (khớp sim với trình duyệt Playwright) và tốc độ đảo của `train`:** `G7` vẫn ở trạng thái `SKIP`; mức độ chênh lệch thực tế giữa `adapters/train.mjs` (nơi tàu nhanh lại dễ hơn) và phản xạ thật trên tay người chưa đo được.
3. **Thông số bỏ qua trong các tài liệu gốc từ `search_web`:**
   - Chưa truy xuất được phương trình phương sai chi tiết của mô hình *Ternary-Gaussian* (Huang et al. CHI 2018) và công thức đại số đầy đủ của $W_e(V)$ / $V_{crit}$ trong Hoffmann (1991).
   - Các liên kết đích cuối phía sau URL chuyển hướng `vertexaisearch.cloud.google.com/grounding-api-redirect/...` chưa được tải trực tiếp.
   - Các truy vấn về Ubisoft playtesting, Unity ML-Agents, Go-Explore, Novelty Search (Lehman & Stanley), hệ số tương quan định lượng của Roohi et al., giá trị chuẩn Shannon choice entropy từng lượt, hành vi bàn phím ảo riêng của Zalo WebView, cũng như chi tiết cơ chế dual-color train (*Train of Thought*) và bonus tile riêng lẻ (*Memory Matrix*) của Lumosity không trả về bằng chứng xác thực trong tập kết quả `search_web`.
4. **Kiểm tra thủ công trên thiết bị thật (iPhone/Android/Zalo WebView & laptop macOS/Windows):** Chưa chạy thực tế ngoài trình duyệt Chromium giả lập của Playwright.
