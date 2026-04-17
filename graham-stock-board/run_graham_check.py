import json,re,urllib.request,urllib.parse,pathlib
from datetime import datetime, timezone
import yfinance as yf


def post_status(task):
    data=json.dumps({"name":"Graham","status":"ACTIVE","currentTask":task}).encode()
    req=urllib.request.Request('http://localhost:3000/api/agent-status', data=data, headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            print('STATUS', r.status, task)
    except Exception as e:
        print('STATUS_ERR', e)

base=pathlib.Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board')
post_status('Scanning prices and checking positions')
portfolio=json.loads((base/'paper-trades.json').read_text(encoding='utf-8'))
alerts=json.loads((base/'alerts.json').read_text(encoding='utf-8'))
html=(base/'index.html').read_text(encoding='utf-8', errors='ignore')

blocks=re.findall(r'\{\s*"ticker":\s*"([A-Z\-]+)".*?"starterBuy":\s*"([^"]*)"', html, re.S)
stocks=[]; seen=set()
for t,z in blocks:
    if t not in seen:
        seen.add(t)
        stocks.append((t,z))
for t in portfolio.get('watchlist',{}).keys():
    if t not in seen:
        seen.add(t)
        stocks.append((t,''))

quotes=list(seen)
price_map={}
for t in quotes:
    try:
        hist=yf.Ticker(t).history(period='1d', interval='1m', prepost=False, auto_adjust=False)
        if not hist.empty:
            price_map[t]=float(hist['Close'].dropna().iloc[-1])
    except Exception:
        pass

fired=[]
for a in alerts:
    if not a.get('active', False):
        continue
    p=price_map.get(a['ticker'])
    if p is None:
        continue
    cond=a.get('condition')
    ap=a.get('price')
    triggered=(cond=='above' and p>=ap) or (cond=='below' and p<=ap)
    if triggered:
        a['active']=False
        a['firedAt']=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
        a['firedPrice']=p
        a['action']=f"ALERT FIRED — {a['ticker']} {p:.2f} {cond} {ap}"
        fired.append(a)

positions=portfolio.get('positions',[])
for p in positions:
    cp=price_map.get(p['ticker'])
    if cp is None:
        continue
    p['currentPrice']=round(cp,4)
    pnl=(cp-p['entryPrice'])*p['shares']
    p['pnl']=round(pnl,2)
    p['pnlPct']=round((cp/p['entryPrice']-1)*100,2)

portfolio['deployed']=round(sum(p.get('currentPrice',0)*p['shares'] for p in positions),2)
portfolio['deployedPct']=round(portfolio['deployed']/portfolio['portfolioSize']*100,2) if portfolio['portfolioSize'] else 0
portfolio['portfolioValue']=round(portfolio['cash']+portfolio['deployed'],2)
portfolio['totalPnl']=round(portfolio['portfolioValue']-portfolio['portfolioSize'],2)
portfolio['totalPnlPct']=round((portfolio['portfolioValue']/portfolio['portfolioSize']-1)*100,2) if portfolio['portfolioSize'] else 0
portfolio['lastUpdated']=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

watch=['IONQ','PLTR','RKLB','RXRX','SERV','TEM']
quote_bits=[]
portfolio.setdefault('watchlist',{})
for t in watch:
    p=price_map.get(t)
    if p is not None:
        quote_bits.append(f'{t} {p:.2f}')
        portfolio['watchlist'][t]={'price':p,'note':''}

zone_changes=[]
for t,z in stocks:
    m=re.search(r'\$?([0-9][0-9,]*(?:\.\d+)?)\s*[-–]\s*\$?([0-9][0-9,]*(?:\.\d+)?)', z)
    if not m:
        continue
    lo=float(m.group(1).replace(',',''))
    hi=float(m.group(2).replace(',',''))
    p=price_map.get(t)
    if p is None:
        continue
    if p < lo*0.8 or p > hi*1.2:
        zone_changes.append((t,p,lo,hi))

note=f"4/15/26 2:10 PM CT - All cash. No open positions. Live watch quotes: {' | '.join(quote_bits)}. Alerts fired: {len(fired) if fired else 'none'}. Zone changes needed: {len(zone_changes)}. No trades. Held cash."
portfolio['note']=note
portfolio['grahamNote']=note
portfolio['strategy']['currentAssessment']=note
for t in portfolio['watchlist']:
    portfolio['watchlist'][t]['note']=note

(base/'paper-trades.json').write_text(json.dumps(portfolio, indent=2), encoding='utf-8')
(base/'alerts.json').write_text(json.dumps(alerts, indent=2), encoding='utf-8')

print('WATCH', quote_bits)
print('FIRED', [(a['ticker'], a.get('firedPrice')) for a in fired])
print('ZONE_CHANGES', zone_changes)
post_status(f"Held cash — IONQ {price_map.get('IONQ',0):.2f}, PLTR {price_map.get('PLTR',0):.2f}; {len(zone_changes)} zone updates pending")
