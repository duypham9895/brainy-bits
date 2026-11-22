---
slug: brainy-bits
pointer: 00-discovery
created: 2026-11-20
---

# PIPELINE — brainy-bits

**Đây là trạng thái DUY NHẤT của app này.** Không có con trỏ toàn cục ở đâu khác.

| # | Stage | Trạng thái | Artifact | Duyệt ngày |
|---|---|---|---|---|
| S0 | Discovery | pending | `gates/00-discovery/PRODUCT-BRIEF.md` · `LEGAL-SCREEN.md` | |
| S1 | PRD | pending | `gates/01-spec/PRD.md` · `ACCEPTANCE.md` · `SUCCESS-CRITERIA.md` · `TRACKING-PLAN.md` · `LEGAL-REVIEW.md` | |
| S2 | Design | pending | `gates/02-design/` — direction · tokens · mockup · a11y · ui-states · microcopy | |
| S3 | Build | pending | `gates/03-build/SLICE-LOG.md` + commit `feat:` + `licences.json` | |
| S4 | QA | pending | `gates/04-qa/VERIFICATION.md` · `REVIEW.md` · `EVENT-VERIFICATION.md` | |
| S5 | Launch | pending | `gates/05-launch/LAUNCH-READINESS.md` · `POSITIONING.md` · đường gỡ | |
| S6 | Iterate | pending | `gates/06-iterate/TRIAGE.md` · `READOUT.md` | |

Trạng thái hợp lệ: `pending` · `in-progress` · `pass` · `fail` · `waived` · `N/A — because <lý do>`

**Ba cổng cứng ở S1, không cái nào waive được:** thiếu `SUCCESS-CRITERIA.md`,
`TRACKING-PLAN.md`, hoặc `LEGAL-REVIEW.md` ⇒ S1 không duyệt được.
**S5 `LAUNCH-READINESS` là cổng duy nhất không waive được ở bất kỳ hoàn cảnh nào.**

Bảng định tuyến đầy đủ — phòng ban nào vào, gọi lệnh gì: `../../docs/stages.md`.

## Log — chỉ thêm, không bao giờ sửa hay xoá

| Ngày | Sự kiện | Lý do |
|---|---|---|
| 2026-11-20 | Tạo app từ `/vibe:new`; nguồn là artifact claude.ai `2GpBGbRjPnqCCy3nvreoa3` của Duy, export ở `reference/original.html` | Duy: "build 1 webapp game làm đúng exactly những gì đang có trong link này" |
| 2026-11-20 | S3 bản port 1:1: `index.html` = bản gốc, chỉ bỏ "(Copy)" ở `<title>`; cổng `npm run parity` + smoke test 6/6 | Giữ đúng y hệt là yêu cầu; mọi nâng cấp chờ Duy duyệt |
| 2026-11-20 | Soát 6 phòng (76 phát hiện, 65 xác nhận) + nghiên cứu repo nguồn mở 5 hướng (10 repo giữ); tầng review `docs/index.html` | Duy yêu cầu "check thật kĩ chỗ nào cần enhance" và "dive deep research các repo opensource" |
| 2026-11-20 | Duy chọn phương án C: làm cả gói A (sửa lỗi) + B (nền app) + C (motion & reward) ngay, bỏ bước duyệt mockup S2 | Duy trả lời "C" cho câu hỏi chọn gói; khuyến nghị cũ là B (A+B ngay, C qua S2) |
| 2026-11-20 | Tách index.html thành css/app.css + js/<game>.js (kiểm byte-identical với bản gốc, smoke 6/6); cổng parity đổi thành khoá sha256 của reference/original.html | Cho phép từng phòng sửa file riêng song song mà không xung đột |
| 2026-11-20 | Duy: responsive phải tốt trên mobile + tablet + laptop → thêm cổng `tests/responsive.spec.js` (12 viewport) + workflow sửa rain/word/hub | "make sure responsive work well on mobile + tablet + laptop also" |
| 2026-11-20 | Duy giao việc tiếp theo: thuật toán điều khiển độ khó chung/riêng cho mọi game hiện tại + tương lai, 30 màn tăng dần mỗi game, mô phỏng người chơi như người thật, chỉ public domain + GitHub Pages; viết rule để sau này chỉ cần "thêm 10 màn" hoặc đưa ý tưởng game mới | Duy, trước khi đi ngủ: "suy nghĩ thật kĩ như 1 founder… proactive làm mọi thứ" |
| 2026-11-20 | Duy: "Enhance cả về phần UIUX" → PR #3 sau responsive: soát anti-ai-ui H1–H7 + U1–U7 + ecc:make-interfaces-feel-better; giữ bản sắc hiện tại (Duy đang ngủ, không duyệt gu được), hướng thiết kế lớn chỉ làm mockup để Duy chọn | Quy tắc 13: gu là quyết định của Duy |
| 2026-11-21 | Chốt custom domain `brainybits.thucanhtrantonnu.com` (deploy qua GitHub Actions `actions/deploy-pages@v4`: cấu hình ở Settings → Pages + DNS `CNAME` `brainybits` → `duypham9895.github.io`, không dùng file `CNAME` trong artifact) | Duy chốt subdomain không dấu gạch nối trên `thucanhtrantonnu.com` |
| 2026-11-21 | Duy chốt Option A (Hub kiêm Landing — 1 màn hình, chơi ngay 1 chạm) cho đợt nâng cấp Logo, Mã QR offline, Metadata/OG và UI/UX theo anti-ai-writing + anti-ai-ui | Duy trả lời "A" cho Quyết định 1/2; dựng 3 bản mockup HTML độc lập để chốt gu |
| 2026-11-21 | Duy chốt Option B (`Giấy Nắng & Mực Rừng` — Dấu Triện Tangram, Light `#f6f0e4` / Dark `#0e1712` + toggle 3 trạng thái, QR offline `<dialog>`, Metadata/OG đầy đủ) và yêu cầu fix tràn chữ domain trong pill thẻ OG trước khi áp vào app | Duy phản hồi "option B, nhưng chỗ metadata UIUX chỗ này còn lỗi"; mở rộng pill OG lên `460px` (`text-anchor="middle"`), đo `getBBox()` >= `20px` padding rồi triển khai live |
| 2026-11-21 | Không nêu số lượng trò chơi cố định (`5 trò` / `năm trò`) trong tiêu đề, mô tả, `#hubIntro`, metadata/OG, `icons/og.png` và mockups để dễ mở rộng thêm trò về sau | Duy xác nhận bỏ số lượng trò chơi; thay bằng mô tả kỹ năng (`Trò ngắn luyện nhớ, tính nhẩm và chữ Việt`) |
| 2026-11-21 | Tích hợp độ khó 30 màn: train/koi/mem/rain lên 30 màn, word giữ 49 (E2), màn cũ đóng băng (E3); `sw.js` cache engine (`bb-v4`), CI chạy `test:sim` + gate calibration; gate xanh ở mem, koi; train, rain, word còn trượt (chờ Duy) — `docs/difficulty/index.html` | Việc Duy giao 2026-11-20 (30 màn tăng dần mỗi game, mô phỏng người chơi); build theo mặc định đảo ngược được E1–E5 khi Duy ngủ |
| 2026-11-21 | Gỡ E3: 5 game cùng một khuôn răng cưa + p* từ L1, bảng v2 có migration giữ tiến độ; chưa game nào qua mọi gate ở N đầy đủ (G1 L5 chung cho train/koi/mem, rain B/G3, word B); CI calibration report-only, KNOWN-FAIL tests chặn; 3 câu chờ Duy — `docs/difficulty/index.html` | Duy 2026-11-21 cho chỉnh màn cũ để mọi game mở rộng được theo một luật |
| 2026-11-22 | Áp 3 quyết định độ khó của Duy (bỏ đỉnh L5; rain đưa tier 7–9 về L7–9; word miễn B): train, koi xanh mọi gate L1–40, word xanh L1–49 với B WAIVED, mem L31–40 xanh — các bước calibration đó chặn trong CI; còn đỏ: mem B L4–5, rain B/G3 (L1–9, màn thở, L31/36) — chờ Duy — `docs/difficulty/index.html` | Duy 2026-11-21 trả lời câu (1), (2), (3); đo lại ở N đầy đủ 2026-11-22 |
| 2026-11-22 | Gỡ hai điểm còn đỏ: `B_EASY_OK_BEFORE_SAW` (L1–9 trước đỉnh đầu, gate B chỉ bắt quá khó) và `BREATHER_EASY_OK` (mọi màn thở, B chỉ bắt quá khó, G3 bỏ vế khó hơn L−4, G4 giữ nguyên). Đo lại N đầy đủ: cả 5 game qua mọi gate — train/koi/mem L1–40, word L1–49 B WAIVED, rain L1–30 ở N 1200 và L26–40 ở N 4000 — không nới gate, không waiver mới; CI chặn ở cả 5 game, rain hết kẹt ở L30 — `docs/DIFFICULTY-RULES.md`, `docs/difficulty/index.html` | Duy chọn A cho hai câu mem/rain (B/G1 xung đột, B/G3/G4 xung đột ở màn thở) 2026-11-22; còn mở: bot yếu rain từ L10 chỉ qua 10–20% màn bước/đỉnh (khoảng cách `human.mjs`, G7 SKIP) |
| 2026-11-22 | Daily +1: thêm màn mới cả 5 trò (`train`/`koi`/`mem`/`rain` L31 breather, `word` L50 peak `'nước mía'` / `'Đồ uống'`); nâng `relief` màn thở sinh tự động `train` L31+ (`0.08 → 0.20`) giữ xanh `G4` tới L41 — `docs/difficulty/daily/2026-11-22.md` | Phiên tự động hằng ngày; cả 5 calibration xanh, 294/294 Playwright Chromium + 36/36 responsive + 0 vi phạm anti-ai-ui; từ ngày mai `word` tạm dừng ở 50 chờ 4 trò còn lại đuổi kịp |
| 2026-11-22 | Mở màn dễ cho cả 5 game (Duy chọn B): p* 0,97 → 0,90 trên L1–15, đỉnh khó đầu tiên dời từ L10 sang L15, gate bot yếu G1 (≥ 90% L1–5, ≥ 82% L6–10) và G9 (≥ 70% ở L15); rain miễn G9 (Duy chọn A). Cả 5 game xanh ở N đầy đủ — `docs/difficulty/research-early.html`, `docs/difficulty/index.html` | Duy chơi Đường Ray thấy 10 màn đầu khó quá; research 8 agent + 5 agent chỉnh bảng + 5 agent review (same vendor, same priors) |
