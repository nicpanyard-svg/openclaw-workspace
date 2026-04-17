path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Current: Q820,300 curves left which crosses field assets
# Satellite at x=950, y=40. iNet core top at x=950, y=762
# Route it cleanly down the right side, avoiding Station 04 at x=950
# Arc slightly right through clear space between gateway zones
html = html.replace(
    'path d="M938,57 Q820,300 875,762" fill="none" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".7"/>',
    'path d="M958,57 Q1080,380 1000,762" fill="none" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".72"/>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
