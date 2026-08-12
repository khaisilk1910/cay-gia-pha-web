# Cây Gia Phả Web v1.0.29

Bản v1.0.29 tập trung vào **ổn định vị trí nội dung quản trị, tối giản khối QR ủng hộ và tách Gallery khỏi gói backup để dữ liệu ảnh lớn dễ quản lý hơn**. Dữ liệu v1.0.28 được nâng cấp trực tiếp, không cần tạo lại database.

## Cập nhật v1.0.29

- Toàn bộ trang Admin và nội dung các tab Cài đặt luôn **bắt đầu từ phía trên vùng làm việc**, không còn căn giữa theo chiều dọc khi nội dung ngắn. Khi đổi menu/tab, trang được đưa về đầu và hiệu ứng tab gây nhảy vị trí đã được bỏ.
- Phần QR ủng hộ **bỏ trường “Tiêu đề” và không hiển thị tiêu đề riêng trên trang công khai**. QR được tăng kích thước trên desktop và vẫn tự co hợp lý trên điện thoại.
- Gói backup `.gpbak` từ v1.0.29 **không chứa `data/uploads/gallery/`**. Gallery phải được sao lưu riêng bằng cách copy thư mục này; nhờ vậy backup hệ thống nhỏ hơn và không bị phình theo số lượng ảnh.
- Khi restore `.gpbak` v1.0.29, thư mục Gallery hiện có được **giữ nguyên**, không bị xóa/thay thế. Backup cũ nếu thực sự có Gallery vẫn được nhận diện tương thích.
- Có thể copy trực tiếp các thư mục ảnh vào `data/uploads/gallery/<tên thư mục>/`. Website tự quét thư mục, tự tạo album công khai cho thư mục chưa có trong database và tự nhận ảnh `.png/.jpg/.jpeg/.webp`, kể cả tên tiếng Việt, dấu và khoảng trắng.
- Đồng bộ Gallery từ filesystem là kiểu **bổ sung, không tự xóa metadata** khi file đang tạm thời thiếu; thao tác xóa album/ảnh nên thực hiện trong Admin để tránh mất thông tin khi đang copy/khôi phục thủ công.
- Bổ sung regression test v1.0.29 cho căn top Admin, QR, backup loại Gallery, restore giữ Gallery và tự nhận thư mục/ảnh copy thủ công.

> **Lưu ý quan trọng:** các mô tả backup ở phần lịch sử phiên bản cũ bên dưới phản ánh hành vi tại thời điểm phiên bản đó phát hành. Từ **v1.0.29**, `data/uploads/gallery/` được tách khỏi `.gpbak` và phải sao lưu riêng.


Website gia phả độc lập được xây dựng dựa trên tinh thần hiển thị của custom integration **Cây Gia Phả v0.3.15** bạn cung cấp, nhưng không cần Home Assistant.

## Tính năng

- Trang xem cây gia phả công khai, **không cần đăng nhập**.
- Giao diện hiện đại, responsive, kéo để di chuyển cây, zoom, fit màn hình, tìm kiếm, lọc theo đời, xem chi tiết cá thể.
- Hỗ trợ nhiều **Chi / nhánh gia phả** trong cùng cơ sở dữ liệu để chia cây lớn thành các cây dễ xem.
- Hỗ trợ quan hệ: cha, mẹ, nhiều vợ/chồng, ly hôn, con, con nuôi, thứ tự sinh.
- Thông tin mở rộng: mã cá thể, ngày/nơi sinh, ngày/nơi mất, nghề nghiệp, tiểu sử, nguồn trích dẫn, ảnh.
- 3 mức quyền riêng tư: `public`, `limited`, `private`.
- Chat/bình luận ngay tại trang công khai; admin có thể xóa bình luận.
- Trang quản trị riêng `/admin.html`.
- Role:
  - `admin`: toàn quyền, quản lý user, comment, cấu hình, audit, export.
  - `editor`: thêm/sửa/xóa dữ liệu cá thể và Chi / nhánh.
  - `viewer`: đăng nhập quản trị nhưng chỉ xem.
- Bảo mật: session server-side, cookie HttpOnly/SameSite, CSRF, password scrypt, rate-limit login/comment, CSP/security headers, query SQLite tham số hóa, kiểm tra ảnh bằng magic bytes, audit log.
- Sao lưu/khôi phục **dữ liệu hệ thống trong `data/` bằng gói `.gpbak` mã hóa mật khẩu, ngoại trừ `data/uploads/gallery/`**, xuất GEDCOM 7 cơ bản, và **in/xuất SVG cây gia phả khổ lớn theo toàn cây hoặc từng Chi**.
- Không dùng thư viện npm bên ngoài: chạy bằng Node.js 22.5+ và `node:sqlite`.


## Sao lưu và khôi phục

Vào **Quản trị → Cài đặt → Sao lưu & khôi phục dữ liệu**.

- **Xuất bản sao lưu**: nhập mật khẩu hai lần rồi tải tệp `gia-pha-data-YYYY-MM-DD.gpbak`. Tệp mã hóa chứa database và dữ liệu hệ thống trong `data/`, **không chứa `data/uploads/gallery/`**.
- **Sao lưu Gallery riêng**: định kỳ copy toàn bộ thư mục `data/uploads/gallery/` sang ổ đĩa/NAS/cloud backup khác. Đây là phần người quản trị tự sao lưu vì có thể rất lớn.
- **Mật khẩu backup**: tối thiểu 8 ký tự, nên dùng từ 12 ký tự trở lên. Hệ thống **không lưu mật khẩu** và không có chức năng lấy lại mật khẩu backup. Hãy lưu mật khẩu ở nơi an toàn cùng quy trình quản lý backup của bạn.
- **Khôi phục dữ liệu**: chọn tệp `.gpbak`, nhập đúng mật khẩu, đọc cảnh báo, xác nhận và nhập `KHOI PHUC`. Dữ liệu hệ thống được thay thế theo backup; **Gallery đang có trên máy được giữ nguyên** nếu gói backup không chứa Gallery.
- Backup `.gpbak` cũ có chứa Gallery vẫn được nhận diện để tương thích. Với backup v1.0.29 trở lên, hãy khôi phục `.gpbak` và copy thư mục Gallery riêng về `data/uploads/gallery/`. Website sẽ tự nhận các thư mục/ảnh copy trực tiếp.
- Trước khi thay dữ liệu, hệ thống giải mã vào vùng tạm và kiểm tra toàn vẹn SQLite cũng như tài khoản admin. Sai mật khẩu, file bị sửa/hỏng hoặc backup không còn admin hoạt động đều bị từ chối.
- Gói backup vẫn chứa dữ liệu riêng tư, tài khoản và mã băm mật khẩu. Dù đã được mã hóa, vẫn nên lưu file backup ở nơi an toàn và dùng HTTPS nếu quản trị website từ xa.
- Mặc định giao diện restore nhận tệp tối đa **1 GB**. Có thể thay bằng biến môi trường `MAX_BACKUP_MB` (64–4096 MB) nếu cần.
- Các file backup JSON của v1.0.14–v1.0.15 là định dạng cũ; `.gpbak` được dùng từ v1.0.16. **Quy tắc loại Gallery khỏi `.gpbak` áp dụng từ v1.0.29.**

## Chạy nhanh trên Windows

1. Cài **Node.js 22.5 trở lên** từ https://nodejs.org/ (Node.js 24 được hỗ trợ).
2. Giải nén thư mục dự án ra một thư mục bình thường, ví dụ `D:\GiaPhaWeb\`.
3. Nhấp đúp `start-windows.bat`. Launcher Windows v1.0.1 chỉ dùng ký tự ASCII + CRLF để tránh lỗi encoding của CMD và dùng Node để mở trình duyệt.
4. Website: `http://127.0.0.1:8787`
5. Quản trị: `http://127.0.0.1:8787/admin.html`

Lần chạy đầu, hệ thống tự sinh mật khẩu admin mạnh và:

- in ra cửa sổ Terminal;
- lưu tạm trong `data/INITIAL_ADMIN.txt`.

Hãy đăng nhập và đổi mật khẩu ngay. Có thể xóa `INITIAL_ADMIN.txt` sau khi đổi.

## macOS / Linux

```bash
chmod +x start.sh
./start.sh
```

Hoặc:

```bash
npm start
```

Không cần `npm install` vì dự án không có dependency ngoài.

### Nếu Windows vẫn không chạy file BAT

Mở **Command Prompt** trong thư mục dự án và chạy trực tiếp:

```bat
node --no-warnings windows-launcher.js
```

Nếu lệnh này chạy được thì Node.js và mã nguồn đều ổn; lỗi còn lại chỉ nằm ở cách Windows mở file BAT.

## Cấu hình tùy chọn

Copy `.env.example` thành `.env`:

```env
PORT=8787
HOST=127.0.0.1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_DAYS=7
COOKIE_SECURE=0
TRUST_PROXY=0
```

### Khi đưa lên Internet

Bản mặc định ưu tiên chạy local. Khi triển khai public:

1. Đặt sau HTTPS reverse proxy (Caddy/Nginx/Cloudflare Tunnel...).
2. Đặt `COOKIE_SECURE=1`.
3. Nếu reverse proxy của bạn kiểm soát `X-Forwarded-For`, đặt `TRUST_PROXY=1`.
4. Chỉ expose cổng reverse proxy; không mở trực tiếp SQLite/data directory.
5. Sao lưu định kỳ bằng `.gpbak` **và sao lưu riêng `data/uploads/gallery/`**.
6. Hạn chế quyền đọc file cho user chạy tiến trình Node.

## Cấu trúc

```text
gia-pha-web/
├─ server.js                 # HTTP/API, security, session, uploads
├─ lib/
│  ├─ db.js                  # SQLite schema + CRUD + audit + snapshot/restore data
│  ├─ data-backup.js         # đóng gói + AES-256-GCM backup thư mục data
│  └─ security.js            # scrypt, token, cookie helpers
├─ public/
│  ├─ index.html             # Trang cây công khai
│  ├─ app.js                 # Layout cây + search/zoom/detail/comment
│  ├─ admin.html             # Trang quản trị
│  ├─ admin.js               # CRUD, users, comments, settings, export
│  ├─ styles.css             # Toàn bộ UI responsive
│  └─ assets/                # Logo/avatar từ integration bạn gửi
├─ data/
│  ├─ family_tree.db         # Tạo tự động
│  └─ uploads/
│     ├─ Logo/               # Logo website
│     ├─ qrcode/             # QR ủng hộ
│     ├─ profiles/           # Ảnh đại diện cá thể
│     └─ gallery/            # Gallery: tự nhận thư mục/ảnh copy tay; backup riêng ngoài .gpbak
└─ docs/
   ├─ SECURITY.md
   └─ REFERENCES.md
```

## Dữ liệu mẫu

Khi database còn trống, hệ thống tạo một cây mẫu nhỏ để bạn nhìn thấy giao diện ngay. Đây chỉ là dữ liệu minh họa và có thể sửa/xóa trong trang quản trị.

## Quyền riêng tư

- `public`: hiển thị toàn bộ trường được nhập ở trang công khai.
- `limited`: giữ tên/vị trí/quan hệ trong cây nhưng ẩn ngày sinh, nơi chốn, nghề nghiệp, ghi chú, nguồn và ảnh.
- `private`: thay tên bằng “Thành viên riêng tư” trên trang công khai, chỉ giữ các liên kết cần thiết để cây không bị đứt.

Đối với người còn sống, mặc định là `limited`. Có thể đổi mặc định trong **Cài đặt**.

## Kiểm tra mã nguồn

```bash
npm run check
```

## Lưu ý GEDCOM

Endpoint xuất GEDCOM hiện là **bản export tương thích cơ bản** cho cá thể, sự kiện sinh/mất, nghề nghiệp và family parent/child/spouse. Nếu bạn cần trao đổi dữ liệu phức tạp với FamilySearch/Ancestry/MyHeritage, nên mở rộng theo toàn bộ GEDCOM 7.0.18 (media, source records, notes structure, identifiers, date phrases...).

## Chi / nhánh gia phả (v1.0.4)

Từ v1.0.4, một cơ sở dữ liệu có thể có nhiều **cây Chi** mà không sao chép cá thể.

- Vào **Quản trị → Chi / nhánh → + Thêm Chi**.
- Nhập tên Chi và chọn **cá thể gốc** bằng ô tìm kiếm họ tên / năm sinh.
- Website tự động đưa vào Chi: cá thể gốc, toàn bộ hậu duệ theo quan hệ cha/mẹ và vợ/chồng của những người thuộc nhánh đó.
- Có thể tạo Chi từ bất kỳ đời nào. Vì cây Chi bắt đầu tại người gốc đã chọn nên không phải vẽ lại tất cả các đời phía trên.
- Mỗi Chi công khai có URL riêng dạng `/?chi=ten-chi` và xuất hiện trong bộ chọn **Cây đang xem** trên trang công khai.
- Xóa Chi chỉ xóa cấu hình cách xem, **không xóa cá thể**. Nếu xóa cá thể đang làm gốc Chi thì cấu hình Chi đó được xóa tự động để không tạo cây lỗi.
- `admin` và `editor` được tạo/sửa/xóa Chi; `viewer` chỉ xem danh sách Chi.

Khi nâng cấp từ v1.0.3 bằng hotfix, bảng `branches` được tạo tự động lúc server khởi động. Không cần sửa database thủ công và không được chép đè thư mục `data/`.

---

## Docker / Container

Bản Docker-ready tương ứng được đóng gói riêng trong `cay-gia-pha-web-v1.0.29-docker.zip`, kèm `Dockerfile`, Compose và Portainer Stack.
