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

  await page.goto('/manager');
  await page.getByLabel('Месяц', { exact: true }).fill('2026-11');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(managerId));
  await expect(page.getByRole('heading', { name: managerName, exact: true })).toBeVisible();
  const controls = page.getByRole('group', { name: 'Управление кабинетом' });
  await expect(controls.getByLabel('Месяц', { exact: true })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Загрузить выписку', exact: true })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'История выписок', exact: true })).toBeVisible();
  const controlBounds = await controls.evaluate((element) => ({
    height: element.getBoundingClientRect().height, width: element.clientWidth, scrollWidth: element.scrollWidth,
  }));
  expect(controlBounds.height).toBeLessThan(160);
  expect(controlBounds.scrollWidth).toBeLessThanOrEqual(controlBounds.width + 1);
  await page.screenshot({ path: info.outputPath('manager-header-synthetic.png'), fullPage: false });
  await page.getByRole('button', { name: 'Загрузить выписку', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Банковские выписки' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Организация и счёт', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Подтвердить счёт организации для импорта', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Файл выписки XLSX').setInputFiles({
    name: `synthetic-control-${scope}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook,
  });
  await expect(dialog.getByRole('button', { name: 'Прочитать выписку', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('bank-file-only-synthetic.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Прочитать выписку', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Результат чтения выписки' })).toBeVisible();
  await expect(dialog.getByRole('article', { name: /^Оплата / })).toHaveCount(6);
  await expect(dialog.getByRole('article', { name: 'Оплата 5471', exact: true })).toContainText('09.09.2026');
  const read = await json(await request.get('/api/bank-statements/uploads', { headers }));
  const upload = read.items.find((item: { account: string }) => item.account === dataset.account);
  const before = await json(await request.get(`/api/bank-statements/uploads/${upload.id}`, { headers }));
  expect(before.summary).toMatchObject({ companyReadyCount: 6, companyReadyAmount: 198906300, readyCount: 5 });
  const firstOperation = before.operations.find((op: { clientId: number }) => op.clientId === clientIds[0]);
  expect(firstOperation.status).toBe('manager_missing');
  const company = () => request.get('/api/admin/dashboard/sales?period=month&date=2026-11-07', { headers }).then((response) => json(response));
  const companyBefore = await company();
  expect(before.operations.find((op: { documentNumber: string }) => op.documentNumber === '606').invoiceDate).toBeNull();
  await dialog.getByRole('button', { name: 'Выбрать готовые', exact: true }).click();
  await dialog.getByRole('button', { name: 'Проверить итог перед добавлением', exact: true }).click();
  const effect = dialog.getByRole('region', { name: 'Изменение продаж и вознаграждения' });
  await expect(effect).toContainText('Изменение общих продаж: 6 оплат');
  await expect(effect).toContainText('Начисление менеджерам: 5 оплат');
  await expect(effect).toContainText('Не начислено менеджерам: 1');
  const confirm = effect.getByRole('button', { name: 'Подтвердить 6 оплат' });
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
  await expect(dialog.locator('output').filter({ hasText: 'Изменение общих продаж: 6' })).toBeVisible();
  const companyAfter = await company();
  const dashboard = () => request.get('/api/manager/dashboard?month=2026-11', { headers: employeeHeaders }).then((response) => json(response));
  expect((await dashboard()).summary).toMatchObject({ salesTotal: 198906300 - firstOperation.amount, count: 5 });
  expect(companyAfter.totals.salesTotal - companyBefore.totals.salesTotal).toBe(198906300);
  expect(companyAfter.totals.unallocatedSalesTotal - companyBefore.totals.unallocatedSalesTotal).toBe(firstOperation.amount);
  expect(companyAfter.totals.unallocatedCount - companyBefore.totals.unallocatedCount).toBe(1);
  const companyOnlyCard = dialog.getByRole('article', { name: `Оплата ${firstOperation.documentNumber}`, exact: true });
  await expect(companyOnlyCard).toContainText('Учтено в общих продажах');
  await expect(companyOnlyCard).toContainText('Не начислено менеджеру');
  await expect(companyOnlyCard.getByRole('checkbox')).toBeDisabled();
  await companyOnlyCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('bank-company-only-synthetic.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  // One actual CRM assignment through the shared desktop/mobile panel.
  const sales = await openClientSales(page, clientIds[0]);
  await sales.getByText('Назначить или изменить менеджера', { exact: true }).click();
  await sales.getByLabel('Менеджер по продажам').selectOption(String(managerId));
  await sales.getByLabel('Дата начала закрепления').fill('2026-11-01');
  await expect(sales.getByLabel('Причина изменения закрепления')).toHaveCount(0);
  const dateBounds = await sales.getByLabel('Дата начала закрепления').evaluate((element) => {
    const input = element.getBoundingClientRect();
    const field = element.parentElement!.getBoundingClientRect();
    return { left: input.left, right: input.right, fieldLeft: field.left, fieldRight: field.right };
  });
  expect(dateBounds.left).toBeGreaterThanOrEqual(dateBounds.fieldLeft - 1);
  expect(dateBounds.right).toBeLessThanOrEqual(dateBounds.fieldRight + 1);
  await sales.getByRole('button', { name: 'Сохранить закрепление', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('crm-first-assignment-synthetic.png'), fullPage: false });
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


  // Attribution creates the manager ledger entry without adding a second company sale.
  await page.goto('/manager');
  await page.getByLabel('Месяц', { exact: true }).fill('2026-11');
  await page.getByLabel('Кабинет сотрудника').selectOption(String(managerId));
  await page.getByRole('button', { name: 'История выписок', exact: true }).click();
  await dialog.getByRole('button', { name: new RegExp(`synthetic-control-${scope}`) }).click();
  await dialog.getByRole('button', { name: 'Проверить итог перед добавлением', exact: true }).click();
  await expect(effect).toContainText('Изменение общих продаж: 0 оплат · 0 ₽');
  await expect(effect).toContainText('Начисление менеджерам: 1 оплат');
  await page.screenshot({ path: info.outputPath('bank-later-manager-preview-synthetic.png'), fullPage: false });
  await effect.getByRole('button', { name: 'Подтвердить 1 оплат', exact: true }).click();
  await expect(dialog.locator('output').filter({ hasText: 'Изменение общих продаж: 0' })).toBeVisible();
  const attributed = await company();
  expect(attributed.totals.salesTotal).toBe(companyAfter.totals.salesTotal);
  expect(attributed.totals.count).toBe(companyAfter.totals.count);
  expect(attributed.totals.unallocatedSalesTotal).toBe(companyBefore.totals.unallocatedSalesTotal);
  expect(attributed.totals.unallocatedCount).toBe(companyBefore.totals.unallocatedCount);
  const posted = await json(await request.get(`/api/bank-statements/uploads/${upload.id}`, { headers }));
  expect(posted.summary.accountedCount).toBe(6);
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
