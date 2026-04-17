import yfinance as yf
import json
from datetime import datetime

entry_prices = {
    'RKLB': 58.30, 'TEM': 42.68, 'HIMS': 19.36, 'SYM': 48.24, 'IONQ': 27.11,
    'FLNC': 13.30, 'SOUN': 6.05, 'RXRX': 2.87, 'SERV': 7.95,
    'GC=F': 4570, 'SI=F': 70.88, 'CL=F': 103.50, 'NG=F': 2.88, 'HG=F': 5.51
}

labels = {
    'RKLB': 'Rocket Lab', 'TEM': 'Tempus AI', 'HIMS': 'Hims & Hers', 'SYM': 'Symbotic',
    'IONQ': 'IonQ', 'FLNC': 'Fluence', 'SOUN': 'SoundHound', 'RXRX': 'Recursion', 'SERV': 'Serve Robotics',
    'GC=F': 'Gold', 'SI=F': 'Silver', 'CL=F': 'Crude Oil', 'NG=F': 'Nat Gas', 'HG=F': 'Copper'
}

categories = {
    'equities': ['RKLB', 'TEM', 'HIMS', 'SYM', 'IONQ', 'FLNC', 'SOUN', 'RXRX', 'SERV'],
    'commodities': ['GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F']
}

all_tickers = list(entry_prices.keys())

try:
    data = yf.download(all_tickers, period='1d', interval='1m', progress=False, auto_adjust=True)
except Exception as e:
    print(f"Download error: {e}")
    exit(1)

results = {}
for t in all_tickers:
    try:
        closes = data['Close'][t].dropna()
        current = float(closes.iloc[-1])
        entry = entry_prices[t]
        pct = (current - entry) / entry * 100
        results[t] = {'label': labels[t], 'entry': entry, 'current': round(current, 4), 'pct': round(pct, 2)}
    except Exception as e:
        results[t] = {'label': labels[t], 'entry': entry_prices[t], 'error': str(e)}

print(f"\n{'='*65}")
print(f"GRAHAM POSITIONS — {datetime.now().strftime('%Y-%m-%d %H:%M')} CT")
print(f"{'='*65}")

for cat, tickers in categories.items():
    print(f"\n--- {cat.upper()} ---")
    for t in tickers:
        r = results[t]
        if 'error' in r:
            print(f"  {t:<8} {r['label']:<20}  ERROR: {r['error']}")
        else:
            arrow = 'UP' if r['pct'] >= 0 else 'DN'
            sign = '+' if r['pct'] >= 0 else ''
            flag = ''
            if abs(r['pct']) >= 5:
                flag = ' <<< ALERT'
            elif abs(r['pct']) >= 3:
                flag = ' *** watch'
            print(f"  {t:<8} {r['label']:<20}  entry=${r['entry']:>9.3f}  now=${r['current']:>9.3f}  [{arrow}] {sign}{r['pct']}%{flag}")
