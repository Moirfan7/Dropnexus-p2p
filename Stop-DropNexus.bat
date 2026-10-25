@echo off
title Stop DropNexus Server
setlocal enabledelayedexpansion

echo ========================================================
echo         🛑 Stopping DropNexus Background Server
echo ========================================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [*] Terminating DropNexus process ID: %%a...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if "!FOUND!"=="1" (
    echo.
    echo [OK] DropNexus background server has been stopped.
) else (
    echo [*] DropNexus is not currently running.
)

echo.
ping 127.0.0.1 -n 3 >nul
exit /b 0
