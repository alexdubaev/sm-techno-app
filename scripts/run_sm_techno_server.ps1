[CmdletBinding()]
param(
    [int]$PollIntervalSeconds = 15,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendScript = Join-Path $rootPath "scripts\run_backend_service.ps1"
$frontendScript = Join-Path $rootPath "scripts\run_frontend_service.ps1"
$backendHealthUrl = "http://127.0.0.1:8000/api/health"
$frontendUrl = "http://127.0.0.1:3000"
$logDirectory = Join-Path $rootPath "logs"
$logPath = Join-Path $logDirectory "sm-techno-server.log"
$windowsPowerShellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$tailscalePath = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
$mutexName = "Global\SMTechnoServerSupervisor"
$pollInterval = [Math]::Max(5, $PollIntervalSeconds)
$lastFunnelRepairAt = [DateTime]::MinValue

if (-not (Test-Path -LiteralPath $backendScript)) {
    throw "Не найден скрипт запуска API: $backendScript"
}

if (-not (Test-Path -LiteralPath $frontendScript)) {
    throw "Не найден скрипт запуска frontend: $frontendScript"
}

if (-not (Test-Path -LiteralPath $windowsPowerShellPath)) {
    throw "Не найден Windows PowerShell: $windowsPowerShellPath"
}

if (-not (Test-Path -LiteralPath $tailscalePath)) {
    $tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($tailscaleCommand) {
        $tailscalePath = $tailscaleCommand.Source
    }
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-Log {
    param([string]$Message)

    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}

function Test-PortListening {
    param([int]$Port)

    return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count -gt 0
}

function Test-UrlReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 3
    )

    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return $true
    } catch {
        return $false
    }
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$MaxSeconds = 45
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

function Start-ManagedScript {
    param(
        [string]$ScriptPath,
        [string]$Label
    )

    Write-Log "Starting $Label."
    Start-Process -FilePath $windowsPowerShellPath `
        -ArgumentList @(
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            $ScriptPath
        ) `
        -WorkingDirectory $rootPath `
        -WindowStyle Hidden | Out-Null
}

function Start-BackendIfNeeded {
    if (Test-UrlReady -Url $backendHealthUrl) {
        return [PSCustomObject]@{ Ready = $true; Wait = $false }
    }

    if (Test-PortListening -Port 8000) {
        Write-Log "Backend port 8000 is occupied, but health check failed."
        return [PSCustomObject]@{ Ready = $false; Wait = $false }
    }

    Start-ManagedScript -ScriptPath $backendScript -Label "backend"
    return [PSCustomObject]@{ Ready = $false; Wait = $true }
}

function Start-FrontendIfNeeded {
    if (Test-UrlReady -Url $frontendUrl) {
        return [PSCustomObject]@{ Ready = $true; Wait = $false }
    }

    if (Test-PortListening -Port 3000) {
        Write-Log "Frontend port 3000 is occupied, but health check failed."
        return [PSCustomObject]@{ Ready = $false; Wait = $false }
    }

    Start-ManagedScript -ScriptPath $frontendScript -Label "frontend"
    return [PSCustomObject]@{ Ready = $false; Wait = $true }
}

function Wait-ForLocalServices {
    param(
        [bool]$BackendReady,
        [bool]$BackendWait,
        [bool]$FrontendReady,
        [bool]$FrontendWait
    )

    $backendWasWaiting = $BackendWait
    $frontendWasWaiting = $FrontendWait
    $backendDeadline = (Get-Date).AddSeconds(30)
    $frontendDeadline = (Get-Date).AddSeconds(60)
    while (($BackendWait -and -not $BackendReady) -or ($FrontendWait -and -not $FrontendReady)) {
        if ($BackendWait -and -not $BackendReady) {
            $BackendReady = Test-UrlReady -Url $backendHealthUrl
            if (-not $BackendReady -and (Get-Date) -ge $backendDeadline) {
                $BackendWait = $false
                Write-Log "Backend did not become ready."
            }
        }

        if ($FrontendWait -and -not $FrontendReady) {
            $FrontendReady = Test-UrlReady -Url $frontendUrl
            if (-not $FrontendReady -and (Get-Date) -ge $frontendDeadline) {
                $FrontendWait = $false
                Write-Log "Frontend did not become ready."
            }
        }

        if (($BackendWait -and -not $BackendReady) -or ($FrontendWait -and -not $FrontendReady)) {
            Start-Sleep -Milliseconds 700
        }
    }

    if ($BackendReady -and $backendWasWaiting) {
        Write-Log "Backend is ready."
    }
    if ($FrontendReady -and $frontendWasWaiting) {
        Write-Log "Frontend is ready."
    }
    return [PSCustomObject]@{ BackendReady = $BackendReady; FrontendReady = $FrontendReady }
}

function Ensure-TailscaleService {
    $service = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Log "Tailscale service was not found."
        return $false
    }

    if ($service.Status -ne "Running") {
        Write-Log "Starting Tailscale service."
        Start-Service -Name "Tailscale"
        $service.WaitForStatus("Running", (New-TimeSpan -Seconds 30))
    }

    return $true
}

function Test-FunnelConfiguration {
    if (-not (Test-Path -LiteralPath $tailscalePath)) {
        return $false
    }

    try {
        $rawStatus = & $tailscalePath funnel status --json 2>$null | Out-String
        if ([string]::IsNullOrWhiteSpace($rawStatus)) {
            return $false
        }

        $status = $rawStatus | ConvertFrom-Json
        if ($null -eq $status.Web) {
            return $false
        }

        foreach ($webEntry in $status.Web.PSObject.Properties) {
            $handlersProperty = $webEntry.Value.PSObject.Properties["Handlers"]
            if ($null -eq $handlersProperty) {
                continue
            }

            $rootHandler = $handlersProperty.Value.PSObject.Properties["/"]
            if ($null -ne $rootHandler -and $rootHandler.Value.Proxy -eq "http://127.0.0.1:8000") {
                return $true
            }
        }
    } catch {
        return $false
    }

    return $false
}

function Get-FunnelPublicHealthUrl {
    if (-not (Test-Path -LiteralPath $tailscalePath)) {
        return $null
    }

    try {
        $rawStatus = & $tailscalePath funnel status --json 2>$null | Out-String
        if ([string]::IsNullOrWhiteSpace($rawStatus)) {
            return $null
        }

        $status = $rawStatus | ConvertFrom-Json
        foreach ($webEntry in $status.Web.PSObject.Properties) {
            $handlersProperty = $webEntry.Value.PSObject.Properties["Handlers"]
            if ($null -eq $handlersProperty) {
                continue
            }

            $rootHandler = $handlersProperty.Value.PSObject.Properties["/"]
            if ($null -ne $rootHandler -and $rootHandler.Value.Proxy -eq "http://127.0.0.1:8000") {
                $hostname = $webEntry.Name -replace ":443$", ""
                return "https://$hostname/api/health"
            }
        }
    } catch {
        return $null
    }

    return $null
}

function Ensure-Funnel {
    if (-not (Ensure-TailscaleService)) {
        return $false
    }

    $publicHealthUrl = Get-FunnelPublicHealthUrl
    if ($publicHealthUrl -and (Test-UrlReady -Url $publicHealthUrl -TimeoutSeconds 5)) {
        return $true
    }

    if ((Get-Date) -lt $script:lastFunnelRepairAt.AddMinutes(1)) {
        return $false
    }

    $script:lastFunnelRepairAt = Get-Date
    if ($publicHealthUrl) {
        Write-Log "Tailscale Funnel public health check failed: $publicHealthUrl"
    } else {
        Write-Log "Tailscale Funnel route is missing or unreadable."
    }

    Write-Log "Restoring Tailscale Funnel route to backend."
    $resetResult = & $tailscalePath funnel reset 2>&1 | Out-String
    if (-not [string]::IsNullOrWhiteSpace($resetResult)) {
        Write-Log ($resetResult.Trim())
    }

    $result = & $tailscalePath funnel --bg http://127.0.0.1:8000 2>&1 | Out-String
    if (-not [string]::IsNullOrWhiteSpace($result)) {
        Write-Log ($result.Trim())
    }

    Start-Sleep -Seconds 3
    $publicHealthUrl = Get-FunnelPublicHealthUrl
    if ($publicHealthUrl -and (Wait-ForUrl -Url $publicHealthUrl -MaxSeconds 20)) {
        Write-Log "Tailscale Funnel is ready."
        return $true
    }

    Write-Log "Tailscale Funnel is not ready."
    return $false
}

$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$mutexAcquired = $mutex.WaitOne(0)
if (-not $mutexAcquired) {
    Write-Log "Another SM Techno server supervisor is already running."
    $mutex.Dispose()
    exit 0
}

$lastReadyState = $null
$exitCode = 0

try {
    do {
        $backendStartup = Start-BackendIfNeeded
        $frontendStartup = Start-FrontendIfNeeded
        $localReadiness = Wait-ForLocalServices `
            -BackendReady $backendStartup.Ready `
            -BackendWait $backendStartup.Wait `
            -FrontendReady $frontendStartup.Ready `
            -FrontendWait $frontendStartup.Wait
        $backendReady = $localReadiness.BackendReady
        $frontendReady = $localReadiness.FrontendReady
        $funnelReady = $backendReady -and (Ensure-Funnel)
        $ready = $backendReady -and $frontendReady -and $funnelReady

        if ($lastReadyState -ne $ready) {
            if ($ready) {
                Write-Log "SM Techno server contour is ready."
            } else {
                Write-Log "SM Techno server contour is waiting for a service."
            }
            $lastReadyState = $ready
        }

        if ($Once) {
            if (-not $ready) {
                $exitCode = 1
            }
            break
        }

        Start-Sleep -Seconds $pollInterval
    } while ($true)
} catch {
    Write-Log "Supervisor error: $($_.Exception.Message)"
    $exitCode = 1
} finally {
    if ($mutexAcquired) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}

exit $exitCode
