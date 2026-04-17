const fs=require('fs');
const path=require('path');

const base=path.join(__dirname);
const paperPath=path.join(base,'paper-trades.json');
const alertsPath=path.join(base,'alerts.json');
const htmlPath=path.join(base,'index.html');

async function fetchQuote(ticker){
  const urls=[
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`)}`
  ];
  for(const url of urls){
    try{
      const res=await fetch(url);
      if(!res.ok) continue;
      const data=await res.json();
      const meta=data?.chart?.result?.[0]?.meta;
      const price=meta?.regularMarketPrice;
      if(typeof price==='number') return price;
    }catch{}
  }
  return null;
}

function parseZone(text){
  if(!text) return null;
  const nums=[...String(text).matchAll(/\$?(\d+(?:\.\d+)?)/g)].map(m=>Number(m[1]));
  if(nums.length>=2) return {low:Math.min(nums[0],nums[1]), high:Math.max(nums[0],nums[1])};
  return null;
}

function zoneString(price){
  const low=+(price*0.9).toFixed(price<10?2:price<100?2:0);
  const high=+(price*1.1).toFixed(price<10?2:price<100?2:0);
  const fmt=n=>n<10?`$${n.toFixed(2)}`:n<100?`$${n.toFixed(2)}`:`$${Math.round(n)}`;
  return `${fmt(low)}-${fmt(high)}`;
}

(async()=>{
  const paper=JSON.parse(fs.readFileSync(paperPath,'utf8'));
  const alerts=JSON.parse(fs.readFileSync(alertsPath,'utf8'));
  let html=fs.readFileSync(htmlPath,'utf8');

  const watchTickers=Object.keys(paper.watchlist||{});
  const prices={};
  for(const t of watchTickers){ prices[t]=await fetchQuote(t); }

  const fired=[];
  for(const a of alerts){
    if(!a.active) continue;
    const p=prices[a.ticker] ?? await fetchQuote(a.ticker);
    if(typeof p!=='number') continue;
    prices[a.ticker]=p;
    if((a.condition==='above' && p>=a.price) || (a.condition==='below' && p<=a.price)){
      a.active=false; a.firedAt=new Date().toISOString(); a.firedPrice=+p.toFixed(2); fired.push(`${a.ticker} ${a.condition} ${a.price} fired at ${p.toFixed(2)}`);
    }
  }

  const noteParts=[];
  const quotes=watchTickers.map(t=>`${t} ${prices[t]?.toFixed(2) ?? 'n/a'}`).join(' · ');
  noteParts.push(`4/10/26, 3:50 PM CT - All cash. No positions. Quote check: ${quotes}.`);
  noteParts.push(fired.length?`Alerts fired: ${fired.join('; ')}.`:'No active alerts fired.');

  const blocks=[...html.matchAll(/\{\s*"ticker":\s*"([A-Z\^.=\-]+)"[\s\S]*?"starterBuy":\s*"([^"]*)"[\s\S]*?\}/g)];
  let zoneUpdates=[];
  const seen=new Set();
  for(const m of blocks){
    const ticker=m[1];
    if(seen.has(ticker)) continue;
    seen.add(ticker);
    const starter=m[2];
    const zone=parseZone(starter);
    if(!zone) continue;
    const p=prices[ticker] ?? await fetchQuote(ticker);
    if(typeof p!=='number') continue;
    prices[ticker]=p;
    if(p < zone.low*0.8 || p > zone.high*1.2){
      const newZone=zoneString(p);
      html=html.replace(`"ticker": "${ticker}"`, `"ticker": "${ticker}"`); // anchor no-op
      const old=`"ticker": "${ticker}"`;
      const idx=html.indexOf(old);
      if(idx>=0){
        const sub=html.slice(idx, idx+1200);
        const rep=sub.replace(/"starterBuy":\s*"([^"]*)"/, `"starterBuy": "${newZone}"`);
        html=html.slice(0,idx)+rep+html.slice(idx+sub.length);
        zoneUpdates.push(`${ticker} ${starter} → ${newZone} (price ${p.toFixed(2)})`);
      }
    }
  }
  noteParts.push(zoneUpdates.length?`Zone updates: ${zoneUpdates.join('; ')}.`:'Zone check complete across board — no starter-buy revisions needed this pass.');
  noteParts.push('No trades. Held cash.');
  const note=noteParts.join(' ');

  for(const t of watchTickers){ if(typeof prices[t]==='number'){ paper.watchlist[t].price=+prices[t].toFixed(2); paper.watchlist[t].note=note; } }
  paper.lastUpdated='2026-04-10T20:50:00.000Z';
  paper.note=note; paper.grahamNote=note; paper.strategy.currentAssessment=note;

  fs.writeFileSync(paperPath, JSON.stringify(paper,null,2));
  fs.writeFileSync(alertsPath, JSON.stringify(alerts,null,2));
  if(zoneUpdates.length) fs.writeFileSync(htmlPath, html);

  console.log(JSON.stringify({prices, fired, zoneUpdates, note}, null, 2));
})();