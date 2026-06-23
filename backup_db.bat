@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\backup_stock_db.ps1"
if errorlevel 1 (
    echo.
    echo Backup failed.
    pause
    exit /b 1
)

echo.
pause
