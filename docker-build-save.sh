#!/bin/sh
set -eu
IMAGE="${IMAGE:-cay-gia-pha-web:1.0.33}"
OUT="${OUT:-cay-gia-pha-web-v1.0.33-image.tar}"
docker build --pull -t "$IMAGE" .
docker save -o "$OUT" "$IMAGE"
echo "Da tao image: $IMAGE"
echo "Da luu image thanh: $OUT"
