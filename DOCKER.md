# Chạy Cây Gia Phả Web v1.0.27 bằng Docker

Bản Docker v1.0.27 bao gồm đầy đủ tính năng web v1.0.27 và tiếp tục lưu rõ mã ứng dụng + dữ liệu trên Ubuntu:

```text
/opt/cay-gia-pha-web/
├── app/     # mã ứng dụng đang chạy, tự đồng bộ từ image
└── data/    # family_tree.db, uploads, dữ liệu backup/restore
```

## Có thể dùng `:latest` không?

Có. Stack GHCR đi kèm dùng trực tiếp:

```yaml
image: ghcr.io/khaisilk1910/cay-gia-pha-web:latest
pull_policy: always
```

Không cần `${IMAGE_TAG}`. Mỗi lần redeploy Stack, Docker Compose sẽ kiểm tra/pull image `latest`. Nếu image mới có nội dung khác, entrypoint của v1.0.27 tự cập nhật `/opt/cay-gia-pha-web/app/`; thư mục `/opt/cay-gia-pha-web/data/` không bị ghi đè.

> Khuyến nghị: trước mỗi lần cập nhật `latest`, nên tạo `.gpbak` từ giao diện quản trị. `latest` tiện, nhưng tag cố định như `1.0.27` vẫn dễ rollback hơn.

## Chuẩn bị Ubuntu

```bash
sudo mkdir -p /opt/cay-gia-pha-web
sudo chown -R 1000:1000 /opt/cay-gia-pha-web
```

Image chạy bằng user `node` UID 1000, vì vậy thư mục bind mount cần cho UID 1000 ghi được.

## Portainer Stack dùng GHCR `latest`

```yaml
services:
  gia-pha:
    image: ghcr.io/khaisilk1910/cay-gia-pha-web:latest
    pull_policy: always
    container_name: cay-gia-pha-web
    restart: unless-stopped
    init: true

    ports:
      - "8787:8787"

    environment:
      TZ: "Asia/Ho_Chi_Minh"
      HOST: "0.0.0.0"
      PORT: "8787"
      STORAGE_ROOT: "/var/lib/cay-gia-pha"
      APP_DIR: "/var/lib/cay-gia-pha/app"
      DATA_DIR: "/var/lib/cay-gia-pha/data"
      ADMIN_USERNAME: "admin"
      ADMIN_PASSWORD: ""
      SESSION_DAYS: "7"
      COOKIE_SECURE: "0"
      TRUST_PROXY: "0"
      MAX_BACKUP_MB: "1024"

    volumes:
      - /opt/cay-gia-pha-web:/var/lib/cay-gia-pha

    security_opt:
      - no-new-privileges:true
```

Không cần khai báo `volumes:` ở cuối Stack vì đây là bind mount trực tiếp từ `/opt` trên host.

## Sau lần chạy đầu

Kiểm tra:

```bash
ls -lah /opt/cay-gia-pha-web
ls -lah /opt/cay-gia-pha-web/app
ls -lah /opt/cay-gia-pha-web/data
```

Bạn sẽ thấy mã ứng dụng trong `app/` và dữ liệu trong `data/`.

Nếu `ADMIN_PASSWORD` để trống ở lần khởi tạo database đầu tiên, xem mật khẩu admin được sinh tự động:

```bash
sudo cat /opt/cay-gia-pha-web/data/INITIAL_ADMIN.txt
```

Sau khi đăng nhập và đổi mật khẩu, có thể xóa file này:

```bash
sudo rm -f /opt/cay-gia-pha-web/data/INITIAL_ADMIN.txt
```

## Cách cập nhật khi dùng `latest`

1. Push source mới lên GitHub.
2. Tạo tag mới, ví dụ `v1.0.27`.
3. GitHub Actions build/push cả `:1.0.27` và `:latest`.
4. Trong Portainer mở Stack và chọn **Update the stack / Redeploy**.
5. Vì `pull_policy: always`, image `latest` mới được pull.
6. Khi container khởi động, entrypoint so sánh build ID. Nếu code khác, nó thay riêng `/opt/cay-gia-pha-web/app/` bằng code mới và giữ nguyên `/opt/cay-gia-pha-web/data/`.

## Vì sao không mount riêng `/opt/.../data`?

Backup/Restore `.gpbak` thay nguyên thư mục `data` bằng thao tác rename. Vì vậy cần mount thư mục cha:

```yaml
- /opt/cay-gia-pha-web:/var/lib/cay-gia-pha
```

Không dùng:

```yaml
- /opt/cay-gia-pha-web/data:/var/lib/cay-gia-pha/data
```

## GitHub Actions / GHCR

File `.github/workflows/docker-publish.yml` đã có trong bản Docker-ready. Khi push tag `v1.0.27`, workflow tạo:

```text
ghcr.io/khaisilk1910/cay-gia-pha-web:1.0.27
ghcr.io/khaisilk1910/cay-gia-pha-web:1.0
ghcr.io/khaisilk1910/cay-gia-pha-web:latest
```

Nếu GHCR package là Public, Ubuntu/Portainer có thể pull trực tiếp mà không cần token.

## Build local

```bash
docker build --pull -t cay-gia-pha-web:1.0.27 .
```

Chạy bằng Compose:

```bash
cp .env.docker.example .env
docker compose up -d --build
```

## Lưu ý về "toàn bộ file trong /opt"

Với Stack v1.0.27, **mã ứng dụng Cây Gia Phả Web và toàn bộ dữ liệu của ứng dụng** đều nằm rõ ràng trong `/opt/cay-gia-pha-web/`.

Tuy nhiên các lớp base image Node.js, metadata container, cache image và dữ liệu nội bộ của Docker Engine vẫn nằm trong `data-root` do Docker quản lý (thường là `/var/lib/docker`). Đây là cách Docker hoạt động. Nếu muốn di chuyển cả kho lưu trữ của Docker Engine sang `/opt`, phải cấu hình `data-root` của Docker daemon cho toàn server, không phải chỉ sửa Stack của một container.
