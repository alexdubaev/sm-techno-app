import { expect, test } from '@playwright/test';

test('copies a synthetic personal code to the real browser clipboard', async ({ page, context }) => {
  const credential = 'c'.repeat(43);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/stock/shortcut-devices', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { device: { id: 1, label: 'iPhone', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, idleExpiresAt: '2027-01-01T00:00:00Z', absoluteExpiresAt: '2027-01-01T00:00:00Z', revokedAt: null }, credential } });
    } else {
      await route.fulfill({ json: { devices: [] } });
    }
  });
  await page.goto('/');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Команды iPhone' }).click();
  await page.getByRole('button', { name: 'Создать подключение' }).click();
  await page.getByText('Дополнительно: личный код').click();
  await expect(page.getByLabel('Личный код подключения')).toHaveValue(credential);
  await page.getByRole('button', { name: 'Копировать код' }).click();
  await expect(page.getByRole('status')).toHaveText('Код скопирован');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(credential);
});
