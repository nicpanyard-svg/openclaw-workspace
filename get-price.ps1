
$headers = @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
try {
    $r = Invoke-RestMethod 'https://query1.finance.yahoo.com/v8/finance/chart/IONQ?interval=5m&range=1d' -Headers $headers
    $meta = $r.chart.result[0].meta
    Write-Host "IONQ Price: $($meta.regularMarketPrice) | PrevClose: $($meta.chartPreviousClose) | High: $($meta.regularMarketDayHigh) | Low: $($meta.regularMarketDayLow)"
} catch {
    Write-Host "Error IONQ: $($_.Exception.Message)"
}
