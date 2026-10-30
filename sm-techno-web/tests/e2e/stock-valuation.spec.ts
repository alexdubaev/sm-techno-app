import { test, expect } from '@playwright/test';

test('stock valuation review is temporary and produces a download', async ({ page }) => {
  await page.route('**/api/stock/valuation/intake', route => route.fulfill({ json: { rows: [{ article: '00123', requestedQty: null, sourceRow: 1 }], warnings: [] } }));
  await page.route('**/api/stock/valuation/resolve', route => route.fulfill({ json: { resolvedAt: '2026-10-30T00:00:00Z', articleResolution: [{ article: '00123', requestedQty: null, sourceRow: 1, status: 'matched', variants: [{ itemId: 1, warehouseId: 1, warehouseName: 'Склад тест', physicalStock: 3, price: 20 }] }], workbook: { filename: 'stock-valuation.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: 'UEs=' } } }));
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator');
  await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/stock');
  await page.getByRole('button', { name: 'Расценить список артикулов' }).click();
  await page.getByLabel('Выбрать файл с артикулами').setInputFiles({ name: 'articles.txt', mimeType: 'text/plain', buffer: Buffer.from('00123') });
  await expect(page.getByLabel('Артикул строки 1')).toHaveValue('00123');
  await page.getByRole('button', { name: 'Проверить остатки' }).click();
  await expect(page.getByRole('cell', { name: 'Склад тест' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать Excel' }).click();
  expect((await download).suggestedFilename()).toBe('stock-valuation.xlsx');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Расценить список артикулов' })).toBeVisible();
  await expect(page.getByLabel('Артикул строки 1')).toHaveCount(0);
});

