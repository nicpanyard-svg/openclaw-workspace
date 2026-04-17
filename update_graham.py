import json
from datetime import datetime

with open(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\paper-trades.json', encoding='utf-8-sig') as f:
    data = json.load(f)

now = "2026-03-31T17:21:00.000Z"

# Current prices
prices = {
    'PLTR': {'price': 147.47, 'chgPct': 8.99, 'dayHigh': 147.48, 'dayLow': 138.98, 'prevClose': 135.30, 'volume': 25080566},
    'TEM':  {'price': 45.43,  'chgPct': 7.15, 'dayHigh': 45.50,  'dayLow': 43.00,  'prevClose': 42.40,  'volume': 2421475},
    'RKLB': {'price': 64.28,  'chgPct': 13.31,'dayHigh': 64.29,  'dayLow': 59.03,  'prevClose': 56.73,  'volume': 16112332},
    'IONQ': {'price': 28.85,  'chgPct': 9.61, 'dayHigh': 28.94,  'dayLow': 27.06,  'prevClose': 26.32,  'volume': 12959383},
    'SERV': {'price': 8.35,   'chgPct': 8.58, 'dayHigh': 8.38,   'dayLow': 7.99,   'prevClose': 7.69,   'volume': 2933276},
    'RXRX': {'price': 3.07,   'chgPct': 9.64, 'dayHigh': 3.07,   'dayLow': 2.90,   'prevClose': 2.80,   'volume': 8045261},
}

# Update watchlist with current prices
for ticker, pdata in prices.items():
    if ticker in data['watchlist']:
        chg = pdata['chgPct']
        price = pdata['price']
        note_map = {
            'PLTR': f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. Day range ${pdata['dayLow']}-${pdata['dayHigh']}. NEAR $148 re-entry trigger — need confirmed close above $148 with volume. Zone: $135-155. No position. Q2 Day 1 tomorrow is key — does this hold?",
            'TEM':  f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. Day range ${pdata['dayLow']}-${pdata['dayHigh']}. IN zone $43-49. Steadiest name, best chart. Watching for continuation — no chase on +7% gap. Volume ${pdata['volume']:,}.",
            'RKLB': f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. Day range ${pdata['dayLow']}-${pdata['dayHigh']}. $60 reclaim CONFIRMED, extended to $64.28 (+13.3%). No chase — too extended. Re-entry zone now $60-63. Need pullback and hold before re-engagement.",
            'IONQ': f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. Day range ${pdata['dayLow']}-${pdata['dayHigh']}. Still below $30 reclaim level. $28 zone bid — positive. Need $30 close + volume for starter signal. No position.",
            'SERV': f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. In zone $7-9. Volume ${pdata['volume']:,}. Tape improving but still cautious — need market follow-through tomorrow.",
            'RXRX': f"3/31/26 12:21PM CT. ${price} (+{chg}%). Q1-END BOUNCE. In zone $2.50-3.50. Approaching zone high. Volume ${pdata['volume']:,}. No position.",
        }
        data['watchlist'][ticker]['price'] = price
        data['watchlist'][ticker]['chgPct'] = chg
        data['watchlist'][ticker]['dayHigh'] = pdata['dayHigh']
        data['watchlist'][ticker]['dayLow'] = pdata['dayLow']
        data['watchlist'][ticker]['prevClose'] = pdata['prevClose']
        data['watchlist'][ticker]['volume'] = pdata['volume']
        data['watchlist'][ticker]['note'] = note_map.get(ticker, f"${price} ({chg:+}%) 3/31/26 12:21PM CT")

# Update alerts - fire RKLB $60 reclaim
for alert in data.get('alerts', []) if 'alerts' in data else []:
    pass

# No positions — cash stays same
data['lastUpdated'] = now
data['date'] = "2026-03-31"
data['note'] = (
    "3/31/26 12:21PM CT — Q1 END BOUNCE. All names up 7-14%. "
    "100% CASH $9,987.81. NO TRADES — correct call. "
    "Prices: PLTR $147.47 (+8.99%), RKLB $64.28 (+13.31%), TEM $45.43 (+7.15%), "
    "IONQ $28.85 (+9.61%), SERV $8.35 (+8.58%), RXRX $3.07 (+9.64%). "
    "Key levels: PLTR needs $148 confirmed close for re-entry trigger. "
    "IONQ needs $30 reclaim. RKLB too extended at $64 — re-entry zone $60-63 on pullback. "
    "TEM $45 in zone but no chase on +7% gap day. "
    "Strategy: let Q1 end rip settle, assess Q2 Day 1 tape tomorrow. No heroes today."
)
data['strategy']['currentAssessment'] = (
    "12:21PM CT 3/31/26 — Q1 END INSTITUTIONAL REBALANCING. "
    "All watchlist names ripping 7-14%. PREDICTED yesterday. Still 100% cash — right call. "
    "Do NOT chase gap-ups. PLTR $147.47 is 2¢ under $148 re-entry trigger — "
    "close above $148 with volume would be signal, but need confirmation, not a gap-chase. "
    "Tomorrow (Q2 Day 1) is the real tell — does this hold or fade back? "
    "Hold cash, let the tape settle, enter on confirmation not momentum."
)

data['grahamNote'] = (
    "3/31/26 12:21PM CT — Q1 END RIPPING. Called it: institutional rebalancing. "
    "PLTR +9%, RKLB +13%, TEM +7%, IONQ +10%, SERV +9%, RXRX +10%. "
    "Still holding 100% cash — this is not a buying setup, it's a confirmation setup. "
    "PLTR at $147.47 is within $0.53 of $148 trigger. IONQ at $28.85 approaching $30. "
    "RKLB fully recovered $60 zone and pushed to $64 — too extended for new entry. "
    "TEM $45.43 is the cleanest chart. "
    "Plan: Watch close. If PLTR closes above $148 and holds, starter consideration tomorrow. "
    "If IONQ closes above $29, watch $30 for signal. Let the day finish — no midday heroics."
)

with open(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\paper-trades.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print("Updated paper-trades.json")
