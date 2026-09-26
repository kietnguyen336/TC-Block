# Thiết Kế Kỹ Thuật: TC-Block - Tiện Ích Báo Cáo & Chặn Kênh YouTube Dùng Chung

## 1. Tổng Quan Dự Án
TC-Block là một tiện ích mở rộng trình duyệt (Chrome Extension Manifest V3) kết hợp với Backend Serverless (Cloudflare Workers + D1 Database).
Hệ thống cho phép người dùng:
1. Báo cáo (Report) các kênh YouTube có nội dung độc hại, câu view, phản cảm hoặc vi phạm bản quyền trực tiếp từ giao diện YouTube.
2. Dữ liệu báo cáo được lưu trữ tập trung trên Cloudflare D1. Bất kỳ khi nào một kênh bị báo cáo, kênh đó sẽ lập tức được thêm vào danh sách chặn chung của toàn bộ cộng đồng người dùng cài extension.
3. Extension tự động ẩn tất cả các video thuộc các kênh trong danh sách chặn trên khắp giao diện YouTube (Trang chủ, Tìm kiếm, Cột gợi ý, Kênh liên quan).
4. Cung cấp giao diện Popup quản lý theo phong cách **Material Design** với tông màu Trắng & Đỏ hồng nhạt đặc trưng của YouTube, hiệu ứng blur mượt mà và hoàn toàn sử dụng SVG vector icons (không dùng emoji).

---

## 2. Kiến Trúc Hệ Thống (System Architecture)

```
+-------------------------------------------------------------------------+
|                              YouTube Web                                |
|  [Video Cards]        [Watch Page Header]         [Channel Header]      |
|         \                      |                         /              |
|          +---------------------+------------------------+               |
|                                |                                        |
|                     [content.js (Content Script)]                       |
|           - DOM Scanner & Filtering (MutationObserver Debounced)        |
|           - Injected Report Buttons (SVG Flag Icon)                     |
|           - Report Modal (Shadow DOM + Blur + Material Design)          |
+--------------------------------+----------------------------------------+
                                 | Chrome Message Passing
+--------------------------------v----------------------------------------+
|                      [background.js (Service Worker)]                   |
|           - Local Storage Cache (chrome.storage.local)                  |
|           - Auto Sync via chrome.alarms (every 10m / browser start)    |
|           - Message Router for Tabs & Popup                             |
+-------------------+--------------------------------+--------------------+
                    |                                |
                    | Sync / Reports                 | Query / Actions
+-------------------v-------------------+  +---------v--------------------+
|  [Cloudflare Worker API (Edge Cloud)] |  |   [Popup UI (Material M3)]   |
|   - POST /api/reports                 |  |   - Block statistics         |
|   - GET /api/blocked                  |  |   - Search & channel list    |
|   - DELETE /api/blocked/:handle       |  |   - Manual sync & unblock    |
|   - Cloudflare D1 (SQLite Edge DB)    |  |   - API configuration        |
+---------------------------------------+  +------------------------------+
```

---

## 3. Chi Tiết Backend (Cloudflare Worker & D1 Database)

### 3.1. Database Schema (Cloudflare D1)
```sql
CREATE TABLE IF NOT EXISTS blocked_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_handle TEXT UNIQUE NOT NULL, -- Ví dụ: @kenh-xau
    channel_name TEXT NOT NULL,         -- Tên hiển thị của kênh
    channel_url TEXT,                   -- URL kênh https://youtube.com/@...
    reason TEXT NOT NULL,               -- Lý do báo cáo gần nhất
    report_count INTEGER DEFAULT 1,     -- Số lượt báo cáo tích lũy
    status TEXT DEFAULT 'active',       -- active | inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_handle TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    reporter_ip_hash TEXT,              -- Hash SHA-256 IP chống flood
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocked_handle ON blocked_channels(channel_handle);
CREATE INDEX IF NOT EXISTS idx_reports_handle ON reports(channel_handle);
```

### 3.2. API Specifications
1. **`POST /api/reports`**
   - Body JSON:
     ```json
     {
       "channel_handle": "@example",
       "channel_name": "Tên Kênh",
       "channel_url": "https://www.youtube.com/@example",
       "reason": "Nội dung phản cảm, tin giả"
     }
     ```
   - Logic:
     - Chuẩn hóa `channel_handle` về chữ thường.
     - Validate độ dài chuỗi (`channel_handle`, `reason`).
     - Ghi nhận vào bảng `reports`.
     - Upsert vào bảng `blocked_channels`: nếu đã tồn tại thì tăng `report_count = report_count + 1` và cập nhật `updated_at`.
     - Trả về status 200/201 kèm payload thông báo thành công.
2. **`GET /api/blocked`**
   - Query params: `?since=<timestamp>` (optional)
   - Headers: Trả về `ETag` dựa trên thời gian cập nhật mới nhất.
   - Body JSON:
     ```json
     {
       "success": true,
       "count": 42,
       "updated_at": "2026-09-26T13:00:00Z",
       "data": [
         {
           "channel_handle": "@toxic1",
           "channel_name": "Kênh Độc Hại 1",
           "channel_url": "https://www.youtube.com/@toxic1",
           "reason": "Nội dung giật gân, độc hại",
           "report_count": 3,
           "created_at": "2026-09-20T10:00:00Z"
         }
       ]
     }
     ```
3. **`DELETE /api/blocked/:handle`**
   - Xóa hoặc cập nhật status = `inactive` cho kênh được chỉ định.

---

## 4. Chi Tiết Extension (Manifest V3)

### 4.1. Cấu Trúc Thư Mục
```
TC-Block/
├── backend/
│   ├── wrangler.toml              # Cấu hình Cloudflare Worker & D1 binding
│   ├── schema.sql                 # SQL migration khởi tạo D1 database
│   ├── package.json               # Dependencies backend
│   └── src/
│       └── index.js               # Handler API Cloudflare Worker
├── extension/
│   ├── manifest.json              # Khai báo Chrome Extension Manifest V3
│   ├── background/
│   │   └── background.js          # Service Worker: sync API, storage cache, message passing
│   ├── content/
│   │   ├── content.js             # Quét DOM YouTube, ẩn video, inject button & modal
│   │   └── content.css            # Styles phụ trợ cho nút inject trên YouTube
│   ├── popup/
│   │   ├── popup.html             # Giao diện Material Design của Popup
│   │   ├── popup.css              # Styling trắng & đỏ hồng nhạt, blur, không emoji
│   │   └── popup.js               # Logic tìm kiếm, thống kê, unblock, trigger sync
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── docs/
    └── superpowers/specs/2026-09-26-youtube-channel-blocker-design.md
```

### 4.2. Kỹ Thuật Can Thiệp DOM & Hiệu Năng YouTube (`content.js`)
* **Bộ chọn phần tử Video YouTube**:
  * Trang chủ (Home) & Đề xuất lưới: `ytd-rich-item-renderer`, `ytd-rich-grid-row`
  * Trang tìm kiếm (Search results): `ytd-video-renderer`
  * Cột đề xuất bên phải khi xem video: `ytd-compact-video-renderer`
  * Danh sách video trên kênh / playlist: `ytd-grid-video-renderer`, `ytd-playlist-video-renderer`
  * Video Shorts: `ytd-reel-video-renderer`, `ytd-rich-item-renderer[is-shorts]`
* **Trích xuất thông tin kênh**:
  * Tìm selector `a.yt-simple-endpoint[href*="/@"], ytd-channel-name a[href*="/@"], a#channel-name`
  * Trích xuất handle: Chuỗi bắt đầu bằng `@` trong link href (ví dụ `/@KenhTinTuc` -> `@kenhtintuc`).
* **Kỹ thuật Ẩn Video Không Gây Giật Lag**:
  * Không dùng `setInterval`. Sử dụng `MutationObserver` gắn vào root container của YouTube.
  * Debounce 40ms kết hợp `requestAnimationFrame` để gom các node mới xuất hiện khi người dùng scroll.
  * Thêm class `.tc-channel-blocked` với thuộc tính `display: none !important;`.
  * Đánh dấu thuộc tính `data-tc-checked="1"` để không lặp lại việc kiểm tra các node đã duyệt qua.
* **Cơ Chế Inject Nút Báo Cáo**:
  * **Tại thẻ video**: Thêm một nút icon SVG nhỏ gọn (cờ báo cáo Material Design) ở góc thumbnail hoặc bên cạnh tiêu đề video.
  * **Tại trang xem video (`/watch`)**: Thêm nút "Báo cáo kênh" viền đỏ hồng Material Design cạnh nút Đăng Ký (Subscribe) trong khu vực `#owner`.
  * **Tại trang kênh (`/@handle`)**: Thêm nút cạnh nút Đăng ký ở thanh thông tin header của kênh.
  * Khi bấm nút: Mở Report Modal với thông tin kênh tương ứng đã được điền sẵn.

---

## 5. Thiết Kế Giao Diện (Material Design & Hồng Đỏ Nhạt, Không Emoji)

### 5.1. Bảng Màu (Color Palette)
* **Primary (Màu chủ đạo)**: Đỏ YouTube `#CC0000` / `#E50914`
* **Primary Container / Tint (Đỏ hồng nhạt)**: `#FFF0F2` (nền chip, nền card active, viền hover)
* **Surface / Background (Nền)**: `#FFFFFF` (trắng tinh khiết)
* **Surface Variant (Nền phụ)**: `#F8F9FA`
* **Border / Divider (Đường kẻ viền)**: `#F0E0E2` (viền hồng xám nhẹ)
* **Text Primary (Chữ chính)**: `#1F1F1F`
* **Text Secondary (Chữ phụ)**: `#606060`
* **Shadows & Blur**: `box-shadow: 0 8px 32px rgba(204, 0, 0, 0.08)`, `backdrop-filter: blur(12px)`

### 5.2. Nguyên Tắc Thiết Kế Biểu Tượng (Iconography)
* **Tuyệt đối KHÔNG sử dụng emoji** trong toàn bộ giao diện: không dùng 🛡️, 👁️, 🔄, ✅, ❌, ⚠️,...
* Sử dụng hoàn toàn **Material Design SVG Icons** đồng bộ (stroke 1.8px / fill tinh gọn):
  * Icon Báo cáo: SVG Flag / Shield-Alert
  * Icon Tìm kiếm: SVG Search Lens
  * Icon Đồng bộ: SVG Refresh Cycle
  * Icon Gỡ chặn: SVG Trash / User-X
  * Icon Đóng: SVG Close Cross
  * Icon Thành công: SVG Checkmark Circle

### 5.3. Report Modal trên YouTube (Shadow DOM)
* Đóng gói toàn bộ trong Shadow DOM để tránh xung đột CSS với YouTube.
* Backdrop mờ: `rgba(15, 15, 15, 0.5)` kết hợp `backdrop-filter: blur(8px)`.
* Card Modal:
  * Góc bo mềm mại `border-radius: 16px`.
  * Nền trắng `#ffffff` với viền nhẹ `#ffdbe0`.
  * Header: Icon SVG cờ đỏ hồng + Tiêu đề "Báo cáo & Chặn Kênh".
  * Thẻ thông tin kênh: Hộp màu đỏ hồng nhạt `#FFF0F2` hiển thị tên kênh và `@handle`.
  * Danh mục lý do chọn nhanh (Chips dạng Material Design):
    * "Nội dung giật gân, câu view"
    * "Thông tin sai sự thật, lừa đảo"
    * "Nội dung độc hại, phản cảm"
    * "Spam, reup vi phạm bản quyền"
  * Textarea nhập chi tiết lý do với hiệu ứng focus viền đỏ hồng `#FF4D6D`.
  * Nút "Hủy" (Text button) và "Gửi Báo Cáo" (Contained button đỏ hồng đậm `#CC0000` với chữ trắng).
* Toast thông báo sau khi gửi: Card nhỏ trượt lên ở góc dưới màn hình kèm icon SVG Checkmark.

### 5.4. Extension Popup UI
* Kích thước tiêu chuẩn: 380px x 520px.
* Header: Logo SVG + Tên "TC-Block" + Trạng thái hoạt động (chấm xanh pulsate) + Nút Đồng bộ lại.
* 2 Card thống kê dạng Material Card:
  * Card 1: Số kênh đã chặn trong hệ thống (kèm icon SVG Shield).
  * Card 2: Số video đã ẩn trong phiên duyệt (kèm icon SVG Eye-Off).
* Thanh tìm kiếm với icon SVG kính lúp và viền bo tròn 24px.
* Danh sách kênh bị chặn:
  * Hiển thị Avatar giả lập với chữ cái đầu của kênh trong hình tròn nền hồng nhạt.
  * Tên kênh in đậm, `@handle` màu xám.
  * Lý do chặn hiển thị trong nhãn nhỏ nền `#FFF0F2`.
  * Nút hành động "Gỡ chặn" dạng icon SVG thùng rác/hủy bỏ.
* Chân trang (Footer): Tùy chọn cài đặt URL API (chuyển đổi giữa Localhost và Cloudflare Worker Production).

---

## 6. Chiến Lược Kiểm Thử & Triển Khai (Testing & Deployment)

1. **Kiểm thử cục bộ (Local Testing)**:
   - Backend: Dùng `wrangler dev` khởi chạy local server `http://127.0.0.1:8787` với database D1 local.
   - Extension: Mở `chrome://extensions`, bật Developer Mode, nhấn **Load unpacked** thư mục `extension/`.
   - Vào YouTube (`youtube.com`), kiểm tra:
     - Nút báo cáo có xuất hiện trên thẻ video, trang xem video, trang kênh.
     - Bấm nút: Modal có mở mượt mà với Shadow DOM và blur không.
     - Bấm gửi: Dữ liệu có lưu vào backend không, video của kênh đó có bị ẩn ngay lập tức không.
     - Mở trang chủ hoặc tìm kiếm lại: các video của kênh bị chặn có bị ẩn hoàn toàn không.
     - Mở Popup: có xem được danh sách và gỡ chặn không.
2. **Triển khai Production (Cloudflare Deployment)**:
   - Tạo D1 database trên Cloudflare: `npx wrangler d1 create tc-block-db`.
   - Chạy migration: `npx wrangler d1 execute tc-block-db --file=./schema.sql`.
   - Deploy worker: `npx wrangler deploy`.
   - Điền URL Worker chính thức vào file cấu hình extension.
