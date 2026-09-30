// Proof clips on the virtual clock (?virt=1: every rendered frame advances exactly 1/30 s), with
// actions at given frames during the recording (inspect a part, return, change camera...). This
// proves continuity and reproducibility of what the viewer sees, NOT real-time smoothness.
//   node scripts/record-proof.mjs <spec.json> <out-dir>
// spec: { "name", "url" (path+query on the base), "base", "width", "height", "frames",
//         "setup": [steps], "during": [{ "frame": n, ...step }] }
// step: { "eval": "js" } | { "click": "selector" } | { "advance": n } | { "wait": ms }
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const [, , specFile, outDir] = process.argv;
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const { name, url, base = 'http://127.0.0.1:4173', width = 640, height = 360, frames = 180 } = spec;
const tmp = join('/tmp', `proof-${name}-${process.pid}`);
mkdirSync(outDir, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const full = `${base}${url}${url.includes('?') ? '&' : '?'}virt=1&capture=1&trace=1`;
await page.goto(full, { waitUntil: 'networkidle', timeout: 300000 });
await page.waitForFunction(() => typeof window.__rocketAdvance === 'function', null, { timeout: 300000 });
const adv = (n) => page.evaluate((k) => window.__rocketAdvance(k), n);
async function step(s) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.advance) for (let i = 0; i < s.advance; i++) await adv(1);
  if (s.eval) await page.evaluate(s.eval);
  if (s.click) await page.locator(s.click).first().click();
  if (s.until) await page.waitForFunction(s.until, null, { timeout: 300000 });
}
// let the scene load: a few frames with real time in between (textures, workers)
for (let i = 0; i < 20; i++) {
  await adv(1);
  await page.waitForTimeout(150);
}
for (const s of spec.setup ?? []) await step(s);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  for (const d of spec.during ?? []) if (d.frame === i) await step(d);
  await adv(1);
  await page.screenshot({ path: join(tmp, `f${String(i).padStart(5, '0')}.png`), timeout: 600000 });
  if (i % 30 === 0) console.log(`${name}: ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const trace = await page.evaluate(() => (window.__rocketTrace ?? []).slice(-2000));
await browser.close();
const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-movflags', '+faststart', join(outDir, `${name}.mp4`)]);
execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, 'f%05d.png'), '-vf', 'fps=2,scale=320:-1,tile=6x4', '-frames:v', '1', join(outDir, `${name}-sheet.jpg`)]);
writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ spec, renderedAt: new Date().toISOString(), errors, trace: trace.filter((_, i) => i % 3 === 0) }, null, 1));
rmSync(tmp, { recursive: true, force: true });
console.log(join(outDir, `${name}.mp4`), errors.length ? `ERRORS ${errors.length}` : 'ok');
