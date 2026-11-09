import { expect, test } from '@playwright/test';

test('compact overview keeps report controls and opens a full-screen chart', async ({ page, request }, info) => {
  test.setTimeout(90_000);
  // Keep the November fixture and date-change action independent of today's date.
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z'));
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin-e2e-password' } });
  expect(login.ok()).toBe(true);
  const { token, user } = await login.json();
  await page.addInitScript(session => localStorage.setItem('sm-techno-auth-session', JSON.stringify(session)), { token, user });
  await page.route('**/api/admin/dashboard/sales?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const anchor = params.get('date')!;
    await route.fulfill({ json: {
      period: { kind: params.get('period'), anchorDate: anchor, start: '2026-11-01', end: '2026-11-30' },
      totals: { salesTotal: 38000000, count: 6, unallocatedSalesTotal: 500000, unallocatedCount: 1 },
      series: [{ date: '2026-11-03', amount: 20000000, count: 3 }, { date: '2026-11-06', amount: 18000000, count: 3 }],
      managers: [1, 2, 3, 4].map(id => ({ id, name: `Синтетический менеджер ${id}`, active: true, archived: false, salesTotal: 9500000, count: 2 })),
      monthlyPlans: { month: '2026-11', managers: [1, 2, 3, 4].map(id => ({ id, plan: 12000000, salesTotal: 9500000, progress: 79.2, status: 'planned' })) },
      sources: { manualCount: 6, bankCount: 0, onecCount: 0, odataConnected: false },
    } });
  });
  await page.route('**/api/admin/dashboard/deepseek?*', route => route.fulfill({ json: {
    period: { kind: 'month', anchorDate: new URL(route.request().url()).searchParams.get('date'), start: '2026-11-01', end: '2026-11-30' }, trackingStartedAt: null, recordingDegraded: false,
    totals: { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, unknownUsageRequests: 0 }, series: [],
  } }));
  await page.route('**/api/admin/dashboard/balance', route => route.fulfill({ json: { status: 'unconfigured' } }));
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Продажи компании' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const viewport = page.viewportSize()!;
  if (viewport.width < 1536) await expect(page.getByTestId('mobile-shell-header')).toBeInViewport({ratio:1});
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const periodLabel = page.locator('strong[title]').first();
  expect(await periodLabel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Открыть кабинет: Синтетический менеджер 1' })).toHaveAttribute('href', /managerId=1&month=2026-11/);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
  const plot = page.getByRole('button', { name: 'Открыть подробный график продаж' });
  await expect(plot).toBeInViewport();
  const bar = await plot.locator('.recharts-bar-rectangle path').first().boundingBox();
  expect(bar && bar.height > 60).toBe(true);
  if (viewport.width > 700) {
    const chartBox = await plot.boundingBox();
    const managerBox = await page.getByRole('heading', {name:'Менеджеры', exact:true}).boundingBox();
    expect(chartBox && managerBox && chartBox.x + chartBox.width <= managerBox.x).toBe(true);
  }
  if (viewport.width === 390) {
    const first = page.locator('a[href="/manager?managerId=1&month=2026-11"]');
    const third = page.locator('a[href="/manager?managerId=3&month=2026-11"]');
    await expect(first).toBeInViewport();
    await expect(third).toBeInViewport();
    const bottomNav = await page.locator('nav').last().boundingBox();
    const thirdBox = await third.boundingBox();
    const plotBox = await plot.boundingBox();
    expect(bottomNav && thirdBox && plotBox && thirdBox.y + thirdBox.height <= bottomNav.y && plotBox.y + plotBox.height <= bottomNav.y).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await info.attach('initial-geometry', {body:JSON.stringify(await page.evaluate(() => ({scrollY:window.scrollY, viewport:{offsetTop:window.visualViewport?.offsetTop,height:window.visualViewport?.height},header:document.querySelector('[data-testid=mobile-shell-header]')?.getBoundingClientRect().toJSON(),third:document.querySelector('a[href="/manager?managerId=3&month=2026-11"]')?.getBoundingClientRect().toJSON()}))),contentType:'application/json'});
    await page.screenshot({ path: info.outputPath('mobile-390.png'), fullPage: false });
  }
  if (viewport.width === 360) {
    await expect(page.locator('a[href="/manager?managerId=1&month=2026-11"]')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('mobile-360.png'), fullPage: false });
  }
  if (viewport.width === 1600) {
    await page.screenshot({ path: info.outputPath('desktop-1600.png'), fullPage: false });
  }
  await page.getByRole('button', { name: 'Выбрать дату' }).click();
  const dateRequest = page.waitForResponse(response => response.url().includes('/api/admin/dashboard/sales?') && response.url().includes('date=2026-11-09'));
  await page.getByLabel('Дата отчёта').fill('2026-11-09');
  expect((await dateRequest).ok()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const expand = page.getByRole('button', { name: 'Развернуть график продаж' });
  await expand.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Продажи по дням' })).toBeVisible();
  await expect(dialog.locator('p').first()).toContainText('380');
  if (viewport.width === 390) await page.screenshot({ path: info.outputPath('mobile-390-fullscreen.png'), fullPage: false });
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox && dialogBox.x === 0 && dialogBox.y === 0 && dialogBox.width === page.viewportSize()!.width && dialogBox.height === page.viewportSize()!.height).toBe(true);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть график' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await plot.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(plot).toBeFocused();
  await page.getByRole('button', {name:'Выбрать дату'}).click();
  await expect(page.getByLabel('Дата отчёта')).toHaveValue('2026-11-09');
  await page.getByRole('button', {name:'Закрыть', exact:true}).click();
  await expect(page.getByRole('button', {name:'Месяц', exact:true})).toHaveAttribute('aria-pressed','true');
  const lastManager = page.getByRole('link', {name:'Открыть кабинет: Синтетический менеджер 4'});
  await lastManager.scrollIntoViewIfNeeded();
  await expect(lastManager).toBeInViewport();
});
