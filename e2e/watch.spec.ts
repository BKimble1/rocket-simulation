import { expect, test } from '@playwright/test';
import { frames, missionTime, waitForLocation, watchErrors, withHooks } from './helpers';

test('watch: captions follow the film, pause holds, chapters seek @phone', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=watch'));
  await page.getByRole('button', { name: /Overview: Satellite to low Earth orbit/ }).click();
  await waitForLocation(page, 'flight');
  await expect(page.locator('.caption')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  const t = await missionTime(page);
  await page.waitForTimeout(1500);
  expect(await missionTime(page)).toBeCloseTo(t, 3);
  await page.getByRole('button', { name: 'Chapters' }).click();
  await page.getByRole('button', { name: /Stage separation/ }).first().click();
  await frames(page);
  await expect.poll(() => missionTime(page), { timeout: 60_000 }).toBeGreaterThan(t);
  expect(errors).toEqual([]);
});
