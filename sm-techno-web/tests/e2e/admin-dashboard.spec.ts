import { expect, test } from '@playwright/test';

test('admin sees company overview and can switch periods; ordinary user cannot read it', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button', {name:'Войти', exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', {name:'Продажи компании'})).toBeVisible();
  await page.screenshot({path: testInfo.outputPath('dashboard.png'), fullPage: true});
  const quarterResponse = page.waitForResponse(response => response.url().includes('/api/admin/dashboard/sales?') && response.url().includes('period=quarter') && response.status() === 200);
  await page.getByRole('button', {name:'Квартал'}).click();
  expect((await (await quarterResponse).json()).period.kind).toBe('quarter');
  await expect(page.getByRole('button', {name:'Квартал'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Подключение 1С пока не включено.', {exact:false})).toBeVisible();
  await page.getByRole('link', {name:'Мои продажи →'}).click();
  await expect(page).toHaveURL(/\/manager$/);
  const login = await request.post('/api/auth/login', {data:{username:'operator',password:'operator-e2e-password'}});
  const {token} = await login.json();
  expect((await request.get('/api/admin/dashboard/sales', {headers:{Authorization:`Bearer ${token}`}})).status()).toBe(403);
});

test('populated overview shows sales and plan', async ({page}, testInfo) => {
  await page.route('**/api/admin/dashboard/sales?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const date = params.get('date')!;
    await route.fulfill({json:{period:{kind:params.get('period'),anchorDate:date,start:'2026-11-01',end:'2026-11-30'},totals:{salesTotal:15000000,count:2},series:[{date:'2026-11-01',amount:6000000,count:1},{date:'2026-11-02',amount:9000000,count:1}],managers:[{id:1,userId:1,name:'Тестовый менеджер',active:true,archived:false,salesTotal:15000000,count:2}],monthlyPlans:{month:'2026-11',managers:[{id:1,name:'Тестовый менеджер',plan:10000000,salesTotal:15000000,progress:150,status:'planned'}]},sources:{manualCount:2,onecCount:0,odataConnected:false}}});
  });
  await page.route('**/api/admin/dashboard/deepseek?*', async route => {
    const params = new URL(route.request().url()).searchParams; const date = params.get('date');
    await route.fulfill({json:{period:{kind:params.get('period'),anchorDate:date,start:'2026-11-01',end:'2026-11-30'},trackingStartedAt:'2026-11-01T00:00:00Z',recordingDegraded:false,totals:{requests:2,failedRequests:0,promptTokens:120,completionTokens:30,totalTokens:150,unknownUsageRequests:0},series:[{date:'2026-11-01',requests:1,totalTokens:50,unknownUsageRequests:0},{date:'2026-11-02',requests:1,totalTokens:100,unknownUsageRequests:0}]}});
  });
  await page.goto('/');
  await page.getByLabel('Логин').fill('admin'); await page.getByLabel('Пароль').fill('admin-e2e-password');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByText('Тестовый менеджер')).toBeVisible();
  await expect(page.getByText(/150%/)).toBeVisible();
  await page.mouse.move(0,0);
  await page.screenshot({path:testInfo.outputPath('dashboard-populated.png'),fullPage:true});
});
