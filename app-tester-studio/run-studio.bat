@echo off
title AppForge Studio - Mobile Emulator ^& Bug Testing Platform
echo ========================================================
echo   Starting AppForge Studio...
echo ========================================================
cd /d "%~dp0"
start http://localhost:4000
node server.js
pause
