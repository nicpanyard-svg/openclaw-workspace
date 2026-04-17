import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Offset the Gateway B siren alert line so it doesn't run through the pole
# Original: M1384,498 Q1478,516 1570,432
html = html.replace(
    'path d="M1384,498 Q1478,516 1570,432"',
    'path d="M1400,496 Q1510,440 1588,412"'
)

# Offset the Gateway A siren alert line similarly
html = html.replace(
    'path d="M476,498 Q400,522 340,438"',
    'path d="M476,496 Q412,454 356,412"'
)

# Offset the siren → community line so it doesn't go through the siren pole
html = html.replace(
    'path d="M1570,400 Q1630,640 1652,872"',
    'path d="M1592,400 Q1660,640 1670,872"'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
