import { test, expect } from '@playwright/test';

test('stock valuation review is temporary and produces both downloads', async ({ page }) => {
  await page.route('**/api/stock/valuation/intake', route => route.fulfill({ json: { rows: [{ article: '00123', requestedQty: null, sourceRow: 1 }], warnings: [] } }));
  await page.route('**/api/stock/valuation/resolve', route => route.fulfill({ json: { resolvedAt: '2026-10-30T00:00:00Z', articleResolution: [{ article: '00123', requestedQty: null, sourceRow: 1, status: 'matched', variants: [{ itemId: 1, warehouseId: 1, warehouseName: 'Склад тест', physicalStock: 3, price: 20 }] }], workbook: { filename: 'stock-valuation.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('ordinary workbook').toString('base64') }, offerWorkbook: { filename: 'stock-offer.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('offer workbook').toString('base64') }, offerExport: { includedRows: 1, excludedNoPriceRows: 0, warnings: [] } } }));
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator');
  await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/stock');
  await page.getByRole('button', { name: 'Расценить список артикулов' }).click();
  await page.getByLabel('Выбрать файл с артикулами').setInputFiles({ name: 'articles.txt', mimeType: 'text/plain', buffer: Buffer.from('00123') });
  await page.getByRole('button', { name: 'Распознать' }).click();
  await expect(page.getByLabel('Артикул строки 1')).toHaveValue('00123');
  await page.getByRole('button', { name: 'Проверить остатки' }).click();
  await expect(page.getByRole('cell', { name: 'Склад тест' })).toBeVisible();
  for (const [button, filename, contents] of [
    ['Скачать Excel', 'stock-valuation.xlsx', 'ordinary workbook'],
    ['Скачать Excel по шаблону КП', 'stock-offer.xlsx', 'offer workbook'],
  ]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(filename);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe(contents);
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Расценить список артикулов' })).toBeVisible();
  await expect(page.getByLabel('Артикул строки 1')).toHaveCount(0);
});
