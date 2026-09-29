// Render a clip frame by frame on the virtual clock (?virt=1: each frame advances exactly
// 1/30 s), so camera and mission continuity can be judged smoothly even on a software renderer.
// This proves continuity and reproducibility, NOT real-time smoothness.
//   node scripts/record-virtual.mjs <name> "<url>" <frames> [width] [height] [setup-json]
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [, , name, url, frames = '180', w = '1280', h = '720', setupJson = '[]'] = process.argv;
const outDir = 'docs/recordings/virtual';
const tmp = join('/tmp', `vrec-${name}-${process.pid}`);
mkdirSync(outDir, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const u = url + (url.includes('?') ? '&' : '?') + 'virt=1&capture=1';
await page.goto(u, { waitUntil: 'networkidle' });
const adv = (n) => page.evaluate((k) => window.__rocketAdvance(k), n);
await page.waitForFunction(() => typeof window.__rocketAdvance === 'function', null, { timeout: 60000 });
for (let i = 0; i < 20; i++) {
  await adv(1);
  await page.waitForTimeout(30);
}
for (const st of JSON.parse(setupJson)) {
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.advance) for (let i = 0; i < st.advance; i++) await adv(1);
  if (st.click) await page.locator(st.click).first().click();
  if (st.eval) await page.evaluate(st.eval);
}
const canvas = page.locator('canvas').first();
for (let i = 0; i < +frames; i++) {
  await adv(1);
  await page.screenshot({ path: join(tmp, `f${String(i).padStart(5, '0')}.png`) });
}
await browser.close();
const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(outDir, `${name}.mp4`)]);
writeFileSync(join(outDir, `${name}.txt`), `virtual-time render: ${frames} frames at 1/30 s, ${w}x${h}, url ${url}\n`);
rmSync(tmp, { recursive: true, force: true });
void canvas;
console.log(join(outDir, `${name}.mp4`));
