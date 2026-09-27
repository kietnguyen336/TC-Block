# TC-Block

Extension Chrome Manifest V3 lọc kênh YouTube bằng lựa chọn cá nhân và danh sách cộng đồng do quản trị viên duyệt. Backend chạy trên Cloudflare Workers + D1; giao diện dùng HTML/CSS/JavaScript thuần.

## Quy tắc bản đầu

- Báo cáo một kênh sẽ chặn ngay cho riêng người gửi.
- Chỉ báo cáo có mã người tham gia hợp lệ mới được ghi nhận trên server. Mỗi người chỉ tính **một phiếu cho mỗi kênh**, kể cả gửi lại.
- **5 người hợp lệ trong 30 ngày gần nhất** đưa kênh lên mức ưu tiên duyệt, **không tự động chặn cộng đồng**. Quản trị viên có thể duyệt cả kênh dưới ngưỡng khi đã kiểm tra bằng chứng.
- Chỉ kênh ở trạng thái `approved` được phát hành qua danh sách cộng đồng.
- Từ chối hoặc gỡ chặn chung không xóa lựa chọn chặn riêng của người dùng. Báo cáo tiếp theo không tự mở lại quyết định đã từ chối.
- “Vẫn hiện kênh này” tạo ngoại lệ cá nhân, không gọi API gỡ chặn cộng đồng. “Bỏ ngoại lệ” áp dụng lại danh sách cộng đồng nếu kênh vẫn nằm trong đó.
- Báo cáo lặp không làm mới thời điểm phiếu. Phiếu quá 30 ngày vẫn được lưu để xem xét nhưng không tính ưu tiên.

## Người báo cáo và chống lạm dụng

Bản đầu dành cho nhóm người tham gia được quản trị viên xác minh và cấp mã. Một mã đại diện một người; quản trị viên phải tránh cấp nhiều mã cho cùng một người. Đây chưa phải hệ thống xác minh danh tính tự động và không thể ngăn việc chia sẻ mã hoặc thông đồng.

Trang `/admin` có chức năng cấp/đổi/thu hồi mã, xem lý do của từng báo cáo, duyệt/từ chối kênh và nhập lý do quyết định. Mã ngẫu nhiên 256 bit có hạn 90 ngày, database chỉ lưu SHA-256. Đổi mã giữ nguyên người tham gia và phiếu cũ. IP do Cloudflare cung cấp được hash để giới hạn lưu lượng, không lưu IP vào database. Mã bị thu hồi không gửi được báo cáo; phiếu của người bị thu hồi không tính ưu tiên. Hết hạn mã không xóa phiếu đã gửi hợp lệ trước đó.

Mỗi mã được báo cáo tối đa 20 kênh mới trong 24 giờ. Người chưa có mã vẫn chặn riêng; báo cáo được giữ trên máy để gửi khi thêm mã.

## Chạy local

Cần Node.js 24 và npm. Đọc [SECURITY.md](SECURITY.md) trước khi public backend.

Trong thư mục `backend`:

```powershell
npm ci
npm run setup:local
```

Lệnh setup tạo `.dev.vars` với khóa local ngẫu nhiên và không ghi đè file đã có. Khóa này chỉ có hiệu lực trên loopback HTTP, không dùng cho production. Sau đó khởi tạo schema và chạy Worker:

```powershell
npx wrangler d1 execute tc-block-db --local --file=./schema.sql
npm run dev
```

1. Mở `http://localhost:8787/admin`, nhập `ADMIN_TOKEN` để vào trang quản trị.
2. Cấp mã cho từng người tham gia đã xác minh.
3. Mở `chrome://extensions`, bật Developer mode, chọn **Load unpacked** và chọn thư mục `extension` của dự án.
4. Trong popup, mở cài đặt, nhập URL `http://localhost:8787` và mã báo cáo cá nhân, bấm **Lưu**. Không nhập khóa quản trị vào extension.
5. Mở YouTube, báo cáo kênh. Trên trang quản trị, xem lý do và duyệt; các máy khác nhận danh sách ở lần đồng bộ tiếp theo hoặc khi bấm đồng bộ.

## Triển khai Cloudflare

Trong thư mục `backend`:

```powershell
npx wrangler login
npx wrangler d1 create tc-block-db
```

Cập nhật `database_id` thật và các biến không bí mật trong `wrangler.toml` theo [hướng dẫn bảo mật](SECURITY.md#cấu-hình-production): `API_ORIGIN`, `ADMIN_ORIGIN`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `EXTENSION_IDS`. Giữ `LOCAL_DEV = "false"`. Lưu email quản trị bằng Worker Secret, không commit vào repo:

```powershell
npx wrangler secret put ADMIN_EMAILS
```

Tạo ứng dụng Cloudflare Access bảo vệ hostname quản trị, giới hạn đúng quản trị viên và yêu cầu MFA ở nhà cung cấp danh tính. Sau đó:

```powershell
npx wrangler d1 execute tc-block-db --remote --file=./schema.sql
npm run check
npm run deploy
```

Mở `ADMIN_ORIGIN/admin` để đăng nhập Cloudflare Access, cấu hình `API_ORIGIN` trong extension. Khóa `ADMIN_TOKEN` cũ không cấp quyền quản trị public. Thiếu Access hoặc binding bảo vệ sẽ bị từ chối, không tự giảm mức bảo mật. Hiện extension hỗ trợ API HTTPS `*.workers.dev` và HTTP `localhost:8787` / `127.0.0.1:8787`; API dùng domain riêng cần cập nhật manifest và kiểm tra URL trong background. Domain quản trị riêng không cần thêm vào extension.

## Dữ liệu và đồng bộ

- `reporters`: người tham gia, hash mã và trạng thái hoạt động.
- `reporter_credentials`: ngày hết hạn mã báo cáo.
- `community_reports`: một phiếu cho mỗi cặp người/kênh, lý do và thời điểm gửi.
- `moderation_channels`: kênh chờ duyệt / đã duyệt / từ chối.
- `moderation_events`: lịch sử quyết định và lý do của quản trị viên.
- `security_audit`: ai cấp/đổi/thu hồi mã hoặc thay đổi quyết định (Access subject, không ghi token).
- `public_state`: phiên bản danh sách chặn để đồng bộ nhiều trang nhất quán.
- `chrome.storage.local.tc_state_v2`: chặn riêng, ngoại lệ, cache cộng đồng, báo cáo chưa gửi và cấu hình; tách theo URL API.

Danh sách cộng đồng đồng bộ mỗi 10 phút, lúc khởi động hoặc khi bấm đồng bộ; public cache có thể trễ tối đa 60 giây. API trả 500 kênh/trang và extension chỉ thay cache khi tải đủ các trang cùng phiên bản (tối đa 100 trang). Chặn riêng và ngoại lệ được giữ qua các lần đồng bộ. Mất mạng hoặc mã không hợp lệ sẽ giữ báo cáo để thử lại; popup hiển thị lỗi. Extension tuân thủ `Retry-After`, gửi tối đa 5 báo cáo chờ mỗi lần đồng bộ và giới hạn kích thước phản hồi. Khi đổi máy chủ, mã và báo cáo của máy chủ cũ không chuyển sang máy chủ mới.

## Nâng cấp từ bản cũ

Chạy lại `schema.sql` cho D1 đang dùng trước khi nâng cấp Worker; lệnh có thể chạy lặp lại. Các bảng mới tách khỏi `blocked_channels` / `reports` cũ và không xóa dữ liệu cũ. Dữ liệu cũ chưa có danh tính người báo cáo hoặc quyết định duyệt nên **không tự đưa vào danh sách cộng đồng mới**; có thể xem lại thủ công khi cần.

Nếu đã dùng bản có duyệt nhưng chưa có bảo mật mới: **đổi mã cho từng người tham gia hiện có** trên `/admin`. Mã không có ngày hết hạn bị từ chối; đổi mã giữ nguyên danh tính và phiếu. Không cấp thêm một người mới để thay mã cũ. Backend và extension cần nâng cấp cùng nhau vì API danh sách đã có phân trang.

Cache cũ `tc_blocked_channels` được giữ nguyên để khôi phục thủ công, nhưng không dùng làm danh sách mới vì không phân biệt được lựa chọn cá nhân và chặn chung. Cần báo cáo lại các kênh muốn chặn riêng. Reload extension và tải lại các tab YouTube sau khi nâng cấp để content script mới có hiệu lực.

## Kiểm thử

Từ thư mục gốc:

```powershell
node scripts/verify-all.js
npm run check --prefix backend
npm audit --prefix backend --audit-level=high
```

Bộ kiểm thử gồm 9 suite: SQL sản phẩm trên SQLite, API, background/content script với fixture Chrome/DOM, luồng cộng đồng và các trường hợp tấn công. Có kiểm tra JWT ký RSA thật với JWKS giả lập, JWT giả/sai audience/hết hạn, CSRF, rate limit trước database, body quá dài/chậm, mã hết hạn/đổi/thu hồi, giới hạn báo cáo đồng thời, phân trang/cache và lỗi mạng. CI chạy test, dependency audit và build dry-run với các GitHub Action ghim theo commit.

Đã smoke-test riêng trên runtime workerd và D1 local qua Wrangler; CI vẫn dùng SQLite adapter. Chưa phải E2E trên Chrome/YouTube thật, Access policy hoặc D1 production. Cần kiểm tra thủ công các trang chủ, tìm kiếm, trang xem video và trang kênh sau khi cài extension. Bộ chọn DOM phụ thuộc giao diện YouTube. URL handle và URL channel ID chưa được hợp nhất thành một danh tính kênh duy nhất; báo cáo qua hai dạng có thể tách phiếu. Các URL cũ `/c/` và `/user/` chỉ được xử lý theo tên, chưa có bước phân giải chính thức.

Các bản thiết kế cũ trong `docs/superpowers` là lịch sử; quy tắc hiện hành nằm trong README này và mã nguồn.
