import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

type Dataset = {
  organizationName: string; ownerInn: string; account: string; bik: string;
  payerInns: string[]; clientNames: string[]; kpp: string; workbookBase64: string;
};

async function json(response: APIResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

async function openClientSales(page: Page, clientId: number) {
  await page.goto(`/crm?documents=${clientId}`);
  const overview = page.getByRole('tab', { name: 'Обзор', exact: true });
  if ((page.viewportSize()?.width ?? 1600) < 768) {
    await expect(overview).toBeVisible();
    await overview.click();
  }
  const panel = page.getByRole('region', { name: 'Продажи и поступления клиента' });
  await expect(panel.getByRole('heading', { name: 'Менеджер по продажам' })).toBeVisible();
  return panel;
}

test('bank statement imports six gross payments once and shows CRM receipts', async ({ page, request }, info) => {
  test.setTimeout(180_000);
  // The existing launcher provides a scrubbed environment and disposable DB/storage.
  const projectScopes: Record<string, number> = {
    'production-chromium-360': 1, 'production-chromium-1600': 2, 'production-webkit-390': 3,
    'chromium-390': 4, 'chromium-1280': 5, 'chromium-1600': 6,
  };
  const scope = projectScopes[info.project.name];
  expect(scope).toBeDefined();
  const python = process.env.SM_TECHNO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const dataset: Dataset = JSON.parse(execFileSync(python, ['-c',
    'import json,sys; from tests.support.bank_e2e import browser_dataset; print(json.dumps(browser_dataset(int(sys.argv[1]))))',
    String(scope)], { cwd: path.resolve('..'), encoding: 'utf8' }));
  const workbook = Buffer.from(dataset.workbookBase64, 'base64');
  const admin = await json(await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin-e2e-password' },
  }));
  const headers = { Authorization: `Bearer ${admin.token}` };
  // This is intentionally the first new API check: before T03 it fails 404.
  const accounts = await json(await request.get('/api/bank-statements/accounts', { headers }));
  const organization = accounts.organizations.find((org: { name: string }) => org.name === dataset.organizationName);
  expect(organization).toBeDefined();
  const managerName = `Синтетический менеджер выписки ${scope}`;
  const username = `bank-control-${scope}`;
  const user = (await json(await request.post('/api/users', { headers, data: {
    username, password: 'synthetic-bank-browser-password', role: 'user', fullName: managerName,
  } }))).user;
  const employee = await json(await request.post('/api/auth/login', {
    data: { username, password: 'synthetic-bank-browser-password' },
  }));
  const employeeHeaders = { Authorization: `Bearer ${employee.token}` };
  const own = await json(await request.get('/api/manager/dashboard?month=2026-11', { headers: employeeHeaders }));
  const managerId = own.account.id;
  expect(own.account.userId).toBe(user.id);
  await json(await request.post('/api/manager/changes', { headers, data: {
    managerId, month: '2026-11', version: own.version, kind: 'terms', plan: 0, fixed: 0,
    mode: 'always', rate: 500, reason: 'Только синтетический контрольный пример',
  } }));
  const clientIds: number[] = [];
  for (let i = 0; i < 5; i++) {
    const created = await json(await request.post(`/api/crm/clients?ownerId=${admin.user.id}`, { headers, data: {
      documentName: dataset.clientNames[i], fullName: dataset.clientNames[i], inn: dataset.payerInns[i],
      kpp: dataset.kpp, legalType: 'legal_entity',
    } }), 201);
    clientIds.push(created.client.id);
    if (i > 0) await json(await request.put(`/api/bank-statements/clients/${created.client.id}/assignment`, {
      headers, data: { version: 0, managerId, startDate: '2026-11-01', reason: 'Синтетическое закрепление' },
    }));
  }
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((session) => localStorage.setItem('sm-techno-auth-session', JSON.stringify(session)), admin);

  // One actual CRM assignment through the shared desktop/mobile panel.
  const sales = await openClientSales(page, clientIds[0]);
  await sales.getByText('Назначить или изменить менеджера', { exact: true }).click();
  await sales.getByLabel('Менеджер по продажам').selectOption(String(managerId));
  await sales.getByLabel('Дата начала закрепления').fill('2026-11-01');
  await sales.getByLabel('Причина изменения закрепления').fill('Первоначальное закрепление в браузере');
  const assignmentRefresh = Promise.all([
    page.waitForResponse((response) => response.request().method() === 'GET'
      && response.url().endsWith(`/api/bank-statements/clients/${clientIds[0]}`) && response.status() === 200),
    page.waitForResponse((response) => response.request().method() === 'GET'
      && response.url().endsWith('/api/manager/managers') && response.status() === 200),
  ]);
  await sales.getByRole('button', { name: 'Сохранить закрепление', exact: true }).click();
  await expect(sales.getByText('Закрепление сохранено.', { exact: false })).toBeVisible();
  // Finish the successful save's explicit refresh before this test's document navigation.
  // WebKit reports an artificial hard-navigation abort as an access-control page error.
  await Promise.all((await assignmentRefresh).map((response) => response.finished()));

  await page.goto('/manager');
  await page.getByLabel('Месяц', { exact: true }).fill('2026-11');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(managerId));
  await page.getByRole('button', { name: 'Загрузить выписку', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Банковские выписки' });
  await expect(dialog).toBeVisible();
  await dialog.getByText('Подтвердить счёт организации для импорта', { exact: true }).click();
  await dialog.getByLabel('Наша организация').selectOption(String(organization.id));
  await expect(dialog.getByLabel('ИНН владельца счёта')).toHaveValue(dataset.ownerInn);
  await dialog.getByLabel('Расчётный счёт', { exact: true }).fill(dataset.account);
  await dialog.getByLabel('БИК банка').fill(dataset.bik);
  await dialog.getByLabel('Основание подтверждения счёта').fill('Проверенные синтетические реквизиты');
  await dialog.getByRole('button', { name: 'Подтвердить реквизиты счёта', exact: true }).click();
  await expect(dialog.getByText('Счёт подтверждён для импорта.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Файл выписки XLSX').setInputFiles({
    name: `synthetic-control-${scope}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook,
  });
  await dialog.getByRole('button', { name: 'Прочитать выписку', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Результат чтения выписки' })).toBeVisible();
  await expect(dialog.getByRole('article', { name: /^Оплата / })).toHaveCount(6);
  await expect(dialog.getByRole('article', { name: 'Оплата 5471', exact: true })).toContainText('09.09.2026');
  const read = await json(await request.get('/api/bank-statements/uploads', { headers }));
  const upload = read.items.find((item: { account: string }) => item.account === dataset.account);
  const before = await json(await request.get(`/api/bank-statements/uploads/${upload.id}`, { headers }));
  expect(before.summary).toMatchObject({ readyCount: 6, readyAmount: 198906300 });
  expect(before.operations.find((op: { documentNumber: string }) => op.documentNumber === '606').invoiceDate).toBeNull();
  await dialog.getByRole('button', { name: 'Выбрать готовые', exact: true }).click();
  await dialog.getByRole('button', { name: 'Проверить итог перед добавлением', exact: true }).click();
  const effect = dialog.getByRole('region', { name: 'Изменение вознаграждения' });
  await expect(effect).toContainText(/99\s453,15/);
  const confirm = effect.getByRole('button', { name: /^Добавить 6 оплат на/ });
  await confirm.scrollIntoViewIfNeeded();
  await confirm.evaluate((button) => button.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(confirm).toBeVisible();
  await expect.poll(() => confirm.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? window.innerHeight;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= top && box.bottom <= top + height && (hit === button || button.contains(hit));
  })).toBe(true);
  const modalWidth = await dialog.evaluate((el) => {
    el.scrollLeft = 0;
    const box = el.getBoundingClientRect();
    const right = box.left + el.clientLeft + el.clientWidth;
    return {
      clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft,
      overflowing: Array.from(el.querySelectorAll('*')).flatMap((child) => {
        const rect = child.getBoundingClientRect();
        return (rect.width && rect.right > right + 1) || child.scrollWidth > child.clientWidth + 1 ? [{
          tag: child.tagName, className: child.className, width: rect.width, left: rect.left, right: rect.right,
          clientWidth: child.clientWidth, scrollWidth: child.scrollWidth,
          visible: child.getClientRects().length, display: getComputedStyle(child).display,
          text: child.textContent?.slice(0, 80),
        }] : [];
      }).slice(0, 12),
    };
  });
  expect(modalWidth.scrollWidth, JSON.stringify(modalWidth)).toBeLessThanOrEqual(modalWidth.clientWidth + 1);
  await info.attach('bank-layout', { body: JSON.stringify({
    viewport: page.viewportSize(), clientWidth: modalWidth.clientWidth, scrollWidth: modalWidth.scrollWidth,
  }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('bank-preview-synthetic.png'), fullPage: false });
  const commitRequest = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith('/api/bank-statements/commit'));
  await confirm.click();
  const savedRequest = (await commitRequest).postDataJSON();
  await expect(dialog.getByText('Добавлено продаж: 6.', { exact: false })).toBeVisible();
  const posted = await json(await request.get(`/api/bank-statements/uploads/${upload.id}`, { headers }));
  expect(posted.summary.accountedCount).toBe(6);
  const dashboard = () => request.get('/api/manager/dashboard?month=2026-11', { headers: employeeHeaders }).then((response) => json(response));
  expect((await dashboard()).summary).toMatchObject({ salesTotal: 198906300, commission: 9945315, income: 9945315, count: 6 });
  // Lost-response retry is the original saved payload/key; totals remain unchanged.
  await json(await request.post('/api/bank-statements/commit', { headers, data: savedRequest }));
  const repeated = await json(await request.post('/api/bank-statements/uploads', { headers, multipart: {
    accountId: String((await json(await request.get('/api/bank-statements/accounts', { headers }))).accounts.find((a: { account: string }) => a.account === dataset.account).id),
    file: { name: `renamed-control-${scope}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook },
  } }));
  expect(repeated.id).toBe(upload.id);
  expect((await dashboard()).summary).toMatchObject({ salesTotal: 198906300, commission: 9945315, count: 6 });
  expect((await request.get(`/api/bank-statements/uploads/${upload.id}/file`, { headers: employeeHeaders })).status()).toBe(403);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByText(/№\s+\d+ · Банковская выписка/)).toHaveCount(6);

  const receipts = await openClientSales(page, clientIds[4]);
  await expect(receipts.getByRole('article')).toHaveCount(2);
  await receipts.getByText('Поступления клиента', { exact: true }).scrollIntoViewIfNeeded();
  await expect(receipts).toContainText('246');
  await expect(receipts).toContainText('517');
  expect(await receipts.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('bank-client-receipts-synthetic.png'), fullPage: false });
  expect(pageErrors).toEqual([]);
});
