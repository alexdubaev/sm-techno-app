import { expect, test } from '@playwright/test';

// Run only through test:auth:e2e: its launcher scrubs all production settings.
test('manager cabinet saves manual sales, previews excess commission and protects history', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const adminResponse = await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin-e2e-password' },
  });
  expect(adminResponse.ok()).toBeTruthy();
  const admin = await adminResponse.json();
  const headers = { Authorization: `Bearer ${admin.token}` };
  const username = `manager-${testInfo.project.name}-${Date.now()}`;
  const created = await request.post('/api/users', {
    headers,
    data: {
      username,
      password: 'manager-test-password',
      role: 'user',
      fullName: 'Тестовый менеджер',
    },
  });
  expect(created.ok()).toBeTruthy();
  const login = await request.post('/api/auth/login', {
    data: { username, password: 'manager-test-password' },
  });
  const managerSession = await login.json();
  const managerHeaders = { Authorization: `Bearer ${managerSession.token}` };
  const own = await request.get('/api/manager/dashboard?month=2026-10', {
    headers: managerHeaders,
  });
  const account = (await own.json()).account.id;
  await page.addInitScript(
    (session) =>
      window.localStorage.setItem(
        'sm-techno-auth-session',
        JSON.stringify(session),
      ),
    admin,
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/manager');
  await page.getByLabel('Месяц', { exact: true }).fill('2026-10');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(account));
  await expect(
    page.getByRole('heading', { name: 'Тестовый менеджер', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Задайте условия начисления.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('compact-cabinet.png'),
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Настроить условия' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('План начисления').selectOption('plan');
  await dialog.getByLabel('План продаж, ₽').fill('1000000');
  await dialog.getByLabel('Фиксированная часть, ₽').fill('50000');
  await dialog.getByLabel('Ставка для новых продаж, %').fill('5');
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'После изменения' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить продажу' }).click();
  await dialog
    .getByLabel('Наименование клиента для документов')
    .fill('ООО «Промснаб»');
  await dialog.getByLabel('Сумма продажи, ₽').fill('1200000');
  await dialog.getByLabel('Номер счёта').fill('001/26');
  await dialog.getByLabel('Дата счёта').fill('2026-10-20');
  await expect(dialog.getByLabel('Причина изменения')).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Сохранить', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('new-sale-invoice.png'),
    fullPage: false,
  });
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole('article')
      .filter({
        has: page.getByRole('heading', { name: 'Комиссия сверх плана' }),
      }),
  ).toContainText(/10\s000/);
  await page.reload();
  await page.getByLabel('Кабинет сотрудника').selectOption(String(account));
  await expect(page.getByText('ООО «Промснаб»', { exact: true })).toBeVisible();
  await expect(page.getByText('Счёт № 001/26 от 20.10.2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Изменить продажу №/ }).click();
  await dialog.getByLabel('Номер счёта').fill('002/26');
  await dialog.getByLabel('Дата счёта').fill('2026-10-21');
  await dialog.getByLabel('Причина изменения').fill('Исправлен номер счёта');
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Счёт № 002/26 от 21.10.2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Настроить условия' }).click();
  await dialog.getByLabel('План начисления').selectOption('percent');
  await dialog.getByLabel('Ставка для новых продаж, %').fill('8');
  await dialog.getByLabel('Причина изменения').fill('Удалённые продажи без плана');
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Без плана', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Комиссия с продаж' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить продажу' }).click();
  await dialog.getByLabel('Наименование клиента для документов').fill('ООО «Без плана»');
  await dialog.getByLabel('Сумма продажи, ₽').fill('16200');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Итого начислено' }) })).toContainText(/61\s?296/);
  await page.getByLabel('Месяц', { exact: true }).fill('2026-09');
  await expect(page.getByRole('heading', { name: 'Тестовый менеджер', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Настроить условия' }).click();
  await dialog.getByLabel('Минимальная зарплата, ₽').fill('25000');
  await dialog.getByLabel('Ставка для новых продаж, %').fill('5');
  await dialog.getByLabel('Причина изменения').fill('Минимальная зарплата');
  await page.screenshot({ path: testInfo.outputPath('minimum-terms.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.getByRole('button', { name: 'Добавить продажу' }).click();
  await dialog.getByLabel('Наименование клиента для документов').fill('ООО «Порог 600»');
  await dialog.getByLabel('Сумма продажи, ₽').fill('600000');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const incomeCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Итого начислено' }) });
  await expect(incomeCard).toContainText(/30\s?000/);
  await page.screenshot({ path: testInfo.outputPath('minimum-dashboard.png'), fullPage: false });
  await page.reload();
  await page.getByLabel('Месяц', { exact: true }).fill('2026-09');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(account));
  await expect(page.getByRole('heading', { name: 'Минимальная зарплата', exact: true })).toBeVisible();
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Комиссия с продаж' }) })).toContainText(/30\s?000/);
  await expect(incomeCard).toContainText(/30\s?000/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const logo = page
    .getByRole('img', { name: /СМ ТЕХНО|SM Techno/i })
    .filter({ visible: true });
  await expect(logo.first()).toHaveAttribute('src', /logo\.png/);
  await page.screenshot({
    path: testInfo.outputPath('manager.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Закрыть месяц', exact: true })
    .click();
  await dialog
    .getByLabel('Причина изменения')
    .fill('Проверено администратором');
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(
    page.getByRole('button', { name: 'Открыть месяц', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Добавить продажу' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'История изменений' }).click();
  await expect(
    dialog.getByText('Проверено администратором', { exact: false }).first(),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const boss = await request.get('/api/manager/dashboard?month=2026-10', {
    headers,
  });
  const forbidden = await request.get(
    `/api/manager/dashboard?month=2026-10&managerId=${(await boss.json()).account.id}`,
    { headers: managerHeaders },
  );
  expect(forbidden.status()).toBe(403);
  expect(errors).toEqual([]);
});

test('startup opens personal cabinet and menu keeps stock available', async ({
  page,
  request,
}, testInfo) => {
  const response = await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin-e2e-password' },
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  const dashboard = await request.get('/api/manager/dashboard?month=2026-10', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(dashboard.ok()).toBeTruthy();
  const profileName = (await dashboard.json()).account.name as string;
  await page.addInitScript(
    (value) =>
      window.localStorage.setItem(
        'sm-techno-auth-session',
        JSON.stringify(value),
      ),
    session,
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/manager$/);
  await expect(
    page.getByRole('heading', { name: profileName, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Месяц', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Кабинет сотрудника')).toBeVisible();
  const stock = page
    .getByRole('link', { name: 'Остатки', exact: true })
    .filter({ visible: true });
  if (!(await stock.count()))
    await page.getByRole('button', { name: 'Прайсы', exact: true }).click();
  await stock.click();
  await expect(page).toHaveURL(/\/stock$/);
  await expect(page.getByRole('main')).toBeVisible();
  const cabinet = page
    .getByRole('link', { name: 'Кабинет', exact: true })
    .filter({ visible: true });
  if (!(await cabinet.count()))
    await page
      .getByRole('button', { name: 'Личный кабинет', exact: true })
      .click();
  if (testInfo.project.name.startsWith('production-')) {
    await cabinet.click();
  } else {
    // Next's development toolbar overlaps the first mobile tab.
    await cabinet.focus();
    await cabinet.press('Enter');
  }
  await expect(page).toHaveURL(/\/manager$/);
  await expect(
    page.getByRole('heading', { name: profileName, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Месяц', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Кабинет сотрудника')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('compact-return-cabinet.png'),
    fullPage: false,
  });
  if (page.viewportSize()!.width < 600) {
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Кабинет' }),
    ).toHaveAttribute('aria-current', 'page');
  }
});
