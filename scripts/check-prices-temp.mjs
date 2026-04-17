const tickers = ['KOD', 'PLTR'];

async function getPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
    const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0'}});
    const data = await res.json();
    const meta = data.chart.result[0].meta;
    return { 
      ticker, 
      price: meta.regularMarketPrice, 
      prevClose: meta.previousClose, 
      open: meta.regularMarketOpen, 
      high: meta.regularMarketDayHigh, 
      low: meta.regularMarketDayLow, 
      volume: meta.regularMarketVolume, 
      avgVolume: meta.averageDailyVolume3Month 
    };
  } catch(e) { return { ticker, error: e.message }; }
}

const results = await Promise.all(tickers.map(getPrice));
console.log(JSON.stringify(results, null, 2));
