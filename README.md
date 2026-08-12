# Cây Gia Phả Web v1.0.38

Bản v1.0.38 nâng cấp toàn bộ trình soạn thảo Rich Text/HTML trong Admin: ảnh có thể chọn kích thước từ 5% đến 100% theo bước 5%, bổ sung công cụ bảng và bộ định dạng nội dung đầy đủ hơn. Dữ liệu Rich Text cũ vẫn tương thích và tự chuyển sang HTML an toàn khi được sửa/lưu lại. Có thể nâng trực tiếp từ v1.0.38, không cần tạo lại database.

## Cập nhật v1.0.38

- Ảnh chèn trong Rich Text và Tin tức có 20 mức kích thước: 5%, 10%, 15% … 95%, 100%; hỗ trợ căn trái/giữa/phải và mô tả ảnh.
- Rich Text Admin bổ sung undo/redo, H2/H3/H4, danh sách, thụt lề, liên kết, đường phân cách và bảng.
- Bảng hỗ trợ thêm/xóa hàng, thêm/xóa cột, gộp phải/gộp dưới, tách ô, chuyển hàng thành đầu bảng, tiêu đề bảng, căn chữ, màu nền ô và chỉnh độ rộng bảng.
- Trình soạn Tin tức dùng cùng bộ công cụ bảng và ảnh nâng cao. HTML được lọc an toàn phía server trước khi lưu.
- Renderer công khai hỗ trợ Rich HTML và bảng responsive, đồng thời vẫn đọc đúng dữ liệu Rich Text token từ các phiên bản cũ.
- Không dùng editor CDN bên ngoài để tránh phụ thuộc Internet và giữ khả năng chạy offline/Docker ổn định; bộ Rich Text/HTML Editor tích hợp được nâng cấp trực tiếp trong dự án.

## Cập nhật v1.0.35

- Bảng vinh danh không còn gộp nhầm người cùng tên nhưng khác địa chỉ; khóa tổng hợp chuẩn hóa cả Phương danh và Địa chỉ.
- Nhóm có từ 2 lần công đức trở lên có thể nhấn trực tiếp trên bảng Top để mở popup danh sách chi tiết từng lần công đức.
- Trường **Giá trị (VNĐ)** trong Admin chuyển thành không bắt buộc. Bản ghi không nhập giá trị hiển thị dấu `—` thay vì `0 ₫`.
- Khoản không ghi giá trị vẫn xuất hiện trong danh sách đầy đủ và popup chi tiết; nhóm chỉ toàn khoản không ghi giá trị không tham gia xếp hạng Top vì không có số tiền để xếp hạng.
- Sắp xếp theo giá trị ưu tiên các bản ghi có số tiền trước, tránh coi khoản không nhập giá trị là 0 đồng.
- Thống kê số Phương danh cũng phân biệt theo cặp tên + địa chỉ để nhất quán với Bảng vinh danh.
- Database cũ tự thêm cột `contributions.amount_known`; backup cũ không có cột này vẫn khôi phục tương thích với dữ liệu giá trị hiện có.
- Bổ sung regression test v1.0.35 cho tổng hợp tên + địa chỉ, giá trị tùy chọn, popup nhóm và migration database.

## Cập nhật v1.0.34

- Thêm trang `Tin tức` và API public/admin, dữ liệu lưu trong bảng `news` của SQLite.
- Tin tức hỗ trợ ảnh đại diện; nếu không có ảnh đại diện sẽ ưu tiên ảnh đầu tiên trong bài, sau cùng dùng logo dòng họ.
- Trang danh sách có tìm kiếm theo nội dung, lọc năm, phân trang; trang chi tiết tương thích các định dạng HTML đã cho phép trong trình soạn thảo.
- Admin hỗ trợ thêm/sửa/xóa tin, trạng thái công khai, ngày đăng, thứ tự ưu tiên và upload ảnh trực tiếp vào nội dung.
- Tất cả trang công khai hiển thị tối đa 6 tin mới nhất ngay dưới khối QR ủng hộ.
- Backup dữ liệu bao gồm bảng Tin tức và thư mục `data/uploads/news`; quy tắc loại trừ `data/uploads/gallery` vẫn giữ nguyên.
- Bổ sung regression test v1.0.34 cho database, lọc HTML, giao diện, API và khu vực tin mới nhất.

## Cập nhật v1.0.33

- Loại bỏ hoàn toàn font serif cũ khỏi CSS, Rich Text, cây gia phả, bản in và bộ chọn cài đặt.
- Cung cấp đúng 20 lựa chọn font: Hệ thống / Unicode, Segoe UI, Arial, Tahoma, Verdana, Trebuchet MS, Calibri, Candara, Corbel, Helvetica Neue, Roboto, Noto Sans, DejaVu Sans, Liberation Sans, Times New Roman, Cambria, Palatino Linotype, Noto Serif, DejaVu Serif và Liberation Serif.
- Mỗi lựa chọn có fallback Unicode để nội dung tiếng Việt có dấu vẫn hiển thị an toàn khi máy người xem không cài font chính.
- Dữ liệu cũ sử dụng font không còn hỗ trợ sẽ tự hiển thị bằng font hệ thống, không làm lỗi nội dung.
- Bổ sung regression test v1.0.33 kiểm tra đủ 20 font, đồng bộ Web/Docker và không còn tham chiếu tới font đã loại bỏ.

## Cập nhật v1.0.32

- Thêm cột **Địa chỉ** vào bảng Phương Danh Công Đức công khai, bảng Top và bảng quản trị.
- Form thêm/sửa công đức dùng textarea Địa chỉ nhiều dòng, tối đa 3000 ký tự; chuẩn hóa CRLF về LF nhưng giữ bố cục dòng.
- Database tự thêm cột `contributions.address` khi khởi động trên dữ liệu v1.0.31 trở xuống; backup/restore tự bao gồm cột mới.
- Bổ sung regression test v1.0.32 cho migration, create/update/list/top và giao diện Địa chỉ.

## Cập nhật v1.0.31

- Thu gọn một nhánh giờ ẩn **toàn bộ hậu duệ gắn với nhánh**, gồm con ruột/con nuôi theo cha mẹ, Dâu/Rể, con riêng của Dâu/Rể và các hậu duệ tiếp theo; không còn thẻ người hoặc đường nối bị treo sau khi nhánh cha mẹ bị ẩn.
- Việc thu gọn chỉ đi xuống nhánh và qua người phối ngẫu cần thiết, **không đi ngược lên cha mẹ của Dâu/Rể**, tránh làm biến mất phần cây không thuộc nhánh đang thu gọn.
- Đồng bộ khoảng trống phía trên của Cây gia phả, Thư viện ảnh, Liên hệ và Phương Danh Công Đức theo nhịp của trang Cây gia phả: 28px trên desktop, 18px trên mobile.
- Popup danh sách thống kê dùng `100dvh`, safe-area và bố cục co giãn; trên điện thoại không còn bị dịch nửa màn hình do xung đột `left/right` với `translate(-50%)`. Danh sách và thanh phân trang cuộn độc lập khi màn hình thấp.
- Bỏ nút mở Bình luận ở header mobile; chỉ giữ nút Bình luận nổi. Panel Bình luận bám trong vùng nhìn thấy, tự co theo `dvh`, safe-area, bàn phím/màn hình thấp và giữ form luôn thao tác được.
- Bổ sung regression test v1.0.31 cho thu gọn nhánh có con rể + con riêng, khoảng cách hero công khai, popup thống kê responsive và panel Bình luận mobile.

## Cập nhật v1.0.30

- Thêm trang công khai **Phương Danh Công Đức** tại `/contributions.html`, hiển thị STT, Phương danh, Nội dung công đức, Giá trị, Ngày công đức và Ghi chú.
- Danh sách có phân trang, tìm theo Phương danh, lọc theo năm và sắp xếp theo ngày, giá trị hoặc tên. Các dòng dùng nền xen kẽ để dễ theo dõi trên desktop; trên điện thoại mỗi bản ghi tự chuyển thành card có nhãn trường rõ ràng.
- Phía trên danh sách đầy đủ có **Bảng vinh danh Top**. Các lần công đức có cùng Phương danh được cộng dồn, xếp từ tổng giá trị cao xuống thấp và nhấn mạnh hạng 1/2/3.
- Trong **Cài đặt → Công đức**, admin chọn số lượng hiển thị Top là **5, 10, 15 hoặc 20**; mặc định Top 10.
- Admin có mục **Phương danh** riêng để thêm, sửa, xóa, tìm, lọc theo năm, sắp xếp và phân trang. `admin`/`editor` được chỉnh sửa; `viewer` được xem danh sách.
- Dữ liệu công đức được lưu trong bảng `contributions`, có log thao tác, thống kê số lượt/tổng giá trị và được đưa vào backup hệ thống. Quy tắc từ v1.0.29 vẫn giữ nguyên: `data/uploads/gallery/` không nằm trong `.gpbak` và phải sao lưu riêng.
- Restore tương thích cả backup JSON legacy v3 tạo trước v1.0.30, khi chưa có bảng Phương Danh Công Đức.
- Bổ sung regression test v1.0.30 cho database, CRUD, tổng hợp Top, cấu hình 5/10/15/20, giao diện responsive, API public/admin và tương thích backup cũ.

## Cập nhật v1.0.29

- Toàn bộ trang Admin và nội dung các tab Cài đặt luôn **bắt đầu từ phía trên vùng làm việc**, không còn căn giữa theo chiều dọc khi nội dung ngắn. Khi đổi menu/tab, trang được đưa về đầu và hiệu ứng tab gây nhảy vị trí đã được bỏ.
- Phần QR ủng hộ **bỏ trường “Tiêu đề” và không hiển thị tiêu đề riêng trên trang công khai**. QR được tăng kích thước trên desktop và vẫn tự co hợp lý trên điện thoại.
- Gói backup `.gpbak` từ v1.0.29 **không chứa `data/uploads/gallery/`**. Gallery phải được sao lưu riêng bằng cách copy thư mục này; nhờ vậy backup hệ thống nhỏ hơn và không bị phình theo số lượng ảnh.
- Khi restore `.gpbak` v1.0.29, thư mục Gallery hiện có được **giữ nguyên**, không bị xóa/thay thế. Backup cũ nếu thực sự có Gallery vẫn được nhận diện tương thích.
- Có thể copy trực tiếp các thư mục ảnh vào `data/uploads/gallery/<tên thư mục>/`. Website tự quét thư mục, tự tạo album công khai cho thư mục chưa có trong database và tự nhận ảnh `.png/.jpg/.jpeg/.webp`, kể cả tên tiếng Việt, dấu và khoảng trắng.
- Đồng bộ Gallery từ filesystem là kiểu **bổ sung, không tự xóa metadata** khi file đang tạm thời thiếu; thao tác xóa album/ảnh nên thực hiện trong Admin để tránh mất thông tin khi đang copy/khôi phục thủ công.
- Bổ sung regression test v1.0.29 cho căn top Admin, QR, backup loại Gallery, restore giữ Gallery và tự nhận thư mục/ảnh copy thủ công.

> **Lưu ý quan trọng:** các mô tả backup ở phần lịch sử phiên bản cũ bên dưới phản ánh hành vi tại thời điểm phiên bản đó phát hành. Từ **v1.0.29**, `data/uploads/gallery/` được tách khỏi `.gpbak` và phải sao lưu riêng.

## Cập nhật v1.0.28

- Popup chào mừng **bỏ nút “Đã hiểu”**. Người xem đóng bằng nút **X**, nhấn vùng nền bên ngoài hoặc phím **Esc**; popup khóa cuộn nền trong lúc mở và tự dọn listener khi đóng.
- Popup được thiết kế lại gọn hơn, hiện đại hơn và **không tạo thanh cuộn ngang**: card dùng `overflow-x: hidden`, nội dung/ảnh Rich Text luôn co tối đa theo chiều rộng khả dụng và chuỗi dài được tự ngắt dòng.
- Với nhiều vợ/chồng, **đời vợ/chồng trước có nhánh con/cháu đang hiển thị sẽ được đưa ra giữa đúng vùng hậu duệ của cuộc hôn nhân đó**. Người nội tộc + đời vợ/chồng hiện tại/cuối tạo thành cụm chính; nhánh đời trước nối bằng lane riêng. Khi nhánh con bị ẩn/thu gọn hoặc không có hậu duệ hiển thị, người vợ/chồng đó tự trở lại nằm sát cụm chính. Bản in/SVG dùng cùng thuật toán.
- Trang **Cài đặt** và vùng nội dung quản trị bỏ giới hạn `max-width`, chiếm toàn bộ chiều rộng còn lại của trình duyệt. Chuyển tab không còn gọi cuộn trang về đầu nên không bị nhảy vị trí.
- Thanh tab Cài đặt được làm **nhỏ, hiện đại, cuộn ngang mượt trên điện thoại**, có trạng thái ARIA và sticky ngay dưới thanh tiêu đề quản trị.
- Các trang công khai **Cây gia phả / Thư viện / Liên hệ** cùng header/footer bỏ giới hạn chiều rộng cố định; khung nội dung chính dàn theo 100% chiều rộng browser (vẫn giữ padding an toàn theo thiết bị).
- Bổ sung regression test v1.0.28 kiểm tra popup, full-width, tab không nhảy trang, bố cục vợ/chồng theo nhánh và hành vi khi nhánh bị ẩn.
- Bản Docker đồng bộ toàn bộ thay đổi web, tiếp tục hỗ trợ GHCR `latest`, Compose/Portainer và bind mount `/opt/cay-gia-pha-web`.

## Cập nhật v1.0.23

- Hai nội dung trên trang Liên hệ (phần dưới tiêu đề **Liên Hệ** và dòng trước QR/online ở chân trang) nay chỉnh bằng Rich Text nhiều dòng trong Cài đặt.
- Địa chỉ nhà thờ Tổ hiển thị trực tiếp phía trên Google Maps; bỏ nút **Mở Google Maps**, bản đồ dàn toàn chiều rộng khung.
- **Không gian thờ tự** hỗ trợ tối đa 10 ảnh, tự co giãn theo số lượng; ảnh có lightbox và nút trước/sau.
- Cài đặt có nút **Lưu cài đặt** nổi ở góc phải, luôn theo màn hình khi cuộn.

- Thư viện có thêm **Video YouTube**. Admin và tài khoản được cấp quyền quản lý Thư viện có thể thêm, sửa và xóa video bằng link YouTube; trang công khai hiển thị thumbnail và phát trực tiếp bằng YouTube privacy-enhanced embed. Danh sách video được phân trang **100 video / trang**.
- Lightbox ảnh có nút **Play / Dừng** để tự động chuyển ảnh mỗi 3,5 giây. Khi đến ảnh cuối, slideshow tự quay lại ảnh đầu và tiếp tục cho tới khi người xem dừng hoặc đóng lightbox.
- Thêm trang **Liên hệ** tại `/contact.html`: danh sách người liên hệ có ảnh đại diện, họ tên, số điện thoại và địa chỉ; các nội dung chữ hỗ trợ Rich Text. Admin quản lý danh sách trong trang quản trị.
- Cài đặt Liên hệ có **Google Maps**, địa chỉ nhà thờ Tổ dạng Rich Text và ảnh nhà thờ Tổ. Ảnh nhà thờ Tổ có hiệu ứng hover và lightbox phóng lớn. Ảnh liên hệ được lưu trong `data/uploads/contacts/`, ảnh nhà thờ Tổ trong `data/uploads/temple/`.
- Ba trang công khai chính **Cây gia phả / Thư viện / Liên hệ** đồng bộ khối QR ủng hộ, thống kê online và nội dung tác giả ở chân trang.
- CSP chỉ cho phép iframe YouTube privacy-enhanced và Google Maps; dữ liệu Rich Text tiếp tục render bằng text node, không thực thi HTML/script tùy ý.


## Cập nhật v1.0.20

- Tổ chức lại toàn bộ ảnh tải lên theo đúng nội dung: `data/uploads/Logo/` cho logo, `data/uploads/qrcode/` cho QR, `data/uploads/profiles/` cho ảnh đại diện và `data/uploads/gallery/<thư-mục-album>/` cho ảnh Thư viện.
- Khi tạo album Gallery, hệ thống tự tạo một thư mục vật lý riêng có tên dễ nhận biết từ tên album kèm mã ngắn để tránh trùng. Mọi ảnh tải mới, thay ảnh, chuyển ảnh giữa album và xóa ảnh đều thao tác đúng thư mục tương ứng. Khi admin xóa album, thư mục vật lý của album cũng được dọn.
- Khi nâng cấp từ dữ liệu cũ, các ảnh đang nằm trực tiếp trong `uploads/` được tự động phân loại và cập nhật đường dẫn trong database. Ảnh rời cũ không còn được dữ liệu tham chiếu được giữ an toàn trong `uploads/_legacy/` thay vì bị xóa.
- Trình phục vụ `/uploads/...`, bản sao lưu JSON tương thích cũ và thống kê restore đã được nâng cấp để hiểu đường dẫn nhiều cấp. Backup `.gpbak` toàn thư mục `data/` tiếp tục giữ nguyên toàn bộ cấu trúc thư mục mới.
- Bản Docker dùng cùng cấu trúc trong volume dữ liệu nên việc recreate container, backup và restore không làm mất cách phân loại ảnh.


## Cập nhật v1.0.20

- Bổ sung **trình soạn nội dung định dạng dùng chung** trong Cài đặt cho các nội dung công khai: Phụ đề cây, nội dung chân trang cây, lời kêu gọi ủng hộ, nội dung tác giả, giới thiệu Thư viện ảnh và chân trang Thư viện ảnh.
- Trình soạn hỗ trợ **nhiều dòng, chữ đậm, nghiêng, gạch chân, gạch ngang, màu chữ, cỡ chữ, font chữ, căn trái/giữa/phải/đều và xóa định dạng**. Dữ liệu được lưu dưới dạng token JSON đã whitelist và trang công khai dựng bằng `textContent`, không thực thi HTML/script tùy ý.
- Admin có thể sửa hai nội dung riêng của **Thư viện ảnh**: đoạn giới thiệu dưới tiêu đề và dòng mô tả ở chân trang; đồng thời có thể sửa dòng **“Dữ liệu gia đình được trình bày với ưu tiên quyền riêng tư.”** ở trang cây.
- Thư viện ảnh công khai và phần quản trị ảnh đều phân trang **100 ảnh / trang**, có đủ **Đầu / Lùi / nhập số trang / Tiến / Cuối**. Lightbox vẫn duyệt được xuyên toàn bộ album và tự đồng bộ trang khi chuyển qua ranh giới 100 ảnh.
- Các khóa Cài đặt mới được tự tạo khi nâng cấp database cũ; không cần xóa hoặc tạo lại database. Ảnh Gallery nằm trong `data/uploads/gallery/<album>/`, nên cơ chế backup `.gpbak` toàn thư mục `data/` tiếp tục sao lưu/khôi phục đầy đủ.
- Bản Docker-ready tiếp tục dùng volume cha `/var/lib/cay-gia-pha`, phù hợp với cơ chế restore thay toàn bộ thư mục `data/`.

## Cập nhật v1.0.18

- Thêm **Gallery / Thư viện ảnh** công khai tại `/gallery.html`, hiển thị theo thư mục/album với ảnh bìa, số lượng ảnh, tìm kiếm thư mục và giao diện responsive.
- Khi mở một thư mục, ảnh được trình bày dạng lưới hiện đại; bấm ảnh mở **lightbox toàn màn hình** với hiệu ứng mượt, ảnh trước/sau, bàn phím ←/→/Esc, vuốt trên màn hình cảm ứng và dải thumbnail.
- Trong trang quản trị có mục **Thư viện ảnh** riêng. Người được admin cấp quyền có thể tạo/sửa thư mục, tải nhiều ảnh cùng lúc, sửa tiêu đề/chú thích/ngày chụp, thay ảnh và chuyển ảnh giữa các thư mục.
- Bổ sung quyền `can_manage_gallery` theo từng tài khoản. User được cấp quyền **không được xóa** ảnh hoặc thư mục; API backend cũng chặn DELETE. **Chỉ admin** được xóa ảnh/thư mục.
- Thư mục có thể bật/tắt **Hiển thị công khai**, đặt thứ tự và chọn ảnh bìa. Ảnh được lưu theo từng album trong `data/uploads/gallery/<album>/`, vì vậy backup `.gpbak` toàn thư mục `data/` tự động sao lưu/khôi phục cả Gallery.

## Cập nhật v1.0.17

- Thêm khối **QR ủng hộ quỹ dòng họ** ở cuối trang công khai, đặt ngay phía trên thống kê online. Admin có thể bật/tắt, đổi tiêu đề, cỡ chữ tiêu đề, upload/xóa ảnh QR và soạn nội dung nhiều dòng với chữ đậm/thường cùng các cỡ 12–36 px.
- Nội dung định dạng được lưu dưới dạng token văn bản có whitelist cỡ chữ và dựng bằng `textContent`, không cho chạy HTML/script tùy ý.
- Ảnh QR lưu trong `data/uploads/qrcode/`, vì vậy gói `.gpbak` sao lưu toàn bộ `data/` sẽ tự động mang theo QR cùng ảnh đại diện, logo và cơ sở dữ liệu.
- Logo góc trên bên trái có hiệu ứng nổi và phóng to khi trỏ chuột; khối QR có hiệu ứng nâng, ánh sáng lướt và zoom nhẹ, đồng thời hỗ trợ `prefers-reduced-motion`.
- API lưu Cài đặt xử lý logo + QR an toàn hơn: file cũ chỉ bị xóa sau khi dữ liệu cài đặt mới đã lưu thành công; nếu cập nhật lỗi, file mới tạm thời được dọn.

## Cập nhật v1.0.16

- Thay cơ chế backup JSON bằng **gói backup toàn bộ thư mục `data/`** có đuôi `.gpbak`. Gói này chứa cơ sở dữ liệu SQLite, toàn bộ ảnh/logo và cả các tệp/thư mục bổ sung nằm trong `data/`.
- Khi tạo backup, hệ thống tạo một snapshot nhất quán của SQLite bằng `VACUUM INTO`, sau đó đóng gói nguyên cấu trúc thư mục data. Các tệp WAL/SHM tạm của SQLite không cần sao lưu vì snapshot DB đã hoàn chỉnh.
- Backup bắt buộc có **mật khẩu**. Dữ liệu được dẫn xuất khóa bằng **scrypt** và mã hóa/xác thực bằng **AES-256-GCM**; mật khẩu không được lưu trong website hay trong tệp backup.
- Restore giải mã vào thư mục tạm, kiểm tra định dạng, `PRAGMA integrity_check`, bảo đảm còn ít nhất một admin hoạt động, rồi mới thay thế toàn bộ thư mục `data/`. Nếu có lỗi trước hoặc trong lúc thay thế, hệ thống cố gắng quay lại thư mục data cũ.
- Phiên admin đang thực hiện restore được giữ lại khi cùng tài khoản admin còn tồn tại trong backup; các phiên cũ nằm trong backup không được kích hoạt lại.
- Giao diện có ô nhập + xác nhận mật khẩu khi backup, ô mật khẩu khi restore và cảnh báo rõ: **nếu quên mật khẩu thì không thể khôi phục backup**.

## Cập nhật v1.0.15

- Thêm **In cây gia phả** ngay trên trang công khai. Bản in luôn dựng **toàn bộ nhánh đang xem**, không phụ thuộc các nút `+ / −` đang thu gọn trên màn hình.
- Trang `/print.html` cho phép chọn **Toàn gia phả hoặc từng Chi**, nhập chiều rộng bạt từ **50 cm đến 10 m**, tự tính chiều cao theo đúng tỷ lệ cây.
- Có hai cách xuất: **In / Lưu PDF** và **Tải SVG chất lượng cao**. SVG giữ chữ, đường nối, khung và bố cục ở dạng vector nên phù hợp mang tới nhà in để phóng bạt vài mét.
- Bản in gồm phần tiêu đề/phụ đề và thống kê như trang công khai, toàn bộ cây, ảnh đại diện, trạng thái vợ/chồng/ly hôn/con nuôi/hôn phối khác Chi, chú thích và **nội dung tác giả dưới cây**. Ảnh đại diện được nhúng trực tiếp vào SVG để file in không phụ thuộc website đang chạy.
- Chức năng **Sao lưu & khôi phục đầy đủ** tiếp tục bao gồm toàn bộ cá thể, quan hệ, Chi/nhánh, cài đặt, tài khoản, bình luận, nhật ký, lượt truy cập, **ảnh đại diện và logo**; restore kiểm tra checksum và từ chối backup thiếu ảnh đang được dữ liệu tham chiếu.

## Cập nhật v1.0.14

- Thêm **Sao lưu & khôi phục dữ liệu đầy đủ** trong **Cài đặt** dành riêng cho admin.
- Bản sao lưu JSON chứa toàn bộ cá thể/quan hệ, Chi/nhánh, cài đặt, tài khoản & phân quyền, bình luận, nhật ký quản trị, thống kê lượt truy cập và toàn bộ ảnh/logo đã tải lên.
- **Phiên đăng nhập không được sao lưu** để tránh phục hồi token phiên cũ. Khi restore, các phiên khác bị xóa; phiên admin đang thực hiện được giữ lại nếu tài khoản đó vẫn tồn tại và còn hoạt động trong bản sao lưu.
- Khôi phục là chế độ **thay thế toàn bộ dữ liệu hiện tại, không merge**. Giao diện yêu cầu xác nhận hai bước và backend từ chối bản sao lưu không còn admin hoạt động.
- Ảnh trong backup có kích thước và SHA-256 để kiểm tra toàn vẹn trước khi restore; dữ liệu DB chỉ được ghi sau khi toàn bộ tệp backup vượt qua kiểm tra.
- Tệp backup chứa dữ liệu riêng tư và mã băm mật khẩu, vì vậy cần được lưu ở nơi an toàn. Tệp restore qua giao diện web tối đa 200 MB.

## Cập nhật v1.0.13

- Logo góc trên bên trái có thể đổi trong Cài đặt (admin), với khuyến nghị ảnh vuông 512×512 px.
- Thống kê tuổi có thêm nhóm 80 tuổi trở lên.
- Cây hỗ trợ hiển thị rõ nhiều vợ/chồng, vợ/chồng đã ly hôn, con riêng theo đúng cặp Cha/Mẹ và hôn phối giữa các Chi/nhánh.
- Chú thích cây tự thay đổi theo dữ liệu thực tế; có trạng thái ly hôn và hôn phối khác Chi khi phát sinh.
- Thống kê truy cập chuyển xuống chân trang; thêm nội dung tác giả và font chữ do admin quản lý.

## Cập nhật v1.0.12

- Sửa lỗi **Thêm cá thể** luôn chọn `Giới hạn`: trường **Quyền riêng tư** nay lấy đúng giá trị từ **Quyền riêng tư mặc định người còn sống** trong Cài đặt (`Công khai`, `Giới hạn` hoặc `Riêng tư`). Khi sửa cá thể, hệ thống vẫn giữ nguyên quyền riêng tư hiện có của cá thể đó.
- Bổ sung kiểm thử hồi quy cho cả 3 cấu hình mặc định `Công khai / Giới hạn / Riêng tư`, kiểm tra sửa cá thể không bị ghi đè và fallback an toàn nếu cài đặt không hợp lệ.

## Cập nhật v1.0.11

- Toàn bộ thống kê độ tuổi được gom thành **một dòng riêng**; trên màn hình hẹp có thể cuộn ngang để không làm vỡ bố cục.
- Thêm thống kê **Không rõ** cho các cá thể không thể xác định tuổi vì thiếu năm sinh hoặc, với người đã mất, thiếu năm mất. Có thể bấm để xem danh sách; riêng danh sách này sắp xếp theo tên **A–Z**.
- Danh sách mở từ mọi thống kê công khai có ô **tìm theo tên** và phân trang cố định **100 cá thể / trang**, đủ nút **Đầu / Lùi / nhập trang / Tiến / Cuối**. STT chạy liên tục theo kết quả sau khi tìm kiếm.
- Các danh sách độ tuổi xác định vẫn sắp xếp từ tuổi lớn xuống nhỏ; tìm kiếm luôn áp dụng trên toàn bộ nhóm thống kê trước khi chia trang.

## Cập nhật v1.0.10

- Giảm khoảng trống phía trên khẩu hiệu “Gìn giữ ký ức · Kết nối các thế hệ”.
- Tiêu đề trang công khai hiển thị 2 dòng: **Tiêu đề cây** phía trên và **Tên dòng họ / gia đình** phía dưới; quản trị viên có thể chỉnh riêng cỡ chữ của hai dòng.
- Góc trái đổi thứ bậc nhấn mạnh: “Gia Phả” nhỏ, thường; tên dòng họ/gia đình lớn và đậm.
- Phụ đề hỗ trợ nhiều dòng, giữ nguyên xuống dòng và căn giữa trên trang công khai.
- Thêm thống kê độ tuổi 60–80, 40–60, 20–40, 16–20 và 0–16, kèm số còn sống/đã mất. Mỗi thống kê đều có thể bấm để xem danh sách cá thể; danh sách ưu tiên tuổi lớn đến nhỏ. Với người đã mất, tuổi là tuổi thọ tại năm mất; với người còn sống là tuổi theo năm hiện tại. Các khoảng tuổi dùng cận dưới bao gồm và cận trên không bao gồm để không đếm trùng.

## Cập nhật v1.0.9

- Trường **Đời / thế hệ** trong **Thêm cá thể / Sửa cá thể** nay có thể nhập trực tiếp (Đời 1–50). Khi chọn hoặc đổi **Cha / Mẹ**, giao diện vẫn tự tính đời theo cha/mẹ; nếu cần, quản trị viên có thể sửa lại thủ công trước khi lưu.
- Khi đổi đời của một cá thể, hệ thống giữ nguyên đời đã nhập cho cá thể đó và tự cập nhật **phối ngẫu cùng đời + toàn bộ hậu duệ phía sau** để cây không bị lệch thế hệ; không tự sửa ngược các đời tổ tiên phía trên.
- Trang công khai có thống kê truy cập: **đang truy cập**, tách **khách / thành viên đã đăng nhập**, cùng **lượt hôm nay / tháng này / tổng lượt**. Trạng thái online dùng cửa sổ hoạt động 5 phút và tự làm mới định kỳ.
- Lượt truy cập được lưu trong SQLite từ khi chạy **v1.0.9** trở đi. Một phiên/trình duyệt tải lại trong vòng 30 phút chỉ tính một lượt để tránh tự tăng số do refresh/polling; dữ liệu trước v1.0.9 không thể khôi phục hồi tố nếu trước đó website chưa lưu thống kê này.
- **Nhật ký quản trị, Quản lý bình luận, Người dùng & phân quyền, Hoạt động gần đây và Các Chi / nhánh** đều có STT liên tục và phân trang **100 bản ghi / trang**, đủ nút **Đầu / Lùi / nhập trang / Tiến / Cuối** như Danh sách cá thể.
- Bổ sung kiểm thử hồi quy cho sửa đời thủ công + lan truyền hậu duệ, tự tính đời khi không truyền level, thống kê khách/thành viên/lượt truy cập, cùng kiểm tra cấu trúc phân trang các màn hình quản trị.

## Cập nhật v1.0.8

- Bảng **Danh sách cá thể** có thêm cột **STT** và phân trang cố định **100 cá thể / trang**.
- Có đủ điều hướng **Đầu / Lùi / nhập số trang / Tiến / Cuối**; trạng thái nút tự khóa khi đang ở trang đầu hoặc trang cuối.
- Tìm kiếm theo họ tên, mã nội bộ hoặc năm sinh và bộ lọc quyền riêng tư được áp dụng trên **toàn bộ danh sách trước khi chia trang**, nên kết quả ở trang 2, 3... vẫn tìm thấy ngay.
- STT chạy liên tục theo tập kết quả: trang 1 là 1–100, trang 2 là 101–200...; khi tìm kiếm, STT được đánh lại theo kết quả đã lọc.
- Thống kê trang công khai bổ sung **Số nam, Số nữ, Số còn sống** bên cạnh tổng thành viên, số thế hệ và số người đã mất.
- Giữ các cải tiến v1.0.7: cột **Năm sinh / Vợ-Chồng**, nút **− / +** thu gọn nhánh và thông báo quản trị căn giữa màn hình.
- Bổ sung kiểm thử hồi quy với 250 cá thể để xác nhận trang 3 là STT 201–250 và tìm kiếm vẫn tìm được một người nằm ở vị trí 230.

## Cập nhật v1.0.7

- Bảng **Danh sách cá thể** có thêm cột **Năm sinh** và **Vợ / Chồng**; phối ngẫu đã ly hôn được ghi chú riêng.
- Trên cây có nút **− / +** tại từng gia đình để ẩn hoặc hiện toàn bộ nhánh hậu duệ phía dưới cha/mẹ, giúp xem cây lớn gọn hơn mà không thay đổi dữ liệu.
- Thông báo hoàn thành/lỗi trong trang quản trị được hiển thị **chính giữa màn hình theo cả chiều ngang và dọc** thay vì góc trên bên phải.
- Bổ sung kiểm thử hồi quy cho chức năng thu gọn nhánh để mở lại không làm thay đổi dữ liệu hoặc thứ tự con.

## Cập nhật v1.0.6

- Phân biệt người thuộc huyết hệ và dâu/rể ngay trên card: người thuộc nhánh giữ **Con thứ ...**; phối ngẫu ngoài nhánh hiển thị **Vợ** hoặc **Chồng**.
- Căn đường nối vợ/chồng đúng **giữa chiều cao khung thông tin** thay vì lệch lên gần avatar.
- Sửa hồi quy **một con duy nhất**: nếu người con có vợ/chồng khiến card con lệch khỏi tâm bố mẹ, hệ thống tự thêm đoạn rail ngang để đường bố mẹ → con ruột luôn liền mạch.
- Thay biểu tượng nến bằng mẫu tưởng niệm mới rõ nét hơn, có nền sáng, viền vàng và ngọn lửa có độ sâu.
- Giữ toàn bộ cải tiến v1.0.5: bố cục cụm gia đình, khóa thứ tự anh/chị/em theo `birth_order`, tuổi/Thọ, card thông tin và 10 preset font tiếng Việt.

## Cập nhật v1.0.4

- **Nhiều cây Chi / nhánh** dùng chung dữ liệu cá thể, giúp cây chính không phải hiển thị quá nhiều đời cùng lúc.
- Mỗi Chi chọn một cá thể làm gốc; hệ thống tự lấy hậu duệ và vợ/chồng liên quan.
- Trang công khai có bộ chọn **Toàn gia phả / từng Chi** và URL chia sẻ riêng dạng `/?chi=ten-chi`.
- Admin/editor quản lý Chi; viewer chỉ xem. Xóa Chi không xóa dữ liệu cá thể.


## Cập nhật v1.0.3

- **Mã cá thể tự động**: backend tự cấp mã dạng `I001`, `I002`, ...; người dùng không phải nhập và request thủ công cũng không thể sửa mã.
- **Sửa gửi bình luận khi đã đăng nhập**: trường Tên hiển thị ẩn không còn chặn native form validation; nút có trạng thái **Đang gửi…** và báo lỗi rõ ràng.
- **Sắp lại form ngày/nơi sinh-mất**: hàng đầu là `Ngày/năm sinh | Ngày/năm mất`; hàng tiếp theo là `Nơi sinh | Nơi mất`. Hai trường nơi chốn là textarea nhiều dòng.
- **Tìm quan hệ nhanh**: Cha, Mẹ, Vợ/Chồng và Vợ/Chồng đã ly hôn dùng ô gõ tìm theo họ tên hoặc năm sinh. Danh sách hiển thị `Họ tên · năm sinh`, không hiển thị mã cá thể.
- **Đời/thế hệ tự động**: cá thể gốc là Đời 1; có cha/mẹ thì hệ thống lấy đời cao nhất của cha/mẹ + 1 và tự đồng bộ lại con cháu khi quan hệ thay đổi. Phối ngẫu chưa có cha/mẹ trong hệ thống được căn cùng đời.
- **Lọc phối ngẫu theo nghiệp vụ**: Nam chỉ chọn Nữ, Nữ chỉ chọn Nam; khi đã xác định cha/mẹ, danh sách ưu tiên cùng đời với cá thể. Backend kiểm tra lại giới tính và thế hệ để không thể bỏ qua bằng request thủ công.


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

Bản Docker-ready tương ứng được đóng gói riêng trong `cay-gia-pha-web-v1.0.38-docker.zip`, kèm `Dockerfile`, Compose và Portainer Stack.
