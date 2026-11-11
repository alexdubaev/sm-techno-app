import { test, expect } from '@playwright/test';

test('admin changes warehouse client-price inclusion and the saved choice survives reload', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const name = `Склад прайса ${testInfo.project.name}`;
  await page.goto('/');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/work-with-price');
  await page.getByRole('button', { name: /Локальные склады/ }).click();
  await page.getByPlaceholder('Название нового склада').fill(name);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: `Включать в клиентский прайс: ${name}`, exact: true });
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: /Локальные склады/ }).click();
  await expect(checkbox).not.toBeChecked();
  const group = page.getByRole('group', { name: `Склад ${name}`, exact: true });
  await expect(group.getByRole('status')).toHaveText('Исключён из клиентского прайса');
  await group.screenshot({ path: testInfo.outputPath('warehouse-client-price.png') });
  const box = await group.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeFocused();
  await group.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(group).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('admin adds stock, saves its warehouse price, and sees both after reload', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const sku = `E2E-PRICE-${suffix}`;
  const warehouseName = `E2E склад ${suffix}`;

  await page.goto('/');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/work-with-price');

  await page.getByRole('button', { name: /Локальные склады/ }).click();
  await page.getByPlaceholder('Название нового склада').fill(warehouseName);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('group', { name: `Склад ${warehouseName}`, exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Добавление вручную/ }).click();
  await page.getByLabel('Артикул').last().fill(sku);
  await page.getByLabel('Наименование').last().fill(`Синтетический товар ${suffix}`);
  await page.getByLabel('Цена').last().fill('100');
  await page.getByLabel('Склад').last().selectOption({ label: warehouseName });
  await page.getByRole('button', { name: 'Добавить позицию' }).click();
  await expect(page.getByText(`Синтетический товар ${suffix}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Добавление вручную/ }).click();

  const price = page.getByLabel('Цена').last();
  await price.fill('226700');
  await page.getByRole('button', { name: 'Изменить остатки…' }).click();
  await page.getByLabel('Количество').fill('1');
  await page.getByRole('button', { name: 'Добавить остаток' }).click();
  await expect(page.getByRole('group', { name: `Остаток на складе ${warehouseName}`, exact: true })).toContainText('1 шт.');
  await expect(price).toHaveValue('226700');
  await page.getByRole('button', { name: 'Сохранить цену и данные' }).click();
  await expect(page.getByText(/обновлена/)).toBeVisible();
  await page.reload();
  await page.getByPlaceholder('Поиск по артикулу или названию').fill(sku);
  await expect(page.getByLabel('Цена').last()).toHaveValue('226700.00');
  await expect(page.getByRole('group', { name: `Остаток на складе ${warehouseName}`, exact: true })).toContainText('1 шт.');
});
