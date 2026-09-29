/**
 * Hub card assets: a poster still and a short muted preview loop, rendered from the running app
 * on the virtual clock (every frame advances exactly 1/30 s, so the clip plays at true speed
 * whatever the machine), with the interface hidden except the KIMBLE identity (?ui=brand).
 *
 *   node scripts/hub-card.mjs [baseUrl]      default http://127.0.0.1:4173/ (npm run preview)
 *
 * Writes public/og/poster.jpg (1200 x 630), public/og/preview.mp4 (960 x 540, 8 s, no audio)
 * and public/og/preview.jpg (its first frame, for players that show a poster).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const OUT = 'public/og';
const POSTER = { t: 7.5, w: 1200, h: 630 };
const CLIP = { from: -3.5, seconds: 8, w: 960, h: 540, fps: 30 };
mkdirSync(OUT, { recursive: true });
const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${base}?v=mission&m=leo&ui=brand&quality=high&virt=1&capture=1&hooks=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => typeof window.__rocketAdvance === 'function', null, { timeout: 180000 });
  // let loaders settle (textures, the flight location), then hold the playhead where we want it
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.__rocketAdvance(1));
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__rocketFrame?.location === 'flight', null, { timeout: 180000 });
  return page;
}
const adv = (page, n = 1) => page.evaluate((k) => window.__rocketAdvance(k), n);
// seek and play at 1x (the mission explorer opened by a deep link starts paused)
const seek = (page, t) =>
  page.evaluate((mt) => {
    window.__rocketSeekMission(mt);
    const pl = window.__rocketPlayback.player;
    pl.setRate?.(1);
    pl.play();
  }, t);

// poster: a moment after tower clearance, the Auto director's framing, 1.3 s of settled frames
{
  const page = await open(POSTER.w, POSTER.h);
  await seek(page, POSTER.t - 1.3);
  for (let i = 0; i < 39; i++) await adv(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'poster.jpg'), type: 'jpeg', quality: 86, timeout: 300000 });
  await page.close();
  console.log('poster', join(OUT, 'poster.jpg'), statSync(join(OUT, 'poster.jpg')).size, 'bytes');
}

// preview: ignition to liftoff and tower clearance, frame by frame
{
  const page = await open(CLIP.w, CLIP.h);
  await seek(page, CLIP.from - 0.5);
  for (let i = 0; i < 15; i++) await adv(page);
  const tmp = join('/tmp', `hubcard-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const n = CLIP.seconds * CLIP.fps;
  for (let i = 0; i < n; i++) {
    await adv(page);
    await page.screenshot({ path: join(tmp, `f${String(i).padStart(4, '0')}.png`), timeout: 300000 });
  }
  await page.close();
  execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(CLIP.fps), '-i', join(tmp, 'f%04d.png'), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', join(OUT, 'preview.mp4')]);
  execFileSync(ff, ['-y', '-loglevel', 'error', '-i', join(tmp, 'f0000.png'), '-q:v', '4', join(OUT, 'preview.jpg')]);
  rmSync(tmp, { recursive: true, force: true });
  console.log('preview', join(OUT, 'preview.mp4'), statSync(join(OUT, 'preview.mp4')).size, 'bytes');
}
await browser.close();
