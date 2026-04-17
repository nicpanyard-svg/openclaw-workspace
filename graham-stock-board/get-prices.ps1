# Try MarketWatch
$tickers = @("IONQ", "RKLB", "SOUN")

foreach ($t in $tickers) {
    try {
        $url = "https://www.marketwatch.com/investing/stock/$($t.ToLower())"
        $h = @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            "Accept" = "text/html"
        }
        $page = Invoke-WebRequest -Uri $url -Headers $h -UseBasicParsing
        $c = $page.Content
        # MarketWatch pattern
        if ($c -match '"price":\s*"([\d,.]+)"') {
            Write-Output "${t}: $($matches[1]) (mw)"
        } elseif ($c -match 'class="intraday__price"[^>]*>.*?<bg-quote[^>]*field="Last"[^>]*>([\d,.]+)<') {
            Write-Output "${t}: $($matches[1]) (mw2)"
        } elseif ($c -match '"Last":([\d.]+)') {
            Write-Output "${t}: $($matches[1]) (mw3)"
        } else {
            $idx = $c.IndexOf('"Last"')
            if ($idx -lt 0) { $idx = $c.IndexOf('intraday__price') }
            if ($idx -ge 0) {
                $snip = $c.Substring($idx, [math]::Min(300, $c.Length - $idx))
                Write-Output "${t}: parse-fail | snip: $snip"
            } else {
                Write-Output "${t}: parse-fail (no markers)"
            }
        }
    } catch {
        Write-Output "${t}: error - $($_.Exception.Message)"
    }
}
