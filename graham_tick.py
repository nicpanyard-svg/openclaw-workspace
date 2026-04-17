import json, re, urllib.request, urllib.parse, os, subprocess
from datetime import datetime, timezone

workspace = r'C:\Users\IkeFl\.openclaw\workspace'
portfolio_path = os.path.join(workspace, 'graham-stock-board', 'paper-trades.json')
alerts_path = os.path.join(workspace, 'graham-stock-board', 'alerts.json')
board_path = os.path.join(workspace, 'graham-stock-board', 'index.html')

def post_status(task):
    body = json.dumps({"name":"Graham","status":"ACTIVE","currentTask":task}).encode()
    req = urllib.request.Request('http://localhost:3000/api/agent-status', data=body, headers={'Content-Type':'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req, timeout=5).read()
        print('status ok:', task)
    except Exception as e:
        print('status failed:', e)

post_status('Scanning prices and checking positions')

with open(portfolio_path, 'r', encoding='utf-8') as f:
    portfolio = json.load(f)
with open(alerts_path, 'r', encoding='utf-8') as f:
    alerts = json.load(f)
with open(board_path, 'r', encoding='utf-8', errors='ignore') as f:
    board = f.read()

watch_tickers = list((portfolio.get('watchlist') or {}).keys())
board_tickers = sorted(set(re.findall(r'"ticker"\s*:\s*"([A-Z\-\^=.]+)"', board)))
all_tickers = sorted(set(watch_tickers + [a['ticker'] for a in alerts if a.get('ticker')] + board_tickers))
quotes = {}
if all_tickers:
    bulk_url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + urllib.parse.quote(','.join(all_tickers))
    try:
        with urllib.request.urlopen(bulk_url, timeout=15) as r:
            data = json.loads(r.read().decode())
        for item in data.get('quoteResponse', {}).get('result', []):
            t = item.get('symbol')
            price = item.get('regularMarketPrice')
            prev = item.get('regularMarketPreviousClose') or item.get('postMarketPreviousClose') or price
            if t and price is not None:
                quotes[t] = {'price': float(price), 'prevClose': float(prev) if prev else None}
    except Exception as e:
        print('bulk quote fail', e)

fired = []
for a in alerts:
    if not a.get('active') or a.get('price') is None:
        continue
    t = a.get('ticker')
    if t not in quotes:
        continue
    px = quotes[t]['price']
    cond = a.get('condition')
    if (cond == 'above' and px >= a['price']) or (cond == 'below' and px <= a['price']):
        a['active'] = False
        a['firedAt'] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
        a['firedPrice'] = round(px, 3)
        fired.append(f"{t} {cond} {a['price']} fired at ${px:.2f}")

zone_changes = []
pattern = re.compile(r'("ticker"\s*:\s*"(?P<ticker>[A-Z\-\^=.]+)".*?"starterBuy"\s*:\s*")(?P<zone>[^\"]*)(")', re.S)
repls = []
for m in pattern.finditer(board):
    t = m.group('ticker')
    zone = m.group('zone')
    if t not in quotes:
        continue
    nums = re.findall(r'\$?(\d+(?:\.\d+)?)', zone)
    if len(nums) < 2:
        continue
    lo, hi = float(nums[0]), float(nums[1])
    px = quotes[t]['price']
    if px < lo * 0.8 or px > hi * 1.2:
        def fmt(n):
            return f'{n:.2f}'.rstrip('0').rstrip('.')
        new_lo = round(px * 0.9, 2)
        new_hi = round(px * 1.1, 2)
        new_zone = re.sub(r'\$?(\d+(?:\.\d+)?)\s*[-–]\s*\$?(\d+(?:\.\d+)?)', f'${fmt(new_lo)}-${fmt(new_hi)}', zone, count=1)
        if new_zone != zone:
            repls.append((m.start('zone'), m.end('zone'), new_zone))
            zone_changes.append(f"{t} {zone} -> {new_zone} (px ${px:.2f})")

if repls:
    parts=[]
    last=0
    for s,e,nz in sorted(repls):
        parts.append(board[last:s])
        parts.append(nz)
        last=e
    parts.append(board[last:])
    board = ''.join(parts)
    with open(board_path, 'w', encoding='utf-8') as f:
        f.write(board)

ordered_watch = [t for t in ['PLTR','TEM','RKLB','IONQ','SERV','RXRX'] if t in quotes]
quote_bits = [f"{t} {quotes[t]['price']:.2f}" for t in ordered_watch]
note = (
    '4/14/26, 11:50 AM CT - All cash. No positions. Quote check: ' + ' · '.join(quote_bits) +
    f". Alerts fired: {'; '.join(fired) if fired else 'none'}. " +
    f"Zone changes: {', '.join(z.split()[0] for z in zone_changes) if zone_changes else 'none'}. " +
    'No trades. Held cash.'
)
portfolio['lastUpdated'] = '2026-04-14T16:50:00Z'
portfolio['date'] = '2026-04-14'
portfolio['note'] = note
portfolio['grahamNote'] = note
portfolio['strategy']['currentAssessment'] = note
for t in portfolio.get('watchlist', {}):
    if t in quotes:
        portfolio['watchlist'][t]['price'] = round(quotes[t]['price'], 2)
        portfolio['watchlist'][t]['note'] = note

with open(portfolio_path, 'w', encoding='utf-8') as f:
    json.dump(portfolio, f, indent=2)
with open(alerts_path, 'w', encoding='utf-8') as f:
    json.dump(alerts, f, indent=2)

subprocess.run(['node', os.path.join(workspace, 'sync-stock-board.js')], check=False)

end_task = 'Held cash — quotes updated, no alerts, no trades' if not zone_changes else f"Held cash — updated {len(zone_changes)} starter zone(s), no trades"
if fired:
    end_task = f"Alert fired — {'; '.join(fired)[:120]}"
post_status(end_task)
print('NOTE:', note)
print('FIRED:', fired)
print('ZONE_CHANGES:', zone_changes)
