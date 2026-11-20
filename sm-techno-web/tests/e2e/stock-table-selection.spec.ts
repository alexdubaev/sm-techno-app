import { test, expect } from '@playwright/test';

test('unheaded table can be mapped and reviewed without editing the source file', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill('operator');
  await page.getByLabel('Пароль').fill('operator-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/stock');
  await page.getByRole('button', { name: 'Развернуть' }).click();
  await page.getByLabel('Выбрать файл или фото').setInputFiles({
    name: 'no-headings.csv', mimeType: 'text/csv',
    buffer: Buffer.from('SYNTHETIC COLUMN CHOICE,Count\n00123,2\nR-7,0'),
  });
  await page.getByRole('button', { name: 'Распознать', exact: true }).click();
  const chooser = page.getByRole('region', { name: 'Выбор столбцов таблицы' });
  await expect(chooser).toBeVisible();
  await chooser.getByLabel('Столбец артикулов, лист 1').selectOption('1');
  await chooser.getByLabel('Столбец количества, лист 1').selectOption('2');
  await chooser.getByLabel('Первая строка, лист 1').fill('2');
  await chooser.screenshot({ path: testInfo.outputPath('table-column-choice.png') });
  const box = await chooser.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await chooser.getByRole('button', { name: 'Применить столбцы' }).click();
  await expect(page.getByLabel('Артикул строки 2')).toHaveValue('00123');
  await expect(page.getByLabel('Количество строки 3')).toHaveValue('0');
  await expect(chooser).toHaveCount(0);
  await page.getByRole('button', { name: 'Проверить остатки' }).click();
  await expect(page.getByRole('cell', { name: 'Не найдено', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скачать Excel', exact: true })).toBeVisible();
});
