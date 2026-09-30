import type { Page } from '@playwright/test';

/** Collect console errors and failed requests (a test fails if any appear). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Download the React DevTools/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

/** Wait until the stage has rendered some frames in the given location. */
export async function waitForLocation(page: Page, loc: 'hangar' | 'flight' | 'map', timeout = 150_000) {
  await page.waitForFunction((l) => (window as unknown as { __rocketFrame?: { location: string; n: number } }).__rocketFrame?.location === l, loc, { timeout });
  await page.waitForFunction(() => ((window as unknown as { __rocketFrame?: { n: number } }).__rocketFrame?.n ?? 0) > 5, null, { timeout });
}

export async function missionTime(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __rocketFrame: { missionTime: number } }).__rocketFrame.missionTime);
}

/** Snapshot of every body's presence and absolute position (for continuity checks). */
export async function bodies(page: Page) {
  return page.evaluate(() => {
    const f = (window as unknown as { __rocketFrame: { bodies: Record<string, { present: boolean; pos: { x: number; y: number; z: number } }> } }).__rocketFrame;
    return Object.fromEntries(Object.entries(f.bodies).map(([k, s]) => [k, { present: s.present, x: s.pos.x, y: s.pos.y, z: s.pos.z }]));
  });
}

export const withHooks = (u: string) => u + (u.includes('?') ? '&' : '?') + 'hooks=1';

/** Wait until the stage has rendered k more frames (state sampled per frame is then current). */
export async function frames(page: Page, k = 2, timeout = 120_000) {
  const n0 = await page.evaluate(() => (window as unknown as { __rocketFrame: { n: number } }).__rocketFrame.n);
  await page.waitForFunction((n) => (window as unknown as { __rocketFrame: { n: number } }).__rocketFrame.n >= n, n0 + k, { timeout });
}
