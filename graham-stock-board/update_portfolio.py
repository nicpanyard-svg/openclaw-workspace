import json, pathlib
from datetime import datetime, timezone

base = pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board')
portfolio_path = base / 'paper-trades.json'
portfolio = json.loads(portfolio_path.read_text(encoding='utf-8', errors='replace'))

quotes = {
  'PLTR': {'price': 148.35, 'chgPct': 0.2839180693571199, 'dayHigh': 149.46, 'dayLow': 144.45, 'prevClose': 147.93},
  'TEM': {'price': 46.40, 'chgPct': -1.9027484143763187, 'dayHigh': 47.16, 'dayLow': 45.32, 'prevClose': 47.30},
  'RKLB': {'price': 64.67, 'chgPct': -4.433279148810403, 'dayHigh': 68.30, 'dayLow': 64.12, 'prevClose': 67.67},
  'IONQ': {'price': 28.12, 'chgPct': -3.8303693570451354, 'dayHigh': 28.88, 'dayLow': 27.29, 'prevClose': 29.24},
  'SERV': {'price': 7.92, 'chgPct': -5.149700598802392, 'dayHigh': 8.29, 'dayLow': 7.80, 'prevClose': 8.35},
  'RXRX': {'price': 3.165, 'chgPct': 0.47619047619048016, 'dayHigh': 3.20, 'dayLow': 3.04, 'prevClose': 3.15},
}

for ticker, q in quotes.items():
    if ticker in portfolio.get('watchlist', {}):
        portfolio['watchlist'][ticker].update(q)

note = (
    '4/7/26 1:50 PM CT - All cash. No positions. '
    'PLTR $148.35 holding above $148 but still needs cleaner $150.50-151 confirmation. '
    'IONQ $28.12 still below $30 re-entry confirmation. '
    'TEM, RXRX, and SERV remain watch-only. '
    'No alerts fired. Starter zones remain valid. No trades made.'
)

portfolio['lastUpdated'] = '2026-04-07T18:50:00Z'
portfolio['note'] = note
portfolio['grahamNote'] = note
portfolio['strategy']['currentAssessment'] = note
portfolio['deployed'] = round(sum(float(p.get('cost', 0)) for p in portfolio.get('positions', [])), 2)
portfolio['deployedPct'] = round((portfolio['deployed'] / float(portfolio.get('portfolioSize', 0)) * 100) if portfolio.get('portfolioSize') else 0, 2)
portfolio['portfolioValue'] = round(float(portfolio.get('cash', 0)) + sum(float(p.get('shares', 0)) * float(p.get('currentPrice', 0)) for p in portfolio.get('positions', [])), 2)
portfolio['totalPnl'] = round(portfolio['portfolioValue'] - float(portfolio.get('portfolioSize', 0)), 2)
portfolio['totalPnlPct'] = round((portfolio['totalPnl'] / float(portfolio.get('portfolioSize', 0)) * 100) if portfolio.get('portfolioSize') else 0, 2)

portfolio_path.write_text(json.dumps(portfolio, indent=2), encoding='utf-8')
print('updated portfolio')
