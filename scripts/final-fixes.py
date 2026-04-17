import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Fix Gateway A label - remove PTZ reference
html = html.replace('Solar pole · Starlink · Cell · PTZ', 'Solar pole · Starlink · Cell')

# Move siren labels to float BELOW the sirens, not overlapping them
# Siren A at translate(320,568) — bottom of siren at y=568+8=576, so label goes at y=590
html = html.replace(
    '<rect x="30" y="668" width="188" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="124" y="687" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="124" y="701" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="230" y="588" width="168" height="36" rx="6" fill="white" opacity=".93"/>\n  <text x="314" y="607" font-size="11" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="314" y="619" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

# Siren B at translate(1570,562) — label to the left of the siren
html = html.replace(
    '<rect x="1682" y="668" width="188" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="1776" y="687" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1776" y="701" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="1390" y="582" width="168" height="36" rx="6" fill="white" opacity=".93"/>\n  <text x="1474" y="601" font-size="11" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1474" y="613" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

# Fix alert line from Siren B → community — route it to go left of the community not through it
html = html.replace(
    'path d="M1590,396 Q1680,580 1668,860"',
    'path d="M1590,396 Q1560,640 1490,858"'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
