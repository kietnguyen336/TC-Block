# TC-Block: YouTube Channel Blocker & Community Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tiện ích mở rộng Chrome (Manifest V3) cho phép người dùng báo cáo kênh YouTube kèm lý do trực tiếp trên giao diện YouTube, lưu trữ tập trung vào Cloudflare Workers + D1, và tự động ẩn tất cả các video của các kênh bị chặn đối với tất cả người dùng cài extension.

**Architecture:** 
- Backend Serverless: Cloudflare Worker API kết nối Cloudflare D1 (Edge SQLite) cung cấp API báo cáo, lấy danh sách chặn và gỡ chặn.
- Extension Manifest V3: Service Worker (`background.js`) định kỳ đồng bộ danh sách kênh về `chrome.storage.local`. Content Script (`content.js`) theo dõi DOM với `MutationObserver` debounced để ẩn thẻ video khớp với danh sách chặn và inject nút báo cáo tại các vị trí trên YouTube.
- Giao diện người dùng: Modal báo cáo sử dụng Shadow DOM và Popup quản lý được thiết kế theo chuẩn Material Design với tông màu Trắng & Đỏ hồng nhạt đặc trưng của YouTube, hiệu ứng blur mượt mà và 100% sử dụng icon vector SVG (hoàn toàn không dùng emoji).

**Tech Stack:** JavaScript (ES6+), Chrome Extension Manifest V3, Cloudflare Workers, Cloudflare D1 Database, HTML5, Vanilla CSS (Material Design 3).

**Spec:** [docs/superpowers/specs/2026-09-26-youtube-channel-blocker-design.md](file:///c:/Users/zodic/Desktop/TC-Block/docs/superpowers/specs/2026-09-26-youtube-channel-blocker-design.md)

## Global Constraints
- Chrome Extension Manifest V3 tuân thủ đầy đủ quy chuẩn bảo mật (không dùng `eval`, không dùng inline scripts trong popup).
- Thiết kế giao diện: Phong cách Material Design, màu chủ đạo Trắng (`#FFFFFF`) và Đỏ hồng nhạt (`#FFF0F2`, `#FFD0D6`, `#CC0000`).
- Hiệu ứng thị giác: Mượt mà với `backdrop-filter: blur(12px)`.
- Ràng buộc biểu tượng: **TUYỆT ĐỐI KHÔNG SỬ DỤNG EMOJI** trong toàn bộ giao diện extension, modal, toast hay popup. Sử dụng 100% SVG Material Design icons.
- Hiệu năng YouTube: Quét DOM bằng `MutationObserver` kết hợp debounce và `requestAnimationFrame`, không dùng `setInterval` hay quét toàn trang lặp lại.

---

### Task 1: Thiết Lập Backend Cloudflare Worker & D1 Database

**Files:**
- Create: `backend/package.json`
- Create: `backend/wrangler.toml`
- Create: `backend/schema.sql`
- Create: `backend/src/index.js`
- Create: `backend/test/test-server.js`

**Interfaces:**
- Consumes: HTTP requests từ Extension Content Script và Service Worker.
- Produces: 
  - `POST /api/reports`: Body `{ channel_handle, channel_name, channel_url, reason }` -> Returns `{ success: true, message, data }`
  - `GET /api/blocked`: Returns `{ success: true, count, updated_at, data: [...] }`
  - `DELETE /api/blocked/:handle`: Returns `{ success: true, message }`

- [ ] **Step 1: Tạo cấu trúc thư mục backend và file cấu hình Cloudflare Wrangler**
  Tạo `backend/package.json`, `backend/wrangler.toml`, và `backend/schema.sql`.

- [ ] **Step 2: Viết test script kiểm thử API backend**
  Tạo `backend/test/test-server.js` để kiểm tra các luồng:
  - Báo cáo kênh mới -> API trả về 201/200.
  - Lấy danh sách kênh bị chặn -> có kênh vừa báo cáo.
  - Báo cáo kênh đã tồn tại -> tăng report_count và cập nhật reason.
  - Xóa kênh khỏi danh sách chặn -> kênh không còn trong danh sách active.

- [ ] **Step 3: Triển khai mã nguồn API Handler cho Cloudflare Worker**
  Viết `backend/src/index.js` xử lý CORS, phân tuyến REST API (`/api/reports`, `/api/blocked`, `/api/blocked/:handle`) tương tác với D1 Database (`env.DB`). Hỗ trợ chế độ Mock in-memory khi chạy test độc lập.

- [ ] **Step 4: Chạy test kiểm thử Backend API**
  Chạy lệnh: `node backend/test/test-server.js`
  Kỳ vọng: Toàn bộ các test cases đều PASS (200 OK, 201 Created, dữ liệu trả về chính xác).

- [ ] **Step 5: Commit mã nguồn Task 1**
  `git add backend/`
  `git commit -m "feat(backend): implement Cloudflare Worker API with D1 database schema and tests"`

---

### Task 2: Cấu Hình Extension Manifest V3, Tạo Icon SVG & Service Worker

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/icons/icon16.png`
- Create: `extension/icons/icon48.png`
- Create: `extension/icons/icon128.png`
- Create: `extension/icons/generate-icons.js`
- Create: `extension/background/background.js`
- Create: `extension/test/test-manifest.js`

**Interfaces:**
- Consumes: Backend API `GET /api/blocked`, `POST /api/reports`.
- Produces:
  - `chrome.storage.local` key `tc_blocked_channels`: Map đối tượng các kênh `{ [handle]: { name, reason, url, reported_at } }`.
  - Message Action `GET_BLOCKED_CHANNELS`: Trả về danh sách kênh bị chặn cho Content Script.
  - Message Action `SUBMIT_REPORT`: Gửi report lên Backend và cập nhật local storage, phát tín hiệu cho các tab YouTube.
  - Message Action `FORCE_SYNC`: Đồng bộ danh sách mới nhất từ server.

- [ ] **Step 1: Tạo script sinh icon thương hiệu Material Design (Không emoji)**
  Tạo `extension/icons/generate-icons.js` sử dụng Node.js canvas/PNG buffer hoặc SVG rasterizer để tạo ra bộ icon 16x16, 48x48, 128x128 với biểu tượng khiên chặn bảo vệ màu đỏ hồng YouTube trên nền trắng bo tròn.

- [ ] **Step 2: Tạo `extension/manifest.json` (Manifest V3)**
  Khai báo `manifest_version: 3`, quyền `storage`, `alarms`, host permissions `*://*.youtube.com/*`, `http://localhost:8787/*`, `http://127.0.0.1:8787/*`, `https://*.workers.dev/*`, Service Worker `background/background.js`, Content Script tại YouTube, và Action `popup/popup.html`.

- [ ] **Step 3: Triển khai Service Worker `extension/background/background.js`**
  - Khởi tạo `chrome.alarms` chạy mỗi 10 phút.
  - Hàm `syncBlockedChannels()` gọi API backend lấy danh sách kênh bị chặn và lưu vào `chrome.storage.local`.
  - Lắng nghe sự kiện `chrome.runtime.onMessage`:
    - `GET_BLOCKED_CHANNELS`: Trả về object map các kênh bị chặn từ cache.
    - `SUBMIT_REPORT`: Gửi dữ liệu tới backend API, cập nhật cache, và gửi thông báo `CHANNEL_BLOCKED_EVENT` đến các tab YouTube.
    - `FORCE_SYNC`: Gọi `syncBlockedChannels()` ngay lập tức và trả về trạng thái.

- [ ] **Step 4: Chạy test kiểm thử Manifest và Service Worker logic**
  Tạo và chạy `extension/test/test-manifest.js` để xác thực cú pháp JSON, đường dẫn file khai báo, và logic định tuyến tin nhắn.

- [ ] **Step 5: Commit mã nguồn Task 2**
  `git add extension/`
  `git commit -m "feat(extension): add Manifest V3 configuration, icons, and background service worker"`

---

### Task 3: Bộ Quét & Ẩn Video Trên YouTube (`content.js` Core Filtering)

**Files:**
- Create: `extension/content/content.css`
- Create: `extension/content/content.js`
- Create: `extension/test/test-dom-filter.js`

**Interfaces:**
- Consumes: Danh sách kênh bị chặn từ Service Worker (`tc_blocked_channels`).
- Produces:
  - Ẩn triệt để các phần tử video trên trang chủ, tìm kiếm, cột gợi ý, video shorts của các kênh nằm trong danh sách chặn.
  - CSS rule `.tc-channel-blocked { display: none !important; }`.
  - Theo dõi biến đếm `sessionBlockedCount` và lưu vào storage để hiển thị trên popup.

- [ ] **Step 1: Viết test mô phỏng lọc DOM YouTube**
  Tạo `extension/test/test-dom-filter.js` sử dụng mock DOM với các thẻ `<ytd-rich-item-renderer>`, `<ytd-video-renderer>`, `<ytd-compact-video-renderer>` để xác minh hàm nhận diện kênh từ `href` (dạng `/@channelHandle` hoặc `/channel/UC...`) và gán class ẩn.

- [ ] **Step 2: Triển khai CSS ẩn video và hiệu ứng chuyển cảnh mượt mà**
  Viết `extension/content/content.css` định nghĩa các class ẩn `.tc-channel-blocked`, hiệu ứng fade-out nhẹ nhàng trước khi ẩn để giao diện YouTube không bị giật khung hình.

- [ ] **Step 3: Triển khai module trích xuất kênh và MutationObserver trong `content.js`**
  - Hàm `extractChannelInfo(videoElement)` trích xuất `handle` và `name`.
  - Hàm `filterYouTubeDOM()` quét và ẩn các video của kênh bị chặn.
  - Thiết lập `MutationObserver` có debounce 40ms kết hợp `requestAnimationFrame` để xử lý mượt mà khi cuộn vô tận (infinite scroll).
  - Lắng nghe sự kiện `yt-navigate-finish` của YouTube để kích hoạt quét lại khi chuyển trang SPA.

- [ ] **Step 4: Chạy test mô phỏng bộ lọc DOM**
  Chạy lệnh: `node extension/test/test-dom-filter.js`
  Kỳ vọng: PASS toàn bộ các trường hợp nhận diện `@handle`, ẩn đúng phần tử cha, bỏ qua các video hợp lệ.

- [ ] **Step 5: Commit mã nguồn Task 3**
  `git add extension/content/ extension/test/`
  `git commit -m "feat(content): implement debounced DOM scanner and video hiding engine"`

---

### Task 4: Inject Nút Báo Cáo Trên YouTube & Shadow DOM Material Modal

**Files:**
- Modify: `extension/content/content.js`
- Modify: `extension/content/content.css`

**Interfaces:**
- Consumes: Sự kiện người dùng bấm nút báo cáo trên thẻ video, trang `/watch`, hoặc trang `/@handle`.
- Produces:
  - Nút SVG cờ báo cáo tại 3 vị trí trên YouTube.
  - Shadow DOM Modal: Hộp thoại báo cáo Material Design (Trắng & Đỏ hồng nhạt, hiệu ứng blur, chip gợi ý, ô nhập lý do, không emoji).
  - Toast thông báo thành công sau khi gửi.

- [ ] **Step 1: Xây dựng các hàm Inject nút Báo Cáo tại 3 vị trí trên YouTube**
  - **Vị trí 1 (Thẻ video)**: Chèn nút icon cờ SVG tinh tế bên cạnh menu action hoặc thumbnail.
  - **Vị trí 2 (Trang `/watch`)**: Chèn nút "Báo cáo Kênh" viền đỏ hồng Material cạnh nút Đăng ký (Subscribe) trong khối `#owner`.
  - **Vị trí 3 (Trang chủ kênh)**: Chèn nút "Báo cáo Kênh" cạnh nút Đăng ký ở header của kênh.

- [ ] **Step 2: Xây dựng Shadow DOM Modal cho form Báo Cáo**
  - Tạo container `#tc-block-modal-root` và gọi `attachShadow({ mode: 'open' })`.
  - Nhúng styles Material Design bên trong Shadow DOM: Nền trắng `#ffffff`, lớp phủ mờ `backdrop-filter: blur(10px); background: rgba(0, 0, 0, 0.45)`, góc bo 16px, đổ bóng mềm `0 12px 40px rgba(204, 0, 0, 0.12)`.
  - Hiển thị thông tin kênh được báo cáo (Tên kênh, `@handle`) trong thẻ màu đỏ hồng nhạt `#FFF0F2`.
  - Các Chip lựa chọn lý do nhanh dạng Material Design (không có emoji):
    - *Nội dung giật gân, câu view*
    - *Thông tin sai sự thật, lừa đảo*
    - *Nội dung độc hại, phản cảm*
    - *Spam, vi phạm bản quyền*
  - Textarea nhập lý do chi tiết với giới hạn ký tự.
  - Nút Hủy và Nút Gửi Báo Cáo (kèm spinner SVG loading khi đang gửi).

- [ ] **Step 3: Xây dựng Toast thông báo thành công và kích hoạt ẩn video tức thì**
  - Khi gửi report thành công:
    - Đóng modal mượt mà.
    - Hiển thị Toast thông báo dạng Material Design có icon SVG Checkmark và hiệu ứng trượt từ dưới lên.
    - Lập tức ẩn toàn bộ các video của kênh vừa report đang xuất hiện trên trang.

- [ ] **Step 4: Kiểm thử tích hợp hàm inject và modal trong môi trường DOM giả lập**
  Chạy script kiểm tra để xác nhận Modal HTML được tạo hợp lệ trong Shadow DOM, không chứa bất kỳ emoji nào, và các sự kiện click hoạt động trơn tru.

- [ ] **Step 5: Commit mã nguồn Task 4**
  `git add extension/content/`
  `git commit -m "feat(content): inject report buttons and Material Design Shadow DOM modal"`

---

### Task 5: Xây Dựng Giao Diện Extension Popup (Material Design, Trắng & Đỏ Hồng, Không Emoji)

**Files:**
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.css`
- Create: `extension/popup/popup.js`

**Interfaces:**
- Consumes: `chrome.storage.local` (danh sách kênh bị chặn, thống kê video đã ẩn, cấu hình API URL).
- Produces: Giao diện quản lý hoàn chỉnh cho người dùng khi bấm vào icon extension.

- [ ] **Step 1: Viết cấu trúc HTML Popup `extension/popup/popup.html`**
  - Header: Logo SVG khiên đỏ hồng + Tiêu đề "TC-Block" + Badge trạng thái kết nối (vòng tròn pulsate) + Nút Đồng bộ (SVG Refresh).
  - Summary Cards (Material Cards):
    - Thẻ 1: Số lượng kênh bị chặn (kèm icon SVG Shield).
    - Thẻ 2: Số video đã ẩn trong phiên (kèm icon SVG Eye-Off).
  - Search Input: Thanh tìm kiếm bo tròn 24px với icon SVG Search.
  - Danh sách kênh bị chặn (Scrollable list):
    - Avatar vòng tròn với chữ cái đầu của kênh (nền `#FFF0F2`, chữ `#CC0000`).
    - Tên kênh, `@handle`, nhãn lý do báo cáo.
    - Nút hành động "Gỡ chặn" (SVG Trash / X).
  - Empty state: Hiển thị icon SVG trống tinh tế khi chưa có kênh nào bị chặn hoặc không tìm thấy kết quả.
  - Cài đặt Server URL (Collapsible Footer): Cho phép đổi API endpoint giữa localhost và production.

- [ ] **Step 2: Viết CSS Material Design `extension/popup/popup.css`**
  - Tông màu: Nền trắng `#ffffff`, màu điểm nhấn đỏ hồng nhạt `#FFF0F2`, viền `#F0E0E2`, màu nút chính `#CC0000`.
  - Hiệu ứng: `backdrop-filter: blur(8px)`, transition mượt mà trên hover/focus/active.
  - Typography: Chuẩn hệ thống Roboto / Inter / System-UI sắc nét, phân cấp rõ ràng.
  - Tuân thủ nghiêm ngặt: **Không có bất kỳ ký tự emoji nào**.

- [ ] **Step 3: Viết logic xử lý `extension/popup/popup.js`**
  - Đọc danh sách kênh bị chặn từ `chrome.storage.local` và render danh sách.
  - Xử lý tìm kiếm tức thì theo tên hoặc handle khi người dùng gõ phím.
  - Xử lý nút "Đồng bộ ngay": gửi message `FORCE_SYNC` tới Service Worker, hiển thị hiệu ứng xoay icon SVG.
  - Xử lý nút "Gỡ chặn": gọi API DELETE lên Backend, cập nhật local storage và re-render danh sách.
  - Xử lý lưu cấu hình API URL tùy chỉnh.

- [ ] **Step 4: Kiểm thử giao diện Popup và logic tìm kiếm/gỡ chặn**
  Tạo file test xác thực render HTML và kiểm tra chuỗi giao diện để đảm bảo 0% emoji.

- [ ] **Step 5: Commit mã nguồn Task 5**
  `git add extension/popup/`
  `git commit -m "feat(popup): build Material Design popup with channel management and sync controls"`

---

### Task 6: Kiểm Thử Toàn Diện (End-to-End Verification) & Hướng Dẫn Sử Dụng

**Files:**
- Create: `scripts/verify-all.js`
- Create: `README.md`

**Interfaces:**
- Kiểm tra toàn bộ chuỗi tương tác từ Backend API đến Extension và DOM YouTube.

- [ ] **Step 1: Viết kịch bản kiểm thử toàn diện `scripts/verify-all.js`**
  - Khởi động Mock Backend API.
  - Giả lập Service Worker đồng bộ dữ liệu kênh.
  - Giả lập Content Script quét DOM YouTube và ẩn video.
  - Giả lập gửi Report từ Modal -> Backend nhận và cập nhật DB -> Các client khác đồng bộ về.
  - Kiểm tra toàn bộ mã nguồn để đảm bảo không vi phạm quy tắc "Không sử dụng emoji".

- [ ] **Step 2: Chạy script kiểm thử toàn diện**
  Chạy lệnh: `node scripts/verify-all.js`
  Kỳ vọng: Tất cả các bài kiểm tra đều đạt trạng thái thành công 100%.

- [ ] **Step 3: Viết tài liệu hướng dẫn cài đặt và sử dụng `README.md`**
  - Hướng dẫn chạy Backend cục bộ với `wrangler dev` hoặc Node.js.
  - Hướng dẫn cài đặt Extension vào Google Chrome / Cốc Cốc / Edge (Load Unpacked).
  - Hướng dẫn deploy backend lên Cloudflare Workers miễn phí với 1 click.
  - Hướng dẫn sử dụng các tính năng trên YouTube.

- [ ] **Step 4: Commit và hoàn tất**
  `git add scripts/ README.md`
  `git commit -m "docs: add E2E verification test suite and comprehensive setup guide"`
