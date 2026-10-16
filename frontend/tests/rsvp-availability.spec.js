import { test, expect } from '@playwright/test';
import { invitationSnapshot } from '../src/state/event.js';

test('an already loaded invitation rechecks availability when RSVPs reopen', async ({ page }) => {
  let isOpen = false;
  let requests = 0;
  await page.route('**/api/v1/event', async (route) => {
    requests += 1;
    await route.fulfill({ json: { ...invitationSnapshot, rsvp_open: isOpen } });
  });
  const initialResponse = page.waitForResponse('**/api/v1/event');
  await page.goto('/');
  await initialResponse;
  await page.locator('.header-cta').click();
  await expect(page.locator('#rsvp-closed')).toBeVisible();
  await page.keyboard.press('Escape');
  isOpen = true;
  await page.locator('.header-cta').click();
  await expect(page.locator('#rsvp-title')).toHaveText('WHO’S ROLLING IN?');
  await expect(page.getByLabel('Your name')).toBeVisible();
  expect(requests).toBeGreaterThanOrEqual(3);
});
