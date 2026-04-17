import yfinance as yf

stocks = ['RKLB','TEM','HIMS','SYM','IONQ','FLNC','SOUN','RXRX','SERV']
comms  = ['GC=F','SI=F','CL=F','NG=F','HG=F']
labels = {
    'GC=F': 'Gold', 'SI=F': 'Silver', 'CL=F': 'Crude Oil',
    'NG=F': 'Nat Gas', 'HG=F': 'Copper'
}

print("=" * 55)
print(f"{'GRAHAM EQUITIES':^55}")
print("=" * 55)
for t in stocks:
    try:
        tk = yf.Ticker(t)
        hist = tk.history(period='1d', interval='1m')
        if hist.empty:
            print(f"  {t:8s}: N/A")
            continue
        price = hist['Close'].iloc[-1]
        open_p = hist['Open'].iloc[0]
        chg = ((price - open_p) / open_p) * 100
        arrow = "^" if chg >= 0 else "v"
        print(f"  {t:8s}: ${price:8.2f}  {arrow} {abs(chg):.2f}% today")
    except Exception as e:
        print(f"  {t:8s}: ERR {e}")

print()
print("=" * 55)
print(f"{'GRAHAM COMMODITIES':^55}")
print("=" * 55)
for t in comms:
    try:
        label = labels.get(t, t)
        tk = yf.Ticker(t)
        hist = tk.history(period='1d', interval='1m')
        if hist.empty:
            print(f"  {label:12s}: N/A")
            continue
        price = hist['Close'].iloc[-1]
        open_p = hist['Open'].iloc[0]
        chg = ((price - open_p) / open_p) * 100
        arrow = "^" if chg >= 0 else "v"
        print(f"  {label:12s}: ${price:8.2f}  {arrow} {abs(chg):.2f}% today")
    except Exception as e:
        print(f"  {label:12s}: ERR {e}")
print("=" * 55)
