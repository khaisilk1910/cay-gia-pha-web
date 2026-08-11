#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Cần cài Node.js 22.5 trở lên: https://nodejs.org/"
  exit 1
fi
if ! node --no-warnings -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Phiên bản Node.js hiện tại chưa hỗ trợ node:sqlite. Hãy cài Node.js 22.5 trở lên."
  exit 1
fi
(
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open http://127.0.0.1:8787 >/dev/null 2>&1
  elif command -v open >/dev/null 2>&1; then open http://127.0.0.1:8787 >/dev/null 2>&1
  fi
) &
node --no-warnings server.js
