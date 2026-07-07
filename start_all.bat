@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\start_sm_techno_app.ps1"
if errorlevel 1 (
    echo.
    echo Start failed.
    pause
    exit /b 1
)
