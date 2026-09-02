[CmdletBinding()]
param(
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdministrator = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    throw "Запустите PowerShell от имени администратора и выполните этот скрипт ещё раз."
}

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverScript = Join-Path $rootPath "scripts\run_sm_techno_server.ps1"
$taskName = "SM Techno Server"
$legacyTaskName = "SM Techno Backend"

if (-not (Test-Path -LiteralPath $serverScript)) {
    throw "Не найден supervisor SM Techno: $serverScript"
}

if ($Remove) {
    foreach ($name in @($taskName, $legacyTaskName)) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "Задача '$name' удалена."
        }
    }
    exit 0
}

$powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$taskAction = New-ScheduledTaskAction `
    -Execute $powershellPath `
    -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$serverScript`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

if (Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Principal $taskPrincipal `
    -Settings $taskSettings `
    -Description "Запускает и контролирует backend, frontend и Tailscale Funnel SM Techno." `
    -Force | Out-Null

Write-Host "Задача '$taskName' настроена: backend, frontend и Tailscale Funnel будут запускаться при старте Windows."
