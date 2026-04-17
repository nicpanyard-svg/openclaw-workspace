/**
 * Playwright script: fetch isometric SVG illustrations for iNet World v2
 * Tries svgrepo.com first, then falls back to inline SVG generation.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const IMAGES_DIR = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\inet-world\\images';
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const scenes = [
  { name: 'midstream',     queries: ['oil rig pipeline isometric', 'pipeline industrial', 'oil pump isometric'] },
  { name: 'solar',         queries: ['solar farm isometric', 'solar panel farm', 'solar energy isometric'] },
  { name: 'city',          queries: ['city isometric', 'city buildings isometric', 'smart city isometric'] },
  { name: 'hospital',      queries: ['hospital isometric', 'hospital building isometric', 'medical building'] },
  { name: 'manufacturing', queries: ['factory isometric', 'manufacturing plant isometric', 'industrial factory'] },
  { name: 'water',         queries: ['dam reservoir isometric', 'water dam isometric', 'water treatment plant'] },
  { name: 'retail',        queries: ['retail store isometric', 'convenience store isometric', 'store building isometric'] },
  { name: 'substation',    queries: ['power substation isometric', 'electric substation', 'power plant isometric'] },
  { name: 'flood',         queries: ['flood sensor isometric', 'river flood monitoring', 'flood plain sensor'] },
  { name: 'construction',  queries: ['construction site isometric', 'building construction isometric', 'construction crane isometric'] },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function trySvgrepo(page, scene) {
  for (const q of scene.queries) {
    try {
      const encoded = encodeURIComponent(q);
      await page.goto(`https://www.svgrepo.com/vectors/${encoded}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Get first result SVG link
      const svgLinks = await page.evaluate(() => {
        const items = document.querySelectorAll('a[href*="/vector/"]');
        return Array.from(items).slice(0, 5).map(a => a.href);
      });

      if (!svgLinks.length) continue;

      // Go to first result page
      await page.goto(svgLinks[0], { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      // Find download SVG button or direct SVG URL
      const svgUrl = await page.evaluate(() => {
        // Look for download link
        const dlBtn = document.querySelector('a[href$=".svg"], a[download][href*="svg"]');
        if (dlBtn) return dlBtn.href;
        // Look for SVG in page
        const svgEl = document.querySelector('svg');
        if (svgEl) {
          return 'inline:' + svgEl.outerHTML;
        }
        return null;
      });

      if (!svgUrl) continue;

      const dest = path.join(IMAGES_DIR, `${scene.name}.svg`);

      if (svgUrl.startsWith('inline:')) {
        fs.writeFileSync(dest, svgUrl.slice(7));
        console.log(`✓ ${scene.name}: inline SVG saved from svgrepo (${q})`);
        return true;
      } else {
        await download(svgUrl, dest);
        const stat = fs.statSync(dest);
        if (stat.size > 500) {
          console.log(`✓ ${scene.name}: downloaded ${stat.size}b from svgrepo (${q})`);
          return true;
        }
        fs.unlinkSync(dest);
      }
    } catch (e) {
      console.log(`  svgrepo attempt failed for ${scene.name}/${q}: ${e.message}`);
    }
  }
  return false;
}

async function tryIconscout(page, scene) {
  try {
    const q = scene.queries[0];
    await page.goto(`https://iconscout.com/illustrations?q=${encodeURIComponent(q)}&price=free&asset=illustration`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await page.waitForTimeout(2000);
    // Find first illustration
    const link = await page.evaluate(() => {
      const a = document.querySelector('.grid-item a, [class*="item"] a[href*="/illustration/"]');
      return a ? a.href : null;
    });
    if (!link) return false;

    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Try to find SVG download
    const svgContent = await page.evaluate(() => {
      const svg = document.querySelector('svg[width][height]');
      return svg ? svg.outerHTML : null;
    });

    if (svgContent) {
      const dest = path.join(IMAGES_DIR, `${scene.name}.svg`);
      fs.writeFileSync(dest, svgContent);
      console.log(`✓ ${scene.name}: SVG from iconscout`);
      return true;
    }
  } catch (e) {
    console.log(`  iconscout failed for ${scene.name}: ${e.message}`);
  }
  return false;
}

// Fallback: generate high-quality inline SVG illustrations
function generateFallbackSvg(scene) {
  const svgs = {
    midstream: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a3a5c"/><stop offset="100%" stop-color="#0d2035"/></linearGradient>
      <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a2a"/><stop offset="100%" stop-color="#0f1f15"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#sky)"/>
      <ellipse cx="200" cy="260" rx="200" ry="40" fill="url(#gnd)"/>
      <!-- Pipeline -->
      <rect x="20" y="190" width="360" height="18" rx="9" fill="#4a6741" stroke="#5a8050" stroke-width="1.5"/>
      <rect x="20" y="195" width="360" height="6" rx="3" fill="#6aad5a" opacity=".4"/>
      <!-- Pump station -->
      <rect x="150" y="145" width="100" height="55" rx="4" fill="#2a4a6a" stroke="#3a6a9a" stroke-width="1.5"/>
      <rect x="165" y="130" width="70" height="20" rx="3" fill="#1e3854" stroke="#2d5a80" stroke-width="1"/>
      <rect x="190" y="110" width="20" height="25" rx="2" fill="#3a6090"/>
      <!-- Tank -->
      <ellipse cx="310" cy="168" rx="35" ry="10" fill="#3a5a3a" stroke="#5a8a5a" stroke-width="1"/>
      <rect x="275" y="168" width="70" height="40" fill="#2a4a2a" stroke="#4a7a4a" stroke-width="1"/>
      <ellipse cx="310" cy="208" rx="35" ry="10" fill="#2a4a2a" stroke="#4a7a4a" stroke-width="1"/>
      <!-- Flare stack -->
      <rect x="85" y="130" width="8" height="65" fill="#5a7a5a" stroke="#4a6a4a" stroke-width="1"/>
      <ellipse cx="89" cy="128" rx="6" ry="4" fill="#ff6a00" opacity=".8"/>
      <ellipse cx="89" cy="124" rx="4" ry="3" fill="#ffaa00" opacity=".6"/>
      <!-- Labels -->
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">MIDSTREAM PIPELINE</text>
    </svg>`,

    solar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d1f35"/><stop offset="100%" stop-color="#1a3a5c"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#sk)"/>
      <ellipse cx="200" cy="270" rx="200" ry="30" fill="#1a2a1a"/>
      <!-- Sun -->
      <circle cx="50" cy="60" r="20" fill="#ffcc44" opacity=".7"/>
      <line x1="50" y1="30" x2="50" y2="20" stroke="#ffcc44" stroke-width="2" opacity=".5"/>
      <line x1="50" y1="90" x2="50" y2="100" stroke="#ffcc44" stroke-width="2" opacity=".5"/>
      <line x1="20" y1="60" x2="10" y2="60" stroke="#ffcc44" stroke-width="2" opacity=".5"/>
      <line x1="80" y1="60" x2="90" y2="60" stroke="#ffcc44" stroke-width="2" opacity=".5"/>
      <!-- Solar panels row 1 -->
      <g transform="translate(60,150)">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="10" x2="50" y2="10" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="20" x2="50" y2="20" stroke="#2a5a9a" stroke-width=".5"/>
        <rect x="10" y="28" width="30" height="15" rx="1" fill="#2a3a2a"/>
      </g>
      <g transform="translate(120,150)">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="10" x2="50" y2="10" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="20" x2="50" y2="20" stroke="#2a5a9a" stroke-width=".5"/>
        <rect x="10" y="28" width="30" height="15" rx="1" fill="#2a3a2a"/>
      </g>
      <g transform="translate(180,150)">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="10" x2="50" y2="10" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="20" x2="50" y2="20" stroke="#2a5a9a" stroke-width=".5"/>
        <rect x="10" y="28" width="30" height="15" rx="1" fill="#2a3a2a"/>
      </g>
      <g transform="translate(240,150)">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="10" x2="50" y2="10" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="0" y1="20" x2="50" y2="20" stroke="#2a5a9a" stroke-width=".5"/>
        <rect x="10" y="28" width="30" height="15" rx="1" fill="#2a3a2a"/>
      </g>
      <!-- Inverter/substation box -->
      <rect x="290" y="170" width="60" height="45" rx="4" fill="#1e3a5a" stroke="#2d5a8a" stroke-width="1.5"/>
      <rect x="300" y="175" width="20" height="12" rx="2" fill="#3a6a9a"/>
      <circle cx="325" cy="195" r="7" fill="none" stroke="#62d0ff" stroke-width="1.5"/>
      <!-- Row 2 panels (behind) -->
      <g transform="translate(60,110)" opacity=".6">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
      </g>
      <g transform="translate(120,110)" opacity=".6">
        <rect width="50" height="30" rx="2" fill="#1a3a6a" stroke="#2a5a9a" stroke-width="1"/>
        <line x1="16" y1="0" x2="16" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
        <line x1="33" y1="0" x2="33" y2="30" stroke="#2a5a9a" stroke-width=".5"/>
      </g>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">SOLAR FARM</text>
    </svg>`,

    city: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="ngt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#060e1c"/><stop offset="100%" stop-color="#0e1f38"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#ngt)"/>
      <rect x="0" y="230" width="400" height="70" fill="#0a1a2a"/>
      <!-- Buildings -->
      <rect x="30" y="160" width="50" height="90" fill="#0d2540" stroke="#1a3f6a" stroke-width="1"/>
      <rect x="35" y="165" width="8" height="8" fill="#ffee88" opacity=".7"/>
      <rect x="48" y="165" width="8" height="8" fill="#ffee88" opacity=".5"/>
      <rect x="61" y="165" width="8" height="8" fill="#ffee88" opacity=".8"/>
      <rect x="35" y="178" width="8" height="8" fill="#ffee88" opacity=".4"/>
      <rect x="48" y="178" width="8" height="8" fill="#88ccff" opacity=".6"/>
      <rect x="61" y="178" width="8" height="8" fill="#ffee88" opacity=".7"/>
      <rect x="35" y="191" width="8" height="8" fill="#88ccff" opacity=".5"/>
      <rect x="48" y="191" width="8" height="8" fill="#ffee88" opacity=".8"/>
      <rect x="61" y="191" width="8" height="8" fill="#ffee88" opacity=".3"/>
      <!-- Tall building center -->
      <rect x="160" y="100" width="80" height="150" fill="#112845" stroke="#1e4a80" stroke-width="1.5"/>
      <rect x="168" y="108" width="14" height="10" fill="#ffee88" opacity=".8"/>
      <rect x="187" y="108" width="14" height="10" fill="#88ccff" opacity=".7"/>
      <rect x="206" y="108" width="14" height="10" fill="#ffee88" opacity=".6"/>
      <rect x="168" y="125" width="14" height="10" fill="#88ccff" opacity=".5"/>
      <rect x="187" y="125" width="14" height="10" fill="#ffee88" opacity=".9"/>
      <rect x="206" y="125" width="14" height="10" fill="#ffee88" opacity=".4"/>
      <rect x="168" y="142" width="14" height="10" fill="#ffee88" opacity=".7"/>
      <rect x="187" y="142" width="14" height="10" fill="#88ccff" opacity=".6"/>
      <rect x="206" y="142" width="14" height="10" fill="#ffee88" opacity=".8"/>
      <rect x="168" y="159" width="14" height="10" fill="#ffee88" opacity=".5"/>
      <rect x="187" y="159" width="14" height="10" fill="#ffee88" opacity=".7"/>
      <rect x="206" y="159" width="14" height="10" fill="#88ccff" opacity=".4"/>
      <rect x="185" y="92" width="30" height="12" fill="#0e2040" stroke="#1e4a80" stroke-width="1"/>
      <line x1="200" y1="80" x2="200" y2="92" stroke="#3a6aaa" stroke-width="2"/>
      <!-- Mid building right -->
      <rect x="290" y="140" width="70" height="110" fill="#0e2540" stroke="#1a3f6a" stroke-width="1"/>
      <rect x="296" y="148" width="10" height="8" fill="#ffee88" opacity=".7"/>
      <rect x="312" y="148" width="10" height="8" fill="#88ccff" opacity=".6"/>
      <rect x="328" y="148" width="10" height="8" fill="#ffee88" opacity=".5"/>
      <rect x="344" y="148" width="10" height="8" fill="#ffee88" opacity=".8"/>
      <!-- Roads -->
      <rect x="0" y="228" width="400" height="6" fill="#151f2a"/>
      <line x1="0" y1="231" x2="400" y2="231" stroke="#ffcc22" stroke-width=".5" stroke-dasharray="20,15" opacity=".4"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">SMART CITY</text>
    </svg>`,

    hospital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d1f35"/><stop offset="100%" stop-color="#1a2f4a"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#hbg)"/>
      <rect x="0" y="235" width="400" height="65" fill="#0a1520"/>
      <!-- Main building -->
      <rect x="100" y="110" width="200" height="130" fill="#0d2845" stroke="#1a4a80" stroke-width="2"/>
      <!-- Cross on top -->
      <rect x="185" y="85" width="30" height="30" fill="#0d2845" stroke="#1a4a80" stroke-width="1"/>
      <rect x="190" y="88" width="10" height="24" fill="#ff4444" opacity=".9"/>
      <rect x="183" y="95" width="24" height="10" fill="#ff4444" opacity=".9"/>
      <!-- Windows -->
      <rect x="115" y="125" width="22" height="16" rx="2" fill="#88ccff" opacity=".6"/>
      <rect x="145" y="125" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".7"/>
      <rect x="175" y="125" width="22" height="16" rx="2" fill="#88ccff" opacity=".5"/>
      <rect x="205" y="125" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".8"/>
      <rect x="235" y="125" width="22" height="16" rx="2" fill="#88ccff" opacity=".6"/>
      <rect x="265" y="125" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".4"/>
      <rect x="115" y="150" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".7"/>
      <rect x="145" y="150" width="22" height="16" rx="2" fill="#88ccff" opacity=".5"/>
      <rect x="175" y="150" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".9"/>
      <rect x="205" y="150" width="22" height="16" rx="2" fill="#88ccff" opacity=".6"/>
      <rect x="235" y="150" width="22" height="16" rx="2" fill="#ffeeaa" opacity=".7"/>
      <rect x="265" y="150" width="22" height="16" rx="2" fill="#88ccff" opacity=".5"/>
      <!-- Entrance -->
      <rect x="170" y="195" width="60" height="45" fill="#0a2035" stroke="#1a4a80" stroke-width="1"/>
      <rect x="183" y="195" width="16" height="45" fill="#062030" stroke="#1a4a80" stroke-width=".5"/>
      <rect x="201" y="195" width="16" height="45" fill="#062030" stroke="#1a4a80" stroke-width=".5"/>
      <!-- Ambulance bay -->
      <rect x="50" y="210" width="55" height="30" rx="3" fill="#1a3a5a" stroke="#ff3333" stroke-width="1.5"/>
      <rect x="53" y="213" width="50" height="6" fill="#ff3333" opacity=".6"/>
      <text x="77" y="232" text-anchor="middle" font-family="Arial" font-size="8" fill="#fff" font-weight="bold">EMR</text>
      <!-- Helipad -->
      <circle cx="340" cy="215" r="25" fill="none" stroke="#ffcc44" stroke-width="2" opacity=".6"/>
      <text x="340" y="220" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffcc44" font-weight="bold" opacity=".7">H</text>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">HOSPITAL</text>
    </svg>`,

    manufacturing: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="fbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0e1a0e"/><stop offset="100%" stop-color="#1a2a1a"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#fbg)"/>
      <rect x="0" y="230" width="400" height="70" fill="#0a120a"/>
      <!-- Main factory building -->
      <rect x="60" y="130" width="280" height="110" fill="#1a2a1a" stroke="#2a4a2a" stroke-width="2"/>
      <!-- Roof sawtooth -->
      <polygon points="60,130 100,100 140,130" fill="#162416" stroke="#2a4a2a" stroke-width="1"/>
      <polygon points="140,130 180,100 220,130" fill="#162416" stroke="#2a4a2a" stroke-width="1"/>
      <polygon points="220,130 260,100 300,130" fill="#162416" stroke="#2a4a2a" stroke-width="1"/>
      <polygon points="300,130 340,100 340,130" fill="#162416" stroke="#2a4a2a" stroke-width="1"/>
      <!-- Skylights -->
      <rect x="108" y="104" width="25" height="20" fill="#88ccff" opacity=".4"/>
      <rect x="188" y="104" width="25" height="20" fill="#88ccff" opacity=".3"/>
      <rect x="268" y="104" width="25" height="20" fill="#88ccff" opacity=".4"/>
      <!-- Smokestacks -->
      <rect x="70" y="70" width="18" height="65" fill="#2a3a2a" stroke="#3a5a3a" stroke-width="1"/>
      <ellipse cx="79" cy="68" rx="12" ry="5" fill="#3a4a3a" stroke="#4a6a4a" stroke-width="1"/>
      <ellipse cx="79" cy="64" rx="8" ry="8" fill="#666" opacity=".3"/>
      <rect x="110" y="80" width="14" height="55" fill="#2a3a2a" stroke="#3a5a3a" stroke-width="1"/>
      <ellipse cx="117" cy="78" rx="10" ry="4" fill="#3a4a3a" stroke="#4a6a4a" stroke-width="1"/>
      <!-- Windows/garage doors -->
      <rect x="80" y="155" width="45" height="35" fill="#0a180a" stroke="#3a6a3a" stroke-width="1.5"/>
      <rect x="135" y="155" width="45" height="35" fill="#0a180a" stroke="#3a6a3a" stroke-width="1.5"/>
      <rect x="190" y="155" width="45" height="35" fill="#0a180a" stroke="#3a6a3a" stroke-width="1.5"/>
      <rect x="245" y="155" width="45" height="35" fill="#0a180a" stroke="#3a6a3a" stroke-width="1.5"/>
      <!-- Conveyor -->
      <rect x="320" y="180" width="20" height="70" rx="3" fill="#2a3a2a" stroke="#4a6a4a" stroke-width="1" transform="rotate(-30 330 215)"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">MANUFACTURING</text>
    </svg>`,

    water: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs>
        <linearGradient id="wtr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a1e3a"/><stop offset="100%" stop-color="#1a3a5a"/></linearGradient>
        <linearGradient id="dam" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a4a6a"/><stop offset="100%" stop-color="#1a3050"/></linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#wtr)"/>
      <!-- Reservoir water -->
      <ellipse cx="200" cy="180" rx="160" ry="60" fill="#1a4a7a" opacity=".7"/>
      <ellipse cx="200" cy="175" rx="155" ry="55" fill="#1e5a8a" opacity=".5"/>
      <!-- Water ripples -->
      <ellipse cx="200" cy="175" rx="80" ry="15" fill="none" stroke="#4a9acc" stroke-width="1" opacity=".4"/>
      <ellipse cx="200" cy="175" rx="120" ry="25" fill="none" stroke="#4a9acc" stroke-width=".8" opacity=".3"/>
      <!-- Dam wall -->
      <rect x="290" y="140" width="60" height="100" fill="url(#dam)" stroke="#3a6a9a" stroke-width="2"/>
      <rect x="293" y="145" width="7" height="12" fill="#1a3a5a" stroke="#2a5a8a" stroke-width=".5"/>
      <rect x="305" y="145" width="7" height="12" fill="#1a3a5a" stroke="#2a5a8a" stroke-width=".5"/>
      <rect x="317" y="145" width="7" height="12" fill="#1a3a5a" stroke="#2a5a8a" stroke-width=".5"/>
      <rect x="329" y="145" width="7" height="12" fill="#1a3a5a" stroke="#2a5a8a" stroke-width=".5"/>
      <rect x="341" y="145" width="7" height="12" fill="#1a3a5a" stroke="#2a5a8a" stroke-width=".5"/>
      <!-- Spillway flow -->
      <path d="M350 200 Q360 220 365 240" stroke="#4a9acc" stroke-width="3" fill="none" opacity=".6"/>
      <!-- Control building -->
      <rect x="310" y="120" width="40" height="25" fill="#1a3854" stroke="#2a5a80" stroke-width="1"/>
      <rect x="325" y="108" width="12" height="15" fill="#1a2a44" stroke="#2a4a70" stroke-width="1"/>
      <!-- Sensors in water -->
      <circle cx="150" cy="170" r="4" fill="#62d0ff"/>
      <line x1="150" y1="166" x2="150" y2="155" stroke="#62d0ff" stroke-width="1.5"/>
      <circle cx="220" cy="160" r="4" fill="#62d0ff"/>
      <line x1="220" y1="156" x2="220" y2="145" stroke="#62d0ff" stroke-width="1.5"/>
      <!-- Mountains in background -->
      <polygon points="0,160 60,80 120,160" fill="#1a2a3a" opacity=".5"/>
      <polygon points="40,160 120,60 200,160" fill="#152030" opacity=".4"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">WATER / DAM</text>
    </svg>`,

    retail: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="rbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d1520"/><stop offset="100%" stop-color="#1a2535"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#rbg)"/>
      <rect x="0" y="235" width="400" height="65" fill="#0a0f1a"/>
      <!-- Convenience store -->
      <rect x="110" y="130" width="180" height="110" fill="#1a2a3a" stroke="#2a4a6a" stroke-width="2"/>
      <!-- 7-Eleven style canopy -->
      <rect x="90" y="115" width="220" height="20" fill="#e8231c" stroke="#cc1a15" stroke-width="1"/>
      <rect x="90" y="107" width="220" height="10" fill="#1a8a1a" stroke="#158015" stroke-width="1"/>
      <!-- Stripes -->
      <rect x="95" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <rect x="130" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <rect x="165" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <rect x="200" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <rect x="235" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <rect x="270" y="107" width="20" height="28" fill="#ff6600" opacity=".7"/>
      <!-- Store sign -->
      <rect x="140" y="90" width="120" height="20" fill="#ff6600" rx="3"/>
      <text x="200" y="104" text-anchor="middle" font-family="Arial" font-size="11" fill="#fff" font-weight="bold">7-ELEVEN</text>
      <!-- Glass windows/doors -->
      <rect x="120" y="150" width="50" height="55" fill="#1e3a5a" stroke="#3a6a9a" stroke-width="1" opacity=".8"/>
      <rect x="230" y="150" width="50" height="55" fill="#1e3a5a" stroke="#3a6a9a" stroke-width="1" opacity=".8"/>
      <!-- Door -->
      <rect x="180" y="175" width="40" height="65" fill="#152535" stroke="#2a4a6a" stroke-width="1"/>
      <line x1="200" y1="175" x2="200" y2="240" stroke="#3a6a9a" stroke-width=".5"/>
      <!-- Fuel pumps -->
      <rect x="50" y="175" width="20" height="35" rx="2" fill="#1a3a5a" stroke="#2a5a8a" stroke-width="1.5"/>
      <rect x="54" y="178" width="12" height="8" fill="#3a6a9a" opacity=".6"/>
      <rect x="330" y="175" width="20" height="35" rx="2" fill="#1a3a5a" stroke="#2a5a8a" stroke-width="1.5"/>
      <rect x="334" y="178" width="12" height="8" fill="#3a6a9a" opacity=".6"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">RETAIL STORE</text>
    </svg>`,

    substation: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0e1a10"/><stop offset="100%" stop-color="#1a2a1a"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#sbg)"/>
      <rect x="0" y="235" width="400" height="65" fill="#080e08"/>
      <!-- Transmission towers -->
      <g transform="translate(20,60)">
        <line x1="20" y1="0" x2="20" y2="160" stroke="#5a8a5a" stroke-width="3"/>
        <line x1="0" y1="30" x2="40" y2="30" stroke="#5a8a5a" stroke-width="2"/>
        <line x1="5" y1="60" x2="35" y2="60" stroke="#5a8a5a" stroke-width="2"/>
        <line x1="0" y1="30" x2="20" y2="10" stroke="#5a8a5a" stroke-width="1.5"/>
        <line x1="40" y1="30" x2="20" y2="10" stroke="#5a8a5a" stroke-width="1.5"/>
        <circle cx="0" cy="30" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="40" cy="30" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="5" cy="60" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="35" cy="60" r="3" fill="#ffcc44" opacity=".8"/>
      </g>
      <g transform="translate(340,60)">
        <line x1="20" y1="0" x2="20" y2="160" stroke="#5a8a5a" stroke-width="3"/>
        <line x1="0" y1="30" x2="40" y2="30" stroke="#5a8a5a" stroke-width="2"/>
        <line x1="5" y1="60" x2="35" y2="60" stroke="#5a8a5a" stroke-width="2"/>
        <line x1="0" y1="30" x2="20" y2="10" stroke="#5a8a5a" stroke-width="1.5"/>
        <line x1="40" y1="30" x2="20" y2="10" stroke="#5a8a5a" stroke-width="1.5"/>
        <circle cx="0" cy="30" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="40" cy="30" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="5" cy="60" r="3" fill="#ffcc44" opacity=".8"/>
        <circle cx="35" cy="60" r="3" fill="#ffcc44" opacity=".8"/>
      </g>
      <!-- Power lines -->
      <path d="M40,90 Q100,100 180,110" stroke="#ffcc44" stroke-width="1.5" fill="none" opacity=".5" stroke-dasharray="none"/>
      <path d="M360,90 Q300,100 220,110" stroke="#ffcc44" stroke-width="1.5" fill="none" opacity=".5"/>
      <!-- Transformers -->
      <rect x="120" y="155" width="50" height="50" rx="4" fill="#1e3a1e" stroke="#2a6a2a" stroke-width="2"/>
      <ellipse cx="145" cy="153" rx="15" ry="8" fill="#2a4a2a" stroke="#3a6a3a" stroke-width="1.5"/>
      <rect x="230" y="155" width="50" height="50" rx="4" fill="#1e3a1e" stroke="#2a6a2a" stroke-width="2"/>
      <ellipse cx="255" cy="153" rx="15" ry="8" fill="#2a4a2a" stroke="#3a6a3a" stroke-width="1.5"/>
      <!-- Control building -->
      <rect x="160" y="180" width="80" height="45" fill="#162816" stroke="#2a5a2a" stroke-width="1.5"/>
      <rect x="168" y="185" width="18" height="14" rx="1" fill="#88ccff" opacity=".5"/>
      <rect x="214" y="185" width="18" height="14" rx="1" fill="#88ccff" opacity=".5"/>
      <!-- Lightning bolt symbol -->
      <polygon points="200,60 190,90 200,85 195,115 210,82 198,87" fill="#ffcc44" opacity=".9"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">POWER SUBSTATION</text>
    </svg>`,

    flood: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs>
        <linearGradient id="flbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d1a2a"/><stop offset="100%" stop-color="#1a3a5a"/></linearGradient>
        <linearGradient id="fwtr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a5a8a" stop-opacity=".9"/><stop offset="100%" stop-color="#0d3a6a" stop-opacity=".8"/></linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#flbg)"/>
      <!-- Hills/terrain -->
      <path d="M0,200 Q50,150 100,180 Q150,210 200,175 Q250,140 300,170 Q350,200 400,180 L400,300 L0,300 Z" fill="#1a2a1a"/>
      <!-- Flood water -->
      <path d="M0,210 Q40,195 80,205 Q120,215 160,200 Q200,185 240,200 Q280,215 320,205 Q360,195 400,210 L400,300 L0,300 Z" fill="url(#fwtr)" opacity=".85"/>
      <!-- Ripples on water -->
      <ellipse cx="100" cy="225" rx="40" ry="6" fill="none" stroke="#4a9acc" stroke-width="1" opacity=".4"/>
      <ellipse cx="280" cy="220" rx="50" ry="7" fill="none" stroke="#4a9acc" stroke-width="1" opacity=".35"/>
      <!-- Sensor poles -->
      <rect x="80" y="165" width="4" height="45" fill="#e0a030"/>
      <circle cx="82" cy="163" r="6" fill="#ff4444"/>
      <rect x="4" y="163" width="12" height="5" fill="#e0a030" transform="rotate(-45 10 165)"/>
      <text x="68" y="155" font-family="Arial" font-size="7" fill="#62d0ff">H:2.4m</text>
      <rect x="200" y="160" width="4" height="45" fill="#e0a030"/>
      <circle cx="202" cy="158" r="6" fill="#ff6600"/>
      <text x="188" y="150" font-family="Arial" font-size="7" fill="#62d0ff">H:3.1m</text>
      <rect x="310" y="162" width="4" height="40" fill="#e0a030"/>
      <circle cx="312" cy="160" r="6" fill="#ffcc00"/>
      <text x="298" y="152" font-family="Arial" font-size="7" fill="#62d0ff">H:1.8m</text>
      <!-- Siren tower -->
      <rect x="345" y="130" width="10" height="75" fill="#3a4a3a" stroke="#5a6a5a" stroke-width="1"/>
      <ellipse cx="350" cy="128" rx="14" ry="8" fill="#ff3333" stroke="#cc2222" stroke-width="1.5"/>
      <!-- Data transmission arcs -->
      <path d="M82,163 Q140,120 200,158" stroke="#62d0ff" stroke-width="1" fill="none" stroke-dasharray="4,3" opacity=".6"/>
      <path d="M202,158 Q255,115 312,160" stroke="#62d0ff" stroke-width="1" fill="none" stroke-dasharray="4,3" opacity=".6"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">FLOOD MONITORING</text>
    </svg>`,

    construction: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#12180a"/><stop offset="100%" stop-color="#1e2810"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#cbg)"/>
      <rect x="0" y="235" width="400" height="65" fill="#0c1008"/>
      <!-- Building skeleton (under construction) -->
      <!-- Floor slabs -->
      <rect x="100" y="200" width="200" height="8" fill="#3a4a3a" stroke="#5a6a3a" stroke-width="1"/>
      <rect x="100" y="165" width="200" height="8" fill="#3a4a3a" stroke="#5a6a3a" stroke-width="1"/>
      <rect x="100" y="130" width="200" height="8" fill="#3a4a3a" stroke="#5a6a3a" stroke-width="1"/>
      <rect x="100" y="95" width="200" height="8" fill="#3a4a3a" stroke="#5a6a3a" stroke-width="1"/>
      <!-- Columns -->
      <rect x="100" y="95" width="8" height="113" fill="#4a5a3a" stroke="#6a7a4a" stroke-width="1"/>
      <rect x="150" y="95" width="8" height="113" fill="#4a5a3a" stroke="#6a7a4a" stroke-width="1"/>
      <rect x="200" y="95" width="8" height="113" fill="#4a5a3a" stroke="#6a7a4a" stroke-width="1"/>
      <rect x="250" y="95" width="8" height="113" fill="#4a5a3a" stroke="#6a7a4a" stroke-width="1"/>
      <rect x="292" y="95" width="8" height="113" fill="#4a5a3a" stroke="#6a7a4a" stroke-width="1"/>
      <!-- Tower crane -->
      <rect x="310" y="30" width="8" height="210" fill="#ffaa00" stroke="#cc8800" stroke-width="1"/>
      <!-- Crane jib -->
      <rect x="240" y="30" width="130" height="6" fill="#ffaa00" stroke="#cc8800" stroke-width="1"/>
      <rect x="250" y="30" width="6" height="40" fill="#ffaa00" stroke="#cc8800" stroke-width="1"/>
      <line x1="314" y1="30" x2="250" y2="70" stroke="#cc8800" stroke-width="1.5"/>
      <line x1="314" y1="30" x2="370" y2="60" stroke="#cc8800" stroke-width="1.5"/>
      <!-- Counter jib -->
      <rect x="318" y="30" width="50" height="5" fill="#ffaa00" stroke="#cc8800" stroke-width="1"/>
      <!-- Hook wire -->
      <line x1="275" y1="36" x2="275" y2="95" stroke="#888" stroke-width="1" stroke-dasharray="3,2"/>
      <polygon points="270,95 280,95 275,105" fill="#888"/>
      <!-- Construction materials -->
      <rect x="60" y="218" width="40" height="15" fill="#8a6a3a" rx="2"/>
      <rect x="65" y="210" width="35" height="10" fill="#9a7a4a" rx="1"/>
      <rect x="70" y="204" width="30" height="8" fill="#aa8a5a" rx="1"/>
      <!-- Hard hat worker -->
      <circle cx="160" cy="215" r="6" fill="#ffcc00"/>
      <rect x="154" y="219" width="12" height="10" fill="#3a5a8a"/>
      <text x="200" y="290" text-anchor="middle" font-family="Arial" font-size="11" fill="#7ab5e0" letter-spacing="1">CONSTRUCTION / EPC</text>
    </svg>`,
  };
  return svgs[scene.name] || null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0' });
  const page = await ctx.newPage();

  const results = {};

  for (const scene of scenes) {
    const svgPath = path.join(IMAGES_DIR, `${scene.name}.svg`);
    const pngPath = path.join(IMAGES_DIR, `${scene.name}.png`);

    // Check if SVG already exists and is valid
    if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 500) {
      console.log(`⏭  ${scene.name}: SVG already exists`);
      results[scene.name] = 'existing';
      continue;
    }

    console.log(`\n🔍 Fetching: ${scene.name}`);

    // Try svgrepo first
    let ok = await trySvgrepo(page, scene);

    // Try iconscout if svgrepo failed
    if (!ok) {
      ok = await tryIconscout(page, scene);
    }

    // Use generated fallback SVG
    if (!ok) {
      const svg = generateFallbackSvg(scene);
      if (svg) {
        fs.writeFileSync(svgPath, svg);
        console.log(`✓ ${scene.name}: using generated fallback SVG`);
        results[scene.name] = 'generated';
        ok = true;
      }
    }

    if (!ok) {
      // If PNG exists, note it
      if (fs.existsSync(pngPath)) {
        console.log(`⚠  ${scene.name}: no SVG found, will use existing PNG`);
        results[scene.name] = 'png-existing';
      } else {
        console.log(`✗  ${scene.name}: no asset found`);
        results[scene.name] = 'missing';
      }
    } else {
      results[scene.name] = results[scene.name] || 'downloaded';
    }
  }

  await browser.close();

  console.log('\n=== RESULTS ===');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }

  // Write results summary
  fs.writeFileSync(path.join(IMAGES_DIR, 'fetch-results.json'), JSON.stringify(results, null, 2));
  console.log('\nDone! Results saved to images/fetch-results.json');
}

main().catch(console.error);
