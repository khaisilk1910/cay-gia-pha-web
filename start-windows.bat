@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.5 or newer.
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo Starting Cay Gia Pha Web...
node --no-warnings windows-launcher.js

if errorlevel 1 (
  echo.
  echo The server stopped because of an error.
)
echo.
echo Press any key to close this window.
pause >nul
endlocal
