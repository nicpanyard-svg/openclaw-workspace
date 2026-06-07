# restart-gateway.ps1
# Kills ALL openclaw gateway instances, then starts a clean one
# Run this instead of openclaw gateway restart to avoid duplicate processes

function Get-WslPrimaryIp {
  try {
    $ip = (wsl -d Ubuntu -- bash -lc "hostname -I | cut -d ' ' -f 1").Trim()
    if ($ip) { return $ip }
  } catch {
  }
  return $null
}

function Refresh-OpenClawSshTarget {
  $configPath = "C:\Users\IkeFl\.openclaw\openclaw.json"
  if (!(Test-Path $configPath)) { return }

  $wslIp = Get-WslPrimaryIp
  if (!$wslIp) {
    Write-Host "WSL IP not available; leaving OpenClaw SSH target unchanged."
    return
  }

  & netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=22 2>$null | Out-Null
  & netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=22 2>$null | Out-Null
  & netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=22 connectaddress=$wslIp connectport=22 | Out-Null
  Write-Host "Forwarding localhost port 22 to WSL sshd at ${wslIp}:22"

  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  $sshConfig = $config.agents.defaults.sandbox.ssh
  if (!$sshConfig) { return }

  $currentTarget = [string]$sshConfig.target
  $targetUser = if ($currentTarget -match "^(?<user>[^@]+)@") { $matches.user } else { "ikefl" }
  $nextTarget = "$targetUser@127.0.0.1"
  if ($currentTarget -eq $nextTarget) {
    Write-Host "OpenClaw SSH target already points at $nextTarget"
    return
  }

  $config.agents.defaults.sandbox.ssh.target = $nextTarget
  $config | ConvertTo-Json -Depth 100 | Set-Content $configPath
  Write-Host "Updated OpenClaw SSH target to $nextTarget"
}

Refresh-OpenClawSshTarget

Write-Host "Stopping all OpenClaw gateway instances..."

$gateways = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*openclaw*gateway*" }
foreach ($g in $gateways) {
  Write-Host "  Killing PID $($g.ProcessId)"
  Stop-Process -Id $g.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

$remaining = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*openclaw*gateway*" }
if ($remaining) {
  Write-Host "WARNING: $($remaining.Count) process(es) still running. Forcing..."
  $remaining | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

Write-Host "Starting fresh gateway..."
Start-Process -WindowStyle Hidden cmd.exe -ArgumentList "/c", "openclaw gateway start"
Start-Sleep -Seconds 3

$new = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*openclaw*gateway*" }
Write-Host "Done. $($new.Count) gateway process(es) running."
$new | ForEach-Object { Write-Host "  PID $($_.ProcessId)" }
