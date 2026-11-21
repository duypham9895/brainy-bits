# Đề xuất Chỉnh sửa JS Song song (Không Tự ý Sửa)

Các thay đổi UI/UX dưới đây nằm trong các file `js/*.js` đang được nhóm khác chỉnh song song (`js/core.js`, `js/train.js`, `js/koi.js`, `js/mem.js`, `js/rain.js`, `js/word.js`), nên chưa được áp dụng trong nhánh `feat/uiux`. Mỗi mục ghi rõ file, hàm và đoạn sửa cụ thể để ghép vào an toàn.

---

## 1. `js/word.js` — Cuộn sẵn Level đang chọn vào tầm mắt & Icon gợi ý SVG

**Vấn đề:** Khi `#wlvgrid` được giới hạn chiều cao (`max-height: min(210px, 28dvh); overflow-y: auto`) để nút `Chơi Level` luôn nằm trong khung nhìn, người chơi ở Level 20–49 mở menu ra sẽ chưa thấy ô `.lv.on` nằm phía dưới vùng cuộn. Ngoài ra `#wHint` vẫn chèn emoji `💡` bằng JS khi bấm gợi ý.

### 1a. Tự động cuộn tới ô đang chọn trong `renderLevels()`
- **File:** `js/word.js`
- **Hàm:** `renderLevels()` (khoảng dòng 388–400)
- **Thay đổi:**
  ```js
  // Cuối renderLevels(), sau vòng lặp appendChild:
  const active = grid.querySelector('.lv.on');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  ```

### 1b. Dùng SVG bóng đèn đồng bộ trong `hud()`
- **File:** `js/word.js`
- **Hàm:** `hud()` (dòng 179–184)
- **Thay đổi:** Thêm `<span class="wico" aria-hidden="true"><svg ...></svg></span>` cố định trong `#wHint` của `index.html` và `<span id="wHintTxt"></span>`, rồi chỉ cập nhật `textContent` của `#wHintTxt` thay vì ghi đè `💡`:
  ```js
  $('wHintTxt').textContent = hintShown ? `Chủ đề: ${puzzle.cat}` : 'Xem gợi ý chủ đề';
  ```

---

## 2. `js/mem.js` — Đồng nhất cấu trúc sao trên ô level (`<span class="lvst">`)

**Vấn đề:** 4 game còn lại (`train`, `koi`, `rain`, `word`) render sao dưới dạng `<span>` / `<i>` thật (`★★★`), còn `mem.js` ghi `el.dataset.st` để CSS render qua `::after`. Dù `css/mem.css` đã sửa `position: static` để hết đè chữ, dùng `<span class="lvst">` kèm đủ 3 sao `★☆` giúp đồng bộ hoàn toàn 5 menu (cả về tương phản sao chưa đạt `☆` lẫn DOM).

- **File:** `js/mem.js`
- **Hàm:** `renderLevels()` (dòng 248–266)
- **Thay đổi:**
  ```js
  const k = st[L] || 0;
  el.innerHTML = `${L}<small>${spec(L).t} ô</small>` +
    (k ? `<span class="lvst" aria-hidden="true">${'★'.repeat(k)}${'☆'.repeat(3 - k)}</span>` : '');
  ```
  *(Lưu ý: khi áp dụng, bỏ rule `#mlvgrid .lv.done[data-st]::after` trong `css/mem.css` và đổi sang `#mlvgrid .lvst`.)*

---

## 3. `js/core.js` — Mở dialog bằng chạm không lộ viền focus giả & trả focus khi đóng

**Vấn đề:** Trong `wireOverlays()` (dòng 325–326) và `js/hub.js` `focusDialog()`, khi mở overlay (`#result`, `#paused`, `#settings`, `#menu`), `first.focus()` được gọi trực tiếp trên nút đầu tiên. Trên trình duyệt desktop/Android, đôi khi nút `Level tiếp theo` bật `:focus-visible` ngay cả khi người chơi dùng chuột/chạm (ví dụ thấy rõ ở `word-result-win-390.png` và `tests/shell.spec.js`). Đặt `tabindex="-1"` trên chính `.overlay` hoặc `.card` và focus vào container khi vừa mở giúp **giữ thứ tự Tab trong dialog** mà không tô viền vàng quanh nút chính khi không dùng bàn phím.

- **File:** `js/core.js`
- **Hàm:** `wireOverlays()` (dòng 314–334)
- **Thay đổi:**
  ```js
  ov.setAttribute('tabindex', '-1');
  // Trong check(), khi mở:
  const card = ov.querySelector('.card') || ov;
  if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
  setTimeout(() => { try { card.focus({ preventScroll: true }); } catch (e) {} }, 30);
  ```
  *(Kiểm tra lại `tests/shell.spec.js` review #6: `ov.contains(document.activeElement)` vẫn là `true` vì `.card` nằm bên trong `ov`, và nhấn `Tab` lần đầu vẫn đi vào `els[0]`.)*

---

## 4. `js/koi.js` — Chỉ báo trạng thái vòng chờ & phản hồi chạm vội (Early Tap)

**Vấn đề:** Ở `Cho Cá Koi Ăn`, người chơi chạm cá khi vòng hẹn giờ chưa đầy sẽ bị mất sao thứ 3 (`earlyTaps++`) nhưng trên màn hình chỉ thấy vòng dưới đáy rung nhẹ + tiếng bíp ngắn mà không biết **vì sao** mình vừa mất sao 3.

- **File:** `js/koi.js`
- **Hàm:** `cv` `pointerdown` listener (dòng 303) và `drawDial()` (dòng 191–220)
- **Thay đổi:**
  ```js
  // Trong pointerdown khi cooldown > 0:
  if (cooldown > 0) {
    if (performance.now() - lastFeedAt > 300) {
      earlyTaps++;
      if (earlyTaps === 1) BB.toast('Chờ vòng dưới đầy rồi hãy chạm (mất sao 3)');
    }
    dialShake = 0.3;
    beep(200, 0.08, 'square', 0.03);
    return;
  }
  ```
  Và trong `drawDial()` khi `cooldown === 0 && pellets > 0`: vẽ thêm nhãn ngắn `"Sẵn sàng"` hoặc vòng hào quang mảnh `rgba(127, 227, 208, .5)` để mắt dễ bắt tín hiệu bằng thị giác ngoại biên khi đang nhìn đàn cá bơi.

---

## 5. `js/rain.js` — Trạng thái khẩn cấp khi giọt sát mặt nước & Combo pill trên HUD

**Vấn đề:** Khi giọt phép tính gần chạm mặt nước (`d.p > 0.78`), màu xanh dương giữ nguyên từ trên xuống dưới nên người chơi khó nhận ra giọt nào sắp rơi nhất khi có 3–4 giọt cùng lúc. Ngoài ra `combo` được tính trong JS nhưng không hiển thị trên HUD (chỉ hiện chữ `✓ ×combo` mờ nhanh sau khi vỡ giọt).

- **File:** `js/rain.js`
- **Hàm:** `drawDrop(d)` (dòng 188–213)
- **Thay đổi:** Khi `d.p > 0.78`, thêm viền hổ phách/san hô cảnh báo nhẹ quanh giọt (`ctx.strokeStyle = d.p > 0.88 ? '#ff7a6b' : '#ffd54a'; ctx.lineWidth = 2.5; ctx.stroke();`) — vẫn giữ thân xanh đậm bên dưới để chữ trắng giữ tương phản `>= 5.5:1`.
- **Hàm:** `renderInput()` (dòng 154)
- **Thay đổi:** Dùng `'\u00A0'` thay `' '` khi trống để độ cao dòng luôn ổn định ngay cả nếu CSS bị ghi đè.

---

## 6. `js/train.js` — Nhấn mạnh ngã rẽ có thể chạm trong lúc đếm ngược

**Vấn đề:** Trong 3,6 giây đếm ngược (`state === 'countdown'`), dòng chữ nhỏ `"Quan sát bản đồ và chỉnh ngã rẽ trước nhé"` dễ bị lớp nền tối `rgba(0,0,0,.35)` che mờ, khiến người chơi mới không biết **có thể chạm đổi ngã rẽ ngay trong lúc đếm ngược**.

- **File:** `js/train.js`
- **Hàm:** `draw(dt)` (dòng 471–490)
- **Thay đổi:** Ở block đếm ngược, thêm vòng xung nhẹ (`ctx.strokeStyle = 'rgba(255,213,74,.55)'`) quanh các `map.switches` trong 1,5 giây đầu khi `level === 1 && !BB.motion.reduced`, và đặt pill nền bo tròn sau dòng gợi ý `Quan sát bản đồ và chỉnh ngã rẽ trước nhé` để đọc rõ ở 320px.
