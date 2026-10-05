@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title GATE 2027 Dashboard

echo ============================================
echo       GATE 2027 Dashboard - Starting
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  echo Reinstall Node.js LTS and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Keep this BAT file in the same folder as package.json.
  echo.
  pause
  exit /b 1
)

echo [OK] Node.js and npm found.
echo [OK] Dashboard project found.
echo.

if not exist "node_modules" (
  echo Installing dashboard dependencies...
  echo This can take a few minutes on the first run.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    echo Check your internet connection and run this BAT again.
    pause
    exit /b 1
  )
)

if not exist "public\pdf.worker.min.js" (
  echo Preparing PDF support...
  call npm run postinstall
  if errorlevel 1 (
    echo [WARNING] PDF worker setup failed. The dashboard will still be started.
  )
)

echo.
echo Starting dashboard server...
start "GATE 2027 Dashboard Server" /min cmd /c "npm run dev"

echo Waiting for the dashboard to start...
timeout /t 5 /nobreak >nul

start "" "http://127.0.0.1:3000"

echo.
echo Dashboard: http://127.0.0.1:3000
echo.
echo Keep the server window running while using the dashboard.
echo To stop the server, close the minimized "GATE 2027 Dashboard Server" window.
echo.
endlocal
exit /b 0
