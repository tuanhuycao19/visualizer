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

## Trang 2 — Doanh số xe Trung Quốc 3D (`/sales/`)

Biểu đồ cột ngang 3D (three.js) cho doanh số xe Trung Quốc tại Việt Nam
tháng 9/2026: các cột bóng mọc lên lần lượt, số đếm tăng dần, vệt sáng quét
dọc cột; nền abstract chuyển động nhẹ (sương xoáy, dải sáng, bụi bokeh,
vòng tròn trôi). Di chuột để xoay nhẹ góc nhìn và làm nổi một hàng;
nút **Phát lại** chạy lại animation. Màn hình dọc tự đổi bố cục (nhãn nằm trên cột).

| File | Vai trò |
| --- | --- |
| `sales/index.html` | Tiêu đề, nhãn, chân trang |
| `src/sales/data.js` | Số liệu + màu từng hãng (sửa ở đây khi có tháng mới) |
| `src/sales/main.js` | Scene 3D, bố cục/camera, timeline animation, nhãn HTML gắn theo cột |
| `src/sales/background.js` | Shader nền, bụi hạt, vòng tròn |
| `src/sales/style.css` | Font, badge hạng, animation tiêu đề |

Chạy `npm run dev` rồi mở http://localhost:5173/sales/

## Trang 3 — Mối Duyên Vàng (`/butterflies/`)

Hai cánh bướm — một tím viền vàng, một vàng viền tím — bay vòng quanh nhau,
nối với nhau bằng một sợi tơ vàng lấp lánh (có các nhịp sáng chạy dọc sợi),
mỗi con kéo theo một vệt sáng và rắc kim tuyến. Nền tím hoàng gia ánh lụa
với quầng vàng, mây tường vân (cuộn xoắn viền vàng) trôi ở nhiều tầng,
cành lá tím–vàng đung đưa ở hai góc, lá rơi xoay và bụi vàng.
Hai con bay vào từ hai phía khi mở trang; chạm/bấm để chúng xích lại gần
nhau trong một vụ nổ kim tuyến.

| File | Vai trò |
| --- | --- |
| `butterflies/index.html` | Tiêu đề, dòng gợi ý |
| `src/butterflies/main.js` | Scene, quỹ đạo bay, sợi tơ, tương tác, quay video |
| `src/butterflies/butterfly.js` | Cánh bướm (vẽ bằng canvas, uốn & vỗ trong shader), thân, bảng màu |
| `src/butterflies/scenery.js` | Nền shader, mây tường vân, cành lá, lá rơi, vòng hào quang, bụi vàng |
| `src/butterflies/effects.js` | Dải sáng (vệt bay, sợi tơ) và kim tuyến |
| `src/butterflies/style.css` | Font Cormorant Garamond, chữ vàng ánh kim |

Chạy `npm run dev` rồi mở http://localhost:5173/butterflies/

## Quay & tải video (cả 3 trang)

Nút **● Quay video** ở góc trên bên phải (hoặc phím **R**):

1. Chọn thời lượng (5 / 10 / 15 / 30 / 60 giây, hoặc *Dừng tay*).
2. Bấm quay: animation intro tự chạy lại từ đầu để video bắt đầu đúng lúc.
3. Khi dừng, file được tải về tự động (kèm khung xem thử và nút **Tải về**).

Video có độ phân giải bằng khung hình đang hiển thị (× devicePixelRatio,
tối đa 3840 px) — muốn video dọc 9:16 thì thu nhỏ cửa sổ/dùng điện thoại.
Định dạng: **MP4 (H.264)** trên Chrome/Edge/Safari mới, **WebM** trên Firefox.
Mọi thứ xử lý trong trình duyệt, không upload đi đâu.

Cách hoạt động: mỗi khung hình, canvas WebGL được chép sang một canvas 2D,
rồi phần chữ HTML (tiêu đề, nhãn, số, chữ ký, logo…) được vẽ đè lên theo
style đang tính toán của trình duyệt, nên các animation CSS cũng có trong video.
Phần tử gắn `data-record-ignore` (nút quay, nút *Phát lại*) không xuất hiện trong video.

| File | Vai trò |
| --- | --- |
| `src/record/recorder.js` | Nút quay, MediaRecorder, tải file |
| `src/record/paint-dom.js` | Vẽ lớp HTML lên canvas (chữ, gradient, badge, SVG, bóng, clip-path) |
| `src/record/recorder.css` | Giao diện nút quay / khung xem thử |

## Deploy

Workflow `.github/workflows/deploy.yml` tự build và deploy lên GitHub Pages
mỗi khi push lên `main` (hoặc chạy tay qua tab *Actions*).
Cần bật một lần: **Settings → Pages → Source: GitHub Actions**.

Trang: https://tuanhuycao19.github.io/visualizer/, https://tuanhuycao19.github.io/visualizer/sales/ và https://tuanhuycao19.github.io/visualizer/butterflies/
