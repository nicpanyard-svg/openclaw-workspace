path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Remove all existing siren label boxes
import re
html = re.sub(r'<rect x="[0-9]+" y="[0-9]+" width="1[0-9][0-9]" height="3[0-9]" rx="6" fill="white" opacity="\.93"/>\s*\n\s*<text[^>]*>Warning Siren [AB]</text>\s*\n\s*<text[^>]*>LoRa triggered</text>', '', html)

# Siren A is at translate(320,568) — base at y=568, so label below at y=582
labelA = '''  <rect x="232" y="582" width="176" height="36" rx="6" fill="white" opacity=".93"/>
  <text x="320" y="600" font-size="11" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>
  <text x="320" y="613" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'''

# Siren B is at translate(1570,562) — base at y=562, so label below at y=576
labelB = '''  <rect x="1482" y="576" width="176" height="36" rx="6" fill="white" opacity=".93"/>
  <text x="1570" y="594" font-size="11" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>
  <text x="1570" y="607" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'''

html = html.replace('  <!-- SATELLITE -->', labelA + '\n\n' + labelB + '\n\n  <!-- SATELLITE -->')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
