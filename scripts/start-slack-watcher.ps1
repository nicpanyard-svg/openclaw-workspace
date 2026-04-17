param(
    [string]$MatonApiKey,
    [string]$ConnectionId = '2923502d-646b-426f-b2da-952319f3d379',
    [string]$DmUserId = 'U0AMU2BEKJ4',
    [int]$PollSeconds = 10,
    [switch]$PostAck
)

$ErrorActionPreference = 'Stop'
$Workspace = 'C:\Users\IkeFl\.openclaw\workspace'
$MonitoringDir = Join-Path $Workspace 'monitoring'
$PidPath = Join-Path $MonitoringDir 'slack-watcher.pid'
$StdOutPath = Join-Path $MonitoringDir 'slack-watcher.stdout.log'
$StdErrPath = Join-Path $MonitoringDir 'slack-watcher.stderr.log'

if (-not (Test-Path $MonitoringDir)) {
    New-Item -ItemType Directory -Path $MonitoringDir -Force | Out-Null
}

if (-not $MatonApiKey) {
    if ($env:MATON_API_KEY) {
        $MatonApiKey = $env:MATON_API_KEY
    } else {
        throw 'Provide -MatonApiKey or set MATON_API_KEY in the environment.'
    }
}

if (Test-Path $PidPath) {
    $existingPid = (Get-Content $PidPath -Raw).Trim()
    if ($existingPid) {
        $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Slack watcher already running with PID $existingPid"
            exit 0
        }
    }
}

$ackArg = ''
if ($PostAck) { $ackArg = '-PostAck' }
$cmd = "`$env:MATON_API_KEY='$MatonApiKey'; powershell -ExecutionPolicy Bypass -File '$Workspace\scripts\slack-watcher.ps1' -ConnectionId '$ConnectionId' -DmUserId '$DmUserId' -PollSeconds $PollSeconds $ackArg"
$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-WindowStyle','Hidden','-Command',$cmd -PassThru -RedirectStandardOutput $StdOutPath -RedirectStandardError $StdErrPath
$proc.Id | Set-Content -Path $PidPath
Write-Host "Started Slack watcher PID $($proc.Id)"
