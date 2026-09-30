// Storyboard stills on the virtual clock: one page load, then for each mission time: seek, render
// a few frames (the camera shows a seeked moment at once), screenshot. For reviewing framings.
//   node scripts/storyboard.mjs <base-url> <mission> <out-dir> <t1,t2,...> [width] [height] [extra-query] [frames]
// Each still is named <mission>-<t>.png; a JSON line per still reports the framing and counters.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , base, mission, out, times, w = '960', h = '540', extra = 'ui=0', frames = '3'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
await page.goto(`${base}/?v=mission&m=${mission}&virt=1&capture=1&${extra}`, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForFunction(() => typeof window.__rocketAdvance === 'function', null, { timeout: 180000 });
const adv = (n) => page.evaluate((k) => window.__rocketAdvance(k), n);
// let the flight location load and enter
for (let i = 0; i < 60; i++) {
  await adv(1);
  const ok = await page.evaluate(() => window.__rocketFrame.location === 'flight' && !window.__rocketDissolve.active);
  if (ok && i > 5) break;
  await page.waitForTimeout(250);
}
for (const tStr of times.split(',')) {
  const t = +tStr;
  await page.evaluate((x) => window.__rocketSeekMission(x), t);
  await adv(+frames);
  const info = await page.evaluate(() => {
    const d = window.__rocketDirector;
    const f = window.__rocketFrame;
    const gl = window.__rocketGL;
    return { t: +f.missionTime.toFixed(2), key: d.autoKey, subject: d.subject, fov: +f.camFov.toFixed(1), alt: Math.round(f.camAlt), calls: gl.info.render.calls, tris: gl.info.render.triangles, loc: f.location };
  });
  const file = `${out}/${mission}-${tStr}.png`;
  await page.screenshot({ path: file, timeout: 600000 });
  console.log(JSON.stringify({ file, ...info }));
}
if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
await browser.close();
