# Báo cáo Nâng cấp UI/UX — Brainy Bits (`feat/uiux`)

**Kết luận:** Đã kiểm định 63 ảnh baseline đa khung nhìn (`320`–`1920px`) cùng màn hình kết quả/cài đặt, giữ nguyên bảng màu tối 5 game + font `Baloo 2` + giọng Việt thân thiện, xử lý toàn bộ lỗi tương phản, cắt chữ, đè sao và hụt khung nhìn trong phạm vi `css/*.css`, `index.html` và `js/hub.js`. Toàn bộ **180 test Playwright** (gồm **171 test có sẵn**, cổng responsive **12/12** và **9 test mới** trong [tests/uiux.spec.js](tests/uiux.spec.js)) đều xanh; [check-anti-ai-ui.py](file://../scripts/check-anti-ai-ui.py) đạt **0 vi phạm trên 38 file**.

---

## 1. Bảng Đối chiếu Trước / Sau (Audit & Sửa)

| # | Vấn đề UX/UI tìm thấy | Ảnh Trước (Before) | Cách sửa & Lý do | Ảnh Sau (After) |
|---|---|---|---|---|
| 1 | **Tương phản thất bại ở Cài đặt:** Nút `.btn.danger` (`Xoá hết`) dùng gradient `#ff6b6b → #d63a3a` chỉ đạt **2.78:1** ở phần trên (`< 4.5:1` WCAG AA); rãnh switch `.switch i` khi tắt chỉ đạt **1.78:1** (`< 3.0:1` WCAG 1.4.11); đường ngăn tách vùng nguy hiểm chưa rõ. | `/tmp/uiux-before-extra/settings-390.png`<br>`/tmp/uiux-before-extra/settings-confirm-390.png` | Đổi `.btn.danger` sang `#d4323a → #a81d24` (`>= 4.8:1` toàn gradient), thêm viền `rgba(255,255,255,.5)` cho `.switch i` OFF (`>= 4.7:1`), thêm mô tả ngắn `.setsub` và nhóm `.setzone` tách vùng xoá tiến độ. | `/tmp/uiux-after-extra/settings-390.png`<br>`/tmp/uiux-after-extra/settings-confirm-390.png` |
| 2 | **Sao đè lên số level ở Ô Sáng Ghi Nhớ:** `#mlvgrid .lv.done[data-st]::after` đặt `position: absolute; top: 3px; right: 5px`, làm 3 ngôi sao vàng nằm đè lên số `1..13` và ký tự `★` mất khoảng thở. | `/tmp/uiux-before-extra/mem-menu-stars-390.png` | Đưa `.lv` dùng `display: flex; flex-direction: column` và đổi `#mlvgrid .lv.done[data-st]::after` sang `position: static; display: block; margin-top: 2px` để sao xếp ngay bên dưới nhãn số ô, thẳng hàng với 4 game còn lại. | `/tmp/uiux-after-extra/mem-menu-stars-390.png` |
| 3 | **Menu 49 level của Đoán Cụm Từ đẩy nút Chơi xuống dưới khung nhìn:** `#wlvgrid` phình hết 13 hàng, ép nút `Chơi Level` và `← Chọn trò khác` ra khỏi màn hình đầu ở cả `390×844` và `1440×900`. | `/tmp/uiux-before/responsive-phone-390-hub-every-game-menu-and-round/phone-390-word-menu.png`<br>`/tmp/uiux-before/responsive-laptop-1440-hub-every-game-menu-and-round/laptop-1440-word-menu.png` | Khoá `#wlvgrid` thành vùng cuộn độc lập (`max-height: min(168px, 23dvh)` trên mobile, `210px` trên màn cao `>= 880px`, `overscroll-behavior: contain`) để cả nút `Chơi` lẫn `← Chọn trò khác` luôn nằm gọn trong màn hình đầu. | `/tmp/uiux-after-extra/word-menu-stars-390.png`<br>`/tmp/uiux-after-extra/word-menu-1440.png` |
| 4 | **Menu Cá Koi bị cắt nút quay lại ở 390×844:** Khối `.how` có 5 dòng giải thích dài khiến nút `← Chọn trò khác` tràn khỏi màn hình đầu. | `/tmp/uiux-before/responsive-phone-390-hub-every-game-menu-and-round/phone-390-koi-menu.png` | Cô đọng `.how` của Cá Koi từ 5 hộp xuống 3 hộp súc tích (giữ nguyên 100% luật: 1 lần/con, vòng chờ, cá xám từ level 3, nhầm tối đa 1 lần), đồng bộ padding thẻ `#kmenu .card`. | `/tmp/uiux-after-extra/koi-menu-stars-390.png` |
| 5 | **Ô nhập Mưa Phép Tính xẹp dẹt khi rỗng:** `#rDisp` lúc chưa gõ chỉ là vệt xám mảnh không chữ gợi ý, khó biết đó là vùng hiển thị số vừa gõ (và nhảy chiều cao khi gõ phím đầu). | `/tmp/uiux-before/responsive-phone-390-hub-every-game-menu-and-round/phone-390-rain-play.png`<br>`/tmp/uiux-before/responsive-laptop-1440-hub-every-game-menu-and-round/laptop-1440-rain-play.png` | Đặt `min-height: 44px; min-width: 168px` (36px trên landscape thấp), thêm viền phát sáng nhẹ qua `box-shadow: inset` và `::before` `"Gõ đáp án…"` (`>= 6.6:1`) mà không sửa DOM JS. | `/tmp/uiux-after-extra/rain-play-390.png`<br>`/tmp/uiux-after/responsive-laptop-1440-hub-every-game-menu-and-round/laptop-1440-rain-play.png` |
| 6 | **Màn hình kết quả thiếu nhất quán giữa 5 game:** Train/Koi/Mem đặt sao trên `.big`, Word đặt sao dưới `.big`, Rain đặt sao dưới `.big` không đồng bộ kích thước, không có hào quang thắng. | `/tmp/uiux-before-extra/train-result-win-390.png`<br>`/tmp/uiux-before-extra/word-result-win-390.png`<br>`/tmp/uiux-before-extra/rain-result-fail-390.png` | Dùng Flexbox + CSS `order` chuẩn hoá cả 6 thẻ kết quả (`h2 → stars → .big → .stats → detail → rule → buttons`), phóng sao đồng nhất `44px` với hào quang vàng và viền thẻ sáng nhẹ khi có sao. | `/tmp/uiux-after-extra/train-result-win-390.png`<br>`/tmp/uiux-after-extra/word-result-win-390.png` |
| 7 | **Toast `#bbToast` che nút CTA và rớt 2 dòng:** Nằm ở `bottom: 24px` đè lên nút `Chơi Level`/`Về menu`, và thiếu `width: max-content` nên câu ngắn bị bẻ đôi xấu. | `/tmp/uiux-before-extra/koi-menu-stars-390.png`<br>`/tmp/uiux-before-extra/train-result-win-390.png` | Đưa `#bbToast` lên `top: calc(14px + env(safe-area-inset-top))` kèm `width: max-content; max-width: min(360px, calc(100vw - 32px))` để nằm 1 dòng gọn gàng và không che nút bấm. | `/tmp/uiux-after-extra/toast-top-390.png`<br>`/tmp/uiux-after-extra/train-result-win-390.png` |
| 8 | **Icon emoji lộn xộn & thiếu tín hiệu tiến độ trên Hub:** Hub dùng SVG sắc nét nhưng Menu và Pause vẫn dùng emoji OS (`🚂🐟🟨🌧️🔤⏸️🔥⭐`); chữ phụ `.muted` dùng chung tông xanh lá lệch tông khi đặt trên nền tím/xanh dương/nâu. | `/tmp/uiux-before/responsive-phone-390-hub-every-game-menu-and-round/phone-390-hub.png`<br>`/tmp/uiux-before-extra/hub-progress-390.png` | Thay toàn bộ `.logo`, `.pause-logo`, `.how .i` và `.hico` bằng inline SVG; bọc `.gi` trong khung recessed; thêm chevron `.gchev`, thanh tiến độ mảnh `--pct` và màu `--dg` cho Daily card qua `js/hub.js`; tách token `--sub/--muted/--note` riêng từng game; giảm độ gắt số `0` trạng thái rỗng (`is-zero`) và nút share (`.quiet`). | `/tmp/uiux-after-extra/hub-390.png`<br>`/tmp/uiux-after-extra/hub-progress-390.png`<br>`/tmp/uiux-after/responsive-laptop-1440-hub-every-game-menu-and-round/laptop-1440-hub.png` |
| 9 | **Trợ năng, Typography, Hover & OS Text Scale:** Thiếu `<meta name="text-scale">`, dùng cỡ chữ `px` cứng trên tiêu đề có dấu chồng, thiếu phân tách hover cho chuột thật và thiếu `forced-colors` cho chữ gradient. | `index.html`, `css/app.css` | Thêm `<meta name="text-scale" content="scale">`, bỏ cỡ `px` ở `:root`, nâng `line-height` tiêu đề lên `1.18` + `clamp()`, tách `:hover` vào `@media (hover: hover) and (pointer: fine)`, thêm focus ring tương phản cao `--focus-warm` trên nút cam/đỏ, `forced-colors: active` và tắt caret pulse/hub entrance khi `prefers-reduced-motion: reduce`. | `/tmp/uiux-after/responsive-phone-320-hub-every-game-menu-and-round/phone-320-hub.png`<br>`/tmp/uiux-after/responsive-tablet-768-hub-every-game-menu-and-round/tablet-768-hub.png` |

---

## 2. Những phần đã đề xuất nhưng CHƯA áp dụng

1. **Thay đổi định hướng hình ảnh lớn (chờ Duy chọn):**
   - [PROPOSALS.md](docs/uiux/PROPOSALS.md) trình bày 3 phương án theo đúng mẫu quyết định:
     - **Option A** ([mockup-option-a.html](docs/uiux/mockup-option-a.html)): *Tactile Woodblock & Brass* (nâng chất liệu bàn cờ + huy chương đồng ấm).
     - **Option B** ([mockup-option-b.html](docs/uiux/mockup-option-b.html)): *Sunlit Paper Studio* (bổ sung theme sáng ban ngày + công tắc Sáng/Tối).
     - **Option C** ([mockup-option-c.html](docs/uiux/mockup-option-c.html)): *Compact Bento Arcade* (bố cục 2 cột vừa trọn 1 màn hình mobile + dải chuỗi tuần).
2. **Đề xuất sửa cho các file JS đang chạy song song:**
   - Ghi chi tiết kèm tên file, hàm và code mẫu trong [JS-PROPOSALS.md](docs/uiux/JS-PROPOSALS.md): cuộn tự động `.lv.on` trong `#wlvgrid` + icon SVG cho `#wHint` (`js/word.js`), đồng nhất `<span class="lvst">` cho `js/mem.js`, focus vào `.card` thay vì nút đầu tiên khi mở bằng chạm (`js/core.js`), cảnh báo mất sao 3 + sẵn sàng (`js/koi.js`), viền cảnh báo giọt sắp rơi (`js/rain.js`), và nhấn mạnh ô ngã rẽ lúc đếm ngược (`js/train.js`).

---

## 3. File đã chỉnh / thêm & Kết quả Kiểm thử

### File phạm vi cho phép đã chạm
- Chỉnh sửa: `css/app.css`, `css/train.css`, `css/koi.css`, `css/mem.css`, `css/rain.css`, `css/word.css`, `index.html`, `js/hub.js` (0 chỉnh sửa ngoài danh sách cho phép).
- Tạo mới: `tests/uiux.spec.js`, `docs/uiux/JS-PROPOSALS.md`, `docs/uiux/PROPOSALS.md`, `docs/uiux/mockup-option-{a,b,c}.html`, `docs/uiux/REPORT.md`.

### Kết quả chạy kiểm thử sau lần sửa code cuối
- **`check-anti-ai-ui.py`:** `PASS — 0 anti-ai-ui violations (38 UI/content files checked)`.
- **Cổng responsive (`RESP_SHOTS=1 PW_PORT=8952 npx playwright test tests/responsive.spec.js --output /tmp/uiux-after`):** **12 passed** (12/12 viewport: `320×568`, `360×740`, `390×844`, `667×375`, `844×390`, `768×1024`, `820×1180`, `1024×768`, `1180×820`, `1280×800`, `1440×900`, `1920×1080`; 132 ảnh PNG đã chụp và đối chiếu).
- **Toàn bộ test suite (`PW_PORT=8951 npx playwright test`):** **180 passed** (171 test hiện hữu + 9 test mới trong `tests/uiux.spec.js`, 0 failed, 0 skipped).

---

## 4. Chưa xác minh được

- Cảm giác chạm thực tế, độ trễ bàn phím ảo/cử chỉ vuốt hệ thống, rung (`navigator.vibrate`) trên thiết bị iOS Safari và Android Chrome vật lý.
- Hành vi viewport/an toàn tai thỏ trong WebView nhúng của Zalo/Messenger trên điện thoại thật.
- Tải font `Baloo 2` từ Google Fonts qua mạng di động thật (chạy thử trong môi trường headless Chromium cục bộ).
- Windows High Contrast (`forced-colors: active`) trên hệ điều hành Windows thật.
- *Kiểm định chéo:* Các kiểm tra trực quan và `tests/uiux.spec.js` thực hiện trong cùng một phiên agent (same vendor, same priors — no external verifier ran).
