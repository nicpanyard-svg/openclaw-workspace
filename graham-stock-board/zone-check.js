const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/const stocks = (\[[\s\S]*?\]);/);
const stocks = eval(match[1]);

// Current prices (just fetched)
const prices = {
  IONQ:31.96, PLTR:154.96, TEM:46.76, RKLB:72.88,
  RXRX:3.17, SYM:53.36, SERV:9.32, FLNC:16.35,
  ASTS:96.06, HIMS:20.84, BBAI:3.56, PL:35.37,
  AVAV:199.02, AFRM:45.05, HOOD:72.54, NXT:130.42,
  PONY:11.39, DUOL:99.12, LUNR:20.55, KTOS:79.98,
  SOFI:16.56, COIN:181.10, RIVN:15.62, JOBY:8.97,
  ACHR:5.56, CRSP:47.09, SNOW:160.61, DDOG:123.29,
  MNDY:69.28, GTLB:20.67, CELH:35.93, BEAM:23.12,
  BE:150.22, MARA:8.28, TDOC:5.57, APP:436.69,
  MELI:1639.47, AXON:460.15, CRWD:385.86, NU:14.32,
  SOUN:6.36
};

console.log('=== ZONE VIOLATION CHECK ===');
stocks.forEach(s => {
  const p = prices[s.ticker];
  if (!p || !s.starterBuy) return;
  
  // Parse zone from starterBuy string - looking for $X-Y or $X–Y patterns
  const zoneMatch = s.starterBuy.match(/\$(\d+\.?\d*)[-\u2013](\d+\.?\d*)/);
  if (!zoneMatch) {
    // console.log(s.ticker + ': NO PARSEABLE ZONE — ' + s.starterBuy.slice(0, 60));
    return;
  }
  const low = parseFloat(zoneMatch[1]);
  const high = parseFloat(zoneMatch[2]);
  
  const aboveViolation = p > high * 1.20;
  const belowViolation = p < low * 0.80;
  
  if (aboveViolation || belowViolation) {
    const pct = aboveViolation ? ((p - high)/high*100).toFixed(0) : ((low - p)/low*100).toFixed(0);
    const dir = aboveViolation ? 'ABOVE' : 'BELOW';
    console.log(s.ticker + ': $' + p + ' is ' + pct + '% ' + dir + ' zone $' + low + '-' + high + ' [' + s.stage + ']');
  } else {
    // console.log(s.ticker + ': OK at $' + p + ' (zone $' + low + '-' + high + ')');
  }
});
console.log('=== END ===');
