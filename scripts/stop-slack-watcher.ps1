$ErrorActionPreference = 'Stop'
$Workspace = 'C:\Users\IkeFl\.openclaw\workspace'
$PidPath = Join-Path $Workspace 'monitoring\slack-watcher.pid'

if (-not (Test-Path $PidPath)) {
    Write-Host 'No slack watcher PID file found.'
    exit 0
}

$pidValue = (Get-Content $PidPath -Raw).Trim()
if ($pidValue) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pidValue -Force
        Write-Host "Stopped Slack watcher PID $pidValue"
    } else {
        Write-Host "Process $pidValue not running"
    }
}

Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
