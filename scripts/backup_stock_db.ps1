param()

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dbPath = Join-Path $rootPath "stock_sync.db"
$backupDir = Join-Path $rootPath "backups"
$transferDir = Join-Path $rootPath "transfer"
$transferFile = Join-Path $transferDir "stock_sync_portable.db"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

function Test-AppRunning {
    $ports = @(3000, 8000)
    foreach ($port in $ports) {
        $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($connections.Count -gt 0) {
            return $true
        }
    }

    return $false
}

Write-Host "========================================="
Write-Host "  SM Techno - backup local database"
Write-Host "========================================="
Write-Host ""

if (-not (Test-Path $dbPath)) {
    throw "Database file was not found: $dbPath"
}

if (Test-AppRunning) {
    throw "Application is still running. Close the app first, then run backup again."
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
New-Item -ItemType Directory -Force -Path $transferDir | Out-Null

$backupFile = Join-Path $backupDir "stock_sync_$timestamp.db"

Copy-Item -LiteralPath $dbPath -Destination $backupFile -Force
Copy-Item -LiteralPath $dbPath -Destination $transferFile -Force

Write-Host "Backup created:"
Write-Host "  $backupFile"
Write-Host ""
Write-Host "Portable copy updated:"
Write-Host "  $transferFile"
Write-Host ""
Write-Host "This file can now be copied to the other computer."
