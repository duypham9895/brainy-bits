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
