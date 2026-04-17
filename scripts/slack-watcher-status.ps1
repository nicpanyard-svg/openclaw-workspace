$Workspace = 'C:\Users\IkeFl\.openclaw\workspace'
$MonitoringDir = Join-Path $Workspace 'monitoring'
$PidPath = Join-Path $MonitoringDir 'slack-watcher.pid'
$StatePath = Join-Path $MonitoringDir 'slack-watcher-state.json'
$LogPath = Join-Path $MonitoringDir 'slack-watcher.log'

if (Test-Path $PidPath) {
    $pidValue = (Get-Content $PidPath -Raw).Trim()
    $proc = $null
    if ($pidValue) { $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue }
    if ($proc) {
        Write-Host "Running PID: $pidValue"
    } else {
        Write-Host "PID file exists but process is not running: $pidValue"
    }
} else {
    Write-Host 'Not running'
}

if (Test-Path $StatePath) {
    Write-Host "`nState:"
    Get-Content $StatePath
}

if (Test-Path $LogPath) {
    Write-Host "`nRecent log:"
    Get-Content $LogPath -Tail 20
}
