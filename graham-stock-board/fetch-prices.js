const https = require('https');
const tickers = ['PLTR','IONQ','RKLB','TEM','SERV','RXRX'];
const results = {};
let done = 0;
tickers.forEach(t => {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + t + '?interval=1m&range=1d';
  https.get(url, {headers:{'User-Agent':'Mozilla/5.0'}}, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const j = JSON.parse(data);
        const meta = j.chart.result[0].meta;
        const prev = meta.previousClose || meta.chartPreviousClose;
        results[t] = {
          price: meta.regularMarketPrice,
          prevClose: prev,
          dayHigh: meta.regularMarketDayHigh,
          dayLow: meta.regularMarketDayLow,
          chgPct: (((meta.regularMarketPrice - prev)/prev)*100).toFixed(2)
        };
      } catch(e) { results[t] = {error: e.message, raw: data.substring(0,200)}; }
      if(++done === tickers.length) console.log(JSON.stringify(results, null, 2));
    });
  }).on('error', e => { results[t] = {error: e.message}; if(++done === tickers.length) console.log(JSON.stringify(results, null, 2)); });
});
