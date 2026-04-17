import re

with open(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\index.html', encoding='utf-8') as f:
    c = f.read()

tickers = re.findall(r"ticker: '(\w+)'", c)
zones = re.findall(r"starterBuy: '([^']+)'", c)
for t, z in zip(tickers, zones):
    print(t, '->', z)
