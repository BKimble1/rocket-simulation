// Screenshot the running app: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [dpr]
// Uses Chromium with SwiftShader (software WebGL) in this environment: pictures are faithful,
// frame rates are NOT representative of a GPU.
import { chromium } from '@playwright/test';
const withCapture = (u) => (u.includes('capture=1') ? u : u + (u.includes('?') ? '&' : '?') + 'capture=1');
const [, , url, out, w = '1440', h = '900', wait = '4000', dpr = '1'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(withCapture(url), { waitUntil: 'networkidle' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
