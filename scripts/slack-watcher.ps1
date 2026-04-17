param(
    [string]$ConnectionId = '2923502d-646b-426f-b2da-952319f3d379',
    [string]$DmUserId = 'U0AMU2BEKJ4',
    [int]$PollSeconds = 15,
    [switch]$PostAck,
    [switch]$RunOnce
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Workspace = 'C:\Users\IkeFl\.openclaw\workspace'
$StateDir = Join-Path $Workspace 'monitoring'
$StatePath = Join-Path $StateDir 'slack-watcher-state.json'
$LogPath = Join-Path $StateDir 'slack-watcher.log'

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

if (-not $env:MATON_API_KEY) {
    throw 'MATON_API_KEY is not set in the environment.'
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
        channelId = $null
        lastSeenTs = $null
        lastAckedTs = $null
    }
}

function Save-State($state) {
    $state | ConvertTo-Json | Set-Content -Path $StatePath
}

function Invoke-MatonGet([string]$url) {
    $headers = @{
        Authorization = "Bearer $($env:MATON_API_KEY)"
        'Maton-Connection' = $ConnectionId
    }
    Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function Invoke-MatonPostJson([string]$url, $bodyObj) {
    $headers = @{
        Authorization = "Bearer $($env:MATON_API_KEY)"
        'Maton-Connection' = $ConnectionId
        'Content-Type' = 'application/json; charset=utf-8'
    }
    $body = $bodyObj | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body
}

function Get-DmChannelId {
    $resp = Invoke-MatonGet 'https://gateway.maton.ai/slack/api/conversations.list?types=im&limit=1000'
    foreach ($channel in $resp.channels) {
        if ($channel.user -eq $DmUserId) {
            return $channel.id
        }
    }
    return $null
}

function Get-LatestMessages([string]$channelId) {
    $url = "https://gateway.maton.ai/slack/api/conversations.history?channel=$channelId&limit=5"
    $resp = Invoke-MatonGet $url
    return $resp.messages
}

function Post-Ack([string]$channelId, [string]$sourceTs) {
    $text = 'I saw your Slack message. Always-on watcher is running, but the full smart reply loop is still being built.'
    $body = @{
        channel = $channelId
        text = $text
        thread_ts = $sourceTs
    }
    Invoke-MatonPostJson 'https://gateway.maton.ai/slack/api/chat.postMessage' $body | Out-Null
}

$state = Load-State
Write-Log 'Slack watcher starting'

while ($true) {
    try {
        if (-not $state.channelId) {
            $state.channelId = Get-DmChannelId
            if (-not $state.channelId) {
                Write-Log "DM channel not found for user $DmUserId"
                Save-State $state
                if ($RunOnce) { break }
                Start-Sleep -Seconds $PollSeconds
                continue
            }
            Write-Log "Watching DM channel $($state.channelId)"
            Save-State $state
        }

        $messages = Get-LatestMessages $state.channelId
        $ordered = @($messages | Sort-Object { [double]$_.ts })

        foreach ($msg in $ordered) {
            if ($msg.subtype) { continue }
            if ($msg.bot_id) { continue }
            if (-not $msg.ts) { continue }

            $isNew = (-not $state.lastSeenTs) -or ([double]$msg.ts -gt [double]$state.lastSeenTs)
            if (-not $isNew) { continue }

            $preview = ($msg.text -replace "`r|`n", ' ')
            if ($preview.Length -gt 120) { $preview = $preview.Substring(0,120) + '...' }
            Write-Log "New message ts=$($msg.ts) text=$preview"
            $state.lastSeenTs = $msg.ts

            if ($PostAck -and ($state.lastAckedTs -ne $msg.ts)) {
                Post-Ack $state.channelId $msg.ts
                $state.lastAckedTs = $msg.ts
                Write-Log "Posted ack for ts=$($msg.ts)"
            }

            Save-State $state
        }
    }
    catch {
        Write-Log "Error: $($_.Exception.Message)"
    }

    if ($RunOnce) { break }
    Start-Sleep -Seconds $PollSeconds
}
