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
