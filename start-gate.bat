@echo off
setlocal
cd /d "%~dp0"
title GATE 2027 Dashboard

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 20 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

rem Already running? Then just open the browser.
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo The dashboard is already running. Opening the browser...
  start "" http://127.0.0.1:3000
  exit /b 0
)

if not exist node_modules (
  echo First run: installing packages. This needs internet only once...
  call npm install
  if errorlevel 1 goto fail
)

if not exist ".next\BUILD_ID" (
  echo Building the app. This takes a few minutes, please wait...
  call npm run build
  if errorlevel 1 goto fail
)

echo.
echo Starting the dashboard at http://127.0.0.1:3000
echo KEEP THIS WINDOW OPEN while you study. Close it to stop the app.
echo.

rem open the browser about 7 seconds from now, while the server starts
start "" /min cmd /c "ping -n 8 127.0.0.1 >nul & start http://127.0.0.1:3000"

call npm start

echo.
echo The dashboard has stopped.
pause
exit /b 0

:fail
echo.
echo Something failed. Read the message above.
pause
exit /b 1
