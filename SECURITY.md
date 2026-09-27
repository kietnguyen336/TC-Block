# Bảo mật TC-Block

Mã nguồn và địa chỉ API được coi là công khai. Backend không tin extension, Origin, User-Agent, IP hoặc số lượt do client khai báo để xác định người báo cáo/quyền quản trị. Không có khóa quản trị hay khóa dùng chung để ghi dữ liệu trong extension.

## Biện pháp đã có

| Phạm vi | Cơ chế |
| --- | --- |
| Quản trị production | JWT Cloudflare Access: chữ ký RS256, issuer cố định trong cấu hình, đúng audience, subject/email, thời hạn và tuổi token tối đa 8 giờ; email phải trong allowlist |
| Không đi vòng Access | Worker tự xác minh JWT; hostname không đúng bị chặn. Header email tự gửi và `ADMIN_TOKEN` local không cấp quyền public |
| CSRF | POST quản trị phải có Origin chính xác, header `X-TC-Admin-Action: 1` và không có Sec-Fetch-Site khác same-origin; admin không mở CORS |
| Báo cáo | Extension tự nhận token ẩn danh 256 bit, chỉ lưu SHA-256 trên server, tự gia hạn và có thể bị quản trị viên thu hồi |
| Lưu lượng | Native Workers Rate Limiting trước D1/JWT, theo IP ở cửa vào và theo danh tính sau xác thực; thêm ngân sách truy cập D1 |
| Ghi dữ liệu | Tối đa 20 kênh mới/người/24 giờ, một phiếu/người/kênh; kiểm tra quota, credential và ghi dữ liệu trong cùng D1 batch |
| Payload | Chỉ JSON UTF-8, đọc stream tối đa 16 KiB, timeout 5 giây, không tin riêng Content-Length, không nhận body nén |
| Truy vấn public | 500 kênh/trang, keyset pagination có revision, cache public 60 giây; không đếm toàn bộ lịch sử báo cáo mỗi lần tải |
| Giao diện | CSP nonce cho script/style, chống iframe, nosniff, no-referrer, HSTS trên HTTPS; nội dung người dùng hiển thị bằng textContent/escape |
| Nhật ký | Audit thao tác thu hồi nguồn và quyết định, gắn Access subject; lỗi nội bộ chỉ lộ request ID, không lộ SQL/stack/token |
| Extension | Không yêu cầu tài khoản người dùng; API và `host_permissions` ghim đúng hostname production, popup không cho đổi endpoint; giới hạn nguồn message, không đi theo redirect, kiểm tra phân trang và giữ cache cũ nếu tải lỗi |
| Dependencies | Lockfile, phiên bản chính xác, CI kiểm thử/audit/build; không commit .dev.vars, .env, private key hoặc output build |

JWT/JWKS dùng thư viện `jose`; không tự cài đặt thuật toán ký. JWKS chỉ lấy từ team domain cấu hình phía server, có timeout và cache; không lấy URL từ JWT do người gọi đưa vào.

## Lưu giữ và dọn dữ liệu

Retention tự động chạy hàng tuần: báo cáo quá 90 ngày và audit/sự kiện quá 180 ngày bị xóa; credential hết hạn, danh tính không còn dữ liệu liên quan và hồ sơ chờ/từ chối cũ không còn bằng chứng cũng được dọn. Kênh đã duyệt được giữ vì là dữ liệu cốt lõi của danh sách chặn. Endpoint reset database chỉ dành cho admin đã qua Access/local auth, yêu cầu CSRF cùng origin và cụm xác nhận chính xác; thao tác xóa dữ liệu động nhưng giữ schema, `public_state` và một bản ghi audit `database.reset`.

## Cấu hình production

Thiếu cấu hình cần thiết sẽ từ chối yêu cầu. Không deploy bản public với `LOCAL_DEV=true`; flag này chỉ được chấp nhận ở loopback HTTP và public host sẽ trả 503 nếu bật nhầm.

1. Tạo D1 và áp dụng `backend/schema.sql`. Điền `database_id` thật trong `backend/wrangler.toml`.
2. Chọn API public, ví dụ `https://tc-block-api.<subdomain>.workers.dev` và điền chính xác vào `API_ORIGIN` (không path, không dấu `/` cuối).
3. Gắn **custom domain quản trị** vào cùng Worker, ví dụ `https://admin.<your-domain>`, điền vào `ADMIN_ORIGIN`. API public vẫn dùng workers.dev; các route quản trị chỉ chấp nhận ADMIN_ORIGIN.
4. Tạo **Self-hosted application trong Cloudflare Access** cho toàn bộ hostname quản trị. Chỉ cho phép email/nhóm quản trị và bật MFA trong policy/IdP; session không quá 8 giờ. Không bảo vệ toàn bộ API public bằng màn hình đăng nhập Access vì extension cần tải danh sách không đăng nhập.
5. Điền `ACCESS_TEAM_DOMAIN` dạng `https://<team>.cloudflareaccess.com` và `ACCESS_AUD` từ ứng dụng Access. Lưu allowlist email bằng `npx wrangler secret put ADMIN_EMAILS`, nhập danh sách email cách nhau bằng dấu phẩy khi Wrangler hỏi. Không truyền secret trên command line và không commit email quản trị vào `wrangler.toml`. Backend còn kiểm tra allowlist này để tránh policy Access rộng hơn dự định. Lệnh `secret put` tạo một version/deployment mới; lần deploy đầu có thể fail-closed ở route quản trị cho đến khi secret được thêm.
6. Điền `EXTENSION_IDS` (ID từ Chrome Web Store, cách nhau dấu phẩy). Origin khác không được gửi báo cáo từ trình duyệt. Request không có Origin vẫn cần mã hợp lệ; **CORS không chặn curl/bot**.
7. Giữ đủ sáu binding rate limit, namespace ID riêng cho ứng dụng. Cấu hình hiện tại:

| Binding | Ngưỡng mỗi 60 giây | Khóa |
| --- | ---: | --- |
| INGRESS_LIMITER | 180 | Hash CF-Connecting-IP |
| AUTH_LIMITER | 40 | Hash CF-Connecting-IP, route báo cáo/quản trị |
| REGISTRATION_LIMITER | 3 | Hash CF-Connecting-IP, cấp/gia hạn danh tính ẩn danh |
| REPORTER_LIMITER | 10 | Reporter ID sau xác thực |
| ADMIN_LIMITER | 60 | Access subject |
| DB_LIMITER | 1000 | Ngân sách chung cho các nhóm thao tác DB |

8. `npm ci`, `node ../scripts/verify-all.js`, `npm run check`, rồi `npm run deploy` trong `backend`. Build dry-run không deploy. Gói Workers Free không nhận cấu hình `limits.cpu_ms`, nên dự án để Cloudflare áp dụng giới hạn mặc định của plan.
9. Kiểm tra từ một client chưa đăng nhập: `/api/admin/me` ở API hostname bị từ chối, hostname quản trị yêu cầu Access, JWT giả không vào được, `/api/blocked` vẫn hoạt động công khai. Cài extension mới và xác nhận báo cáo đầu tiên tự đăng ký qua `/api/register`, không hỏi tài khoản hoặc mã.

Đây là các bước cấu hình tài khoản Cloudflare; mã nguồn không tự tạo Access policy, MFA, custom domain hoặc WAF rule. Không bỏ kiểm tra JWT để vượt qua lỗi cấu hình.

## Giới hạn thực tế và vận hành

- Workers Rate Limiting là giới hạn xấp xỉ **theo từng Cloudflare location**, không phải quota toàn cầu chính xác. Quota 20 báo cáo/ngày được kiểm tra riêng trong D1 transaction. IP có thể dùng chung (NAT) nên ngưỡng cửa vào có thể ảnh hưởng nhiều người; cần theo dõi 429 để điều chỉnh.
- Các giới hạn chạy sau khi Worker đã được gọi. Chúng giảm tải DB/ghi dữ liệu, không bảo đảm miễn phí hoặc miễn nhiễm DDoS phân tán. Khi mở rộng, cấu hình WAF/rate limiting ở edge, cảnh báo usage/billing và theo dõi 429/5xx tại Cloudflare. Cache public có thể trễ 60 giây sau quyết định duyệt/gỡ.
- Người dùng ẩn danh vẫn có thể gửi báo cáo sai trong quota hoặc tạo danh tính mới bằng cách xóa dữ liệu/cài lại. Chỉ quản trị viên duyệt mới tác động cộng đồng; không có tuyên bố “một thiết bị = một người”.
- Chỉ hash IP cho khóa rate limit, không lưu vào bảng ứng dụng. Cloudflare có thể ghi metadata request theo cấu hình logging của tài khoản. Không gửi bí mật qua URL và không đưa token vào lý do báo cáo.
- Thu hồi nguồn báo cáo bất thường trong phần bằng chứng và kiểm tra `security_audit`. Nếu tài khoản quản trị bị lộ, thu hồi session ở Access/IdP và sửa allowlist. Nút **Đăng xuất** trên trang production chuyển tới endpoint đăng xuất Cloudflare Access.
- Sao lưu D1 trước thay đổi lớn. Chạy schema mới là thay đổi bổ sung; lịch sử cũ được giữ. Token cũ còn hoạt động được gia hạn trên cùng Reporter ID khi extension nâng cấp.
- Bộ test không thay thế pentest hoặc kiểm thử tải production. Triển khai an toàn còn phụ thuộc cấu hình Access, quyền tài khoản Cloudflare/GitHub, máy quản trị và quy trình duyệt.

## Báo cáo lỗ hổng

Không đăng token, dữ liệu riêng hoặc hướng dẫn khai thác kèm bí mật trong GitHub issue công khai. Chủ repo nên bật GitHub Private vulnerability reporting và secret scanning/push protection trước khi mời cộng đồng đóng góp. CI chỉ có quyền đọc repository, không có quyền deploy và không được cấp secret production.

## Tài liệu nền tảng

- [Cloudflare: Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare: xác minh Access JWT tại Worker](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
