param()

$ErrorActionPreference = "Stop"

function Invoke-CapturedCmd {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandLine
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "cmd.exe"
  $startInfo.Arguments = "/c $CommandLine"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $combined = ($stdout + [Environment]::NewLine + $stderr).Trim()
  if ($process.ExitCode -ne 0) {
    throw "Command failed: openclaw command=`"$CommandLine`"`n$combined"
  }

  return $combined
}

function Invoke-PythonScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptText
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "python"
  $startInfo.Arguments = "-"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $process.StandardInput.Write($ScriptText)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $combined = ($stdout + [Environment]::NewLine + $stderr).Trim()
  if ($process.ExitCode -ne 0) {
    throw "Python helper failed.`n$combined"
  }

  return $stdout.Trim()
}

function Invoke-OpenClawJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Arguments
  )

  $raw = Invoke-CapturedCmd -CommandLine "openclaw $Arguments"
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "openclaw $Arguments returned no output."
  }

  $trimmed = $raw.Trim()
  $objectStart = $trimmed.IndexOf("{")
  $arrayStart = $trimmed.IndexOf("[")
  $jsonStart = if ($objectStart -lt 0) { $arrayStart } elseif ($arrayStart -lt 0) { $objectStart } else { [Math]::Min($objectStart, $arrayStart) }
  if ($jsonStart -lt 0) {
    throw "openclaw $Arguments did not return JSON."
  }

  return $trimmed.Substring($jsonStart) | ConvertFrom-Json
}

function Invoke-OpenClawText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Arguments
  )

  Invoke-CapturedCmd -CommandLine "openclaw $Arguments"
}

function Wait-ForGatewayHealth {
  param(
    [int]$Attempts = 5,
    [int]$DelaySeconds = 3
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      return Invoke-OpenClawJson -Arguments "gateway call health"
    } catch {
      $lastError = $_
      if ($attempt -lt $Attempts) {
        Start-Sleep -Seconds $DelaySeconds
      }
    }
  }

  throw $lastError
}

function Get-RecoverySnapshot {
  $taskSnapshotJson = Invoke-PythonScript -ScriptText @'
import json
import sqlite3

conn = sqlite3.connect(r"C:\Users\IkeFl\.openclaw\tasks\runs.sqlite")
cur = conn.cursor()

running = []
for row in cur.execute(
    "select task_id, runtime, coalesce(label, ''), created_at from task_runs where status='running' order by created_at desc"
):
    running.append({
        "taskId": row[0],
        "runtime": row[1],
        "label": row[2],
        "createdAt": row[3],
    })

failed = []
for row in cur.execute(
    "select task_id, runtime, coalesce(label, ''), created_at from task_runs where error like '%acpx exited with code 1%' order by created_at desc limit 25"
):
    failed.append({
        "taskId": row[0],
        "runtime": row[1],
        "label": row[2],
        "createdAt": row[3],
    })

conn.close()
print(json.dumps({"runningTasks": running, "failedCode1": failed}))
'@
  $taskSnapshot = $taskSnapshotJson | ConvertFrom-Json
  $runningTasks = @($taskSnapshot.runningTasks)
  $failedCode1 = @($taskSnapshot.failedCode1)
  $duplicateRunningLabels = @(
    $runningTasks |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_.label) } |
      Group-Object label |
      Where-Object { $_.Count -gt 1 } |
      Select-Object Name, Count
  )

  $sessionRegistryPath = "C:\Users\IkeFl\.openclaw\agents\codex\sessions\sessions.json"
  $missingSessionFiles = @()
  if (Test-Path $sessionRegistryPath) {
    $sessionRegistry = Get-Content -Path $sessionRegistryPath -Raw | ConvertFrom-Json
    $missingSessionFiles = @(
      @($sessionRegistry.sessions) |
        Where-Object {
          $_.acp -and
          $_.acp.lastError -eq "acpx exited with code 1" -and
          $_.sessionFile -and
          -not (Test-Path $_.sessionFile)
        } |
        Select-Object id, label, sessionFile, updatedAt
    )
  }

  [pscustomobject]@{
    RunningTasks = $runningTasks
    FailedCode1 = $failedCode1
    DuplicateRunningLabels = $duplicateRunningLabels
    MissingSessionFiles = $missingSessionFiles
  }
}

function Write-Snapshot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Snapshot
  )

  Write-Host ""
  Write-Host "=== $Title ==="
  Write-Host "Running tasks: $($Snapshot.RunningTasks.Count)"
  Write-Host "Recent failed ACP launches (code 1): $($Snapshot.FailedCode1.Count)"
  Write-Host "Missing session files in registry: $($Snapshot.MissingSessionFiles.Count)"

  if ($Snapshot.DuplicateRunningLabels.Count -gt 0) {
    Write-Host "Duplicate running labels:"
    $Snapshot.DuplicateRunningLabels | ForEach-Object {
      Write-Host "  $($_.Name) x$($_.Count)"
    }
  }

  if ($Snapshot.RunningTasks.Count -gt 0) {
    Write-Host "Oldest running labels:"
    $Snapshot.RunningTasks |
      Select-Object -First 9 runtime, label, createdAt |
      ForEach-Object {
        $label = if ([string]::IsNullOrWhiteSpace($_.label)) { "(no label)" } else { $_.label }
        Write-Host "  [$($_.runtime)] $label"
      }
  }
}

Write-Host "Checking gateway health before cleanup..."
$beforeHealth = Wait-ForGatewayHealth
Write-Host "Gateway ok: $($beforeHealth.ok)"

$before = Get-RecoverySnapshot
Write-Snapshot -Title "Before recovery" -Snapshot $before

Write-Host ""
Write-Host "Running built-in task maintenance..."
Invoke-OpenClawText -Arguments "tasks maintenance --apply" | Write-Host

Write-Host ""
Write-Host "Restarting gateway..."
& "$PSScriptRoot\restart-gateway.ps1"

Write-Host ""
Write-Host "Checking gateway health after restart..."
$afterHealth = Wait-ForGatewayHealth
Write-Host "Gateway ok: $($afterHealth.ok)"

$after = Get-RecoverySnapshot
Write-Snapshot -Title "After recovery" -Snapshot $after

if (-not $afterHealth.ok) {
  Write-Error "Gateway health is not OK after recovery. UNSAFE_TO_RESPAWN"
}

if ($after.RunningTasks.Count -gt 0) {
  Write-Error "Stale running tasks remain after maintenance and restart. UNSAFE_TO_RESPAWN"
}

Write-Host ""
Write-Host "SAFE_TO_RESPAWN"
