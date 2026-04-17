# Usage: spawn-coding-session.ps1 -Agent "Codex" -Task "description" -Prompt "full prompt" -SessionId "uuid"
param(
    [string]$Agent = "Codex",
    [string]$Task = "Coding task",
    [string]$Prompt,
    [string]$SessionId,
    [string]$Workdir = "C:\Users\IkeFl\.openclaw\workspace"
)

$logFile = "C:\Users\IkeFl\AppData\Local\Temp\openclaw\coding-session-$SessionId.log"
$dataFile = "C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\coding-sessions.json"

# Register session
$data = Get-Content $dataFile | ConvertFrom-Json
$session = [PSCustomObject]@{
    id        = $SessionId
    agent     = $Agent
    task      = $Task
    status    = "running"
    startedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")
    logFile   = $logFile
    output    = ""
}
$existing = $data.sessions | Where-Object { $_.id -eq $SessionId }
if (-not $existing) {
    $data.sessions += $session
}
$data | ConvertTo-Json -Depth 10 | Set-Content $dataFile

# Create log dir
$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Run Codex and stream to log
"[$(Get-Date -Format 'HH:mm:ss')] Session started: $Task`n" | Set-Content $logFile

try {
    & codex exec --full-auto $Prompt 2>&1 | ForEach-Object {
        $line = "[$(Get-Date -Format 'HH:mm:ss')] $_"
        $line | Add-Content $logFile
    }
    # Mark done
    $data = Get-Content $dataFile | ConvertFrom-Json
    $s = $data.sessions | Where-Object { $_.id -eq $SessionId }
    $s.status = "done"
    $s.output = (Get-Content $logFile -Tail 5 -Raw)
    $data | ConvertTo-Json -Depth 10 | Set-Content $dataFile
    "[$(Get-Date -Format 'HH:mm:ss')] Session complete." | Add-Content $logFile
} catch {
    "[$(Get-Date -Format 'HH:mm:ss')] ERROR: $_" | Add-Content $logFile
    $data = Get-Content $dataFile | ConvertFrom-Json
    $s = $data.sessions | Where-Object { $_.id -eq $SessionId }
    $s.status = "error"
    $data | ConvertTo-Json -Depth 10 | Set-Content $dataFile
}
