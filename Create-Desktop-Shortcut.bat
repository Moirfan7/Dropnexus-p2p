@echo off
title Create DropNexus Desktop Shortcut
setlocal enabledelayedexpansion

echo ================================================================
echo             DropNexus - Desktop Shortcut Creator
echo ================================================================
echo.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

echo [*] Creating DropNexus shortcut on your Desktop...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\scripts\create-shortcut.ps1"

echo.
echo [OK] Desktop Shortcut created successfully!
echo You can now find the 'DropNexus' icon on your Desktop.
echo.
ping 127.0.0.1 -n 3 >nul
exit /b 0
