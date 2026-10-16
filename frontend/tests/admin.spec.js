import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Read the local bootstrap output directly; never print or embed real credentials in test reports.
const credentials = readFileSync(resolve('../.local/organizer-credentials.txt'), 'utf8');
const username = credentials.match(/^Username: (.+)$/m)[1].trim();
const password = credentials.match(/^Password: (.+)$/m)[1].trim();

test.afterEach(async ({ page }) => {
  const response = await page.request.get('/api/v1/auth/me');
  if (response.ok()) {
    const session = await response.json();
    await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5173', 'X-CSRF-Token': session.csrf_token } });
  }
});

async function signIn(page) {
  await page.goto('/admin.html');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#update-status')).toContainText('Live');
}

async function seedGuest(request) {
  const name = `E2E Race Crew Admin ${randomUUID()}`;
  const response = await request.post('/api/v1/rsvp', { headers: { 'Idempotency-Key': randomUUID() }, data: {
    name, relationship: 'parents_friend', contact_number: '0917 123 4567', attendance: 'attending', adults: 2, kids: 3,
    message: 'Happy birthday, Zade! <img src=x onerror=alert(1)>',
  } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  const directory = resolve('../.local/e2e-rsvps');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${saved.id}.json`), JSON.stringify({ id: saved.id }));
  return saved;
}

async function csvDownload(page, selector = '#export-button') {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('zade-birthday-guests.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test('authenticated dashboard, live metrics, search, details, messages, export and logout', async ({ page, request }, info) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin.html');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `../.local/screenshots/admin-${info.project.name}-login.png`, fullPage: true });
  await signIn(page);
  await expect(page.locator('.dashboard')).toHaveCSS('display', info.project.name.includes('mobile') ? 'block' : 'grid');
  const initial = Number(await page.locator('.kpi-card [data-metric="total_responses"]').textContent());
  const saved = await seedGuest(request);
  // Verify the real timer, rather than replacing the application's clock.
  await expect.poll(async () => Number(await page.locator('.kpi-card [data-metric="total_responses"]').textContent()), { timeout: 20000 }).toBeGreaterThan(initial);
  await expect(page.locator('.headcount-strip [data-metric="confirmed_kids"]')).not.toHaveText('—');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `../.local/screenshots/admin-${info.project.name}-overview.png`, fullPage: true });

  await page.locator('[data-view="guests"]').click();
  await page.getByRole('searchbox').fill(saved.name);
  await expect(page.locator('#guest-rows tr')).toHaveCount(1);
  await expect(page.locator('#guest-rows')).toContainText(saved.name);
  await page.locator('[data-status="maybe"]').click();
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('[data-status="attending"]').click();
  await expect(page.locator('#guest-rows tr')).toHaveCount(1);
  await page.screenshot({ path: `../.local/screenshots/admin-${info.project.name}-guests.png`, fullPage: true });
  await page.locator('.guest-name-button').click();
  await expect(page.locator('#guest-dialog')).toBeVisible();
  await expect(page.locator('#detail-name')).toHaveText(saved.name);
  await expect(page.locator('#detail-fields')).toContainText('+639171234567');
  await expect(page.locator('#detail-message')).toHaveText('Happy birthday, Zade! <img src=x onerror=alert(1)>');
  await expect(page.locator('#detail-message img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const csv = await csvDownload(page);
  expect(csv).toContain(saved.name);
  expect(csv).toContain("'+639171234567");
  expect(csv).toContain('Submitted At (PHT)');
  const filteredCsv = await csvDownload(page, '#export-filtered');
  expect(filteredCsv).toContain(saved.name);
  expect(filteredCsv.split('\r\n').filter(Boolean)).toHaveLength(2);

  await page.locator('[data-view="messages"]').click();
  await expect(page.locator('#table-title')).toHaveText('Birthday messages');
  await page.getByRole('searchbox').fill(saved.name);
  await expect(page.locator('.message-card')).toHaveCount(1);
  await expect(page.locator('#message-list img')).toHaveCount(0);
  await page.locator('[data-view="statistics"]').click();
  await expect(page.locator('.attendance-bar-track')).toHaveCount(3);
  await expect(page.locator('#statistics-panel')).toBeVisible();
  await page.reload();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#statistics-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#guest-rows tr')).toHaveCount(0);
  expect((await page.request.get('/api/v1/admin/overview')).status()).toBe(401);
  expect((await page.request.get('/api/v1/admin/export.csv')).status()).toBe(401);
  expect(errors).toEqual([]);
});

test('expired session returns to login and removes private data', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/admin/**', (route) => route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED', message: 'Session expired.' } } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#login-error')).toContainText('session has ended');
  await expect(page.locator('#guest-rows tr')).toHaveCount(0);
  await expect(page.locator('#dashboard')).toBeHidden();
});

test('delete can be cancelled and confirmed deletion updates guests and metrics', async ({ page, request }, info) => {
  const saved = await seedGuest(request);
  await signIn(page);
  await page.locator('[data-view="guests"]').click();
  await page.getByRole('searchbox').fill(saved.name);
  const button = page.getByRole('button', { name: `Delete response for ${saved.name}`, exact: true });
  await button.click();
  await expect(page.locator('#delete-guest-name')).toHaveText(saved.name);
  await expect(page.getByRole('button', { name: 'Keep response' })).toBeFocused();
  await page.getByRole('button', { name: 'Keep response' }).click();
  await expect(page.locator('#delete-dialog')).not.toBeVisible();
  expect((await page.request.get(`/api/v1/admin/rsvps/${saved.id}`)).status()).toBe(200);
  await button.click();
  await page.screenshot({ path: `../.local/screenshots/admin-${info.project.name}-delete.png` });
  const refreshedMetrics = page.waitForResponse((response) => response.url().endsWith('/api/v1/admin/overview'));
  await page.getByRole('button', { name: 'Delete response', exact: true }).click();
  await expect(page.locator('#delete-dialog')).not.toBeVisible();
  await expect(page.locator('#delete-notice')).toHaveText('Response deleted.');
  await expect(page.locator('#guest-rows tr')).toHaveCount(0);
  const after = await (await refreshedMetrics).json();
  await expect(page.locator('.kpi-card [data-metric="total_responses"]')).toHaveText(String(after.total_responses));
  await expect(page.locator('.headcount-strip [data-metric="confirmed_kids"]')).toHaveText(String(after.confirmed_kids));
  expect((await page.request.get(`/api/v1/admin/rsvps/${saved.id}`)).status()).toBe(404);
  const csv = await csvDownload(page);
  expect(csv).not.toContain(saved.name);
});

test('delete failure preserves response and allows retry', async ({ page, request }) => {
  const saved = await seedGuest(request);
  await signIn(page);
  await page.locator('[data-view="guests"]').click();
  await page.getByRole('searchbox').fill(saved.name);
  await page.getByRole('button', { name: `Delete response for ${saved.name}`, exact: true }).click();
  await page.route(`**/api/v1/admin/rsvps/${saved.id}`, async (route) => {
    if (route.request().method() === 'DELETE') await route.fulfill({ status: 503, json: { error: { message: 'The party desk is temporarily offline.' } } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Delete response', exact: true }).click();
  await expect(page.locator('#delete-error')).toContainText('temporarily offline');
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete response', exact: true })).toBeEnabled();
  expect((await page.request.get(`/api/v1/admin/rsvps/${saved.id}`)).status()).toBe(200);
  await page.unroute(`**/api/v1/admin/rsvps/${saved.id}`);
  await page.getByRole('button', { name: 'Delete response', exact: true }).click();
  await expect(page.locator('#delete-dialog')).not.toBeVisible();
  await expect(page.locator('#guest-rows tr')).toHaveCount(0);
});
