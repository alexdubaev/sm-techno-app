import { expect, test } from '@playwright/test';

test('related work entrypoints open the exact client documents and keep unlinked data unlinked', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1600', 'one client identity navigation journey');
  const login = await request.post('/api/auth/login', {
    data: { username: 'operator', password: 'operator-e2e-password' },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)), session);
  const headers = { Authorization: `Bearer ${session.token}` };
  const orders = await (await request.get('/api/orders', { headers })).json();
  const order = orders.items.find((row: { localNumber: string }) => row.localNumber === 'NAV-LINKED');
  const unlinkedOrder = orders.items.find((row: { localNumber: string }) => row.localNumber === 'NAV-UNLINKED');
  const offers = await (await request.get('/api/commercial-offers', { headers })).json();
  const offer = offers.items.find((row: { number: string }) => row.number === 'NAV-LINKED');
  const unlinkedOffer = offers.items.find((row: { number: string }) => row.number === 'NAV-UNLINKED');
  // CRM card 1 belongs to another client; 901 is a counterparty ID, never a CRM ID.
  expect(order.crmClientId).toBe(2);
  expect(offer.crmClientId).toBe(2);
  const privateCalls: string[] = [];
  page.on('request', (event) => {
    const url = new URL(event.url());
    if (/^\/api\/crm\/clients\/2(?:\/(?:contacts|events|note|audit|sync-conflicts))?$/.test(url.pathname)) {
      privateCalls.push(url.pathname);
    }
  });
  for (const source of ['/orders', `/orders/${order.id}`, `/commercial-offers/${offer.id}`]) {
    await page.goto(source);
    const entry = source === '/orders'
      ? page.getByRole('row').filter({ has: page.getByRole('link', { name: 'NAV-LINKED', exact: true }) })
      : page;
    await entry.getByRole('link', { name: 'Документы клиента', exact: true }).click();
    await expect(page).toHaveURL(/\/crm\?documents=2$/);
    const documents = page.getByRole('region', { name: 'Документы клиента', exact: true });
    await expect(documents.getByText('ООО Клиент переходов', { exact: true })).toBeVisible();
    await expect(documents.getByText('ООО Синтетический клиент документов', { exact: true })).toHaveCount(0);
    await expect(page.getByText('NAVIGATION PRIVATE NOTE', { exact: false })).toHaveCount(0);
  }
  expect(privateCalls).toEqual([]);
  await page.goto('/orders');
  const unlinkedRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'NAV-UNLINKED', exact: true }) });
  await expect(unlinkedRow).toBeVisible();
  await expect(unlinkedRow.getByRole('link', { name: 'Документы клиента', exact: true })).toHaveCount(0);
  for (const source of [`/orders/${unlinkedOrder.id}`, `/commercial-offers/${unlinkedOffer.id}`]) {
    await page.goto(source);
    await expect(page.getByText('ООО Клиент переходов', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Документы клиента', exact: true })).toHaveCount(0);
  }
});

test('client documents: upload article request, review, generate all warehouse prices and download quote', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1600', 'one critical document journey');
  const login = await request.post('/api/auth/login', {
    data: { username: 'operator', password: 'operator-e2e-password' },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)), session);
  // The isolated harness seeds this manager's synthetic client first.
  await page.goto('/crm?documents=1');
  const documents = page.getByRole('region', { name: 'Документы клиента', exact: true });
  await expect(documents.getByText('ООО Синтетический клиент документов', { exact: true })).toBeVisible();
  await expect(page.getByText('SYNTHETIC PRIVATE NOTE', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: 'К списку клиентов', exact: true }).click();
  await expect(page).toHaveURL(/\/crm$/);
  await expect(documents).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
  await page.goBack();
  await expect(documents).toBeVisible();
  await documents.getByRole('combobox', { name: 'Что распознать', exact: true }).selectOption('articles');
  await documents.getByLabel('Документ или фото для распознавания', { exact: true }).setInputFiles({
    name: 'synthetic-articles.txt', mimeType: 'text/plain', buffer: Buffer.from('00123 4'),
  });
  await documents.getByRole('button', { name: 'Загрузить и распознать', exact: true }).click();
  await expect(documents.getByLabel('Артикул, строка 1', { exact: true })).toHaveValue('00123');
  await expect(documents.getByLabel('Запрошенное количество, строка 1', { exact: true })).toHaveValue('4');
  await documents.getByRole('button', { name: 'Подтвердить проверенные поля', exact: true }).click();
  await documents.getByRole('button', { name: 'Сформировать КП по всем складам', exact: true }).click();
  await expect(documents.getByText(/Склад Южный: 4 из 5, 250 ₽/)).toBeVisible();
  await expect(documents.getByText(/номер семь: 2 из 2, 100 ₽/)).toBeVisible();
  await documents.getByRole('link', { name: 'Открыть коммерческое предложение', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать Excel', exact: true }).click();
  const result = await download;
  expect(result.suggestedFilename()).toMatch(/\.xlsx$/i);
  expect(await result.failure()).toBeNull();
});
