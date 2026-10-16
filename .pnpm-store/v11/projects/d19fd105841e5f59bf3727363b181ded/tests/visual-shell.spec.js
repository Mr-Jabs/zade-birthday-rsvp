import { test, expect } from '@playwright/test';

test('responsive invitation, event connection, navigation, and calendar', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('h1')).toContainText('MONSTER');
  await expect(page.locator('[data-event="shortDate"]')).toContainText('October 25, 2026');
  await expect(page.locator('#event-data-note')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../.local/screenshots/${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });

  await page.getByRole('link', { name: 'View Details' }).click();
  await expect(page).toHaveURL(/#details$/);
  const maps = page.getByRole('link', { name: 'Open Google Maps' });
  await expect(maps).toHaveAttribute('href', /google\.com\/maps\/search/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('zade-birthday-october-25.ics');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const calendar = Buffer.concat(chunks).toString('utf8');
  expect(calendar).toContain('DTSTART:20261025T070000Z');
  expect(calendar).toContain('DTEND:20261025T110000Z');

  await page.locator('.header-cta').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('WHO’S ROLLING IN?');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.header-cta')).toBeFocused();
  expect(errors).toEqual([]);
});

test('offline API keeps invitation usable and explains stale event data', async ({ page }) => {
  await page.route('**/api/v1/event', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.locator('#event-data-note')).toBeVisible();
  await expect(page.locator('[data-event="venue"]')).toContainText('PlayTown Kids Cafe');
  await page.locator('.header-cta').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close RSVP form' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.header-cta')).toBeFocused();
});
