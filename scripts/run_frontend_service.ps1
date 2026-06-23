$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendPath = Join-Path $rootPath "sm-techno-web"
$npmPath = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$buildPath = Join-Path $frontendPath ".next"

if (-not $npmPath) {
    $fallbackNpm = "C:\Program Files\nodejs\npm.cmd"
    if (Test-Path $fallbackNpm) {
        $npmPath = $fallbackNpm
    } else {
        throw "npm.cmd was not found."
    }
}

Set-Location -LiteralPath $frontendPath
if (-not (Test-Path $buildPath)) {
    & $npmPath run build
}

& $npmPath run start -- --hostname 0.0.0.0 --port 3000
