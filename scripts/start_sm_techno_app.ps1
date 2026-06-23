param(
    [switch]$SkipBrowser,
    [switch]$ShowServerWindows
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendPath = Join-Path $rootPath "sm-techno-web"
$pythonPath = Join-Path $rootPath ".venv\Scripts\python.exe"
$npmPath = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$frontendUrl = "http://127.0.0.1:3000"
$backendUrl = "http://127.0.0.1:8000"
$backendHealthUrl = "$backendUrl/api/health"
$browserProfileDir = Join-Path $env:LOCALAPPDATA "SMTechnoBrowserApp"
$startedBackend = $false
$startedFrontend = $false
$browserStartedInAppMode = $false

if (-not (Test-Path $pythonPath)) {
    throw "Python not found: $pythonPath"
}

if (-not (Test-Path $powershellPath)) {
    throw "PowerShell not found: $powershellPath"
}

if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    throw "Frontend dependencies were not found in $frontendPath\nRun: cd /d $frontendPath && npm install"
}

if (-not $npmPath) {
    $fallbackNpm = "C:\Program Files\nodejs\npm.cmd"
    if (Test-Path $fallbackNpm) {
        $npmPath = $fallbackNpm
    } else {
        throw "npm.cmd was not found."
    }
}

$envLocalPath = Join-Path $frontendPath ".env.local"
$envExamplePath = Join-Path $frontendPath ".env.local.example"
if (-not (Test-Path $envLocalPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envLocalPath -Force
}

function Test-PortListening {
    param([int]$Port)

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    return $listeners.Count -gt 0
}

function Test-UrlReady {
    param([string]$Url)

    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$MaxSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-UrlReady -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    }

    return $false
}

function Get-BrowserPath {
    $candidates = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-TailscaleIpv4 {
    $tailscaleCommand = (Get-Command tailscale.exe -ErrorAction SilentlyContinue).Source
    if (-not $tailscaleCommand) {
        $candidate = "C:\Program Files\Tailscale\tailscale.exe"
        if (Test-Path $candidate) {
            $tailscaleCommand = $candidate
        }
    }

    if (-not $tailscaleCommand) {
        return $null
    }

    try {
        $addresses = & $tailscaleCommand ip -4 2>$null
        foreach ($address in $addresses) {
            $trimmed = [string]$address
            if ($trimmed -match '^\d+\.\d+\.\d+\.\d+$') {
                return $trimmed
            }
        }
    } catch {
        return $null
    }

    return $null
}

function Get-AppBrowserProcesses {
    return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match "^(msedge|chrome)\.exe$" -and
        $_.CommandLine -and
        (
            $_.CommandLine.Contains("--app=$frontendUrl") -or
            $_.CommandLine.Contains($browserProfileDir)
        )
    })
}

function Wait-ForBrowserAppExit {
    param([int]$MaxSeconds = 86400)

    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        $browserProcesses = Get-AppBrowserProcesses
        if ($browserProcesses.Count -eq 0) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Stop-ListeningProcesses {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($connections.Count -eq 0) {
            continue
        }

        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $processIds) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
            } catch {
                Write-Warning "Failed to stop PID $processId on port $port."
            }
        }
    }
}

$windowStyle = if ($ShowServerWindows) { "Normal" } else { "Hidden" }

Write-Host "=========================================="
Write-Host "  SM Techno - start backend and frontend"
Write-Host "=========================================="
Write-Host ""

try {
    if (-not (Test-PortListening -Port 8000)) {
        Write-Host "Starting backend on $backendUrl"
        Start-Process -FilePath $powershellPath `
            -ArgumentList @(
                "-NoLogo",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                (Join-Path $rootPath "scripts\run_backend_service.ps1")
            ) `
            -WorkingDirectory $rootPath `
            -WindowStyle $windowStyle | Out-Null
        $startedBackend = $true
    } else {
        Write-Host "Backend already running on port 8000"
    }

    if (-not (Test-PortListening -Port 3000)) {
        Write-Host "Starting frontend on $frontendUrl"
        Start-Process -FilePath $powershellPath `
            -ArgumentList @(
                "-NoLogo",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                (Join-Path $rootPath "scripts\run_frontend_service.ps1")
            ) `
            -WorkingDirectory $frontendPath `
            -WindowStyle $windowStyle | Out-Null
        $startedFrontend = $true
    } else {
        Write-Host "Frontend already running on port 3000"
    }

    if (-not (Wait-ForUrl -Url $backendHealthUrl -MaxSeconds 20)) {
        Write-Warning "Backend did not answer in time: $backendHealthUrl"
    }

    if (-not (Wait-ForUrl -Url $frontendUrl -MaxSeconds 45)) {
        throw "Frontend did not answer in time: $frontendUrl"
    }

    if (-not $SkipBrowser) {
        $browserPath = Get-BrowserPath

        if ($browserPath) {
            Write-Host "Opening app window in browser app mode"
            Start-Process -FilePath $browserPath `
                -ArgumentList @(
                    "--app=$frontendUrl",
                    "--new-window",
                    "--window-size=1600,1000",
                    "--user-data-dir=$browserProfileDir",
                    "--no-first-run",
                    "--no-default-browser-check"
                ) | Out-Null
            $browserStartedInAppMode = $true
        } else {
            Write-Warning "Edge/Chrome not found. Opening default browser instead."
            Write-Warning "Automatic stop on close is unavailable in this fallback mode."
            Start-Process $frontendUrl | Out-Null
        }
    }

    Write-Host ""
    Write-Host "Done."
    Write-Host "Backend:  $backendUrl"
    Write-Host "Frontend: $frontendUrl"

    $tailscaleIp = Get-TailscaleIpv4
    if ($tailscaleIp) {
        Write-Host "Tailscale access: http://$tailscaleIp`:3000"
        Write-Host "Tailscale API:    http://$tailscaleIp`:8000"
    }

    if ($browserStartedInAppMode) {
        Write-Host "Auto-stop is active and will stop started services when the app window closes."
        Start-Sleep -Seconds 2
        [void](Wait-ForBrowserAppExit)
    }
}
finally {
    if ($browserStartedInAppMode) {
        $portsToStop = @()
        if ($startedFrontend) {
            $portsToStop += 3000
        }
        if ($startedBackend) {
            $portsToStop += 8000
        }

        if ($portsToStop.Count -gt 0) {
            Stop-ListeningProcesses -Ports $portsToStop
        }
    }
}
