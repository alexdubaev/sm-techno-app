$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonPath = Join-Path $rootPath ".venv\Scripts\python.exe"

Set-Location -LiteralPath $rootPath
& $pythonPath -m uvicorn stock_sync_api:app --host 0.0.0.0 --port 8000
