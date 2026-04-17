path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Move Siren B label above the siren (siren is at y=562, top of siren at y=562-168=394)
# Label was at y=382, move higher to y=348 and shift right to avoid pole
html = html.replace(
    '<rect x="1490" y="382" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="1570" y="401" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1570" y="415" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="1600" y="440" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="1680" y="459" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1680" y="473" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

# Also move Siren A label to avoid overlap
html = html.replace(
    '<rect x="240" y="388" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="320" y="407" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="320" y="421" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="110" y="440" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="190" y="459" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="190" y="473" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

# Reroute alert line for Siren B — go around the right side of the siren
html = html.replace(
    'path d="M1400,496 Q1510,440 1588,412"',
    'path d="M1400,496 Q1460,420 1620,450"'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
