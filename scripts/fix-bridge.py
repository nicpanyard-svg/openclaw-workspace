path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

bridge = """
  <!-- BRIDGE crossing river perpendicularly at x=950 -->
  <rect x="940" y="272" width="20" height="106" rx="3" fill="#8a9ab0"/>
  <rect x="936" y="272" width="6" height="106" rx="2" fill="#6a8aaa"/>
  <rect x="958" y="272" width="6" height="106" rx="2" fill="#6a8aaa"/>
  <line x1="950" y1="282" x2="950" y2="368" stroke="white" stroke-width="2" stroke-dasharray="10 8" opacity=".4"/>
"""

html = html.replace('  <!-- STREAM GAUGE 04 (bridge) -->', bridge + '\n  <!-- STREAM GAUGE 04 (bridge) -->')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
