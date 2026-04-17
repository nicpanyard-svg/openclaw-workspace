const https = require('https');
const tickers = ['PLTR','TEM','RKLB','IONQ','SERV','RXRX'];
const results = {};
let done = 0;
tickers.forEach(t => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1m&range=1d`;
  https.get(url, {headers:{'User-Agent':'Mozilla/5.0'}}, res => {
    let d='';
    res.on('data',c=>d+=c);
    res.on('end',()=>{
      try {
        const j=JSON.parse(d);
        const meta=j.chart.result[0].meta;
        results[t]={
          price: meta.regularMarketPrice,
          prevClose: meta.previousClose || meta.chartPreviousClose,
          dayHigh: meta.regularMarketDayHigh,
          dayLow: meta.regularMarketDayLow,
          volume: meta.regularMarketVolume
        };
      } catch(e){ results[t]={error:e.message}; }
      if(++done===tickers.length) console.log(JSON.stringify(results,null,2));
    });
  }).on('error',e=>{ results[t]={error:e.message}; if(++done===tickers.length) console.log(JSON.stringify(results,null,2)); });
});
