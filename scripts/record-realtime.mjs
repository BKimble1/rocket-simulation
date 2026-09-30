// Record a normal wall-clock video of the running app (what a viewer on THIS machine sees):
//   node scripts/record-realtime.mjs <name> "<url>" <seconds> [width] [height] [setup-json]
// setup-json: [{ "click": "role=button[name=/Explore a mission/]" }, { "wait": 1000 }, ...]
// Output: docs/recordings/realtime/<name>.mp4 (via imageio-ffmpeg; the WebM is kept only if that fails).
// NOTE: this container renders with SwiftShader (CPU); motion is as smooth as that allows.
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [, , name, url, secs = '12', w = '1280', h = '720', setupJson = '[]'] = process.argv;
const outDir = 'docs/recordings/realtime';
const tmp = join('/tmp', `rec-${name}-${process.pid}`);
mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, recordVideo: { dir: tmp, size: { width: +w, height: +h } } });
const page = await ctx.newPage();
await page.goto(url + (url.includes('?') ? '&' : '?') + 'hooks=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => (window.__rocketFrame?.n ?? 0) > 10, null, { timeout: 120000 });
for (const st of JSON.parse(setupJson)) {
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.click) await page.locator(st.click).first().click();
  if (st.eval) await page.evaluate(st.eval);
}
await page.waitForTimeout(+secs * 1000);
await ctx.close();
await browser.close();
const f = readdirSync(tmp).find((x) => x.endsWith('.webm'));
const webm = join(outDir, `${name}.webm`);
renameSync(join(tmp, f), webm);
rmSync(tmp, { recursive: true, force: true });
try {
  const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  const mp4 = join(outDir, `${name}.mp4`);
  execFileSync(ff, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', mp4]);
  rmSync(webm); // keep the smaller, widely playable MP4 only
  console.log(mp4);
} catch (e) {
  console.error('mp4 conversion skipped, keeping the WebM:', e.message);
  console.log(webm);
}
