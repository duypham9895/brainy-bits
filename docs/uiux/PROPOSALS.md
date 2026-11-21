# Đề xuất Nâng cấp Định hướng Thị giác — Brainy Bits

**TL;DR:** Sau khi hoàn thiện tương phản, hình học responsive và nhịp giao diện mà vẫn giữ nguyên bảng màu hiện tại ở bản live, có 3 hướng nâng cấp định hướng hình ảnh lớn hơn (bộ icon/chất liệu mới, chế độ sáng ban ngày, hoặc bố cục Hub 1 màn hình) để Duy chọn cho đợt tiếp theo. **Thời gian đọc:** ~2 phút.

---

Decide: Chọn hướng nâng cấp hình ảnh tiếp theo cho Brainy Bits (hoặc giữ nguyên bản tối ưu vừa triển khai).

Why now: Nhánh `feat/uiux` đã xử lý toàn bộ lỗi tương phản, cắt chữ, tràn màn hình 49 level, sao đè số và phản hồi hover/focus trong khung nhận diện cũ; các thay đổi lớn về palette, theme sáng hay bố cục Hub cần Duy chốt gu trước khi sửa DOM/tài nguyên.

| Option | Gain | Lose | Risk |
|--------|------|------|------|
| A: Tactile Woodblock and Brass (mockup-option-a.html) | Giữ trọn bảng màu 5 game hiện tại nhưng nâng chiều sâu bàn cờ gỗ, đường viền đồng ấm và hệ icon SVG đồng bộ 100% thay emoji trong mọi modal | Cần vẽ thêm vài icon vector nhỏ cho menu và kết quả; tăng nhẹ công bảo trì SVG | Thấp — không đổi màu chủ đạo hay cấu trúc Hub, chỉ thay áo bề mặt |
| B: Sunlit Paper Studio Day and Night (mockup-option-b.html) | Thêm theme sáng nền giấy ấm để chơi ngoài trời quán cà phê ban ngày dễ đọc, giữ nguyên dark mode làm mặc định ban đêm | Phải kiểm định kép WCAG AA cho cả 2 theme trên 5 game và 5 canvas nền; tăng gấp đôi biến màu CSS | Trung bình — 5 canvas game hiện vẽ cứng mã hex tối nên cần đồng bộ theme vào JS |
| C: Compact Bento Arcade Hub (mockup-option-c.html) | Toàn bộ 5 game, chuỗi ngày và Thử thách hôm nay nằm gọn trong 1 màn hình điện thoại 390x844 không cần cuộn | Mỗi thẻ game nhỏ hơn, mô tả rút gọn chỉ còn 1 dòng; mất cảm giác thoáng của danh sách dọc hiện tại | Trung bình — cần chỉnh cấu trúc grid `#hub` và test lại responsive trên 320px |

Recommend: **Option A (Tactile Woodblock & Brass)**, because bảng màu 5 game tối đã có sẵn bản sắc riêng và dễ chơi buổi tối, chỉ cần nâng độ sắc của bề mặt thẻ, viền chỉ và độ đồng nhất icon giữa Hub và Menu là đạt chất lượng app hoàn chỉnh mà không phá 5 canvas game đang chạy song song.

Strongest case against: **Option B (Sunlit Paper Studio)** giải quyết tốt bối cảnh người chơi mở điện thoại ban ngày ngoài nắng — nơi màn hình tối rất dễ loá và chói bóng ngón tay — đồng thời gần gu giấy ấm của các app khác trong xưởng.

Real tradeoff: Giữ sự an toàn và thống nhất tức thì của 5 canvas hiện tại (**Option A**) hay đầu tư công đồng bộ màu 5 canvas cho bối cảnh dùng ngoài trời (**Option B**), hoặc hy sinh độ rộng mô tả để đổi lấy tốc độ vào game không cần cuộn trên mobile (**Option C**).

If wrong: Hoàn toàn đảo ngược được ở mức commit/nhánh CSS; Option A không chạm vào JS logic, còn Option B và C nên tách PR riêng sau khi chốt hướng.

Question: Duy muốn đi tiếp theo **Option A**, **Option B**, **Option C**, hay giữ nguyên bản tối ưu vừa xong ở `feat/uiux`?

---

## Xem thử trực quan các phương án
- [mockup-option-a.html](docs/uiux/mockup-option-a.html) — **Option A: Tactile Woodblock & Brass** (Dark mode nâng cấp bề mặt + icon hệ thống).
- [mockup-option-b.html](docs/uiux/mockup-option-b.html) — **Option B: Sunlit Paper Studio** (Có nút gạt thử `Sáng / Tối` ngay trên trang mockup).
- [mockup-option-c.html](docs/uiux/mockup-option-c.html) — **Option C: Compact Bento Arcade** (Bố cục 2 cột vừa khung 390px + dải lịch chuỗi 7 ngày).
