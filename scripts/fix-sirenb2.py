path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Move Siren B label far to the right, clear of the pole
html = html.replace(
    '<rect x="1600" y="440" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="1680" y="459" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1680" y="473" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="1628" y="530" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="1708" y="549" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren B</text>\n  <text x="1708" y="563" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

# Move Siren A label far to the left, clear of the pole
html = html.replace(
    '<rect x="110" y="440" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="190" y="459" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="190" y="473" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>',
    '<rect x="110" y="530" width="160" height="38" rx="6" fill="white" opacity=".93"/>\n  <text x="190" y="549" font-size="12" font-weight="700" fill="#d03030" text-anchor="middle">Warning Siren A</text>\n  <text x="190" y="563" font-size="10" fill="#4a7aaa" text-anchor="middle">LoRa triggered</text>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
