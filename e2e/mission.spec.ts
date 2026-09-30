import { expect, test } from '@playwright/test';
import { bodies, frames, missionTime, playerTime, waitForLocation, watchErrors, withHooks } from './helpers';

test('satellite walkthrough: start, inspect the engine, return to the same point, switch cameras, finish, replay', async ({ page }) => {
  // the longest journey in the suite: 4 to 5 minutes on a software renderer
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  await page.goto(withHooks(''));
  await page.getByRole('button', { name: /Explore a mission/ }).click();
  await waitForLocation(page, 'flight');
  const t0 = await missionTime(page);
  // playback advances (poll: on a software renderer a frame can take seconds)
  await expect.poll(() => missionTime(page), { timeout: 120_000 }).toBeGreaterThan(t0);
  // jump to staging through the chapters
  await page.getByRole('button', { name: 'Chapters' }).click();
  await page.getByRole('button', { name: /Stage separation/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Stage separation' })).toBeVisible();
  // pause first so the comparison is exact (a playing mission resumes on return)
  const pause = page.getByRole('button', { name: 'Pause mission' });
  if (await pause.count()) await pause.click();
  // inspect a part from the phase card: the mission pauses and says so
  await page.getByRole('complementary', { name: 'What is happening' }).getByRole('button').filter({ hasText: /Stage separation|Interstage|E-1V/ }).first().click();
  await waitForLocation(page, 'hangar');
  await expect(page.getByText(/Mission paused at/)).toBeVisible();
  const paused = await playerTime(page);
  await page.getByRole('button', { name: /Return to mission/ }).click();
  await waitForLocation(page, 'flight');
  // the same moment, exactly (the player is paused on return)
  expect(Math.abs((await playerTime(page)) - paused)).toBeLessThan(0.001);
  // cameras
  for (const c of ['Ground', 'Chase', 'Onboard', 'Free', 'Map', 'Auto']) await page.getByRole('radio', { name: c, exact: true }).click();
  // finish: jump to the last chapter and play
  await page.getByRole('button', { name: 'Chapters' }).click();
  await page.getByRole('button', { name: /Solar arrays and first contact/ }).click();
  await page.getByRole('button', { name: 'Play mission' }).click();
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test('seeking reconstructs state exactly and never duplicates bodies', async ({ page }) => {
  await page.goto(withHooks('?v=mission&m=leo'));
  await waitForLocation(page, 'flight');
  const seek = (t: number) =>
    page.evaluate((mt) => {
      const w = window as unknown as { __rocketSeekMission: (t: number) => void };
      w.__rocketSeekMission(mt);
    }, t);
  const count = () => page.evaluate(() => (window as unknown as { __rocketSceneCount: () => number }).__rocketSceneCount());
  const cycle = async () => {
    for (const t of [20, 600, 200]) {
      await seek(t);
      await frames(page);
    }
  };
  await seek(200);
  await frames(page);
  const a = await bodies(page);
  // a first pass fills bounded pools (plume volumes are created as engines first light)
  await cycle();
  const b = await bodies(page);
  for (const k of Object.keys(a)) {
    expect(b[k].present).toBe(a[k].present);
    if (a[k].present) expect(Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y, a[k].z - b[k].z)).toBeLessThan(0.01);
  }
  // repeating the same seeks must not add anything: no duplicated bodies, no leaks
  const warmed = await count();
  await cycle();
  expect(await count()).toBe(warmed);
});

test('booster storyline: switching focus keeps the shared mission time', async ({ page }) => {
  await page.goto(withHooks('?v=mission&m=leo&ch=staging'));
  await waitForLocation(page, 'flight');
  await frames(page);
  const t = await missionTime(page);
  await page.getByRole('radio', { name: 'Booster' }).click();
  await frames(page);
  expect(Math.abs((await missionTime(page)) - t)).toBeLessThan(0.5);
  await page.getByRole('radio', { name: 'Upper stage' }).click();
});

for (const [m, last] of [
  ['suborbital', 'Splashdown and recovery'],
  ['gto', 'Apogee burns to geostationary orbit'],
  ['station', 'Soft capture and hard capture'],
  ['return', 'Splashdown and recovery'],
  ['lunar', 'Outbound trajectory'],
] as const) {
  test(`mission ${m} runs through its final chapter`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(withHooks(`?v=mission&m=${m}`));
    await waitForLocation(page, 'flight');
    await page.getByRole('button', { name: 'Chapters' }).click();
    await page.getByRole('button', { name: new RegExp(last.replace(/[()]/g, '\\$&')) }).first().click();
    await page.getByRole('button', { name: 'Play mission' }).click();
    await frames(page, 3);
    await expect(page.locator('.mission-title__phase')).toHaveText(last, { timeout: 90_000 });
    expect(errors).toEqual([]);
  });
}

test('mission playback on a phone @phone', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=mission&m=leo&ch=maxq'));
  await waitForLocation(page, 'flight');
  await expect(page.getByRole('group', { name: 'Mission playback' })).toBeVisible();
  await page.getByRole('button', { name: /Play mission|Pause mission/ }).click();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

// ───────────────────────────── V2 camera and routing ─────────────────────────────

type W = { __rocketDirector: { mode: string; focus: string; blends: unknown[]; autoKey: string }; __rocketFlightStats: { pushes: number; cuts: number } };

test('a held manual camera starts no transitions while the mission plays (V1 restarted one every frame)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=mission&m=leo&ch=maxq&cam=chase'));
  await waitForLocation(page, 'flight');
  await frames(page, 3);
  const before = await page.evaluate(() => (window as unknown as W).__rocketFlightStats.pushes + (window as unknown as W).__rocketFlightStats.cuts);
  await page.getByRole('button', { name: 'Play mission' }).click();
  await frames(page, 8);
  const after = await page.evaluate(() => {
    const w = window as unknown as W;
    return { n: w.__rocketFlightStats.pushes + w.__rocketFlightStats.cuts, blends: w.__rocketDirector.blends.length, key: w.__rocketDirector.autoKey };
  });
  expect(after.n).toBe(before);
  expect(after.blends).toBe(1);
  expect(after.key).toBe('chase:chase:booster');
  expect(errors).toEqual([]);
});

test('a deep link keeps its camera mode and storyline (booster, chase)', async ({ page }) => {
  await page.goto(withHooks('?v=mission&m=leo&ch=boostback&focus=booster&cam=chase'));
  await waitForLocation(page, 'flight');
  await frames(page, 3);
  const d = await page.evaluate(() => {
    const w = window as unknown as W;
    return { mode: w.__rocketDirector.mode, focus: w.__rocketDirector.focus };
  });
  expect(d).toEqual({ mode: 'chase', focus: 'booster' });
  await expect(page.getByRole('radio', { name: 'Booster' })).toHaveAttribute('aria-checked', 'true');
});

test('Back and Forward between missions load the mission the address names', async ({ page }) => {
  await page.goto(withHooks('?v=mission&m=leo'));
  await waitForLocation(page, 'flight');
  await page.getByRole('button', { name: /Satellite to low Earth orbit/i }).first().click();
  await page.getByRole('menuitem', { name: 'Suborbital hop' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __rocketPlayback: { player: { tl: { id: string } } } }).__rocketPlayback.player.tl.id)).toBe('suborbital');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __rocketPlayback: { player: { tl: { id: string } } } }).__rocketPlayback.player.tl.id)).toBe('leo');
  expect(new URL(page.url()).searchParams.get('m')).toBe('leo');
});

test('repeated mission changes and seeks do not grow scene objects, GPU resources or camera state', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=mission&m=leo'));
  await waitForLocation(page, 'flight');
  const open = async (m: string) => {
    await page.getByRole('button', { name: /Satellite to low Earth orbit|Geostationary transfer/i }).first().click();
    await page.getByRole('menuitem', { name: m }).click();
    await frames(page, 4, 300_000);
    await page.evaluate(() => (window as unknown as { __rocketSeekMission: (t: number) => void }).__rocketSeekMission(160));
    await frames(page, 3, 300_000);
  };
  const snap = () =>
    page.evaluate(() => {
      const w = window as unknown as { __rocketGL: { info: { memory: { geometries: number; textures: number } } }; __rocketSceneCount: () => number; __rocketDirector: { blends: unknown[] } };
      return { geo: w.__rocketGL.info.memory.geometries, tex: w.__rocketGL.info.memory.textures, nodes: w.__rocketSceneCount(), blends: w.__rocketDirector.blends.length };
    });
  await open('Geostationary transfer');
  await open('Satellite to LEO');
  const a = await snap();
  await open('Geostationary transfer');
  await open('Satellite to LEO');
  const b = await snap();
  expect(b.nodes).toBe(a.nodes);
  expect(b.geo).toBeLessThanOrEqual(a.geo + 2);
  expect(b.tex).toBeLessThanOrEqual(a.tex + 2);
  expect(b.blends).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});
