const tickers = ['PLTR','TEM','RKLB','IONQ','SERV','RXRX'];
async function getPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
  const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}});
  const data = await res.json();
  const q = data.chart.result[0];
  const meta = q.meta;
  const chgPct = ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100);
  return {
    ticker,
    price: meta.regularMarketPrice,
    prevClose: meta.previousClose || meta.chartPreviousClose,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume,
    chgPct: Math.round(chgPct * 100) / 100
  };
}
const results = await Promise.all(tickers.map(getPrice));
console.log(JSON.stringify(results, null, 2));
