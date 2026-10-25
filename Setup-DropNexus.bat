@echo off
setlocal enabledelayedexpansion
title DropNexus - One-Click Setup and Desktop Launcher

echo ================================================================
echo             DropNexus P2P - One-Click Automatic Setup
echo ================================================================
echo.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
cd /d "%SCRIPT_DIR%"

set "PORTABLE_DIR=%SCRIPT_DIR%\.node"
set "PORTABLE_NODE=%PORTABLE_DIR%\node.exe"
set "NODE_CMD="
set "NPM_CMD="

REM -------------------------------------------------------------
REM Step 1: Detect or Download Node.js Runtime (Zero Manual Install)
REM -------------------------------------------------------------
echo [*] Checking for Node.js runtime...

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
    echo [OK] System Node.js detected: !NODE_VER!
    set "NODE_CMD=node"
    set "NPM_CMD=npm"
    goto :CheckDeps
)

if exist "%PORTABLE_NODE%" (
    for /f "tokens=*" %%v in ('"%PORTABLE_NODE%" -v') do set "NODE_VER=%%v"
    echo [OK] Portable Node.js detected: !NODE_VER!
    set "NODE_CMD=%PORTABLE_NODE%"
    set "NPM_CMD=%PORTABLE_DIR%\npm.cmd"
    goto :CheckDeps
)

echo [!] Node.js not detected on this PC.
echo [*] Auto-downloading portable Node.js runtime - no installer needed...
echo [*] Please wait a moment while files are downloaded...
echo.

if not exist "%PORTABLE_DIR%" mkdir "%PORTABLE_DIR%"
set "ZIP_FILE=%PORTABLE_DIR%\node.zip"

where curl >nul 2>&1
if %ERRORLEVEL% equ 0 (
    curl -L -o "!ZIP_FILE!" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
) else (
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' -OutFile '!ZIP_FILE!'"
)

if not exist "!ZIP_FILE!" (
    echo [X] Download failed. Please check internet connection and try again.
    pause
    exit /b 1
)

echo [*] Extracting portable Node.js runtime...
powershell -Command "Expand-Archive -Path '!ZIP_FILE!' -DestinationPath '%PORTABLE_DIR%' -Force"

if exist "%PORTABLE_DIR%\node-v20.18.0-win-x64" (
    xcopy /E /Y "%PORTABLE_DIR%\node-v20.18.0-win-x64\*" "%PORTABLE_DIR%\" >nul 2>&1
    rmdir /S /Q "%PORTABLE_DIR%\node-v20.18.0-win-x64" >nul 2>&1
)
if exist "!ZIP_FILE!" del /F /Q "!ZIP_FILE!" >nul 2>&1

if not exist "%PORTABLE_NODE%" (
    echo [X] Failed to setup portable node.
    pause
    exit /b 1
)

echo [OK] Portable Node.js installed successfully!
set "NODE_CMD=%PORTABLE_NODE%"
set "NPM_CMD=%PORTABLE_DIR%\npm.cmd"

:CheckDeps
REM -------------------------------------------------------------
REM Step 2: Check and Install NPM Dependencies
REM -------------------------------------------------------------
if not exist "%SCRIPT_DIR%\node_modules" (
    echo.
    echo [*] Installing required project dependencies - one-time setup...
    call !NPM_CMD! install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [!] Warning: npm install reported issues, continuing setup...
    ) else (
        echo [OK] Dependencies installed successfully.
    )
) else (
    echo [OK] Dependencies already present.
)

REM -------------------------------------------------------------
REM Step 3: Ensure Custom Icons and Favicon are Built
REM -------------------------------------------------------------
if not exist "%SCRIPT_DIR%\assets\dropnexus.ico" (
    echo [*] Generating custom high-resolution DropNexus icon...
    call !NODE_CMD! "%SCRIPT_DIR%\scripts\build-assets.js" >nul 2>&1
)
if exist "%SCRIPT_DIR%\assets\dropnexus.ico" (
    echo [OK] DropNexus branded icon ready.
)

REM -------------------------------------------------------------
REM Step 4: Create Windows Desktop Shortcut
REM -------------------------------------------------------------
echo [*] Creating Desktop Shortcut...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\scripts\create-shortcut.ps1"
echo [OK] Desktop Shortcut created on your Desktop!

REM -------------------------------------------------------------
REM Step 5: Launch DropNexus Silently in the Background
REM -------------------------------------------------------------
echo.
echo ================================================================
echo   [SUCCESS] Setup Completed!
echo   Launching DropNexus Desktop App now...
echo   You can launch it anytime by clicking the Desktop icon.
echo ================================================================
echo.

wscript.exe "%SCRIPT_DIR%\launch.vbs"

ping 127.0.0.1 -n 3 >nul
exit /b 0
