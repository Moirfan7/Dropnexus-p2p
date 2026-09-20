@echo off
title Launching Android Emulator Window...
echo ========================================================
echo   Launching Android Emulator (medium_phone)...
echo ========================================================
cd /d "%LOCALAPPDATA%\Android\Sdk\emulator"
start emulator.exe -avd medium_phone
echo Emulator window opened on your desktop!
pause
