$appDir = 'C:\Users\IkeFl\.openclaw\workspace\mission-control-app'
$logDir = Join-Path $appDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$outLog = Join-Path $logDir 'mission-control.out.log'
$errLog = Join-Path $logDir 'mission-control.err.log'
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',"Set-Location '$appDir'; npm run start *> '$outLog'" -WorkingDirectory $appDir -WindowStyle Hidden
