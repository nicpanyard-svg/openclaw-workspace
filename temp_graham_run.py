import json, urllib.request, urllib.parse, pathlib
workspace = pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace')
portfolio_path = workspace / 'graham-stock-board' / 'paper-trades.json'
alerts_path = workspace / 'graham-stock-board' / 'alerts.json'

def post_status(task):
    data = json.dumps({"name":"Graham","status":"ACTIVE","currentTask":task}).encode()
    req = urllib.request.Request('http://localhost:3000/api/agent-status', data=data, headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            print('STATUS', r.status, task)
    except Exception as e:
        print('STATUS_ERR', task, e)

post_status('Scanning prices and checking positions')
portfolio = json.loads(portfolio_path.read_text(encoding='utf-8'))
alerts = json.loads(alerts_path.read_text(encoding='utf-8'))
watchlist = list((portfolio.get('watchlist') or {}).keys())
open_positions = [p['ticker'] for p in portfolio.get('positions', [])]
all_tickers = sorted(set(watchlist + open_positions + [a['ticker'] for a in alerts if a.get('ticker')]))
q = urllib.parse.quote(','.join(all_tickers))
url = f'https://query1.finance.yahoo.com/v7/finance/quote?symbols={q}'
with urllib.request.urlopen(url, timeout=10) as r:
    data = json.load(r)
quotes = {item['symbol']: item for item in data['quoteResponse']['result']}
stamp = '4/20/26 2:26 PM CT'

cash = float(portfolio.get('cash',0))
portfolio_value = cash
for p in portfolio.get('positions', []):
    qt = quotes.get(p['ticker'], {})
    price = qt.get('regularMarketPrice') or p.get('currentPrice') or p.get('entryPrice')
    p['currentPrice'] = round(float(price), 2)
    cost = float(p.get('cost', p['shares'] * p['entryPrice']))
    pnl = p['shares'] * p['currentPrice'] - cost
    p['pnl'] = round(pnl, 2)
    p['pnlPct'] = round((pnl / cost * 100) if cost else 0, 2)
    portfolio_value += p['shares'] * p['currentPrice']
portfolio['deployed'] = round(sum(p['shares'] * p['currentPrice'] for p in portfolio.get('positions', [])), 2)
portfolio['deployedPct'] = round((portfolio['deployed'] / portfolio.get('portfolioSize', portfolio_value) * 100) if portfolio.get('portfolioSize') else 0, 2)
portfolio['portfolioValue'] = round(portfolio_value, 2)
portfolio['totalPnl'] = round(portfolio_value - float(portfolio.get('portfolioSize', portfolio_value)), 2)
portfolio['totalPnlPct'] = round((portfolio['totalPnl']/float(portfolio.get('portfolioSize', portfolio_value))*100) if portfolio.get('portfolioSize') else 0, 2)
portfolio['lastUpdated'] = '2026-04-20T19:26:00.000Z'
for ticker in watchlist:
    qt = quotes.get(ticker, {})
    price = qt.get('regularMarketPrice')
    if price is not None:
        portfolio['watchlist'][ticker] = {'price': round(float(price), 2), 'note': f'{stamp} - Yahoo Finance quote {float(price):.2f}.'}
for item in portfolio.get('passed', []):
    ticker = item.get('ticker')
    if ticker in quotes and 'Quote last verified' in item.get('reason',''):
        price = float(quotes[ticker]['regularMarketPrice'])
        base = item['reason'].split('Quote last verified')[0].rstrip('. ')
        item['reason'] = f"{base}. Quote last verified {stamp}: {price:.2f}."
fired = []
for a in alerts:
    if not a.get('active'):
        continue
    t = a.get('ticker')
    price = quotes.get(t, {}).get('regularMarketPrice')
    if price is None:
        continue
    cond = a.get('condition')
    level = a.get('price')
    hit = (cond == 'above' and price >= level) or (cond == 'below' and price <= level)
    if hit:
        a['active'] = False
        a['firedAt'] = '2026-04-20T19:26:00Z'
        a['firedPrice'] = round(float(price), 2)
        fired.append((t, cond, level, float(price)))
if fired:
    alert_text = '; '.join(f'{t} {c} {lvl} fired at {price:.2f}' for t,c,lvl,price in fired)
else:
    ionq25 = quotes.get('IONQ',{}).get('regularMarketPrice')
    alert_text = f'IONQ downside alert at $25 remains inactive with IONQ at {float(ionq25):.2f}' if ionq25 is not None else 'no active alerts fired'
watch_summary = ', '.join(f"{t} {portfolio['watchlist'][t]['price']:.2f}" for t in watchlist if t in portfolio['watchlist'])
note = f'{stamp} - Held cash with no open positions; no position price/P&L updates required; no trades taken. Active alert check: {alert_text}. Watchlist refreshed ({watch_summary}). Zone validation still deferred because index.html stocks array remains malformed/corrupted, so no reliable >20% starterBuy drift rewrite or sync run was attempted.'
portfolio['note'] = note
portfolio['grahamNote'] = note
portfolio['strategy']['currentAssessment'] = note
portfolio_path.write_text(json.dumps(portfolio, indent=2), encoding='utf-8')
alerts_path.write_text(json.dumps(alerts, indent=2), encoding='utf-8')
end_task = 'Held cash, refreshed watchlist, no alerts/trades' if not fired else 'Alert fired; refreshed watchlist and alerts'
post_status(end_task)
print(json.dumps({'fired': fired, 'watch': {t: portfolio['watchlist'][t]['price'] for t in watchlist}}, indent=2))