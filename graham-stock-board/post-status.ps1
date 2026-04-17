$body = @{
    name = "Graham"
    status = "ACTIVE"
    currentTask = "Held all cash. PLTR $148.46 at trigger but no volume confirmation. IONQ $29.30 stalled short of $30. Watching final hour."
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/agent-status' -ContentType 'application/json' -Body $body
