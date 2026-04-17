import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

html = re.sub(r'\n  <!-- BRIDGE crossing river perpendicularly at x=950 -->.*?opacity="\.4"/>',
              '', html, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
