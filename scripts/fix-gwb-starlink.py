path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Gateway B is at x=1360, y=560
# Starlink dish top is at y=560-154=406
# Satellite is at x=950, y=40
# Route: start at top of Gateway B dish, arc up-left to satellite cleanly
# Current: M1368,468 Q1160,200 964,57 — starts too low (468 is below the dish top)
html = html.replace(
    'path d="M1368,468 Q1160,200 964,57"',
    'path d="M1360,406 Q1180,200 964,57"'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
