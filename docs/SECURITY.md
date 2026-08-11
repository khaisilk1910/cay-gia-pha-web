# Security notes

Các lớp bảo vệ đã có:

- Mật khẩu băm bằng `crypto.scrypt` + salt riêng.
- Session token ngẫu nhiên; database chỉ lưu SHA-256 của token.
- Session cookie `HttpOnly`, `SameSite=Lax`; hỗ trợ `Secure` khi bật HTTPS.
- CSRF token bắt buộc cho login/logout, CRUD, đổi mật khẩu, quản trị.
- Role-based access control kiểm tra tại server, không chỉ ẩn nút ở frontend.
- Login throttling và comment throttling theo IP trong bộ nhớ.
- SQLite prepared statements cho dữ liệu đầu vào.
- Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, hạn chế browser permissions.
- Upload ảnh giới hạn 5 MB, chỉ PNG/JPEG/WEBP, kiểm tra header/magic bytes, tên file UUID.
- Không render HTML từ comment/tiểu sử/nguồn; frontend escape text trước khi đưa vào DOM.
- Audit log cho thao tác quản trị quan trọng.
- Backup thư mục `data/` được bảo vệ bằng mật khẩu: scrypt dẫn xuất khóa + AES-256-GCM mã hóa và xác thực toàn vẹn. Mật khẩu backup không được lưu trong ứng dụng.

Điểm cần bổ sung nếu triển khai Internet quy mô lớn:

- HTTPS bắt buộc và reverse proxy cấu hình HSTS.
- Rate limit phân tán (Redis hoặc reverse proxy) thay cho memory rate limit.
- CAPTCHA/Turnstile cho comment nếu bị spam.
- Chính sách vòng đời/retention cho backup, lưu nhiều bản ở vị trí tách biệt và kiểm thử restore định kỳ.
- 2FA/WebAuthn cho admin.
- Malware scanning nếu cho phép upload tài liệu ngoài ảnh.
- Chính sách consent và quy trình xử lý yêu cầu ẩn/xóa dữ liệu người còn sống.
