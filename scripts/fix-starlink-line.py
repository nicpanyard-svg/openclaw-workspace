path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Starlink satellite-to-core line currently goes straight down x=938
# Station 04 is at x=950, y=256 — so route the line to the left, avoiding the station
html = html.replace(
    '<line x1="938" y1="57" x2="885" y2="762" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".7"/>',
    '<path d="M938,57 Q820,300 875,762" fill="none" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".7"/>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
