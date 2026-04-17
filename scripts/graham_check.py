positions = [
    {"ticker": "IONQ", "shares": 20, "avg_cost": 31.20, "price": 27.15, "stop": 22.50},
    {"ticker": "RKLB", "shares":  8, "avg_cost": 67.23, "price": 58.99, "stop": 56.06},
    {"ticker": "TEM",  "shares": 15, "avg_cost": 55.00, "price": 42.24, "stop": 39.21},
]

print("=== OPEN POSITIONS - 9:14 AM CT Mar 30 ===\n")
total_cost = 0
total_value = 0
for p in positions:
    cost = p["shares"] * p["avg_cost"]
    value = p["shares"] * p["price"]
    pnl = value - cost
    pnl_pct = (pnl / cost) * 100
    stop_dist = ((p["price"] - p["stop"]) / p["price"]) * 100
    flag = ""
    if p["price"] <= p["stop"]:
        flag = "  STOP HIT"
    elif stop_dist < 5:
        flag = "  NEAR STOP"
    ticker = p["ticker"]
    price = p["price"]
    stop = p["stop"]
    print(f"{ticker}: ${price:.2f}  |  P&L: ${pnl:+.0f} ({pnl_pct:+.1f}%)  |  Stop: ${stop}  ({stop_dist:.1f}% away){flag}")
    total_cost += cost
    total_value += value

total_pnl = total_value - total_cost
pct = total_pnl / total_cost * 100
print(f"\nTOTAL: Cost ${total_cost:.0f} | Value ${total_value:.0f} | P&L ${total_pnl:+.0f} ({pct:+.1f}%)")
print("\nMarket: SPY +0.49% | QQQ +0.56%  (risk-on open)")
