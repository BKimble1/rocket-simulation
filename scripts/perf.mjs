// Measure a scenario in Chromium: real frame intervals (median/p95/p99, long frames, stalls,
// missed 60 Hz frames), CPU render time (and GPU time where timer queries exist), draw calls,
// triangles, the transfer size of the initial load, time to first frames, renderer string,
// viewport, DPR, quality tier.
//   node scripts/perf.mjs "<url>" [width] [height] [seconds] [dpr] [--gpu] [--seek=<mission s>] [--settle=<s>]
// Without --gpu Chromium uses SwiftShader (software): the numbers then describe this machine's
// CPU rasteriser, NOT a GPU, and must be reported as such.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const [url, w = '1440', h = '900', secs = '10', dpr = '1'] = args.filter((a) => !a.startsWith('--'));
const seekArg = args.find((a) => a.startsWith('--seek='));
const settle = +(args.find((a) => a.startsWith('--settle='))?.slice(8) ?? '2');
const launch = gpu ? { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] };
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
let bytes = 0;
const client = await page.context().newCDPSession(page);
await client.send('Network.enable');
client.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const u = url + (url.includes('?') ? '&' : '?') + 'hooks=1&diag=1';
const t0 = Date.now();
await page.goto(u, { waitUntil: 'networkidle' });
await page.waitForFunction(() => (window.__rocketFrame?.n ?? 0) > 10, null, { timeout: 120000 });
const ready = Date.now() - t0;
const initialBytes = bytes;
if (seekArg) {
  // wait for the flight location, then show the requested mission moment (paused)
  await page.waitForFunction(() => window.__rocketFrame?.location === 'flight', null, { timeout: 300000 });
  await page.evaluate((t) => {
    window.__rocketPlayback.player?.pause();
    window.__rocketSeekMission(t);
  }, +seekArg.slice(7));
}
await page.waitForTimeout(settle * 1000);
const r = await page.evaluate(
  (ms) =>
    new Promise((res) => {
      const times = [];
      let last = performance.now();
      const end = last + ms;
      const f = () => {
        const t = performance.now();
        times.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(f);
        else {
          const s = [...times].sort((a, b) => a - b);
          const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
          const gl = window.__rocketGL;
          const ctx = gl.getContext();
          const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
          res({
            frames: times.length,
            fps: times.length / (ms / 1000),
            median: q(0.5),
            p95: q(0.95),
            p99: q(0.99),
            longFrames50: times.filter((x) => x > 50).length,
            calls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
            geometries: gl.info.memory.geometries,
            textures: gl.info.memory.textures,
            renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
            location: window.__rocketFrame.location,
            missionTime: +window.__rocketFrame.missionTime.toFixed(1),
            cpuRenderMedianMs: (() => {
              const c = [...window.__rocketPerf.recentCpu].slice(-60).sort((a, b) => a - b);
              return c.length ? +c[c.length >> 1].toFixed(1) : null;
            })(),
            gpuMedianMs: (() => {
              const g = [...window.__rocketPerf.recentGpu].slice(-60).sort((a, b) => a - b);
              return g.length ? +g[g.length >> 1].toFixed(1) : null;
            })(),
            missedFrames60: window.__rocketPerf.missedTotal,
            stalls: window.__rocketPerf.stalls,
            stallsOver1s: times.filter((x) => x > 1000).length,
            dpr: window.devicePixelRatio,
            canvas: [gl.domElement.width, gl.domElement.height],
          });
        }
      };
      requestAnimationFrame(f);
    }),
  +secs * 1000,
);
const tier = await page.evaluate(() => document.querySelector('.diag')?.textContent ?? '');
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}
console.log(JSON.stringify({ url, viewport: `${w}x${h}`, dprRequested: +dpr, commit, readyMs: ready, initialTransferMB: +(initialBytes / 1e6).toFixed(2), ...r, frameTimeMs: { median: +r.median.toFixed(1), p95: +r.p95.toFixed(1), p99: +r.p99.toFixed(1) }, tier, errors }, null, 1));
await browser.close();
