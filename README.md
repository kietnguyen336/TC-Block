<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="TC-Block logo">
</p>

<h1 align="center">TC-Block</h1>

<p align="center">
  Ẩn toàn bộ nội dung từ các kênh YouTube rác và cùng cộng đồng xây dựng một bộ lọc sạch hơn.
</p>

## TC-Block làm được gì?

- Thêm nút **Chặn kênh** ngay trên YouTube.
- Ẩn video, Shorts và nội dung đề xuất của kênh đã chặn.
- Dừng video và che trang khi bạn mở trực tiếp một kênh đã chặn.
- Chặn riêng có hiệu lực ngay trên trình duyệt của bạn.
- Nhận danh sách kênh đã được quản trị viên duyệt từ cộng đồng.
- Không yêu cầu tài khoản, email hoặc mật khẩu.

TC-Block không tự quyết định một kênh là rác chỉ vì có nhiều báo cáo. Mọi kênh trong bộ lọc cộng đồng đều phải được quản trị viên xem xét và duyệt.

## Cài đặt

Hiện tại extension được cài thủ công bằng chế độ dành cho nhà phát triển của Chrome:

1. Bấm **Code → Download ZIP** trên trang GitHub này và giải nén tập tin.
2. Mở `chrome://extensions` trong Chrome.
3. Bật **Developer mode** ở góc trên bên phải.
4. Bấm **Load unpacked**.
5. Chọn thư mục `extension` nằm trong thư mục dự án vừa giải nén.
6. Ghim TC-Block lên thanh công cụ để mở nhanh.

Sau khi cài hoặc cập nhật, hãy tải lại các tab YouTube đang mở.

## Cách sử dụng

### Chặn một kênh

1. Mở trang kênh, video hoặc danh sách video trên YouTube.
2. Bấm **Chặn kênh** tại kênh bạn không muốn thấy.
3. Nhập lý do và gửi báo cáo.
4. Nội dung của kênh được ẩn ngay trên máy của bạn.

Lý do báo cáo giúp quản trị viên đánh giá yêu cầu. Việc gửi báo cáo không tự động đưa kênh vào danh sách chặn chung.

### Đồng bộ danh sách cộng đồng

TC-Block chỉ đồng bộ khi bạn yêu cầu, không tự chạy nền:

1. Mở popup TC-Block.
2. Chọn **View blocked channels**.
3. Bấm **Sync now**.

Danh sách mới chỉ chứa những kênh đã được quản trị viên duyệt. Báo cáo chưa gửi do mất mạng cũng được thử lại trong lần đồng bộ này.

### Cho phép một kênh xuất hiện lại

Mở **View blocked channels** rồi bấm nút xóa bên cạnh kênh. TC-Block sẽ tạo ngoại lệ cá nhân để kênh tiếp tục hiển thị trên máy của bạn, kể cả khi kênh vẫn nằm trong danh sách cộng đồng. Bạn có thể xóa ngoại lệ bất cứ lúc nào.

## Quyền riêng tư

TC-Block không yêu cầu đăng nhập và không gửi lịch sử xem YouTube lên backend.

Khi bạn gửi báo cáo đầu tiên, extension tạo một token ẩn danh cho lần cài đặt hiện tại. Token giúp backend chỉ tính một phiếu cho mỗi nguồn và kênh, giới hạn spam, đồng thời cho phép quản trị viên vô hiệu hóa nguồn lạm dụng. Token thật chỉ nằm trong bộ nhớ cục bộ của Chrome; D1 chỉ lưu bản hash SHA-256.

Backend không lưu tên, email hay tài khoản Google của người dùng. IP được hash làm khóa rate limit tại Cloudflare và không được lưu trong D1. Nếu xóa dữ liệu extension hoặc cài lại, trình duyệt sẽ nhận một danh tính ẩn danh mới khi gửi báo cáo tiếp theo.

## Danh sách cộng đồng hoạt động thế nào?

- Mỗi danh tính ẩn danh chỉ có một phiếu cho mỗi kênh.
- Năm nguồn hợp lệ trong 30 ngày đưa kênh vào hàng ưu tiên kiểm duyệt.
- Đạt ngưỡng không đồng nghĩa với tự động chặn.
- Chỉ kênh có trạng thái **đã duyệt** mới được phát hành cho cộng đồng.
- Báo cáo một kênh vẫn chặn kênh đó ngay cho riêng người gửi.
- Quản trị viên có thể từ chối, gỡ quyết định hoặc vô hiệu hóa nguồn báo cáo rác.

## Câu hỏi thường gặp

**Vì sao đã báo cáo nhưng máy khác vẫn thấy kênh?**

Báo cáo chỉ chặn ngay trên máy gửi. Máy khác chỉ nhận kênh sau khi quản trị viên duyệt và người dùng bấm **Sync now**.

**Vì sao số nguồn báo cáo không phải số người thật?**

Một nguồn đại diện cho một danh tính ẩn danh của extension. Xóa dữ liệu hoặc cài lại extension có thể tạo nguồn mới, vì vậy số phiếu chỉ dùng để sắp xếp ưu tiên kiểm duyệt.

**TC-Block có tự kết nối backend khi mở Chrome không?**

Không. Cài đặt, reload extension, khởi động Chrome và mở trang quản lý đều chỉ đọc dữ liệu cục bộ. Danh sách cộng đồng chỉ được tải khi bấm **Sync now**; báo cáo mới được gửi ngay khi người dùng chủ động gửi.

**Tại sao vẫn nhìn thấy một video của kênh đã chặn?**

Hãy tải lại tab YouTube và kiểm tra kênh có nằm trong mục ngoại lệ hay không. YouTube thường xuyên thay đổi giao diện nên một số vị trí mới có thể cần cập nhật bộ chọn.

## Góp ý và báo lỗi

Hãy mở một [GitHub Issue](https://github.com/kietnguyen336/TC-Block/issues) và ghi rõ:

- Trang YouTube nơi lỗi xuất hiện.
- Các bước để tái hiện.
- Phiên bản Chrome và TC-Block.
- Ảnh chụp màn hình nếu có.

Không đăng token, khóa quản trị hoặc dữ liệu bí mật vào issue công khai.

<details>
<summary><strong>Dành cho nhà phát triển và người triển khai</strong></summary>

### Kiến trúc

- Chrome Extension Manifest V3 bằng HTML, CSS và JavaScript thuần.
- Cloudflare Worker cung cấp API công khai và trang kiểm duyệt.
- Cloudflare D1 lưu báo cáo, quyết định và danh tính ẩn danh.
- Cloudflare Access bảo vệ trang quản trị production.

Extension production được ghim vào `https://tc-block-api.kietnguyen336.workers.dev`. Người dùng không thể đổi endpoint trong giao diện và `host_permissions` chỉ cấp quyền cho YouTube cùng API này.

### Chạy backend local

Yêu cầu Node.js 24 và npm. Trong thư mục `backend`:

```powershell
npm ci
npm run setup:local
npx wrangler d1 execute tc-block-db --local --file=./schema.sql
npm run dev
```

Mở `http://localhost:8787/admin` và dùng `ADMIN_TOKEN` trong `.dev.vars`. Bản extension production không gọi backend local; nếu cần kiểm thử Chrome với local Worker, hãy tạo bản dev riêng và không commit endpoint/quyền localhost.

### Triển khai Cloudflare

1. Tạo D1 và điền `database_id` trong `backend/wrangler.toml`.
2. Cấu hình `API_ORIGIN`, `ADMIN_ORIGIN`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` và `EXTENSION_IDS`.
3. Lưu email quản trị bằng `npx wrangler secret put ADMIN_EMAILS`.
4. Tạo Cloudflare Access application cho hostname quản trị và chỉ cho phép quản trị viên.
5. Chạy:

```powershell
npx wrangler d1 execute tc-block-db --remote --file=./schema.sql
npm run check
npm run deploy
```

Khi Chrome Web Store cấp ID chính thức, thêm ID đó vào `EXTENSION_IDS` rồi deploy lại Worker. Xem đầy đủ yêu cầu hardening và rate limit trong [SECURITY.md](SECURITY.md).

### Dữ liệu và vòng đời

- `reporters`: danh tính ẩn danh, hash token và trạng thái hoạt động.
- `reporter_credentials`: hạn sử dụng credential.
- `community_reports`: một phiếu cho mỗi cặp nguồn/kênh.
- `moderation_channels`: trạng thái chờ duyệt, đã duyệt hoặc từ chối.
- `moderation_events` và `security_audit`: lịch sử thao tác quản trị.
- `public_state`: phiên bản danh sách cộng đồng.

Retention chạy hàng tuần: báo cáo quá 90 ngày và audit/sự kiện quá 180 ngày được xóa; credential hết hạn cùng danh tính không còn dữ liệu liên quan cũng được dọn. Kênh đã duyệt được giữ để tiếp tục phát hành. Trang admin có thao tác reset dữ liệu động với cụm xác nhận `XOA TOAN BO`.

### Tạo lại bộ icon

File vector gốc nằm tại `extension/icons/icon-source.svg`. Bộ PNG dùng bởi Chrome được tạo không cần dependency ngoài:

```powershell
node extension/icons/generate-icons.js
```

### Kiểm thử

Từ thư mục gốc:

```powershell
node scripts/verify-all.js
npm run check --prefix backend
npm audit --prefix backend --audit-level=high
```

Bộ test kiểm tra phân quyền, JWT/Access, rate limit, giới hạn body, đăng ký và thu hồi nguồn ẩn danh, phân trang đồng bộ, queue báo cáo, bộ lọc DOM, luồng kiểm duyệt và cấu hình Manifest V3. Đây là test bằng fixture/local runtime, không thay thế kiểm thử thủ công trên giao diện YouTube thật.

### Giới hạn hiện tại

- Bộ chọn DOM phụ thuộc giao diện YouTube và có thể cần cập nhật khi YouTube thay đổi.
- URL dạng handle và channel ID chưa được hợp nhất hoàn toàn thành một định danh duy nhất.
- URL cũ `/c/` và `/user/` chỉ được nhận diện theo tên, chưa có bước phân giải chính thức.

</details>
