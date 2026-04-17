import yfinance as yf
import json

tickers = ['PLTR', 'IONQ', 'RKLB', 'TEM']
results = {}

for t in tickers:
    tk = yf.Ticker(t)
    fi = tk.fast_info
    # Get after-hours / current price
    try:
        hist = tk.history(period='1d', interval='1m', prepost=True)
        if not hist.empty:
            last_close = float(hist['Close'].iloc[-1])
            last_time = str(hist.index[-1])
            regular_close = float(fi.get('previousClose', hist['Close'].iloc[-1]))
        else:
            last_close = float(fi.get('lastPrice', 0))
            last_time = 'unknown'
            regular_close = float(fi.get('previousClose', 0))
    except Exception as e:
        last_close = float(fi.get('lastPrice', 0))
        last_time = 'error: ' + str(e)
        regular_close = float(fi.get('previousClose', 0))
    
    prev_close = float(fi.get('previousClose', regular_close))
    chg = last_close - prev_close
    chg_pct = (chg / prev_close * 100) if prev_close else 0
    
    results[t] = {
        'price': round(last_close, 2),
        'prevClose': round(prev_close, 2),
        'chg': round(chg, 2),
        'chgPct': round(chg_pct, 2),
        'lastTime': last_time
    }

print(json.dumps(results, indent=2))
