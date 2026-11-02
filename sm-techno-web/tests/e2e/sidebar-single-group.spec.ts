import { expect, test } from '@playwright/test';

test('a single-item sidebar group reads like the other groups when it is active', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1600', 'desktop sidebar is shown from 1536px');
  const login = await request.post('/api/auth/login', { data: { username: 'operator', password: 'operator-e2e-password' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sm-techno-auth-session', JSON.stringify(value)), session);
  await page.goto('/stock');
  const sidebar = page.locator('aside.app-shell-sidebar');
  const activeButton = sidebar.getByRole('button', { name: 'Прайсы', exact: true });
  await expect(activeButton).toHaveAttribute('aria-expanded', 'true');
  const buttonColors = await activeButton.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(buttonColors.color).toBe('rgb(255, 255, 255)');

  const cabinet = sidebar.getByRole('link', { name: 'Личный кабинет', exact: true });
  await cabinet.click();
  await expect(page).toHaveURL(/\/manager$/);
  await expect(cabinet).toHaveAttribute('aria-current', 'page');
  // Wait for the 200ms colour transition to finish before reading computed colours.
  await expect(cabinet).toHaveCSS('background-color', buttonColors.background);
  await expect(cabinet).toHaveCSS('color', buttonColors.color);
  await expect(activeButton).toHaveCSS('color', 'rgb(11, 23, 54)');
  await page.screenshot({ path: testInfo.outputPath('single-group.png') });
});
