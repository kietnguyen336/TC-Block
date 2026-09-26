# TC-Block: Tiện Ích Báo Cáo & Chặn Kênh YouTube Dùng Chung Cho Cộng Đồng

**TC-Block** là một giải pháp kết hợp giữa **Chrome Extension (Manifest V3)** và **Cloudflare Workers (Edge Serverless + D1 Database)**, cho phép người dùng báo cáo các kênh YouTube rác, tin giả, độc hại, giật gân hoặc vi phạm bản quyền trực tiếp trên giao diện YouTube. Danh sách các kênh bị chặn được đồng bộ tự động và dùng chung cho toàn bộ cộng đồng người cài tiện ích.

---

## 🌟 Tính Năng Nổi Bật

1. **Inject Nút Báo Cáo Tại 3 Vị Trí Trên YouTube**:
   - **Góc thẻ video**: Icon cờ báo cáo nhanh trên thumbnail/thẻ video ở Trang chủ, Tìm kiếm, Cột đề xuất bên phải.
   - **Trang xem video (`/watch`)**: Nút "Báo cáo Kênh" viền đỏ hồng Material Design nằm ngay cạnh nút Đăng Ký (Subscribe) của chủ kênh.
   - **Trang chủ kênh (`/@handle`)**: Nút báo cáo nằm cạnh nút Subscribe ở header kênh.

2. **Hộp Thoại Báo Cáo Chuẩn Material Design (Shadow DOM)**:
   - Sử dụng **Shadow DOM** giúp giao diện modal độc lập 100%, không bị ảnh hưởng bởi CSS của YouTube.
   - Hiệu ứng **Blur** nền và animation mượt mà (`backdrop-filter: blur(10px)`).
   - Chip chọn nhanh các lý do phổ biến: *Giật gân, câu view*, *Lừa đảo, tin giả*, *Độc hại, phản cảm*, *Spam, bản quyền*.
   - Ô nhập chi tiết lý do kèm đếm ký tự.
   - **100% không sử dụng emoji**, dùng toàn bộ biểu tượng vector SVG Material Design sắc nét.

3. **Cơ Chế Ẩn Video Siêu Mượt**:
   - Sử dụng `MutationObserver` kết hợp **Debounce 40ms** và `requestAnimationFrame`.
   - Video của kênh bị chặn sẽ biến mất ngay lập tức với hiệu ứng fade-out nhẹ, giữ trải nghiệm YouTube luôn mượt mà 60 FPS.

4. **Đồng Bộ Dùng Chung (Cloudflare Workers & D1 Database)**:
   - Chỉ cần 1 người báo cáo kênh, kênh đó sẽ được lưu vào cơ sở dữ liệu Edge Cloud và lập tức ẩn đối với tất cả người dùng khác cài extension.
   - Extension tự động cập nhật ngầm định kỳ qua `chrome.alarms` và lưu cache cục bộ trong `chrome.storage.local`.

5. **Popup Quản Lý Tiện Ích**:
   - Thống kê: Số kênh đã chặn & Số video đã ẩn trong phiên.
   - Tìm kiếm tức thì danh sách kênh hoặc lý do.
   - Nút gỡ chặn từng kênh.
   - Nút cưỡng chế đồng bộ ngay từ server.
   - Cấu hình linh hoạt URL API (chuyển đổi giữa localhost và production).

---

## 📁 Cấu Trúc Dự Án

```
TC-Block/
├── backend/
│   ├── package.json               # Cấu hình dự án backend
│   ├── wrangler.toml              # Cấu hình Cloudflare Worker & D1 binding
│   ├── schema.sql                 # SQL schema bảng blocked_channels & reports
│   ├── src/
│   │   └── index.js               # Handler API REST (CORS, POST /api/reports, GET /api/blocked, DELETE)
│   └── test/
│       └── test-server.js         # Unit test backend
├── extension/
│   ├── manifest.json              # Khai báo Chrome Extension Manifest V3
│   ├── background/
│   │   └── background.js          # Service Worker: sync API, local cache, message router
│   ├── content/
│   │   ├── content.js             # Quét DOM YouTube, inject button & modal Shadow DOM
│   │   └── content.css            # CSS Material Design trên YouTube
│   ├── popup/
│   │   ├── popup.html             # Giao diện Popup Material Design
│   │   ├── popup.css              # Styling trắng & đỏ hồng nhạt, blur, không emoji
│   │   └── popup.js               # Logic tìm kiếm, thống kê, unblock, trigger sync
│   ├── icons/                     # Bộ icon 16x16, 48x48, 128x128
│   └── test/                      # Bộ test kiểm thử Extension
├── scripts/
│   └── verify-all.js              # Script kiểm thử E2E tích hợp toàn diện
└── docs/                          # Bản thiết kế kỹ thuật (Spec) và Kế hoạch (Plan)
```

---

## 🚀 Hướng Dẫn Cài Đặt & Sử Dụng

### Bước 1: Cài đặt Extension vào Trình duyệt (Chrome / Cốc Cốc / Edge / Brave)

1. Mở trình duyệt và truy cập vào đường dẫn tiện ích:
   - Google Chrome / Cốc Cốc / Brave: `chrome://extensions/`
   - Microsoft Edge: `edge://extensions/`
2. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Bấm vào nút **Load unpacked (Tải tiện ích đã giải nén)**.
4. Chọn thư mục:
   ```
   C:\Users\zodic\Desktop\TC-Block\extension
   ```
5. Tiện ích **TC-Block** sẽ xuất hiện trên thanh công cụ trình duyệt. Bấm ghim (Pin) icon tiện ích để dễ dàng theo dõi.

---

### Bước 2: Chạy Backend Cloudflare Worker

Bạn có thể chạy thử cục bộ trên máy tính hoặc triển khai lên đám mây Cloudflare miễn phí:

#### Cách A: Chạy Cục Bộ (Local Development)
1. Mở Terminal tại thư mục `backend`:
   ```bash
   cd c:\Users\zodic\Desktop\TC-Block\backend
   npm install
   ```
2. Khởi chạy server Cloudflare Worker giả lập:
   ```bash
   npx wrangler dev
   ```
   Worker sẽ lắng nghe tại `http://localhost:8787`. Mặc định Extension đã được cấu hình sẵn để kết nối tới địa chỉ này.

#### Cách B: Triển Khai Lên Cloudflare Workers (Miễn Phí)
1. Đăng nhập tài khoản Cloudflare qua CLI:
   ```bash
   npx wrangler login
   ```
2. Tạo cơ sở dữ liệu D1 Database trên Cloudflare:
   ```bash
   npx wrangler d1 create tc-block-db
   ```
   *(Copy `database_id` được in ra và cập nhật vào file `wrangler.toml`)*
3. Chạy migration tạo bảng dữ liệu:
   ```bash
   npx wrangler d1 execute tc-block-db --file=./schema.sql
   ```
4. Triển khai API lên Cloudflare toàn cầu:
   ```bash
   npx wrangler deploy
   ```
5. Sau khi deploy xong, bạn sẽ nhận được một đường link dạng:
   `https://tc-block-api.<your-subdomain>.workers.dev`
6. Mở Popup của Extension -> Bấm icon bánh răng cài đặt -> Dán link API của bạn vào và bấm **Lưu**. Tất cả các máy tính cài extension của bạn sẽ đồng bộ chung qua link này!

---

## 🧪 Chạy Kiểm Thử (Automated Tests)

Dự án đi kèm bộ test tự động toàn diện bao gồm cả kiểm tra quy tắc không dùng emoji và kiểm thử E2E:

1. **Chạy kiểm thử toàn diện E2E**:
   ```bash
   node scripts/verify-all.js
   ```

2. **Chạy kiểm thử từng phần**:
   ```bash
   node backend/test/test-server.js
   node extension/test/test-manifest.js
   node extension/test/test-dom-filter.js
   node extension/test/test-content-script.js
   node extension/test/test-popup.js
   ```

---

## 🎨 Quy Chuẩn Thiết Kế

- **Phong cách**: Material Design 3 (Google).
- **Màu sắc**: Nền Trắng tinh khiết (`#FFFFFF`), Điểm nhấn Đỏ hồng nhạt đặc trưng của YouTube (`#FFF0F2`, `#FFD0D6`, `#CC0000`).
- **Hiệu ứng**: Blur mượt mà (`backdrop-filter: blur(10px)`), viền bo tròn 16px - 20px, đổ bóng mềm mại.
- **Biểu tượng**: 100% sử dụng icon vector SVG Material Design sắc nét, **hoàn toàn không dùng emoji**.
