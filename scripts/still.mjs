// Deterministic still on the virtual clock: loads with ?virt=1&capture=1, renders N frames on
// request (each advances exactly 1/30 s), then screenshots. Works on slow software renderers.
//   node scripts/still.mjs "<url>" <out.png> [width] [height] [frames] [setup-js]
import { chromium } from '@playwright/test';
const [, , url, out, w = '1440', h = '900', frames = '8', setup = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/THREE.Clock/.test(m.text()) && logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url + (url.includes('?') ? '&' : '?') + 'virt=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => typeof window.__rocketAdvance === 'function', null, { timeout: 120000 });
// let async loaders (textures, Suspense) settle, then render frames on request
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__rocketAdvance(1));
  await page.waitForTimeout(400);
}
if (setup) await page.evaluate(setup);
for (let i = 0; i < +frames; i++) await page.evaluate(() => window.__rocketAdvance(1));
await page.waitForTimeout(300);
const info = await page.evaluate(() => {
  const gl = window.__rocketGL;
  const f = window.__rocketFrame;
  return { location: f.location, t: +f.missionTime.toFixed(2), calls: gl.info.render.calls, tris: gl.info.render.triangles };
});
await page.screenshot({ path: out, timeout: 600000 });
console.log(JSON.stringify(info), 'ms', Date.now() - t0);
console.log(logs.slice(0, 12).join('\n'));
await browser.close();
