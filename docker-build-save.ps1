$ErrorActionPreference = "Stop"
$image = if ($env:IMAGE) { $env:IMAGE } else { "cay-gia-pha-web:1.0.27" }
$out = if ($env:OUT) { $env:OUT } else { "cay-gia-pha-web-v1.0.27-image.tar" }
docker build --pull -t $image .
docker save -o $out $image
Write-Host "Da tao image: $image"
Write-Host "Da luu image thanh: $out"
