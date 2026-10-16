import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function rememberSaved(result) {
  if (!/^[0-9a-f-]{36}$/i.test(result.id) || !result.name.startsWith('E2E Race Crew ')) throw new Error('Unexpected test response');
  const directory = resolve('../.local/e2e-rsvps');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${result.id}.json`), JSON.stringify({ id: result.id }));
}

async function open(page) {
  await page.goto('/');
  await page.locator('.header-cta').click();
  await expect(page.locator('#rsvp-title')).toHaveText('WHO’S ROLLING IN?');
  await expect(page.locator('.rsvp-shell')).toHaveCSS('display', 'grid');
}

async function details(page, name = `E2E Race Crew ${randomUUID()}`) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Relationship to Zade').selectOption('family');
  await page.getByLabel('Contact number').fill('0917 123 4567');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  return name;
}

async function party(page, status = 'attending') {
  await page.locator(`input[value="${status}"]`).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

async function save(page) {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/rsvp') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const result = await response.json();
  rememberSaved(result);
  return result;
}

test('validation, preserved draft, real submission, and saved confirmation', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#error-name')).toBeVisible();
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.screenshot({ path: `../.local/screenshots/rsvp-${info.project.name}-guest.png` });
  const name = await details(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#error-attendance')).toBeVisible();
  await page.locator('input[value="attending"]').focus();
  await page.keyboard.press('Space');
  await page.screenshot({ path: `../.local/screenshots/rsvp-${info.project.name}-attendance.png` });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Adults', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  await expect(page.locator('#error-party')).toBeVisible();
  await page.getByLabel('Adults', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Increase kids' }).click();
  await page.getByLabel('A little message for Zade').fill('🎉'.repeat(201));
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  await expect(page.locator('#error-message')).toBeVisible();
  await page.getByLabel('A little message for Zade').fill('Happy birthday, Zade! 🎉');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Your name')).toHaveValue(name);
  await expect(page.getByLabel('Contact number')).toHaveValue('0917 123 4567');
  await page.keyboard.press('Escape');
  await page.locator('.header-cta').click();
  await expect(page.getByLabel('Your name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('input[value="attending"]')).toBeChecked();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel('Adults', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Kids', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('A little message for Zade')).toHaveValue('Happy birthday, Zade! 🎉');
  const fits = await page.locator('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: `../.local/screenshots/rsvp-${info.project.name}-party.png` });
  const result = await save(page);
  expect(result.adults).toBe(2);
  expect(result.kids).toBe(1);
  await expect(page.locator('#confirmation-title')).toHaveText('YOU’RE ON THE STARTING GRID!');
  await expect(page.locator('#confirmation-name')).toHaveText(name);
  await page.screenshot({ path: `../.local/screenshots/rsvp-${info.project.name}-confirmation.png` });
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('.header-cta').click();
  await expect(page.locator('#confirmation-title')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const status of ['not_attending', 'maybe']) {
  test(`${status} sends correct counts and gets appropriate confirmation`, async ({ page }) => {
    await open(page);
    await details(page);
    await party(page, status);
    if (status === 'not_attending') {
      await expect(page.locator('#party-counts')).toBeHidden();
    } else {
      await expect(page.locator('#tentative-note')).toBeVisible();
      await page.getByLabel('Adults', { exact: true }).fill('0');
    }
    const result = await save(page);
    expect(result.attendance).toBe(status);
    expect(result.adults + result.kids).toBe(0);
    await expect(page.locator('#confirmation-title')).toHaveText(status === 'maybe' ? 'YOUR MAYBE IS ON THE GRID!' : 'THANKS FOR LETTING US KNOW!');
  });
}

test('lost response retries with same key and recovers the saved RSVP', async ({ page }) => {
  await open(page);
  await details(page);
  await party(page);
  const keys = [];
  let saved;
  await page.route('**/api/v1/rsvp', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      const response = await route.fetch();
      saved = await response.json();
      rememberSaved(saved);
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  await expect(page.locator('#submit-error')).toContainText('Your answers are still here');
  await expect(page.locator('#rsvp-confirmation')).toBeHidden();
  const replayPromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/rsvp'));
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  const replay = await replayPromise;
  expect(replay.status()).toBe(200);
  expect((await replay.json()).id).toBe(saved.id);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page.locator('#confirmation-title')).toBeVisible();
});

test('server field error returns to the correct step without losing the draft', async ({ page }) => {
  await open(page);
  const name = await details(page);
  await party(page);
  await page.getByLabel('A little message for Zade').fill('A preserved birthday message');
  await page.route('**/api/v1/rsvp', (route) => route.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Please check the supplied values.', fields: { contact_number: 'Please verify your contact number.' } } }),
  }));
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  await expect(page.locator('#error-contact_number')).toHaveText('Please verify your contact number.');
  await expect(page.getByLabel('Contact number')).toBeFocused();
  await expect(page.getByLabel('Your name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel('A little message for Zade')).toHaveValue('A preserved birthday message');
});

test('saving prevents double submission and keeps the dialog open', async ({ page }) => {
  await open(page);
  await details(page);
  await party(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let requests = 0;
  await page.route('**/api/v1/rsvp', async (route) => {
    requests += 1;
    await gate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'The party desk is temporarily offline. Please retry.' } }) });
  });
  await page.getByRole('button', { name: 'Submit RSVP' }).click();
  await expect(page.getByRole('button', { name: 'Saving your RSVP' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(page.locator('#submit-error')).toContainText('temporarily offline');
  await expect(page.locator('#rsvp-confirmation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Submit RSVP' })).toBeEnabled();
  expect(requests).toBe(1);
});

test('closed event displays a clear notice', async ({ page }) => {
  await page.route('**/api/v1/event', async (route) => {
    const response = await route.fetch();
    const event = await response.json();
    await route.fulfill({ json: { ...event, rsvp_open: false } });
  });
  const eventResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/event'));
  await page.goto('/');
  await eventResponse;
  await page.locator('.header-cta').click();
  await expect(page.locator('#closed-title')).toBeVisible();
  await expect(page.locator('#rsvp-form')).toBeHidden();
  await page.getByRole('button', { name: 'Explore party details' }).click();
  await expect(page).toHaveURL(/#details$/);
});
