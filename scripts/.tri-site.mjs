import { chromium } from '@playwright/test';
const [, , url, wait = '12000'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(url + '&capture=1&hooks=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(+wait);
const rows = await page.evaluate(() => {
  const s = window.__devScene; const out = [];
  s.traverse((o) => { if (!o.isMesh || !o.geometry) return; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; const inst = o.isInstancedMesh ? o.count : 1; out.push([o.name || o.type, Math.round(n * inst), inst, o.visible, o.userData.part || '', o.userData.material || '']); });
  out.sort((a, b) => b[1] - a[1]); return out;
});
let tot = 0; for (const r of rows) tot += r[1];
console.log('meshes', rows.length, 'total tris', tot);
for (const r of rows.slice(0, 40)) console.log(r.join('\t'));
await browser.close();
