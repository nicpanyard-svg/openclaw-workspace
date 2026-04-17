path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# ===== OPTIMIZED CONNECTIONS BLOCK =====
old_connections = '''  <!-- ======= CONNECTIONS ======= -->

  <!-- LoRa (amber) — sensors → gateways -->
  <path d="M430,228 Q462,398 494,480" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".6"/>
  <path d="M690,222 Q614,378 506,480" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".6"/>
  <path d="M1190,220 Q1256,390 1352,475" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".6"/>
  <path d="M1440,218 Q1410,386 1366,475" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".6"/>
  <path d="M160,200 Q296,358 492,478" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".65"/>
  <path d="M950,204 Q768,358 506,478" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".55"/>
  <path d="M950,204 Q1148,358 1352,475" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".55"/>
  <path d="M1720,200 Q1558,358 1366,475" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".65"/>

  <!-- LoRa (amber) — gateway → sirens (broadcast) -->
  <path d="M476,496 Q412,454 356,412" fill="none" stroke="#f0b844" stroke-width="3" stroke-dasharray="6 4" opacity=".75"/>
  <path d="M1400,496 Q1460,420 1620,450" fill="none" stroke="#f0b844" stroke-width="3" stroke-dasharray="6 4" opacity=".75"/>

  <!-- Starlink (blue) — gateways → satellite → core -->
  <path d="M500,408 Q680,140 950,54" fill="none" stroke="#62d0ff" stroke-width="3" stroke-dasharray="12 7" opacity=".75"/>
  <path d="M1360,473 Q1138,140 950,54" fill="none" stroke="#62d0ff" stroke-width="3" stroke-dasharray="12 7" opacity=".75"/>
  <line x1="950" y1="56" x2="950" y2="762" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".75"/>

  <!-- Cellular (green) — RTUs → nearest tower -->
  <path d="M160,178 Q130,428 100,640" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".7"/>
  <path d="M968,164 Q1060,450 980,638" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".7"/>
  <path d="M1720,178 Q1770,438 1820,640" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".7"/>
  <path d="M524,518 Q350,606 108,732" fill="none" stroke="#50d890" stroke-width="2.5" stroke-dasharray="10 6" opacity=".55"/>
  <path d="M1384,514 Q1600,606 1816,732" fill="none" stroke="#50d890" stroke-width="2.5" stroke-dasharray="10 6" opacity=".55"/>

  <!-- Cell towers → core -->
  <path d="M100,740 Q430,775 880,800" fill="none" stroke="#50d890" stroke-width="2.5" stroke-dasharray="10 6" opacity=".5"/>
  <line x1="950" y1="740" x2="952" y2="762" stroke="#50d890" stroke-width="2.5" stroke-dasharray="10 6" opacity=".5"/>
  <path d="M1820,740 Q1490,775 1020,800" fill="none" stroke="#50d890" stroke-width="2.5" stroke-dasharray="10 6" opacity=".5"/>

  <!-- Core → Ops Center -->
  <path d="M880,842 Q620,856 384,904" fill="none" stroke="#62d0ff" stroke-width="3" marker-end="url(#arr)" opacity=".7"/>

  <!-- Siren → Community (alert line) -->
  <path d="M1592,400 Q1660,640 1670,872" fill="none" stroke="#d03030" stroke-width="3" stroke-dasharray="7 4" opacity=".7"/>'''

new_connections = '''  <!-- ======= CONNECTIONS ======= -->

  <!-- LoRa (amber) — LoRa sensors → nearest gateway (short clean arcs) -->
  <path d="M430,230 Q460,370 492,474" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".7"/>
  <path d="M690,224 Q610,370 508,474" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".7"/>
  <path d="M1190,222 Q1250,370 1350,470" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".7"/>
  <path d="M1440,220 Q1408,370 1364,470" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="8 5" opacity=".7"/>

  <!-- LoRa (amber) — RTUs optional LoRa path → nearest gateway -->
  <path d="M170,202 Q330,360 490,472" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".45"/>
  <path d="M958,206 Q750,360 504,472" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".35"/>
  <path d="M942,206 Q1140,360 1350,470" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".35"/>
  <path d="M1710,202 Q1550,360 1364,470" fill="none" stroke="#f0b844" stroke-width="2" stroke-dasharray="8 5" opacity=".45"/>

  <!-- LoRa (amber) — gateways → sirens (broadcast, arc outward) -->
  <path d="M478,478 Q400,445 336,416" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="6 4" opacity=".7"/>
  <path d="M1382,478 Q1470,430 1590,416" fill="none" stroke="#f0b844" stroke-width="2.5" stroke-dasharray="6 4" opacity=".7"/>

  <!-- Starlink (blue) — Gateway A up-left to satellite, Gateway B up-right to satellite -->
  <path d="M492,406 Q660,200 936,57" fill="none" stroke="#62d0ff" stroke-width="3" stroke-dasharray="12 7" opacity=".72"/>
  <path d="M1368,468 Q1160,200 964,57" fill="none" stroke="#62d0ff" stroke-width="3" stroke-dasharray="12 7" opacity=".72"/>
  <!-- Satellite down to core (offset slightly to avoid center overlap) -->
  <line x1="938" y1="57" x2="885" y2="762" stroke="#62d0ff" stroke-width="3.5" stroke-dasharray="12 7" opacity=".7"/>

  <!-- Cellular (green) — RTU 01 → Tower 1, RTU 04 → Tower 2 (curved right), RTU 07 → Tower 3 -->
  <path d="M148,180 Q120,440 98,638" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".65"/>
  <path d="M970,166 Q1070,440 990,636" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".65"/>
  <path d="M1732,180 Q1775,440 1822,638" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".65"/>
  <!-- Gateway cell modems → towers (subtle) -->
  <path d="M520,514 Q340,600 106,730" fill="none" stroke="#50d890" stroke-width="2" stroke-dasharray="10 6" opacity=".4"/>
  <path d="M1382,510 Q1605,600 1818,730" fill="none" stroke="#50d890" stroke-width="2" stroke-dasharray="10 6" opacity=".4"/>

  <!-- Cell towers → iNet core (converging) -->
  <path d="M102,738 Q440,772 878,798" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".6"/>
  <path d="M952,738 Q952,755 952,762" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".6"/>
  <path d="M1818,738 Q1488,772 1022,798" fill="none" stroke="#50d890" stroke-width="3" stroke-dasharray="10 6" opacity=".6"/>

  <!-- Core → Ops Center (main data delivery) -->
  <path d="M878,840 Q614,852 382,902" fill="none" stroke="#62d0ff" stroke-width="4" marker-end="url(#arr)" opacity=".8"/>

  <!-- Siren B → Community (alert, routes around community not through it) -->
  <path d="M1590,396 Q1680,580 1668,860" fill="none" stroke="#d03030" stroke-width="3" stroke-dasharray="7 4" opacity=".65"/>'''

html = html.replace(old_connections, new_connections)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
