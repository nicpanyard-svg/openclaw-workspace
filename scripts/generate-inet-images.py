import urllib.request, json, os, time, urllib.error

KEY = os.environ.get('OPENAI_API_KEY', '')
OUT = 'C:/Users/IkeFl/.openclaw/workspace/inet-world/images'
os.makedirs(OUT, exist_ok=True)

if not KEY:
    raise RuntimeError('OPENAI_API_KEY environment variable is required')

scenes = [
    ('water', 'Isometric 3D illustration of water and wastewater infrastructure. Treatment plant building, large cylindrical storage tanks, lift station, pipe networks, telemetry equipment, operations building. Clean enterprise technical illustration style, white background, no text, no logos, blue-green color palette, professional infrastructure brochure quality.'),
    ('solar', 'Isometric 3D illustration of a solar energy field and utility infrastructure. Rows of solar panels, power substation with transformers, remote monitoring equipment, communications tower. Clean enterprise technical illustration style, white background, no text, no logos, warm yellows and earth tones, professional infrastructure brochure quality.'),
    ('midstream', 'Isometric 3D illustration of oil and gas midstream infrastructure. Pipeline running across terrain, compressor station buildings, pump station, industrial equipment, remote monitoring antennas. Clean enterprise technical illustration style, white background, no text, no logos, industrial color palette, professional infrastructure brochure quality.'),
    ('retail', 'Isometric 3D illustration of distributed retail network connectivity. Multiple store buildings across a landscape, network operations center, wireless connectivity links between locations, managed networking equipment. Clean enterprise technical illustration style, white background, no text, no logos, blue and neutral color palette, professional brochure quality.'),
    ('hospital', 'Isometric 3D illustration of a hospital and healthcare facility with critical communications infrastructure. Large hospital building, backup communications equipment, emergency alert systems, satellite dish, network infrastructure. Clean enterprise technical illustration style, white background, no text, no logos, clinical blue and white color palette, professional brochure quality.'),
    ('manufacturing', 'Isometric 3D illustration of a manufacturing plant with industrial networking. Factory building with machinery visible, production floor, communications tower, OT network equipment, operations monitoring center. Clean enterprise technical illustration style, white background, no text, no logos, industrial green and grey color palette, professional infrastructure brochure quality.'),
    ('maritime', 'Isometric 3D illustration of maritime and port operations with satellite connectivity. Port facility with dock, cargo vessel, satellite communications equipment, operations center, wireless networking infrastructure. Clean enterprise technical illustration style, white background, no text, no logos, ocean blue color palette, professional brochure quality.'),
    ('upstream', 'Isometric 3D illustration of upstream oil and gas drilling operations in remote terrain. Drill rig, drill pad, crew camp facilities, satellite dish, remote communications equipment, rugged landscape. Clean enterprise technical illustration style, white background, no text, no logos, earth tones and industrial colors, professional infrastructure brochure quality.'),
]

for name, prompt in scenes:
    out_path = f'{OUT}/{name}.png'
    if os.path.exists(out_path):
        print(f'SKIP {name} (already exists)')
        continue
    print(f'Generating {name}...')
    body = json.dumps({'model':'dall-e-3','prompt':prompt,'n':1,'size':'1792x1024','quality':'hd'}).encode()
    req = urllib.request.Request('https://api.openai.com/v1/images/generations', data=body, headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    try:
        resp = json.load(urllib.request.urlopen(req))
        img_url = resp['data'][0]['url']
        urllib.request.urlretrieve(img_url, out_path)
        print(f'  saved {name}.png')
        time.sleep(2)
    except urllib.error.HTTPError as e:
        print(f'  ERR {name}: {e.code} {e.read().decode()}')
        time.sleep(5)

print('Done.')
