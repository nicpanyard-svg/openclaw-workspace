$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Workspace = 'C:\Users\IkeFl\.openclaw\workspace'
$StateDir = Join-Path $Workspace 'monitoring'
$StatePath = Join-Path $StateDir 'openclaw-watchdog-state.json'
$LogPath = Join-Path $StateDir 'openclaw-watchdog.log'

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $LogPath -Value $line
}

function Load-State {
    if (Test-Path $StatePath) {
        try { return Get-Content $StatePath -Raw | ConvertFrom-Json } catch {}
    }
    return [pscustomobject]@{
        consecutiveFailures = 0
        lastAlertAt = $null
        lastDownMessageId = $null
        lastDoctorAt = $null
    }
}

function Save-State($state) {
    $state | ConvertTo-Json | Set-Content -Path $StatePath
}

function Invoke-Quiet($cmd) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = "/c $cmd"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    return [pscustomobject]@{
        Success = ($proc.ExitCode -eq 0)
        Output = (($stdout + "`n" + $stderr).Trim())
    }
}

function Send-Alert($subject, $body) {
    $escapedBody = $body -replace '"', '\"'
    $escapedSubject = $subject -replace '"', '\"'
    $cmd = "gog gmail send --account ike.flickema@gmail.com --to nick.panyard@inetlte.com --subject `"$escapedSubject`" --body `"$escapedBody`""
    $result = Invoke-Quiet $cmd
    Write-Log "Alert send success=$($result.Success) subject=$subject"
}

$state = Load-State

# Manual recovery trigger by email subject containing down
$downQuery = 'gog gmail search --account ike.flickema@gmail.com --plain "subject:down newer_than:7d" --max 5'
$downResult = Invoke-Quiet $downQuery
if ($downResult.Success) {
    $lines = $downResult.Output -split "`r?`n" | Where-Object { $_.Trim() -ne '' }
    foreach ($line in $lines) {
        if ($line -match '^([A-Za-z0-9]+)\t') {
            $messageId = $matches[1]
            if ($messageId -and $messageId -ne $state.lastDownMessageId) {
                Write-Log "Detected manual recovery email trigger messageId=$messageId"
                $doctor = Invoke-Quiet 'openclaw doctor'
                $state.lastDoctorAt = (Get-Date).ToString('o')
                $state.lastDownMessageId = $messageId
                Write-Log "Manual doctor run success=$($doctor.Success)"
                break
            }
        }
    }
}

$statusResult = Invoke-Quiet 'openclaw status'
$gatewayResult = Invoke-Quiet 'openclaw gateway status'

$healthy = $statusResult.Success -and $gatewayResult.Success

if ($healthy) {
    $state.consecutiveFailures = 0
    Save-State $state
    Write-Log 'Health check OK'
    exit 0
}

$state.consecutiveFailures = [int]$state.consecutiveFailures + 1
Write-Log "Health check failed count=$($state.consecutiveFailures)"

if ($state.consecutiveFailures -ge 3) {
    $doctor = Invoke-Quiet 'openclaw doctor'
    $state.lastDoctorAt = (Get-Date).ToString('o')
    Start-Sleep -Seconds 15

    $statusRetry = Invoke-Quiet 'openclaw status'
    $gatewayRetry = Invoke-Quiet 'openclaw gateway status'
    $stillBad = -not ($statusRetry.Success -and $gatewayRetry.Success)

    if ($stillBad) {
        $now = Get-Date
        $sendAlert = $true
        if ($state.lastAlertAt) {
            try {
                $lastAlert = [datetime]::Parse($state.lastAlertAt)
                if (($now - $lastAlert).TotalMinutes -lt 60) {
                    $sendAlert = $false
                }
            } catch {}
        }

        if ($sendAlert) {
            $body = @"
OpenClaw watchdog detected repeated failures.

Consecutive failures: $($state.consecutiveFailures)
Status command success: $($statusRetry.Success)
Gateway command success: $($gatewayRetry.Success)

Last doctor run: $($state.lastDoctorAt)

Please check Telegram/OpenClaw stability.
"@
            Send-Alert 'Ike watchdog alert: OpenClaw unstable' $body
            $state.lastAlertAt = $now.ToString('o')
        }
    } else {
        $state.consecutiveFailures = 0
        Write-Log 'Doctor recovered health'
    }
}

Save-State $state
