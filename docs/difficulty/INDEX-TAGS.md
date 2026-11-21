# Thẻ script cần thêm vào `index.html`

Nhánh độ khó không sửa `index.html` (nhánh UI song song đang giữ file đó). Người tích hợp chèn đúng
6 dòng dưới đây **ngay sau `js/core.js` và trước `js/train-map.js`**:

```html
<script src="js/core.js"></script>
<script src="js/difficulty.js"></script>
<script src="js/levels/train.js"></script>
<script src="js/levels/koi.js"></script>
<script src="js/levels/mem.js"></script>
<script src="js/levels/rain.js"></script>
<script src="js/levels/word.js"></script>
<script src="js/train-map.js"></script>
```

Dòng đầu và dòng cuối đã có sẵn, chỉ để chỉ chỗ chèn.

## Vì sao thứ tự này

| Ràng buộc | Lý do |
|---|---|
| `difficulty.js` trước mọi `levels/*.js` | Mỗi bảng gọi `BBD.register(...)` lúc nạp. |
| Cả 6 thẻ trước mọi file game và `hub.js` | `koi.js`, `mem.js`, `word.js` đọc `window.BBD` một lần lúc nạp. Thiếu BBD lúc đó thì game chạy bản cũ. |
| Không cần `BB` | `difficulty.js` và `levels/*.js` không đụng `window.BB`, nên đứng sau `core.js` chỉ để gọn. |

## Thiếu thẻ thì sao

| Game | Không có thẻ | Có thẻ |
|---|---|---|
| `train` | Tự chèn `difficulty.js` + `levels/train.js`, chờ tối đa 4 s; lỗi thì chơi 11 màn cũ | 30 màn |
| `rain` | Tự chèn như train; lỗi thì chơi 10 màn cũ | 30 màn |
| `koi` | 10 màn cũ | 30 màn |
| `mem` | 13 màn cũ | 30 màn |
| `word` | 49 màn, thứ tự cũ | 49 màn qua BBD |

Kết luận: **thẻ là bắt buộc** để có 30 màn ở koi và mem. Không có thẻ thì không game nào hỏng, nhưng
koi và mem dừng ở số màn cũ. Thêm phần tự nạp cho koi/mem không phải việc nhỏ: hai game đó đọc
`LV_MAX` một lần lúc khởi động, nên phải chuyển sang khởi động trễ như train/rain.
