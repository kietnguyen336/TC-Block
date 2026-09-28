<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="Logo TC-Block">
</p>

<h1 align="center">TC-Block</h1>

<p align="center">
  Ẩn các kênh YouTube có nội dung rác và cùng cộng đồng xây dựng một bộ lọc sạch hơn.
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>Tiếng Việt</strong>
</p>

## TC-Block làm được gì?

- Thêm nút chặn kênh trực tiếp trên YouTube.
- Ẩn video, Shorts và nội dung đề xuất từ các kênh đã chặn.
- Dừng phát video và che trang khi bạn mở trực tiếp một kênh đã chặn hoặc video của kênh đó.
- Áp dụng danh sách chặn cá nhân ngay lập tức.
- Cho phép tải danh sách chặn cộng đồng đã được quản trị viên kiểm duyệt.
- Không yêu cầu tạo tài khoản.

Báo cáo cộng đồng không tự động chặn kênh đối với tất cả người dùng. Chỉ những kênh đã được xem xét và phê duyệt mới xuất hiện trong bộ lọc chung.

## Cài đặt TC-Block

Hiện tại TC-Block được cài thủ công bằng chế độ dành cho nhà phát triển của Chrome:

1. Chọn **Code → Download ZIP** trên trang GitHub này.
2. Giải nén tập tin ZIP vừa tải xuống.
3. Mở `chrome://extensions` trong Chrome.
4. Bật **Developer mode** ở góc trên bên phải.
5. Chọn **Load unpacked**.
6. Chọn thư mục `extension` nằm trong thư mục dự án đã giải nén.
7. Ghim TC-Block lên thanh công cụ Chrome để mở nhanh.

Sau khi cài đặt hoặc cập nhật extension, hãy tải lại các tab YouTube đang mở.

## Chặn một kênh

1. Mở một trang kênh, video hoặc danh sách video trên YouTube.
2. Chọn nút chặn kênh của TC-Block.
3. Nhập lý do ngắn gọn cho báo cáo.
4. Gửi báo cáo.

Kênh sẽ bị ẩn ngay trên trình duyệt của bạn. Báo cáo cũng được gửi để cộng đồng kiểm duyệt, nhưng sẽ không ảnh hưởng đến người dùng khác cho đến khi quản trị viên phê duyệt kênh.

## Đồng bộ bộ lọc cộng đồng

TC-Block chỉ đồng bộ khi bạn yêu cầu. Extension không tự tải danh sách cộng đồng trong nền.

1. Mở popup TC-Block.
2. Chọn **View blocked channels**.
3. Chọn **Sync now**.

Extension sẽ tải danh sách cộng đồng mới nhất đã được phê duyệt. Những báo cáo chưa gửi được do lỗi kết nối trước đó cũng sẽ được thử gửi lại.

## Xem danh sách kênh đã chặn

Mở popup TC-Block và chọn **View blocked channels** để:

- Xem số lượng kênh đang bị lọc.
- Tìm kiếm theo tên kênh, handle hoặc lý do.
- Cho phép một kênh đã chặn xuất hiện trở lại.
- Xem và xóa các ngoại lệ cá nhân.
- Đồng bộ thủ công bộ lọc cộng đồng.

## Cho phép một kênh xuất hiện trở lại

Mở **View blocked channels** và chọn nút xóa bên cạnh kênh. TC-Block sẽ tạo một ngoại lệ cá nhân để kênh đó tiếp tục hiển thị trên trình duyệt của bạn, kể cả khi kênh vẫn nằm trong bộ lọc cộng đồng.

Để chặn lại kênh, hãy mở phần **Exceptions** và xóa ngoại lệ.

## Cách kiểm duyệt cộng đồng hoạt động

- Một báo cáo sẽ ẩn kênh ngay lập tức đối với người gửi báo cáo.
- Nhiều báo cáo giúp quản trị viên xác định các kênh cần được xem xét trước.
- Đạt ngưỡng báo cáo không tự động chặn kênh đối với tất cả người dùng.
- Chỉ các kênh được quản trị viên phê duyệt mới xuất hiện trong bộ lọc cộng đồng.
- Người dùng nhận các thay đổi đã phê duyệt trong lần bấm **Sync now** tiếp theo.

## Câu hỏi thường gặp

### Vì sao máy khác vẫn nhìn thấy kênh tôi đã báo cáo?

Danh sách chặn cá nhân chỉ áp dụng cho trình duyệt đã gửi báo cáo. Người dùng khác chỉ nhận được kênh sau khi kênh đã được xem xét, phê duyệt và có trong lần đồng bộ thủ công tiếp theo.

### TC-Block có tự đồng bộ khi Chrome khởi động không?

Không. Cài đặt hoặc reload extension, khởi động Chrome, mở popup và mở trang danh sách chặn đều không tải bộ lọc cộng đồng. Hãy chọn **Sync now** khi bạn muốn nhận danh sách mới nhất.

### Vì sao một kênh đã chặn vẫn xuất hiện?

Hãy tải lại tab YouTube và kiểm tra xem kênh có nằm trong phần **Exceptions** hay không. YouTube thường xuyên thay đổi giao diện, vì vậy các vị trí mới có thể cần một bản cập nhật extension.

### Vì sao báo cáo vẫn đang chờ gửi?

Báo cáo chưa thể kết nối đến dịch vụ. Hãy kiểm tra kết nối mạng, mở **View blocked channels** và chọn **Sync now** để thử lại.

### Cài lại extension có giữ danh sách cá nhân không?

Gỡ extension hoặc xóa dữ liệu cục bộ có thể làm mất danh sách chặn cá nhân, ngoại lệ và báo cáo chưa gửi. Đồng bộ chỉ khôi phục danh sách cộng đồng đã được phê duyệt.

## Báo lỗi

Hãy mở một [GitHub Issue](https://github.com/kietnguyen336/TC-Block/issues) và cung cấp:

- Trang YouTube nơi lỗi xuất hiện.
- Các bước rõ ràng để tái hiện lỗi.
- Phiên bản Chrome và TC-Block đang sử dụng.
- Ảnh chụp màn hình nếu ảnh giúp giải thích lỗi.

Không đăng thông tin riêng tư hoặc nhạy cảm trong issue công khai.
