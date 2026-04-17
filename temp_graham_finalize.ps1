$body = '{"name":"Graham","status":"ACTIVE","currentTask":"Held cash. Updated watchlist quotes: PLTR 135.57 | TEM 48.61 | RKLB 72.18 | IONQ 34.15 | SERV 8.90 | RXRX 3.49. No alerts, no trades, no zone changes."}'
Invoke-WebRequest -Uri 'http://localhost:3000/api/agent-status' -Method Post -ContentType 'application/json' -Body $body | Out-Null
node sync-stock-board.js
