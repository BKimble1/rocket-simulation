import { expect, test } from '@playwright/test';
import { waitForLocation, watchErrors, withHooks } from './helpers';

test('first screen: rocket scene, title and three actions @phone', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks(''));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore the rocket/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore a mission/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watch and learn/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'KIMBLE' }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'FAB / ONE' }).first()).toBeAttached();
  await waitForLocation(page, 'hangar');
  expect(errors).toEqual([]);
});

test('no WebGL: honest fallback', async ({ page }) => {
  await page.goto('?nowebgl=1');
  await expect(page.getByText(/3D is not available/)).toBeVisible();
});

test('reduced motion is respected', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(withHooks(''));
  await waitForLocation(page, 'hangar');
  const reduced = await page.evaluate(() => (window as unknown as { __rocketDirector: { reduced: boolean } }).__rocketDirector.reduced);
  expect(reduced).toBe(true);
  await ctx.close();
});
