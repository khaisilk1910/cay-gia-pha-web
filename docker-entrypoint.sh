#!/bin/sh
set -eu

STORAGE_ROOT="${STORAGE_ROOT:-/var/lib/cay-gia-pha}"
APP_DIR="${APP_DIR:-${STORAGE_ROOT}/app}"
DATA_DIR="${DATA_DIR:-${STORAGE_ROOT}/data}"
APP_SEED_DIR="${APP_SEED_DIR:-/opt/cay-gia-pha-image/app}"

export STORAGE_ROOT APP_DIR DATA_DIR

if [ ! -d "$APP_SEED_DIR" ] || [ ! -f "$APP_SEED_DIR/.image-build-id" ]; then
  echo "[cay-gia-pha] Khong tim thay bo ma ung dung trong image: $APP_SEED_DIR" >&2
  exit 1
fi

mkdir -p "$STORAGE_ROOT" "$DATA_DIR" "$DATA_DIR/uploads"

seed_id="$(cat "$APP_SEED_DIR/.image-build-id")"
current_id=""
if [ -f "$APP_DIR/.image-build-id" ]; then
  current_id="$(cat "$APP_DIR/.image-build-id" 2>/dev/null || true)"
fi

if [ "$seed_id" != "$current_id" ]; then
  staging="${STORAGE_ROOT}/.app-staging-$$"
  previous="${STORAGE_ROOT}/.app-previous-$$"
  rm -rf "$staging" "$previous"
  mkdir -p "$staging"
  cp -a "$APP_SEED_DIR/." "$staging/"

  if [ -e "$APP_DIR" ]; then
    mv "$APP_DIR" "$previous"
  fi

  if mv "$staging" "$APP_DIR"; then
    rm -rf "$previous"
    echo "[cay-gia-pha] Da dong bo ma ung dung vao $APP_DIR"
  else
    rm -rf "$staging"
    if [ -e "$previous" ] && [ ! -e "$APP_DIR" ]; then
      mv "$previous" "$APP_DIR" || true
    fi
    echo "[cay-gia-pha] Khong the cap nhat thu muc ung dung $APP_DIR" >&2
    exit 1
  fi
fi

cd "$APP_DIR"
exec "$@"
