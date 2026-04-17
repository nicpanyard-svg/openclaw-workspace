import yfinance as yf

positions = [
    {"ticker": "IONQ", "shares": 20, "avg_cost": 31.20, "stop": 22.50},
    {"ticker": "RKLB", "shares":  8, "avg_cost": 67.23, "stop": 56.06},
    {"ticker": "TEM",  "shares": 15, "avg_cost": 55.00, "stop": 39.21},
]

for p in positions:
    t = yf.Ticker(p["ticker"])
    fi = t.fast_info
    p["price"] = fi["lastPrice"]
    p["prev_close"] = fi["regularMarketPreviousClose"]
    p["day_high"] = fi["dayHigh"]
    p["day_low"] = fi["dayLow"]

spy = yf.Ticker("SPY").fast_info
qqq = yf.Ticker("QQQ").fast_info
spy_chg = (spy["lastPrice"] - spy["regularMarketPreviousClose"]) / spy["regularMarketPreviousClose"] * 100
qqq_chg = (qqq["lastPrice"] - qqq["regularMarketPreviousClose"]) / qqq["regularMarketPreviousClose"] * 100

print("=== OPEN POSITIONS 9:59 AM CT Mar 30 ===")
print(f"Market: SPY {spy_chg:+.2f}% @ ${spy['lastPrice']:.2f}  |  QQQ {qqq_chg:+.2f}% @ ${qqq['lastPrice']:.2f}")
print()

total_cost = total_value = 0
for p in positions:
    cost = p["shares"] * p["avg_cost"]
    value = p["shares"] * p["price"]
    pnl = value - cost
    pnl_pct = pnl / cost * 100
    day_chg = (p["price"] - p["prev_close"]) / p["prev_close"] * 100
    stop_dist = (p["price"] - p["stop"]) / p["price"] * 100
    flag = ""
    if p["price"] <= p["stop"]:
        flag = "  *** STOP HIT ***"
    elif stop_dist < 5:
        flag = "  !! NEAR STOP !!"
    ticker = p["ticker"]
    price = p["price"]
    stop = p["stop"]
    dh = p["day_high"]
    dl = p["day_low"]
    print(f"{ticker}: ${price:.2f} ({day_chg:+.2f}% today)  |  P&L: ${pnl:+.0f} ({pnl_pct:+.1f}%)  |  Stop: ${stop} ({stop_dist:.1f}% away)  H:${dh:.2f} L:${dl:.2f}{flag}")
    total_cost += cost
    total_value += value

total_pnl = total_value - total_cost
pct = total_pnl / total_cost * 100
print(f"\nTOTAL: Cost ${total_cost:.0f} | Value ${total_value:.0f} | P&L ${total_pnl:+.0f} ({pct:+.1f}%)")
