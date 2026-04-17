// Get stock prices and check news
const https = require('https');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/html',
      ...headers
    };
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: defaultHeaders
    };
    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function getPrice(ticker) {
  try {
    const r = await fetchUrl(`https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`);
    if (r.status === 200) {
      const lines = r.body.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(',');
        // Symbol,Date,Time,Open,High,Low,Close,Volume
        return { 
          ticker, 
          date: parts[1],
          time: parts[2],
          open: parseFloat(parts[3]),
          high: parseFloat(parts[4]),
          low: parseFloat(parts[5]),
          price: parseFloat(parts[6]),
          volume: parts[7],
          source: 'stooq' 
        };
      }
    }
  } catch(e) {}
  return { ticker, price: null, source: 'failed' };
}

async function getNews(ticker) {
  try {
    // Try RSS feed from SeekingAlpha or similar
    const r = await fetchUrl(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`);
    if (r.status === 200 && r.body.includes('<item>')) {
      // Extract first 3 headlines
      const items = r.body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      return items.slice(1, 4).map(i => i.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, ''));
    }
  } catch(e) {}
  return [];
}

async function main() {
  const tickers = ['IONQ', 'RKLB', 'SOUN'];
  const [prices, news] = await Promise.all([
    Promise.all(tickers.map(getPrice)),
    Promise.all(tickers.map(getNews))
  ]);
  
  const result = prices.map((p, i) => ({ ...p, headlines: news[i] }));
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
