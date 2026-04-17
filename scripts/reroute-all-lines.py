path = r'C:\Users\IkeFl\.openclaw\workspace\out\inet-flood-final.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# ============================================================
# FIELD LAYOUT (for reference when routing):
# Station 01: x=160, y=272  (RTU, PTZ)
# Sensor 02:  x=430, y=274  (LoRa)
# Sensor 03:  x=690, y=268  (LoRa)
# Station 04: x=950, y=256  (RTU, bridge)
# Sensor 05:  x=1190, y=268 (LoRa)
# Sensor 06:  x=1440, y=264 (LoRa)
# Station 07: x=1720, y=268 (RTU)
# Gateway A:  x=500, y=560  (solar pole)
# Gateway B:  x=1360, y=560 (solar pole)
# Siren A:    x=320, y=568
# Siren B:    x=1570, y=562
# Satellite:  x=950, y=40
# Cell T1:    x=100, y=740
# Cell T2:    x=950, y=740
# Cell T3:    x=1820, y=740
# iNet Core:  x=950, y=762-922
# Ops Center: x=270, y=906
# Community:  x=1490-1860, y=862-910
# ============================================================

# CLEAR CORRIDORS:
# Left corridor: x=0-140 (left of Stn01)
# Left-center: x=340-390 (between Siren A and GW A)
# Center-left: x=560-630 (between Sensor 03 and GW A right side)
# Center: x=820-870 (between GW A and Stn04)
# Center-right: x=1030-1080 (between Stn04 and Sensor 05)
# Right-center: x=1240-1340 (between Sensor 06 and GW B)
# Right: x=1640-1720 (between Siren B and Stn07)
# Far right: x=1840-1900

replacements = [
    # LoRa: Sensor 02 → Gateway A — use left arc, stays between Stn01 and GW A
    ('path d="M430,230 Q460,370 492,474"', 'path d="M428,232 Q454,380 492,474"'),
    # LoRa: Sensor 03 → Gateway A — arc through clear x=600 corridor
    ('path d="M690,224 Q610,370 508,474"', 'path d="M688,226 Q620,380 508,474"'),
    # LoRa: Sensor 05 → Gateway B — arc through x=1240 corridor
    ('path d="M1190,222 Q1250,370 1350,470"', 'path d="M1188,224 Q1252,376 1350,470"'),
    # LoRa: Sensor 06 → Gateway B — arc right into GW B
    ('path d="M1440,220 Q1408,370 1364,470"', 'path d="M1438,222 Q1406,372 1364,470"'),

    # LoRa RTU option lines — route through clear space, subtle
    # RTU 01 → GW A: left corridor x=200-300
    ('path d="M170,202 Q330,360 490,472"', 'path d="M168,204 Q280,380 490,472"'),
    # RTU 04 → GW A: center corridor x=820-860
    ('path d="M958,206 Q750,360 504,472"', 'path d="M948,208 Q840,380 504,472"'),
    # RTU 04 → GW B: center-right corridor x=1060-1140
    ('path d="M942,206 Q1140,360 1350,470"', 'path d="M952,208 Q1080,380 1350,470"'),
    # RTU 07 → GW B: right corridor x=1640
    ('path d="M1710,202 Q1550,360 1364,470"', 'path d="M1712,204 Q1620,380 1364,470"'),

    # LoRa: GW A → Siren A — arc left through x=380-420 corridor
    ('path d="M478,478 Q400,445 336,416"', 'path d="M476,476 Q408,438 322,400"'),
    # LoRa: GW B → Siren B — arc right through x=1500-1560 corridor
    ('path d="M1382,478 Q1470,430 1590,416"', 'path d="M1384,476 Q1484,426 1566,398"'),

    # Starlink: GW A → satellite — left arc up through x=680 corridor
    ('path d="M492,406 Q660,200 936,57"', 'path d="M492,404 Q668,160 936,57"'),
    # Starlink: GW B → satellite — right arc up through x=1240 corridor
    ('path d="M1360,406 Q1180,200 964,57"', 'path d="M1360,404 Q1220,160 964,57"'),

    # Cellular: RTU 01 → Tower 1 — route left edge x=80-120
    ('path d="M148,180 Q120,440 98,638"', 'path d="M146,182 Q116,440 98,638"'),
    # Cellular: RTU 04 → Tower 2 — route right x=1040-1060 clear of Sensor 05
    ('path d="M970,166 Q1070,440 990,636"', 'path d="M972,168 Q1080,450 992,636"'),
    # Cellular: RTU 07 → Tower 3 — far right edge x=1780-1840
    ('path d="M1732,180 Q1775,440 1822,638"', 'path d="M1734,182 Q1778,440 1822,638"'),
    # Cellular: GW A cell → Tower 1 — route along lower terrain x=100-400
    ('path d="M520,514 Q340,600 106,730"', 'path d="M518,516 Q330,598 106,730"'),
    # Cellular: GW B cell → Tower 3 — route along lower terrain x=1500-1800
    ('path d="M1382,510 Q1605,600 1818,730"', 'path d="M1384,512 Q1608,598 1818,730"'),

    # Cell towers → core: already fairly clean, slight tightening
    ('path d="M102,738 Q440,772 878,798"', 'path d="M102,738 Q440,770 878,798"'),
    ('path d="M1818,738 Q1488,772 1022,798"', 'path d="M1818,738 Q1488,770 1022,798"'),

    # Core → Ops: route left below community, clean arc
    ('path d="M878,840 Q614,852 382,902"', 'path d="M878,840 Q600,850 382,900"'),

    # Alert: Siren B → Community: stay left of community x=1480
    ('path d="M1590,396 Q1560,640 1490,858"', 'path d="M1566,396 Q1540,640 1486,858"'),
]

for old, new in replacements:
    if old in html:
        html = html.replace(old, new)
    else:
        print(f'NOT FOUND: {old[:60]}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print('done')
