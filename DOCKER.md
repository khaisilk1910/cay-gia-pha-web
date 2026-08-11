# Chay Cay Gia Pha Web v1.0.23 bang Docker

> Bản v1.0.23 nâng cấp trang Liên hệ với Rich Text, Google Maps toàn chiều rộng, tối đa 10 ảnh nhà thờ Tổ và nút Lưu cài đặt nổi.

Ban Docker nay giu nguyen giao dien va tinh nang v1.0.23, dong thoi them lop trien khai container. Du lieu van nam trong thu muc `data`, nhung trong container duoc dat tai `/var/lib/cay-gia-pha/data`.

## 1. Cach nhanh nhat: Docker Compose

Yeu cau: Docker Engine/Docker Desktop co Docker Compose.

```bash
cp .env.docker.example .env
# Co the sua .env. Neu ADMIN_PASSWORD de trong, he thong tu sinh mat khau lan dau.
docker compose up -d --build
```

Mo:

- Website: `http://IP-MAY-DOCKER:8787/`
- Quan tri: `http://IP-MAY-DOCKER:8787/admin.html`

Xem trang thai:

```bash
docker compose ps
docker compose logs -f gia-pha
```

Neu `ADMIN_PASSWORD` de trong, doc tai khoan admin tu volume:

```bash
docker compose exec gia-pha cat /var/lib/cay-gia-pha/data/INITIAL_ADMIN.txt
```

Sau khi dang nhap va doi mat khau, co the xoa file nay:

```bash
docker compose exec gia-pha rm -f /var/lib/cay-gia-pha/data/INITIAL_ADMIN.txt
```

Dung/chay lai:

```bash
docker compose stop
docker compose start
```

Xoa container nhung GIU du lieu:

```bash
docker compose down
```

Khong dung `docker compose down -v` neu ban muon giu gia pha, vi `-v` se xoa volume du lieu.

## 2. Tu build Docker image

```bash
docker build --pull -t cay-gia-pha-web:1.0.23 .
```

Hoac build va dong goi image thanh file TAR de mang sang NAS/may khac:

Linux/macOS:

```bash
./docker-build-save.sh
```

Windows PowerShell:

```powershell
./docker-build-save.ps1
```

File tao ra mac dinh: `cay-gia-pha-web-v1.0.23-image.tar`.

Nap image tren may dich:

```bash
docker load -i cay-gia-pha-web-v1.0.23-image.tar
```

## 3. Chay truc tiep bang docker run

Tao volume:

```bash
docker volume create cay-gia-pha-web-data
```

Chay container:

```bash
docker run -d \
  --name cay-gia-pha-web \
  --restart unless-stopped \
  --init \
  -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e PORT=8787 \
  -e DATA_DIR=/var/lib/cay-gia-pha/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD= \
  -e SESSION_DAYS=7 \
  -e COOKIE_SECURE=0 \
  -e TRUST_PROXY=0 \
  -e MAX_BACKUP_MB=1024 \
  -v cay-gia-pha-web-data:/var/lib/cay-gia-pha \
  --security-opt no-new-privileges:true \
  cay-gia-pha-web:1.0.23
```

## 4. Portainer Stack

### Buoc A - dua image vao Docker host

Build image tren chinh Docker host:

```bash
docker build -t cay-gia-pha-web:1.0.23 .
```

Hoac nap file TAR da tao o may khac:

```bash
docker load -i cay-gia-pha-web-v1.0.23-image.tar
```

### Buoc B - tao Stack

Trong Portainer: **Stacks -> Add stack -> Web editor**, dan noi dung file `stack-portainer.yml`, sau do Deploy.

Neu muon dat mat khau admin ngay tu lan dau, sua dong:

```yaml
ADMIN_PASSWORD: ""
```

thanh mat khau manh cua ban truoc khi Deploy. Bien nay chi tao admin khi database chua co tai khoan; no khong ghi de mat khau admin da ton tai.

## 5. Noi luu du lieu

Stack mac dinh dung Docker named volume:

```text
cay-gia-pha-web-data
```

Volume nay duoc mount vao:

```text
/var/lib/cay-gia-pha
```

Du lieu ung dung nam tai:

```text
/var/lib/cay-gia-pha/data
```

Bao gom database SQLite, anh dai dien, logo, QR ung ho, Gallery, anh nguoi lien he, anh nha tho To va cac file can cho backup/restore.

Khong mount truc tiep volume vao `/var/lib/cay-gia-pha/data`. Ban Docker mount thu muc cha `/var/lib/cay-gia-pha` de chuc nang Restore co the doi cho thu muc `data` an toan trong cung filesystem.

## 6. Dua du lieu ban cu vao container

Cach khuyen nghi:

1. Tren website ban cu, vao **Quan tri -> Sao luu & khoi phuc**.
2. Tao file `.gpbak` co mat khau.
3. Khoi dong container moi.
4. Dang nhap admin tren container.
5. Restore file `.gpbak`.

Ban Docker da dieu chinh duong dan staging/restore de restore toan bo thu muc `data` van hoat dong khi du lieu nam trong Docker volume.

## 7. Reverse proxy / HTTPS

Neu truy cap truc tiep bang HTTP trong LAN:

```text
COOKIE_SECURE=0
TRUST_PROXY=0
```

Neu chi truy cap website qua HTTPS reverse proxy:

```text
COOKIE_SECURE=1
```

Chi dat `TRUST_PROXY=1` neu reverse proxy do ban quan ly va no ghi dung `X-Forwarded-For`.

Sau khi doi bien moi truong trong Compose/Portainer, hay recreate container thay vi chi restart.

## 8. Cap nhat image ma khong mat du lieu

Du lieu o named volume tach khoi image. Khi co source/image moi:

```bash
docker compose down
docker compose build --pull
docker compose up -d
```

Khong xoa volume `cay-gia-pha-web-data`.

Truoc khi nang cap, van nen tao mot `.gpbak` tu giao dien quan tri.

## 9. Kiem tra container

Dockerfile co `HEALTHCHECK` truy cap trang chu moi 30 giay. Co the xem:

```bash
docker inspect --format='{{json .State.Health}}' cay-gia-pha-web
```

## 10. Ghi chu ve image

Dockerfile dung Docker Official Image `node:22-bookworm-slim`. Khi `docker build`, stage `verify` tu dong chay `npm run check`; build se dung neu regression test loi. Runtime khong can `npm install` vi du an v1.0.23 khong co package phu thuoc luc chay.
