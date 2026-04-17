import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Make all red alert/siren lines thicker and more opaque
html = re.sub(r'stroke="#d03030" stroke-width="1\.5" stroke-dasharray="7 5" opacity="\.\d+"',
              'stroke="#d03030" stroke-width="3" stroke-dasharray="7 4" opacity=".7"', html)

# Also thicken the siren → community line
html = re.sub(r'stroke="#d03030" stroke-width="1\.5" stroke-dasharray="7 5" opacity="\.\d+"',
              'stroke="#d03030" stroke-width="3" stroke-dasharray="7 4" opacity=".65"', html)

# Make alert box border thicker
html = html.replace('stroke="#d03030" stroke-width="2"/>', 'stroke="#d03030" stroke-width="3"/>')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
