path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

grass = """
  <!-- GRASS on riverbanks -->
  <!-- Upper bank grass tufts -->
  <g opacity=".55">
    <line x1="80" y1="316" x2="76" y2="302" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="86" y1="314" x2="88" y2="300" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="92" y1="316" x2="90" y2="301" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="240" y1="312" x2="237" y2="298" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="246" y1="311" x2="248" y2="297" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="252" y1="313" x2="250" y2="298" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="400" y1="308" x2="397" y2="294" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="406" y1="307" x2="408" y2="293" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="620" y1="306" x2="617" y2="292" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="626" y1="305" x2="628" y2="291" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="780" y1="304" x2="777" y2="290" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="786" y1="303" x2="788" y2="289" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="1100" y1="304" x2="1097" y2="290" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1106" y1="303" x2="1108" y2="289" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="1300" y1="307" x2="1297" y2="293" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1306" y1="306" x2="1308" y2="292" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="1500" y1="306" x2="1497" y2="292" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1600" y1="305" x2="1597" y2="291" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1750" y1="303" x2="1747" y2="289" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1850" y1="301" x2="1847" y2="287" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
  </g>
  <!-- Lower bank grass tufts -->
  <g opacity=".55">
    <line x1="80" y1="492" x2="76" y2="478" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="86" y1="493" x2="88" y2="479" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="260" y1="490" x2="257" y2="476" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="266" y1="491" x2="268" y2="477" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="450" y1="494" x2="447" y2="480" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="456" y1="493" x2="458" y2="479" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="650" y1="494" x2="647" y2="480" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="850" y1="492" x2="847" y2="478" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1050" y1="494" x2="1047" y2="480" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1056" y1="493" x2="1058" y2="479" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
    <line x1="1250" y1="494" x2="1247" y2="480" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1450" y1="494" x2="1447" y2="480" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1650" y1="493" x2="1647" y2="479" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1750" y1="510" x2="1747" y2="496" stroke="#5a9a4a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="1850" y1="508" x2="1847" y2="494" stroke="#6aaa5a" stroke-width="2" stroke-linecap="round"/>
  </g>
"""

html = html.replace('  <!-- road crossings -->', grass + '\n  <!-- road crossings -->')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
