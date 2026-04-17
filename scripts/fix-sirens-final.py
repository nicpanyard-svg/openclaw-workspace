import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Find and remove ALL existing siren label boxes and text (any that reference Warning Siren)
html = re.sub(r'<rect[^>]*>\s*\n\s*<text[^>]*>Warning Siren [AB]</text>\s*\n\s*<text[^>]*>LoRa triggered</text>', '', html)

# Add clean labels far from each siren pole
# Siren A is at translate(320,568) — label goes to the left at x=130, y=670 (well below)
# Siren B is at translate(1570,562) — label goes to the right at x=1700, y=670

labelA = '''
  <rect x="30" y="668" width="188" height="38" rx="6" fill="white" opacity=".93"/>
  <text x="124" y="687" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>
  <text x="124" y="701" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>
'''

labelB = '''
  <rect x="1682" y="668" width="188" height="38" rx="6" fill="white" opacity=".93"/>
  <text x="1776" y="687" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>
  <text x="1776" y="701" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>
'''

# Insert before the satellite section
html = html.replace('  <!-- SATELLITE -->', labelA + labelB + '\n  <!-- SATELLITE -->')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
