path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Route satellite→core line through the clear open space on the right side
# between Gateway B (x=1360) and Cell Tower 3 (x=1820)
# Satellite at x=958, y=57 → arc far right through open midfield → core at x=1000, y=762
html = html.replace(
    'path d="M958,57 Q1080,380 1000,762" fill="none" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".72"/>',
    'path d="M962,57 Q1500,300 1020,762" fill="none" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".72"/>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
