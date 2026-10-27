import { expect, test, type Page } from '@playwright/test';

async function saveDialog(page: Page, reason?: string) {
  const dialog = page.getByRole('dialog');
  const reasonField = dialog.getByLabel('Причина изменения');
  if ((await reasonField.count()) === 0) {
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    return;
  }
  if (reason) await dialog.getByLabel('Причина изменения').fill(reason);
  await dialog.getByRole('button', { name: 'Рассчитать изменения' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'После изменения' }),
  ).toBeVisible();
  const saleEdit = (await dialog.getByLabel('Дата продажи').count()) > 0;
  await dialog
    .getByRole('button', {
      name: saleEdit ? 'Сохранить' : 'Сохранить изменения',
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
}

test('full ledger cycle preserves closed snapshots, avatar and employee privacy', async ({
  page,
  request,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const admin = await (
    await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin-e2e-password' },
    })
  ).json();
  const headers = { Authorization: `Bearer ${admin.token}` };
  const username = `cycle-${info.project.name}-${Date.now()}`;
  const employeeName = `Менеджер полного цикла ${info.project.name}`;
  const created = await request.post('/api/users', {
    headers,
    data: {
      username,
      password: 'synthetic-cycle-pass',
      role: 'user',
      fullName: employeeName,
    },
  });
  expect(created.ok()).toBeTruthy();
  const employee = await (
    await request.post('/api/auth/login', {
      data: { username, password: 'synthetic-cycle-pass' },
    })
  ).json();
  const employeeHeaders = { Authorization: `Bearer ${employee.token}` };
  const own = await (
    await request.get('/api/manager/dashboard?month=2026-10', {
      headers: employeeHeaders,
    })
  ).json();
  const managerId = own.account.id;
  // September settings exercise copying through the October form.
  const seeded = await request.post('/api/manager/changes', {
    headers,
    data: {
      managerId,
      month: '2026-09',
      version: 0,
      reason: 'Synthetic previous terms',
      kind: 'terms',
      plan: 10000000,
      fixed: 500000,
      rate: 500,
      mode: 'plan',
    },
  });
  expect(seeded.ok()).toBeTruthy();
  await page.addInitScript(
    (value) =>
      localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)),
    admin,
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/manager$/);
  await page.getByLabel('Месяц', { exact: true }).fill('2026-10');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(managerId));
  await expect(
    page.getByRole('heading', { name: employeeName, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Настроить условия' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Скопировать из предыдущего месяца' })
    .click();
  await expect(dialog.getByLabel('План продаж, ₽')).toHaveValue('100000');
  await saveDialog(page);

  for (const [client, amount, rate] of [
    ['Первая продажа', '90000', '5'],
    ['Переход через план', '30000,01', '7,5'],
  ]) {
    await page.getByRole('button', { name: 'Добавить продажу' }).click();
    await dialog.getByLabel('Наименование клиента для документов').fill(client);
    await dialog.getByLabel('Сумма продажи, ₽').fill(amount);
    await dialog.getByLabel('Ставка продажи, %').fill(rate);
    await saveDialog(page);
  }
  const dashboard = async () =>
    (
      await request.get(
        `/api/manager/dashboard?month=2026-10&managerId=${managerId}`,
        { headers },
      )
    ).json();
  let current = await dashboard();
  expect(current.summary).toMatchObject({
    salesTotal: 12000001,
    commission: 150000,
    fixed: 500000,
    income: 650000,
  });
  const firstId = current.sales.find(
    (sale: { client: string }) => sale.client === 'Первая продажа',
  ).id;
  await page
    .getByRole('button', { name: `Изменить продажу № ${firstId}`, exact: true })
    .click();
  await dialog.getByLabel('Сумма продажи, ₽').fill('80000');
  await saveDialog(page, 'Исправлена сумма');
  current = await dashboard();
  expect(current.summary.commission).toBe(75000);

  // Actual protected file upload and decoded image, not a mocked object URL.
  await page.getByLabel('Изменить фото').setInputFiles('public/logo.png');
  const photo = page.getByRole('img', {
    name: `Фото ${employeeName}`,
    exact: true,
  });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const avatar = await request.get(`/api/manager/avatar/${managerId}`, {
    headers: employeeHeaders,
  });
  expect(avatar.status()).toBe(200);
  expect(avatar.headers()['cache-control']).toBe('no-store');
  expect(avatar.headers()['content-type']).toContain('image/webp');

  await page
    .getByRole('button', { name: 'Закрыть месяц', exact: true })
    .click();
  await saveDialog(page, 'Первое закрытие');
  const snapshots = await (
    await request.get(
      `/api/manager/snapshots?month=2026-10&managerId=${managerId}`,
      { headers },
    )
  ).json();
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0]).not.toHaveProperty('data');
  const snapshotId = snapshots[0].id;
  await page
    .getByRole('button', { name: 'Открыть месяц', exact: true })
    .click();
  await saveDialog(page, 'Исправление после закрытия');
  await page
    .getByRole('button', { name: `Отменить продажу № ${firstId}`, exact: true })
    .click();
  await saveDialog(page, 'Отмена первой продажи');
  current = await dashboard();
  expect(current.summary).toMatchObject({
    salesTotal: 3000001,
    commission: 0,
    fixed: 0,
    income: 0,
  });
  await page
    .getByRole('button', { name: 'Закрыть месяц', exact: true })
    .click();
  await saveDialog(page, 'Повторное закрытие');
  const oldSnapshot = await (
    await request.get(`/api/manager/snapshots/${snapshotId}`, { headers })
  ).json();
  expect(oldSnapshot.data.summary.income).toBe(575000);
  expect(
    oldSnapshot.data.sales.every(
      (sale: { cancelled: boolean }) => !sale.cancelled,
    ),
  ).toBeTruthy();

  await page.getByRole('button', { name: 'История изменений' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Снимки закрытия (последние 30)' }),
  ).toBeVisible();
  const older = dialog.locator('details').filter({
    has: page
      .locator('summary small')
      .filter({ hasText: `версия ${oldSnapshot.version}` }),
  });
  await older.locator('summary').click();
  await expect(
    older.getByText('Первая продажа', { exact: true }),
  ).toBeVisible();
  await expect(older).toContainText(/5\s750/);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath('closed-cabinet.png'),
    fullPage: true,
  });

  const employeeContext = await browser.newContext({
    viewport: page.viewportSize()!,
    locale: 'ru-RU',
  });
  await employeeContext.addInitScript(
    (value) =>
      localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)),
    employee,
  );
  const employeePage = await employeeContext.newPage();
  await employeePage.goto('/');
  await expect(employeePage).toHaveURL(/\/manager$/);
  await employeePage.getByLabel('Месяц', { exact: true }).fill('2026-10');
  await expect(
    employeePage.getByRole('heading', { name: employeeName, exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole('button', { name: 'Добавить продажу' }),
  ).toHaveCount(0);
  await expect(
    employeePage.getByRole('button', { name: 'История изменений' }),
  ).toHaveCount(0);
  await expect(employeePage.getByLabel('Кабинет сотрудника')).toHaveCount(0);
  expect(
    (
      await request.get(`/api/manager/snapshots/${snapshotId}`, {
        headers: employeeHeaders,
      })
    ).status(),
  ).toBe(403);
  expect(
    await employeePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await employeePage.screenshot({
    path: info.outputPath('employee-cabinet.png'),
    fullPage: true,
  });
  await employeeContext.close();
  expect(errors).toEqual([]);
});

test('network errors recover through visible retry controls', async ({
  page,
  request,
}) => {
  const session = await (
    await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin-e2e-password' },
    })
  ).json();
  await page.addInitScript(
    (value) =>
      localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)),
    session,
  );
  let failList = true;
  await page.route('**/api/manager/managers', (route) =>
    failList
      ? route.fulfill({
          status: 503,
          json: { detail: 'Список временно недоступен' },
        })
      : route.continue(),
  );
  await page.goto('/manager');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Список временно недоступен',
  );
  failList = false;
  await page
    .getByRole('button', { name: 'Повторить загрузку сотрудников' })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  let failHistory = true;
  await page.route('**/api/manager/history?**', (route) =>
    failHistory
      ? route.fulfill({
          status: 503,
          json: { detail: 'История временно недоступна' },
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'История изменений' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText(
    'История временно недоступна',
  );
  failHistory = false;
  await dialog
    .getByRole('button', { name: 'Повторить загрузку', exact: true })
    .click();
  await expect(
    dialog.getByRole('heading', { name: 'Снимки закрытия (последние 30)' }),
  ).toBeVisible();
});

test('large amounts, long names, pagination and keyboard focus stay usable', async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  const session = await (
    await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin-e2e-password' },
    })
  ).json();
  const headers = { Authorization: `Bearer ${session.token}` };
  const month = `2040-${info.project.name.includes('360') ? '01' : info.project.name.includes('390') ? '02' : info.project.name.includes('1600') ? '03' : '04'}`;
  let data = await (
    await request.get(`/api/manager/dashboard?month=${month}`, { headers })
  ).json();
  async function change(payload: Record<string, unknown>) {
    const response = await request.post('/api/manager/changes', {
      headers,
      data: {
        managerId: data.account.id,
        month,
        version: data.version,
        reason: 'Synthetic stress UI',
        ...payload,
      },
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
  }
  await change({
    kind: 'terms',
    plan: 1000000000000,
    fixed: 1000000000000,
    rate: 10000,
    mode: 'always',
  });
  for (let index = 0; index < 22; index++)
    await change({
      kind: 'sale',
      date: `${month}-01`,
      client: `Клиент ${index} ${'ДлинноеНазвание'.repeat(17)}`,
      amount: 1000000000000,
      rate: 10000,
    });
  await page.addInitScript(
    (value) =>
      localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)),
    session,
  );
  await page.goto('/manager');
  await page.getByLabel('Месяц', { exact: true }).fill(month);
  await expect(
    page.getByRole('region', { name: 'Результаты месяца' }),
  ).toContainText('220');
  await expect(
    page.getByRole('button', { name: 'Далее', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByText(/Клиент 0 /, { exact: false })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (page.viewportSize()!.width < 600) {
    const singleLine = await page
      .getByRole('region', { name: 'Результаты месяца' })
      .locator('article > p')
      .evaluateAll((elements) =>
        elements.every((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length === 1;
        }),
      );
    expect(singleLine).toBeTruthy();
  }
  await page.screenshot({
    path: info.outputPath('large-values.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Добавить продажу' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBeTruthy();
  }
  await dialog
    .getByLabel('Наименование клиента для документов')
    .fill('Не сохранять');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('dialog', {
    name: 'Есть несохранённые изменения',
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Продолжить редактирование' })
    .click();
  await expect(
    dialog.getByLabel('Наименование клиента для документов'),
  ).toHaveValue('Не сохранять');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await confirmation
    .getByRole('button', { name: 'Выйти без сохранения' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (
    await request.get(`/api/manager/dashboard?month=${month}`, { headers })
  ).json();
  expect(after.version).toBe(data.version);
});
