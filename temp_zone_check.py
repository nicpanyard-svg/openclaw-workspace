import json, re
from pathlib import Path
board = json.loads(Path(r'C:\Users\IkeFl\.openclaw\workspace\graham-stock-board\board.seed.json').read_text())
prices = {'IONQ':44.07,'PLTR':144.16,'RKLB':85.04,'RXRX':3.56,'SERV':9.5,'TEM':52.0,'MELI':1830.465,'SOUN':7.975,'HIMS':28.895,'AFRM':63.505,'APP':456.16,'AXON':387.08,'CRWD':447.428,'NU':14.615}
pat = re.compile(r'\$?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)')
for c in board['cards']:
    t = c['ticker']
    if t not in prices:
        continue
    nums = [float(x.replace(',', '')) for x in pat.findall(c.get('starterBuy',''))]
    if len(nums) >= 2:
        lo, hi = nums[0], nums[1]
        p = prices[t]
        if p < lo*0.8 or p > hi*1.2:
            print(f'{t} OUT {p} vs {lo}-{hi}')
