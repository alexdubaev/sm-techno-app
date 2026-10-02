import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";


const ADMIN_PASSWORD = "admin-e2e-password";
const OPERATOR_PASSWORD = "operator-e2e-password";

async function login(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(visibleUserName(page, username === "admin" ? "Administrator" : "E2E Operator")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toHaveCount(0);
}

function visibleUserName(page: Page, name: string) {
  return page.getByText(name, { exact: true }).filter({ visible: true });
}

// Choose the actual visible navigation, including the collapsed sidebar at 1280px.
async function logoutViaUI(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  const more = page.getByRole("button", { name: "Ещё", exact: true });
  if (await more.isVisible()) {
    await more.click();
  }
  const logout = page.getByRole("button", { name: "Выйти", exact: true }).filter({ visible: true });
  await expect(logout).toHaveCount(1);
  await logout.click();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  const configured = testInfo.project.use.viewport;
  expect(page.viewportSize()).toEqual(configured);
  await page.goto("/");
  expect(await page.evaluate(() => window.innerWidth)).toBe(configured?.width);
});

for (const [username, password] of [["admin", ADMIN_PASSWORD], ["operator", OPERATOR_PASSWORD]]) {
  test(`${username} UI logout revokes session and keeps orders protected after reload`, async ({ page, request }) => {
    await login(page, username, password);
    const token = await page.evaluate(() => JSON.parse(
      window.localStorage.getItem("sm-techno-auth-session") || "{}",
    ).token as string);
    expect(token).toBeTruthy();
    await logoutViaUI(page);
    const rejected = await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(rejected.status()).toBe(401);
    await page.goto("/orders");
    await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(0);
  });
}

async function apiLogin(request: APIRequestContext, username: string, password: string) {
  const response = await request.post("/api/auth/login", { data: { username, password } });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ token: string; user: { id: number } }>;
}

test("login survives reload, logout revokes the captured server session", async ({ page, request }) => {
  await login(page, "admin", ADMIN_PASSWORD);
  const token = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("sm-techno-auth-session") || "{}",
  ).token as string);

  await page.reload();
  await expect(visibleUserName(page, "Administrator")).toBeVisible();
  await logoutViaUI(page);
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();

  const rejected = await request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(rejected.status()).toBe(401);
});

test("ordinary user is denied admin routes while admin has a positive control", async ({ page }) => {
  await login(page, "operator", OPERATOR_PASSWORD);

  await page.goto("/settings");
  await expect(page.getByText("Этот раздел доступен только администратору приложения.")).toBeVisible();
  await page.goto("/work-with-price");
  await expect(page.getByText("Этот раздел доступен только администратору приложения.")).toBeVisible();

  await logoutViaUI(page);
  await login(page, "admin", ADMIN_PASSWORD);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Пользователи.*Учетные записи/ })).toHaveAttribute("href", "/settings/users");
  await expect(page.getByRole("link", { name: /Интеграция с 1С.*Подключение/ })).toHaveAttribute("href", "/settings/onec");
});

test("deactivation invalidates an active browser and reactivation needs a fresh login", async ({ page, request }) => {
  await login(page, "operator", OPERATOR_PASSWORD);
  const operator = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("sm-techno-auth-session") || "{}",
  ).user as { id: number });
  const admin = await apiLogin(request, "admin", ADMIN_PASSWORD);

  const disabled = await request.patch(`/api/users/${operator.id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { role: "user", isActive: false, fullName: "E2E Operator" },
  });
  expect(disabled.status()).toBe(200);

  await page.reload();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();

  const reactivated = await request.patch(`/api/users/${operator.id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { role: "user", isActive: true, fullName: "E2E Operator" },
  });
  expect(reactivated.status()).toBe(200);
  await login(page, "operator", OPERATOR_PASSWORD);
});

test("logout and account switch synchronize across two tabs", async ({ context, page }) => {
  await login(page, "operator", OPERATOR_PASSWORD);
  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await expect(visibleUserName(secondPage, "E2E Operator")).toBeVisible();

  await logoutViaUI(page);
  await expect(secondPage.getByRole("button", { name: "Войти", exact: true })).toBeVisible();

  await login(page, "admin", ADMIN_PASSWORD);
  await expect(visibleUserName(secondPage, "Administrator")).toBeVisible();
  await expect(secondPage.getByText("E2E Operator", { exact: true })).toHaveCount(0);
});

const CRM_FOCUSABLE_SELECTOR = [
  "input:not([type=hidden]):not([disabled])",
  "button:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([disabled])",
].join(", ");

// The desktop CRM workspace renders at desktop widths only; at 390px the
// mobile workspace replaces it and these launchers do not exist.
function skipNonDesktopProject(testInfo: { project: { name: string } }) {
  const name = testInfo.project.name;
  test.skip(!name.includes("1280") && !name.includes("1600"), "desktop CRM focus contract");
}

async function dialogTabbableCount(dialog: Locator): Promise<number> {
  return dialog.evaluate((root, selector) => {
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
      return el.getAttribute("tabindex") !== "-1";
    }).length;
  }, CRM_FOCUSABLE_SELECTOR);
}

async function activeElementInsideDialog(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((root) => root.contains(root.ownerDocument.activeElement));
}

// Press Tab more times than the dialog has tabbable elements and require the
// focus to stay inside the dialog after every press. The assertion polls, so
// the focus guard's frame-scheduled refocus is observed after it runs; only a
// real escape (focus leaving the dialog for good) fails a step.
async function tabCycleWithinDialog(page: Page, dialog: Locator, tabbableCount: number) {
  const presses = tabbableCount + 2;
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Tab");
    await expect.poll(() => activeElementInsideDialog(dialog), { message: `focus escaped the dialog on forward Tab #${index + 1}` }).toBe(true);
  }
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => activeElementInsideDialog(dialog), { message: `focus escaped the dialog on Shift+Tab #${index + 1}` }).toBe(true);
  }
}

test("CRM tab editor dialog traps focus in a cycle and restores the launcher after Escape", async ({ page }, testInfo) => {
  skipNonDesktopProject(testInfo);
  await login(page, "admin", ADMIN_PASSWORD);
  await page.goto("/crm");
  const launcher = page.getByRole("button", { name: "+ Новая вкладка" });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Новая вкладка" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Название")).toBeFocused();

  await tabCycleWithinDialog(page, dialog, await dialogTabbableCount(dialog));

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Новая вкладка" })).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test("CRM import dialog traps focus in a cycle and restores the launcher after Escape", async ({ page }, testInfo) => {
  skipNonDesktopProject(testInfo);
  await login(page, "admin", ADMIN_PASSWORD);
  await page.goto("/crm");
  const launcher = page.getByRole("button", { name: "Загрузить клиентов" });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Загрузка клиентов из Excel" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => activeElementInsideDialog(dialog), { message: "initial focus must be inside the import dialog" }).toBe(true);

  await tabCycleWithinDialog(page, dialog, await dialogTabbableCount(dialog));

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Загрузка клиентов из Excel" })).toHaveCount(0);
  await expect(launcher).toBeFocused();
});
