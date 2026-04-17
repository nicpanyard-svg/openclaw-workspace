import re
path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace Gateway B building block with solar pole matching Gateway A style
old = '''  <!-- LoRa GATEWAY B — building mount -->
  <g transform="translate(1360,555)">
    <polygon points="-34,0 -34,56 34,56 34,0" fill="#c4d8ea"/>
    <polygon points="-34,0 0,-22 34,0" fill="#b4ccde"/>
    <polygon points="-48,7 -34,0 -34,56 -48,63" fill="#a4bcce"/>
    <rect x="-20" y="16" width="22" height="18" rx="2" fill="#1a66aa" opacity=".55"/>
    <rect x="-2" y="-80" width="5" height="60" rx="2" fill="#3a5870"/>
    <line x1="0" y1="-70" x2="-15" y2="-57" stroke="#3a5870" stroke-width="2"/>
    <line x1="0" y1="-70" x2="15" y2="-57" stroke="#3a5870" stroke-width="2"/>
    <ellipse cx="0" cy="-84" rx="17" ry="6" fill="none" stroke="#62d0ff" stroke-width="2.5"/>
    <ellipse cx="0" cy="-86" rx="9" ry="4" fill="#0a3060" opacity=".8"/>
    <rect x="-32" y="-20" width="28" height="16" rx="2" fill="#1a3a6a"/>
    <line x1="-18" y1="-20" x2="-18" y2="-4" stroke="#4a68ba" stroke-width="1"/>
    <rect x="8" y="-56" width="26" height="20" rx="3" fill="#0d2a4a"/>
    <text x="21" y="-43" font-size="7" fill="#f0b844" text-anchor="middle">LoRa GW</text>
    <rect x="-42" y="-56" width="24" height="16" rx="3" fill="#0d3a28"/>
    <text x="-30" y="-45" font-size="7" fill="#50d890" text-anchor="middle">Cell</text>
  </g>
  <rect x="1232" y="618" width="256" height="44" rx="6" fill="white" opacity=".93"/>
  <text x="1360" y="637" font-size="12" font-weight="700" fill="#0a2a4a" text-anchor="middle">LoRa Gateway B</text>
  <text x="1360" y="652" font-size="10" fill="#4a7aaa" text-anchor="middle">Building · Starlink · Cell · Solar</text>'''

new = '''  <!-- LoRa GATEWAY B — solar pole (matching Gateway A) -->
  <g transform="translate(1360,560)">
    <ellipse cx="0" cy="8" rx="26" ry="10" fill="#bcd4e4" opacity=".7"/>
    <rect x="-3" y="-150" width="6" height="158" rx="2" fill="#3a5870"/>
    <ellipse cx="0" cy="-154" rx="17" ry="7" fill="none" stroke="#62d0ff" stroke-width="2.5"/>
    <ellipse cx="0" cy="-156" rx="10" ry="4" fill="#0a3060" opacity=".8"/>
    <line x1="-3" y1="-130" x2="-26" y2="-116" stroke="#3a5870" stroke-width="2.5"/>
    <line x1="3" y1="-130" x2="26" y2="-116" stroke="#3a5870" stroke-width="2.5"/>
    <rect x="-44" y="-122" width="52" height="28" rx="3" fill="#1a3a6a" transform="rotate(-15,-18,-108)"/>
    <line x1="-18" y1="-122" x2="-18" y2="-94" stroke="#4a68ba" stroke-width="1.5" transform="rotate(-15,-18,-108)"/>
    <rect x="-21" y="-84" width="42" height="26" rx="4" fill="#0d2a4a"/>
    <rect x="-19" y="-82" width="38" height="22" rx="3" fill="#163a64"/>
    <text x="2" y="-67" font-size="8" fill="#f0b844" text-anchor="middle">LoRa GW</text>
    <rect x="-19" y="-50" width="24" height="15" rx="3" fill="#0d3a28"/>
    <text x="-7" y="-39" font-size="7" fill="#50d890" text-anchor="middle">Cell</text>
  </g>
  <rect x="1232" y="614" width="256" height="44" rx="6" fill="white" opacity=".93"/>
  <text x="1360" y="633" font-size="12" font-weight="700" fill="#0a2a4a" text-anchor="middle">LoRa Gateway B</text>
  <text x="1360" y="648" font-size="10" fill="#4a7aaa" text-anchor="middle">Solar pole · Starlink · Cell</text>'''

html = html.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
