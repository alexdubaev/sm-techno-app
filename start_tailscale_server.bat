@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo ==========================================
echo   SM Techno - Tailscale server mode
echo ==========================================
echo.
echo This mode keeps backend/frontend running
echo for access from other computers.
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\start_sm_techno_app.ps1" -SkipBrowser
if errorlevel 1 (
    echo.
    echo Start failed.
    pause
    exit /b 1
)

echo.
echo Server mode is active.
echo Use stop_all.bat to stop services later.
echo.
pause
