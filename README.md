# Visualizer — "New Act" waves

Hiệu ứng sóng lượn chuyển động lấy cảm hứng từ poster *NEW ACT*:
nền xanh navy với các vệt "cát" lấp lánh xoáy, những dải ruy-băng xanh
bóng có sọc mảnh uốn lượn, chữ **NEW ACT** serif gradient xanh dương → xanh lá,
logo và chữ ký.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # xuất bản ra dist/
```

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `index.html` | Bố cục poster (tiêu đề, logo, chữ ký) |
| `src/shader.js` | Fragment shader WebGL2: nền xoáy hạt + ruy-băng sóng |
| `src/main.js` | Khởi tạo WebGL, vòng lặp animation, tương tác chuột |
| `src/style.css` | Font, gradient chữ chuyển động, animation xuất hiện |

## Tuỳ chỉnh nhanh (trong `src/shader.js`)

- `k = F * 3.2` — số lượng dải sóng (tăng = nhiều dải mỏng hơn).
- `hw = 0.27 + 0.13 * twist` — độ rộng/xoắn của dải.
- `stripeFreq` — mật độ sọc trên dải.
- `royal`, `deep`, `navy`, `dust` — bảng màu.
- Tốc độ: các hệ số nhân `t` trong hàm `ribbons()` và `background()`.

Di chuột để làm sóng lệch nhẹ. Hỗ trợ `prefers-reduced-motion`.
