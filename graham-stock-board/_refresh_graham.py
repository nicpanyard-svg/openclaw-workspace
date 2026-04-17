import json, re, pathlib
import yfinance as yf

p = pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\paper-trades.json')
alerts_p = pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\alerts.json')

data = json.load(open(p, encoding='utf-8'))
alerts = json.load(open(alerts_p, encoding='utf-8'))

tickers = sorted(set(list((data.get('watchlist') or {}).keys()) + [a.get('ticker') for a in alerts if a.get('ticker')]))
tf = yf.Tickers(' '.join(tickers))
prices = {}
for t in tickers:
    info = tf.tickers[t].fast_info
    prices[t] = round(float(info.get('lastPrice')), 2)

active_fired = []
for a in alerts:
    if not a.get('active') or a.get('price') is None:
        continue
    px = prices.get(a['ticker'])
    if px is None:
        continue
    cond = a.get('condition')
    threshold = float(a['price'])
    if (cond == 'above' and px >= threshold) or (cond == 'below' and px <= threshold):
        active_fired.append(f"{a['ticker']} {cond} {threshold:g} @ {px}")

now = '2026-04-16T18:30:00Z'
ct_note = (
    f"4/16/26 1:30 PM CT - All cash. No open positions, so no P&L changes or trade actions. "
    f"Held cash. Alerts fired: {'; '.join(active_fired) if active_fired else 'none'}. "
    f"Refreshed watch prices: IONQ {prices.get('IONQ', 0):.2f}, PLTR {prices.get('PLTR', 0):.2f}, "
    f"RKLB {prices.get('RKLB', 0):.2f}, RXRX {prices.get('RXRX', 0):.2f}, SERV {prices.get('SERV', 0):.2f}, "
    f"TEM {prices.get('TEM', 0):.2f}, MELI {prices.get('MELI', 0):.2f}. Zone validation still blocked because "
    f"index.html stocks array remains malformed, so no safe board-zone edits were pushed this pass."
)

data['lastUpdated'] = now
data['note'] = ct_note
data['grahamNote'] = ct_note
data.setdefault('strategy', {})['currentAssessment'] = ct_note

deployed = round(sum(float(pos.get('shares', 0)) * float(pos.get('currentPrice', 0)) for pos in data.get('positions', [])), 2)
portfolio_size = float(data.get('portfolioSize', 0))
data['deployed'] = deployed
data['deployedPct'] = round((deployed / portfolio_size * 100) if portfolio_size else 0, 2)
data['portfolioValue'] = round(float(data.get('cash', 0)) + deployed, 2)
data['totalPnl'] = round(data['portfolioValue'] - portfolio_size, 2)
data['totalPnlPct'] = round((data['totalPnl'] / portfolio_size * 100) if portfolio_size else 0, 2)

for t, px in prices.items():
    if t in data.get('watchlist', {}):
        data['watchlist'][t]['price'] = px
        data['watchlist'][t]['note'] = ct_note

for item in data.get('passed', []):
    ticker = item.get('ticker')
    if ticker in prices and 'Quote ' in item.get('reason', ''):
        item['reason'] = re.sub(
            r'Quote .*?:\s*[0-9.,]+$',
            f'Quote 4/16/26 1:30 PM CT: {prices[ticker]:.2f}',
            item['reason']
        )

with open(p, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(json.dumps({'prices': prices, 'alerts': active_fired, 'note': ct_note}))
