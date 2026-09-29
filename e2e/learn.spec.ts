import { expect, test, type Page } from '@playwright/test';
import { waitForLocation, watchErrors, withHooks } from './helpers';

const progress = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('kimble.progress.v1') ?? '{"explored":{},"checked":{}}') as { explored: Record<string, number>; checked: Record<string, { ok: boolean }> });

test('learning path, glossary, knowledge checks: explored and checked kept apart, reset clears both', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=explore'));
  await waitForLocation(page, 'hangar');
  await page.evaluate(() => localStorage.removeItem('kimble.progress.v1'));

  // opening a lesson counts as explored, not as checked
  await page.getByRole('button', { name: 'Find a part' }).click();
  await page.getByLabel('Search parts').fill('injector');
  await page.getByRole('button', { name: /^Injector/ }).click();
  await expect(page.getByRole('complementary', { name: /Injector lesson/ })).toBeVisible();
  await expect.poll(async () => Object.keys((await progress(page)).explored).length).toBeGreaterThan(0);
  expect(Object.keys((await progress(page)).checked)).toEqual([]);

  // learning path lists steps with separate explored and checked counts
  await page.getByRole('button', { name: 'Learning path, glossary and checks' }).click();
  const drawer = page.getByRole('dialog', { name: 'Learning path' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/Explored \d+ of \d+/).first()).toBeVisible();

  // glossary search
  await drawer.getByRole('button', { name: 'Glossary' }).click();
  const glossary = page.getByRole('dialog', { name: 'Glossary' });
  await glossary.getByLabel('Search glossary').fill('specific impulse');
  await expect(glossary.getByRole('term').filter({ hasText: 'Specific impulse' })).toBeVisible();
  await glossary.getByRole('button', { name: 'Close' }).click();

  // a knowledge check: answer, see the explanation, progress records it as checked
  await page.getByRole('button', { name: 'Learning path, glossary and checks' }).click();
  await page.getByRole('dialog', { name: 'Learning path' }).getByRole('button', { name: 'Knowledge checks' }).click();
  const checks = page.getByRole('dialog', { name: 'Knowledge checks' });
  await checks.locator('.check-q__choices .choice').first().click();
  await expect(checks.getByRole('status').first()).toContainText(/Right\.|Not quite\./);
  await expect.poll(async () => Object.keys((await progress(page)).checked).length).toBe(1);
  await checks.getByRole('button', { name: 'Close' }).click();

  // reset clears both
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await expect.poll(async () => {
    const p = await progress(page);
    return Object.keys(p.explored).length + Object.keys(p.checked).length;
  }).toBe(0);
  expect(errors).toEqual([]);
});
