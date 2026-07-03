param()

$ErrorActionPreference = "Stop"

$frontendUrl = "http://127.0.0.1:3000"
$edgeAppId = "dpngjijhjgjcjelhmhoihafabpbjgfen"
$edgeAppUrl = "$frontendUrl/"
$browserProfileDir = Join-Path $env:LOCALAPPDATA "SMTechnoBrowserApp"

Write-Host "========================================="
Write-Host "  SM Techno - stop backend and frontend"
Write-Host "========================================="
Write-Host ""

$ports = @(3000, 8000)
foreach ($port in $ports) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) {
        Write-Host "Nothing is running on port $port."
        continue
    }

    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Stopped $($process.ProcessName) (PID $processId) on port $port."
        } catch {
            Write-Warning "Failed to stop PID $processId on port $port."
        }
    }
}

$browserProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match "^(msedge|chrome|msedge_proxy)\.exe$" -and
    $_.CommandLine -and
    (
        $_.CommandLine.Contains("--app-id=$edgeAppId") -or
        $_.CommandLine.Contains("--app-url=$edgeAppUrl") -or
        $_.CommandLine.Contains("--app=$frontendUrl") -or
        $_.CommandLine.Contains($browserProfileDir)
    )
})

if ($browserProcesses.Count -eq 0) {
    Write-Host "App browser window was not found."
} else {
    foreach ($browserProcess in $browserProcesses) {
        try {
            Stop-Process -Id $browserProcess.ProcessId -Force -ErrorAction Stop
            Write-Host "Closed app window process $($browserProcess.Name) (PID $($browserProcess.ProcessId))."
        } catch {
            Write-Warning "Failed to close browser app PID $($browserProcess.ProcessId)."
        }
    }
}

Write-Host ""
Write-Host "Done."
