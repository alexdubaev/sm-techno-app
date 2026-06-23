@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop_sm_techno_app.ps1"
if errorlevel 1 (
    echo.
    echo Stop failed.
    pause
    exit /b 1
)
