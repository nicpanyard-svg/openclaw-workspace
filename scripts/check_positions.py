import yfinance as yf

tickers = ['IONQ', 'RKLB', 'TEM', 'RXRX', 'PLTR', 'NVDA', 'MSFT', 'META', 'AMZN', 'TSLA', 'JPM', 'XOM']
positions = {
    'IONQ': {'shares': 20, 'avg_cost': 31.20},
    'RKLB': {'shares': 8,  'avg_cost': 67.23},
    'TEM':  {'shares': 15, 'avg_cost': 55.00},
    'RXRX': {'shares': 100,'avg_cost': 4.50},
    'PLTR': {'shares': 10, 'avg_cost': 25.00},
    'NVDA': {'shares': 5,  'avg_cost': 650.00},
    'MSFT': {'shares': 3,  'avg_cost': 380.00},
    'META': {'shares': 2,  'avg_cost': 465.00},
    'AMZN': {'shares': 4,  'avg_cost': 175.00},
    'TSLA': {'shares': 6,  'avg_cost': 265.00},
    'JPM':  {'shares': 5,  'avg_cost': 195.00},
    'XOM':  {'shares': 12, 'avg_cost': 112.00},
}

# Alerts from alerts.json
stops = {
    'IONQ': 22.50,
    'PLTR': 78.00,
    'NVDA': None,  # Breakout watch at 950
}

total_value = 0
total_cost = 0
print("=" * 70)
print(f"{'SYM':<5} {'PRICE':>7} {'DAY%':>7} {'VALUE':>9} {'P&L':>9} {'P&L%':>7} {'ALERT':>10}")
print("=" * 70)

for sym in tickers:
    try:
        t = yf.Ticker(sym)
        h = t.history(period='2d')
        if len(h) >= 2:
            price = round(float(h['Close'].iloc[-1]), 2)
            prev = round(float(h['Close'].iloc[-2]), 2)
            chg_pct = round((price - prev) / prev * 100, 2)
        elif len(h) == 1:
            price = round(float(h['Close'].iloc[-1]), 2)
            chg_pct = 0.0
        else:
            price = None
            chg_pct = 0.0

        pos = positions.get(sym, {})
        shares = pos.get('shares', 0)
        cost = pos.get('avg_cost', 0)
        if price and shares:
            value = round(price * shares, 2)
            cost_basis = round(cost * shares, 2)
            pnl = round(value - cost_basis, 2)
            pnl_pct = round((price - cost) / cost * 100, 2)
            total_value += value
            total_cost += cost_basis
        else:
            value = pnl = pnl_pct = 0

        # Alert check
        alert = ""
        stop = stops.get(sym)
        if stop and price and price <= stop:
            alert = "STOP HIT!"
        elif sym == 'NVDA' and price and price >= 950:
            alert = "BREAKOUT!"
        elif chg_pct <= -5:
            alert = "DROP -5%"
        elif chg_pct >= 5:
            alert = "UP +5%"

        pnl_str = f"+{pnl:.0f}" if pnl >= 0 else f"{pnl:.0f}"
        pnl_pct_str = f"+{pnl_pct:.1f}%" if pnl_pct >= 0 else f"{pnl_pct:.1f}%"
        chg_str = f"+{chg_pct:.2f}%" if chg_pct >= 0 else f"{chg_pct:.2f}%"
        print(f"{sym:<5} {price:>7.2f} {chg_str:>7} ${value:>8,.0f} {pnl_str:>8} {pnl_pct_str:>7} {alert:>10}")
    except Exception as e:
        print(f"{sym:<5} ERROR: {e}")

print("=" * 70)
total_pnl = total_value - total_cost
total_pnl_pct = round((total_pnl / total_cost) * 100, 2) if total_cost else 0
pnl_str = f"+{total_pnl:.0f}" if total_pnl >= 0 else f"{total_pnl:.0f}"
pnl_pct_str = f"+{total_pnl_pct:.1f}%" if total_pnl_pct >= 0 else f"{total_pnl_pct:.1f}%"
print(f"{'TOTAL':<5} {'':>7} {'':>7} ${total_value:>8,.0f} {pnl_str:>8} {pnl_pct_str:>7}")
print("=" * 70)
