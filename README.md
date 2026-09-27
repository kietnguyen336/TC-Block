# TC-Block

Extension Chrome Manifest V3 lọc kênh YouTube bằng lựa chọn cá nhân và danh sách cộng đồng do quản trị viên duyệt. Backend chạy trên Cloudflare Workers + D1; giao diện dùng HTML/CSS/JavaScript thuần.

## Quy tắc bản đầu

- Báo cáo một kênh sẽ chặn ngay cho riêng người gửi.
- Extension tự tạo danh tính ẩn danh ở lần dùng đầu; người dùng không đăng nhập và không nhập mã. Mỗi danh tính chỉ tính **một phiếu cho mỗi kênh**, kể cả gửi lại.
- **5 người hợp lệ trong 30 ngày gần nhất** đưa kênh lên mức ưu tiên duyệt, **không tự động chặn cộng đồng**. Quản trị viên có thể duyệt cả kênh dưới ngưỡng khi đã kiểm tra bằng chứng.
- Chỉ kênh ở trạng thái `approved` được phát hành qua danh sách cộng đồng.
- Từ chối hoặc gỡ chặn chung không xóa lựa chọn chặn riêng của người dùng. Báo cáo tiếp theo không tự mở lại quyết định đã từ chối.
- “Vẫn hiện kênh này” tạo ngoại lệ cá nhân, không gọi API gỡ chặn cộng đồng. “Bỏ ngoại lệ” áp dụng lại danh sách cộng đồng nếu kênh vẫn nằm trong đó.
- Báo cáo lặp không làm mới thời điểm phiếu. Phiếu quá 30 ngày vẫn được lưu để xem xét nhưng không tính ưu tiên.

## Người báo cáo và chống lạm dụng

Người dùng cài extension là có thể báo cáo ngay. Backend cấp một token ẩn danh 256 bit, extension lưu token cục bộ và tự gia hạn; database chỉ lưu SHA-256. Không có tài khoản người dùng, email người dùng hoặc bước xin mã. Danh tính này không chứng minh một người thật và có thể thay đổi khi xóa dữ liệu/cài lại extension, nên số phiếu chỉ dùng để **xếp ưu tiên cho quản trị viên**, không tự xuất bản quyết định.

Đăng ký ẩn danh bị giới hạn theo IP tại edge; mỗi danh tính gửi tối đa 10 yêu cầu/phút và 20 kênh mới trong 24 giờ. Một danh tính chỉ có một phiếu cho một kênh. IP chỉ được hash làm khóa rate limit và không lưu trong database. Quản trị viên có thể chặn nguồn báo cáo từ màn hình bằng chứng; phiếu cũ của nguồn bị chặn không còn tính ưu tiên.

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
2. Mở `chrome://extensions`, bật Developer mode, chọn **Load unpacked** và chọn thư mục `extension` của dự án.
3. Trong popup, mở cài đặt, nhập URL `http://localhost:8787` rồi bấm **Lưu**. Extension tự đăng ký danh tính ẩn danh.
4. Mở YouTube, báo cáo kênh. Trên trang quản trị, xem bằng chứng và duyệt; các máy khác nhận danh sách ở lần đồng bộ tiếp theo hoặc khi bấm đồng bộ.

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

Mở `ADMIN_ORIGIN/admin` để quản trị qua Cloudflare Access. Người dùng extension không đăng nhập; bản phát hành mặc định dùng `API_ORIGIN` production và tự đăng ký ẩn danh. Khóa `ADMIN_TOKEN` local không cấp quyền quản trị public. Thiếu Access hoặc binding bảo vệ sẽ bị từ chối, không tự giảm mức bảo mật. Hiện extension hỗ trợ API HTTPS `*.workers.dev` và HTTP `localhost:8787` / `127.0.0.1:8787`; API dùng domain riêng cần cập nhật manifest và kiểm tra URL trong background. Domain quản trị riêng không cần thêm vào extension.

## Dữ liệu và đồng bộ

- `reporters`: danh tính ẩn danh, hash token và trạng thái hoạt động.
- `reporter_credentials`: ngày hết hạn token ẩn danh.
- `community_reports`: một phiếu cho mỗi cặp người/kênh, lý do và thời điểm gửi.
- `moderation_channels`: kênh chờ duyệt / đã duyệt / từ chối.
- `moderation_events`: lịch sử quyết định và lý do của quản trị viên.
- `security_audit`: ai chặn nguồn báo cáo hoặc thay đổi quyết định (Access subject, không ghi token).
- `public_state`: phiên bản danh sách chặn để đồng bộ nhiều trang nhất quán.
- `chrome.storage.local.tc_state_v2`: chặn riêng, ngoại lệ, cache cộng đồng, báo cáo chưa gửi và cấu hình; tách theo URL API.

Danh sách cộng đồng đồng bộ mỗi 10 phút, lúc khởi động hoặc khi bấm đồng bộ; public cache có thể trễ tối đa 60 giây. API trả 500 kênh/trang và extension chỉ thay cache khi tải đủ các trang cùng phiên bản (tối đa 100 trang). Chặn riêng và ngoại lệ được giữ qua các lần đồng bộ. Mất mạng hoặc token ẩn danh hết hạn sẽ giữ báo cáo để thử lại và tự gia hạn khi có mạng; popup hiển thị lỗi. Extension tuân thủ `Retry-After`, gửi tối đa 5 báo cáo chờ mỗi lần đồng bộ và giới hạn kích thước phản hồi. Mỗi URL máy chủ có danh tính và hàng đợi riêng.

## Nâng cấp từ bản cũ

Chạy lại `schema.sql` cho D1 đang dùng trước khi nâng cấp Worker; lệnh có thể chạy lặp lại. Các bảng mới tách khỏi `blocked_channels` / `reports` cũ và không xóa dữ liệu cũ. Dữ liệu cũ chưa có danh tính người báo cáo hoặc quyết định duyệt nên **không tự đưa vào danh sách cộng đồng mới**; có thể xem lại thủ công khi cần.

Token do quản trị viên cấp ở bản cũ vẫn được extension dùng và tự gia hạn nếu còn hoạt động; người dùng mới được đăng ký ẩn danh tự động. Backend và extension nên nâng cấp cùng nhau vì bản mới thêm `/api/register` và bỏ ô nhập mã thủ công.

Cache cũ `tc_blocked_channels` được giữ nguyên để khôi phục thủ công, nhưng không dùng làm danh sách mới vì không phân biệt được lựa chọn cá nhân và chặn chung. Cần báo cáo lại các kênh muốn chặn riêng. Reload extension và tải lại các tab YouTube sau khi nâng cấp để content script mới có hiệu lực.

## Kiểm thử

Từ thư mục gốc:

```powershell
node scripts/verify-all.js
npm run check --prefix backend
npm audit --prefix backend --audit-level=high
```

Bộ kiểm thử gồm các suite SQL, API, background/content script với fixture Chrome/DOM, luồng cộng đồng và các trường hợp tấn công. Có kiểm tra JWT ký RSA thật với JWKS giả lập, JWT giả/sai audience/hết hạn, CSRF, rate limit trước database, body quá dài/chậm, đăng ký/gia hạn/thu hồi danh tính ẩn danh, giới hạn báo cáo đồng thời, phân trang/cache và lỗi mạng. CI chạy test, dependency audit và build dry-run với các GitHub Action ghim theo commit.

Đã smoke-test riêng trên runtime workerd và D1 local qua Wrangler; CI vẫn dùng SQLite adapter. Chưa phải E2E trên Chrome/YouTube thật, Access policy hoặc D1 production. Cần kiểm tra thủ công các trang chủ, tìm kiếm, trang xem video và trang kênh sau khi cài extension. Bộ chọn DOM phụ thuộc giao diện YouTube. URL handle và URL channel ID chưa được hợp nhất thành một danh tính kênh duy nhất; báo cáo qua hai dạng có thể tách phiếu. Các URL cũ `/c/` và `/user/` chỉ được xử lý theo tên, chưa có bước phân giải chính thức.

Các bản thiết kế cũ trong `docs/superpowers` là lịch sử; quy tắc hiện hành nằm trong README này và mã nguồn.
