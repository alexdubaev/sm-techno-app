param()

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dbPath = Join-Path $rootPath "stock_sync.db"
$backupDir = Join-Path $rootPath "backups"
$transferFile = Join-Path $rootPath "transfer\stock_sync_portable.db"
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
Write-Host "  SM Techno - restore local database"
Write-Host "========================================="
Write-Host ""

if (Test-AppRunning) {
    throw "Application is still running. Close the app first, then run restore again."
}

if (-not (Test-Path $transferFile)) {
    throw "Portable database was not found: $transferFile`nCopy stock_sync_portable.db into the transfer folder first."
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

if (Test-Path $dbPath) {
    $beforeRestoreFile = Join-Path $backupDir "stock_sync_before_restore_$timestamp.db"
    Copy-Item -LiteralPath $dbPath -Destination $beforeRestoreFile -Force
    Write-Host "Previous local database saved:"
    Write-Host "  $beforeRestoreFile"
    Write-Host ""
}

Copy-Item -LiteralPath $transferFile -Destination $dbPath -Force

Write-Host "Restore completed."
Write-Host "Active database replaced from:"
Write-Host "  $transferFile"
