import re

path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Remove bridge block — everything between bridge start and road lines end
html = re.sub(r'<!-- Bridge structure -->.*?stroke-dasharray="8 6"/>\'?', '', html, flags=re.DOTALL)

# Also remove any leftover road crossing rects near x=874-1060 y=290-360
html = re.sub(r'<rect x="892" y="320"[^/]*/>', '', html)
html = re.sub(r'<rect x="1030" y="320"[^/]*/>', '', html)
html = re.sub(r'<rect x="866" y="30[48]"[^/]*/>', '', html)
html = re.sub(r'<path d="M892,308[^/]*/>', '', html)
html = re.sub(r'<line x1="940" y1="306"[^/]*/>', '', html)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)

print('done')
