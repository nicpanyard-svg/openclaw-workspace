import yfinance as yf

tickers = ['RKLB','TEM','HIMS','SYM','IONQ','FLNC','SOUN','RXRX','SERV','GC=F','SI=F','CL=F','NG=F','HG=F']
entry = {
    'RKLB': 58.30, 'TEM': 42.68, 'HIMS': 19.36, 'SYM': 48.24, 'IONQ': 27.11,
    'FLNC': 13.30, 'SOUN': 6.05, 'RXRX': 2.87, 'SERV': 7.95,
    'GC=F': 4570, 'SI=F': 70.88, 'CL=F': 103.50, 'NG=F': 2.88, 'HG=F': 5.51
}

results = {}
for t in tickers:
    try:
        tk = yf.Ticker(t)
        hist = tk.history(period='1d', interval='1m')
        if not hist.empty:
            results[t] = float(hist['Close'].iloc[-1])
        else:
            info = tk.info
            results[t] = info.get('regularMarketPrice') or info.get('currentPrice')
    except Exception as e:
        results[t] = None

print(f"{'Ticker':<8} {'Entry':>10} {'Current':>10} {'Change%':>10} {'Signal':>6}")
print("-" * 48)
for t in tickers:
    cur = results.get(t)
    ent = entry.get(t)
    if cur and ent:
        pct = ((cur - ent) / ent) * 100
        signal = "UP" if pct > 0 else "DOWN"
        print(f"{t:<8} {ent:>10.2f} {cur:>10.2f} {pct:>9.1f}% {signal:>6}")
    else:
        print(f"{t:<8} {ent:>10.2f} {'N/A':>10}")
