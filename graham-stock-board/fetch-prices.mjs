import https from 'node:https';

const tickers = ['PLTR','TEM','RKLB','IONQ','SERV','RXRX'];

function getPrice(ticker) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
    const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const meta = j.chart.result[0].meta;
          resolve({
            ticker,
            price: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose || meta.previousClose,
            open: meta.regularMarketOpen,
            dayHigh: meta.regularMarketDayHigh,
            dayLow: meta.regularMarketDayLow,
            volume: meta.regularMarketVolume
          });
        } catch(e) { resolve({ ticker, error: e.message, raw: data.substring(0,300) }); }
      });
    });
    req.on('error', (e) => resolve({ ticker, error: e.message }));
  });
}

const results = await Promise.all(tickers.map(getPrice));
console.log(JSON.stringify(results, null, 2));
