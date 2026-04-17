# restart-gateway.ps1
# Kills ALL openclaw gateway instances, then starts a clean one
# Run this instead of openclaw gateway restart to avoid duplicate processes

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
Start-Process -NoNewWindow powershell -ArgumentList "-Command", "openclaw gateway start"
Start-Sleep -Seconds 3

$new = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*openclaw*gateway*" }
Write-Host "Done. $($new.Count) gateway process(es) running."
$new | ForEach-Object { Write-Host "  PID $($_.ProcessId)" }
