import { expect, test } from '@playwright/test';

test('appearance switches immediately and is restored on a direct load', async ({ page }) => {
  await page.route('**/api/admin/dashboard/sales?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: {
      period: { kind: params.get('period'), anchorDate: params.get('date'), start: '2026-11-01', end: '2026-11-30' },
      totals: { salesTotal: 15000000, count: 2, unallocatedSalesTotal: 9000000, unallocatedCount: 1 },
      series: [{ date: '2026-11-01', amount: 6000000, count: 1 }, { date: '2026-11-02', amount: 9000000, count: 1 }],
      managers: [{ id: 1, userId: 1, name: 'Тестовый менеджер', active: true, archived: false, salesTotal: 6000000, count: 1 }],
      monthlyPlans: { month: '2026-11', managers: [] },
      sources: { manualCount: 1, onecCount: 0, odataConnected: false },
    } });
  });
  await page.goto('/');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const theme = page.locator('html');
  await expect(theme).not.toHaveAttribute('data-ui-theme', 'glassy');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Стекло', exact: true }).click();
  await expect(theme).toHaveAttribute('data-ui-theme', 'glassy');
  await page.goto('/dashboard');
  await expect(theme).toHaveAttribute('data-ui-theme', 'glassy');
  await expect(page.getByRole('heading', { name: 'Продажи по менеджерам' })).toBeVisible();
  await expect(page.getByText(/90\s000 ₽ \(60\s?%\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Открыть подробный график продаж' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/stock');
  await expect(theme).toHaveAttribute('data-ui-theme', 'glassy');
  await expect(page.getByRole('heading', { name: 'Остатки', exact: true })).toBeVisible();
  const valuation = page.getByRole('button', { name: 'Развернуть', exact: true });
  await expect(valuation).toHaveAttribute('aria-expanded', 'false');
  await valuation.click();
  await expect(page.getByRole('button', { name: 'Вставить список' })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Классическая', exact: true }).click();
  await expect(theme).not.toHaveAttribute('data-ui-theme', 'glassy');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Классическая', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
