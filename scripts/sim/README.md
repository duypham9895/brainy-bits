# scripts/sim — bộ mô phỏng người chơi

Chạy bằng Node 22, không cần cài thêm gì. Mọi lần chạy đều seeded nên ra cùng một kết quả.

| Lệnh | Làm gì |
|---|---|
| `node scripts/sim/calibrate.mjs mem` | Chạy 400 lượt/màn/profile cho L1..30, kiểm gate, in bảng, ghi `docs/difficulty/calibration-mem.json`. Exit 0 = mọi gate qua, 1 = có gate trượt, 2 = lỗi dùng lệnh hoặc adapter còn là TODO. |
| `node scripts/sim/calibrate.mjs mem --n 1200 --from 14 --to 40 --no-write` | Đổi số lượt, khoảng màn; không ghi file. |
| `node scripts/sim/calibrate.mjs mem --gamma 0.25 --no-write` | Cờ số lạ được chuyển thẳng vào adapter (ở đây: chi phí chunk của mem) để thử độ nhạy của giả định. |
| `node --test scripts/sim/difficulty.test.mjs` | Test engine (D, p*, đơn điệu, hardCap, legacy, lighter, Elo) và gate mem. |
| `PW_PORT=8920 npx playwright test tests/difficulty.spec.js` | Kiểm `js/difficulty.js` nạp được như classic script trên browser thật, không cần `BB`. |

## Thêm vào `package.json` (chưa sửa file đó vì PR song song đang đụng vào nó)

```json
"sim": "node scripts/sim/calibrate.mjs",
"sim:mem": "node scripts/sim/calibrate.mjs mem",
"test:sim": "node --test scripts/sim/difficulty.test.mjs"
```

Dùng: `npm run sim -- koi`, `npm run sim:mem`, `npm run test:sim`.
Lưu ý `node --test scripts/sim/` (thư mục) không chạy trên Node 22; phải chỉ đúng file `.test.mjs`.

## File

| File | Vai trò |
|---|---|
| `load-bbd.mjs` | Nạp `js/difficulty.js` + `js/levels/*.js` vào một `node:vm` mới, đúng như browser chạy classic script. |
| `human.mjs` | Profile `weak` / `median` / `skilled`, RNG `mulberry32` + `cyrb53`, ex-Gaussian RT, working memory, lapse, learning. Mỗi tham số ghi nguồn trong comment. |
| `calibrate.mjs` | Monte Carlo + gate B, G1–G9 (G7 SKIP). |
| `adapters/mem.mjs` | Adapter mẫu, làm đủ. |
| `adapters/{train,koi,rain,word}.mjs` | Adapter đủ cho từng game (trước là TODO stub; `calibrate` vẫn từ chối adapter nào còn khai `TODO`, exit 2). |
