[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdministrator = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    throw "Запустите PowerShell от имени администратора и выполните этот скрипт ещё раз."
}

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendScript = Join-Path $rootPath "scripts\run_backend_service.ps1"
$taskName = "SM Techno Backend"

if (-not (Test-Path -LiteralPath $backendScript)) {
    throw "Не найден скрипт запуска API: $backendScript"
}

$taskAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backendScript`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Principal $taskPrincipal `
    -Settings $taskSettings `
    -Description "Запускает API SM Techno для сайта через Tailscale Funnel." `
    -Force | Out-Null

Write-Host "Задача '$taskName' настроена: API будет запускаться при старте Windows."
