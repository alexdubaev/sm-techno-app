$ErrorActionPreference = "Stop"

$tailscalePath = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (-not (Test-Path -LiteralPath $tailscalePath)) {
    throw "Tailscale is not installed at $tailscalePath"
}

& $tailscalePath funnel --bg http://127.0.0.1:8000
& $tailscalePath funnel status
