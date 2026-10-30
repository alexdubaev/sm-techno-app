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
      privateCalls.push(`${url.pathname}?ownerId=${url.searchParams.get('ownerId')}`);
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
  expect(privateCalls.length).toBeGreaterThan(0);
  expect(privateCalls.every((path) => path.endsWith(`?ownerId=${session.user.id}`))).toBe(true);
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

test('documents: review requisites, explicitly bind a client and download the generated contract', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1600', 'one critical document journey');
  const login = await request.post('/api/auth/login', { data: { username: 'operator', password: 'operator-e2e-password' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)), session);
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Документы', exact: true })).toBeVisible();
  const source=page.getByLabel('Документ или фото для распознавания', {exact:true}).first();
  await source.setInputFiles({name:'synthetic-requisites.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC REQUISITES 7701234560')});
  await page.getByRole('button',{name:'Загрузить и распознать',exact:true}).first().click();
  await expect(page.getByLabel('ИНН',{exact:true}).first()).toHaveValue('7701234560');
  await page.getByRole('button',{name:'Подтвердить проверенные поля',exact:true}).first().click();
  await page.getByRole('button',{name:/ООО Синтетический клиент документов.*подтвердить/}).click();
  await page.getByLabel('Номер формируемого договора').fill('Д-E2E');
  await page.getByLabel('Дата формируемого договора').fill('2026-10-30');
  await page.getByRole('button',{name:'Сформировать договор',exact:true}).click();
  await expect(page.getByText('Договор № Д-E2E', {exact:false})).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Скачать актуальный файл № Д-E2E'}).click();
  const file=await download;
  expect(file.suggestedFilename()).toMatch(/\.docx$/i);
  expect(await file.failure()).toBeNull();
  await page.goto('/crm?documents=1');
  await expect(page.getByText('SYNTHETIC PRIVATE NOTE',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Скачать актуальный файл № Д-E2E'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Что распознать'})).toHaveCount(0);
});
