import { expect, test } from '@playwright/test';
import { waitForLocation, watchErrors, withHooks } from './helpers';

test('find a part, read its lesson at every depth, open views and the materials layer', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=explore'));
  await waitForLocation(page, 'hangar');
  await page.getByRole('button', { name: 'Find a part' }).click();
  await page.getByLabel('Search parts').fill('turbopump');
  await page.getByRole('button', { name: /^Turbopump/ }).click();
  const lesson = page.getByRole('complementary', { name: /Turbopump lesson/ });
  await expect(lesson).toBeVisible();
  await lesson.getByRole('tab', { name: 'Engineering detail' }).click();
  for (const h of ['Where it is, what it connects to', 'What it does and how it works', 'Why it is needed at this point in the mission', 'Loads, temperatures and fluids', 'Materials, and why', 'How it is made, joined, inspected and tested', 'Common misunderstanding, and if it were missing'])
    await expect(lesson.getByRole('heading', { name: h })).toBeVisible();
  await lesson.getByRole('tab', { name: 'Materials & manufacturing' }).click();
  await expect(lesson.getByText(/Nickel|nickel/).first()).toBeVisible();
  // URL deep link reflects the part
  await expect(page).toHaveURL(/part=turbopump/);
  // views
  for (const v of ['Cutaway', 'Exploded', 'Intact']) await page.getByRole('radio', { name: v }).click();
  // materials layer: material → parts → back to the part lesson
  await page.getByRole('button', { name: /Materials/ }).first().click();
  await page.getByRole('button', { name: /Aluminium-lithium|Aluminum-lithium|Al-Li/ }).first().click();
  await expect(page.getByText('Used in this illustrative vehicle')).toBeVisible();
  await page.getByRole('button', { name: /First-stage liquid-oxygen tank/ }).first().click();
  await expect(page.getByRole('complementary', { name: /liquid-oxygen tank lesson/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test('deep link to a part and a view @phone', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(withHooks('?v=explore&part=injector&view=cutaway'));
  await waitForLocation(page, 'hangar');
  await expect(page.getByRole('complementary', { name: /Injector lesson/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard: reach the part list and select with Enter', async ({ page }) => {
  await page.goto(withHooks('?v=explore'));
  await waitForLocation(page, 'hangar');
  await page.getByRole('button', { name: 'Find a part' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Search parts').fill('grid fins');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: /Grid fins lesson/ })).toBeVisible();
});
