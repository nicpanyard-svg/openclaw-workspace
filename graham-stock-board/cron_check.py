import re, json, pathlib, requests
from datetime import datetime, timezone

BASE = pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board')
html = (BASE / 'index.html').read_text(encoding='utf-8', errors='replace')
m = re.search(r'const stocks = (\[.*?\n\]);\n\nconst stageMap', html, re.S)
stocks = json.loads(m.group(1))
portfolio = json.loads((BASE / 'paper-trades.json').read_text(encoding='utf-8', errors='replace'))
alerts = json.loads((BASE / 'alerts.json').read_text(encoding='utf-8', errors='replace'))
headers = {'User-Agent': 'Mozilla/5.0'}

quotes = {}
for s in stocks:
    t = s['ticker']
    try:
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{t}?interval=1d&range=1d'
        j = requests.get(url, timeout=20, headers=headers).json()['chart']['result'][0]['meta']
        p = j.get('regularMarketPrice')
        pc = j.get('chartPreviousClose') or j.get('previousClose')
        quotes[t] = {
            'price': p,
            'prevClose': pc,
            'dayHigh': j.get('regularMarketDayHigh'),
            'dayLow': j.get('regularMarketDayLow'),
            'chgPct': ((p - pc) / pc * 100) if (p is not None and pc) else None,
        }
    except Exception as e:
        quotes[t] = {'error': str(e)}

zone_issues = []
for s in stocks:
    sb = s.get('starterBuy', '')
    nums = [float(x.replace(',', '')) for x in re.findall(r'\$?(\d+(?:,\d{3})*(?:\.\d+)?)', sb)]
    if not nums or s['ticker'] not in quotes or 'price' not in quotes[s['ticker']]:
        continue
    lo, hi = (nums[0], nums[1]) if len(nums) >= 2 else (nums[0], nums[0])
    p = quotes[s['ticker']]['price']
    if p < lo * 0.8 or p > hi * 1.2:
        zone_issues.append({'ticker': s['ticker'], 'price': p, 'starterBuy': sb, 'range': [lo, hi]})

alert_hits = []
for a in alerts:
    if not a.get('active'):
        continue
    t = a.get('ticker')
    q = quotes.get(t)
    if not q or 'price' not in q:
        continue
    p = q['price']
    if a['condition'] == 'above' and p >= a['price']:
        alert_hits.append({'ticker': t, 'price': p, 'alert': a})
    elif a['condition'] == 'below' and p <= a['price']:
        alert_hits.append({'ticker': t, 'price': p, 'alert': a})

print(json.dumps({'quotes': quotes, 'zone_issues': zone_issues, 'alert_hits': alert_hits}, indent=2))
