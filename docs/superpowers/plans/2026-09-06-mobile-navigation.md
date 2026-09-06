# Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal responsive shell navigation with a fixed role-aware bottom bar and swipeable More drawer below the desktop sidebar breakpoint.

**Architecture:** Move existing route, role and active-state metadata into a shared navigation module while retaining the desktop sidebar. AppShell renders independent bottom-bar and drawer components below `2xl`, passes them the role-filtered metadata, and supplies safe-area-aware content padding.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Base UI Drawer, Vitest, Testing Library, Next Image, WEBP.

**Spec:** `docs/superpowers/specs/2026-09-06-mobile-navigation-design.md`

## Global Constraints

- Apply the replacement below `2xl`, including phones and tablets; keep the sidebar unchanged at `2xl` and higher.
- Do not change backend, database, APIs, auth, authorization, business logic, individual pages, or desktop navigation.
- Reuse `isAdmin` and `logout()`; visibility follows existing rights and never becomes an access-control mechanism.
- Every new mobile navigation icon is a transparent, local WEBP—not SVG.
- The bar and normal page content must account for `env(safe-area-inset-bottom)`.
- The More drawer must be modal, have a visible drag handle, support downward swipe, close from its backdrop, and close before route navigation.

---

### Task 1: Extract navigation metadata and establish AppShell regression coverage

**Files:**
- Create: `sm-techno-web/components/navigation/app-navigation.tsx`
- Create: `sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx`
- Modify: `sm-techno-web/components/app-shell.tsx:8-91`

**Interfaces:**
- Produces `AppNavItem`, `AppNavGroup`, `navigationGroups`, `normalizePathname`, `isNavItemActive`, and `isNavGroupActive`.
- `AppNavItem` has `href`, `label`, optional `adminOnly`, optional `isActive`, desktop `Icon`, and `mobileIcon`.
- Future mobile components consume this data rather than duplicate routes or role checks.

- [ ] **Step 1: Write the failing AppShell tests**

```tsx
it('shows four primary items for an administrator and marks CRM current', () => {
  renderShell({ isAdmin: true }, '/crm');
  const nav = screen.getByLabelText('Основная навигация');
  expect(within(nav).getAllByRole('link')).toHaveLength(3);
  expect(within(nav).getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
  expect(within(nav).getByRole('link', { name: 'CRM' })).toHaveAttribute('aria-current', 'page');
  expect(nav).toHaveAttribute('data-item-count', '4');
});

it('omits settings instead of leaving an empty primary slot for a user', () => {
  renderShell({ isAdmin: false }, '/');
  const nav = screen.getByLabelText('Основная навигация');
  expect(within(nav).queryByRole('link', { name: 'Настройки' })).not.toBeInTheDocument();
  expect(nav).toHaveAttribute('data-item-count', '3');
});

it.each([['/', 'Остатки'], ['/crm', 'CRM'], ['/settings', 'Настройки'], ['/orders/42', 'Ещё']])('marks %s as %s', (route, expected) => {
  renderShell({ isAdmin: true }, route);
  expect(screen.getByLabelText('Основная навигация').querySelector('[aria-current="page"]')).toHaveAccessibleName(expected);
});
```

- [ ] **Step 2: Verify that the new suite is red**

Run: `npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx`

Expected: FAIL because current AppShell has no `Основная навигация`.

- [ ] **Step 3: Extract the current metadata intact**

```tsx
export type AppNavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  isActive?: (pathname: string) => boolean;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  mobileIcon: `/mobile-icons/\${string}.webp`;
};
```

Move current types, five groups, path-match functions, and desktop SVG icon functions from AppShell into `app-navigation.tsx` without changing values. Assign the eventual WebP path to each item. Import these exports back into AppShell, leaving its desktop `NavGroupButton` and `SidebarLink` markup and behavior unchanged.

- [ ] **Step 4: Re-run the focused suite**

Run: `npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx`

Expected: still FAIL only for the absent responsive primary navigation, with no extraction-related runtime error.

- [ ] **Step 5: Commit the safe metadata boundary**

```powershell
git add sm-techno-web/components/navigation/app-navigation.tsx sm-techno-web/components/app-shell.tsx sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx
git commit -m "test: cover responsive shell navigation"
```

### Task 2: Implement the primary bar and More drawer

**Files:**
- Create: `sm-techno-web/components/mobile/mobile-bottom-nav.tsx`
- Create: `sm-techno-web/components/mobile/mobile-more-menu.tsx`
- Modify: `sm-techno-web/components/app-shell.tsx:95-285`
- Modify: `sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx`

**Interfaces:**
- `MobileBottomNav({ pathname, isAdmin, moreOpen, onMoreClick })` renders the three or four primary links and More trigger.
- `MobileMoreMenu({ open, onOpenChange, groups, displayName, roleLabel, logout })` renders secondary visible items using the existing Drawer primitive.
- AppShell owns `moreOpen` and passes only its already-filtered groups to the drawer.

- [ ] **Step 1: Add red drawer tests**

```tsx
it('opens grouped secondary links, hides the admin price action for a user, and closes after selection', async () => {
  const user = userEvent.setup();
  renderShell({ isAdmin: false }, '/orders');
  await user.click(screen.getByRole('button', { name: 'Ещё' }));
  const drawer = screen.getByRole('dialog', { name: 'Ещё' });
  expect(within(drawer).getByText('Прайсы')).toBeInTheDocument();
  expect(within(drawer).queryByRole('link', { name: 'Работа с прайсом' })).not.toBeInTheDocument();
  await user.click(within(drawer).getByRole('link', { name: 'Заказы' }));
  expect(screen.queryByRole('dialog', { name: 'Ещё' })).not.toBeInTheDocument();
});

it('removes the legacy horizontal group controls', () => {
  renderShell({ isAdmin: true }, '/');
  expect(screen.queryByRole('button', { name: 'Прайсы' })).not.toBeInTheDocument();
});

it('uses the existing logout action from the drawer footer', async () => {
  const { logout } = renderShell({ isAdmin: true }, '/orders');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ещё' }));
  await user.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(logout).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Verify that drawer coverage is red**

Run: `npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx`

Expected: FAIL because neither the More trigger nor dialog exists.

- [ ] **Step 3: Implement the bottom bar**

```tsx
const primaryItems = [stockItem, crmItem, ...(isAdmin ? [settingsItem] : [])];
const moreActive = !primaryItems.some((item) => isNavItemActive(item, pathname));

<nav aria-label="Основная навигация" data-item-count={primaryItems.length + 1}
  className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-white/95 px-2 pt-1.5 backdrop-blur 2xl:hidden"
  style={{ gridTemplateColumns: `repeat(\${primaryItems.length + 1}, minmax(0, 1fr))`, paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
  {primaryItems.map((item) => <Link key={item.href} href={item.href} aria-current={isNavItemActive(item, pathname) ? 'page' : undefined} className="relative flex min-h-16 flex-col items-center justify-center gap-1" />)}
  <button type="button" aria-current={moreActive ? 'page' : undefined} onClick={onMoreClick} className="relative flex min-h-16 flex-col items-center justify-center gap-1" />
</nav>
```

Each primary item uses Next Image with `width={64}`, `height={64}`, `alt=""` and `className="h-6 w-6"`. Apply blue active surface, stronger label and a compact indicator, rather than mutating raster colors.

- [ ] **Step 4: Implement the controlled drawer**

```tsx
<Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle swipeDirection="down">
  <DrawerContent className="max-h-[88dvh] rounded-t-[28px] border-0 bg-[#F7F9FC]">
    <DrawerHeader><DrawerTitle>Ещё</DrawerTitle></DrawerHeader>
    <nav aria-label="Дополнительная навигация" className="min-h-0 flex-1 overflow-y-auto px-4">
      {groups.map((group) => <section key={group.label}><h2>{group.label}</h2>{group.items.filter((item) => item.href !== '/' && item.href !== '/crm').map((item) => <Link key={item.href} href={item.href} onClick={() => onOpenChange(false)}>{item.label}</Link>)}</section>)}
    </nav>
    <DrawerFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div>{displayName}<span>{roleLabel}</span></div><button type="button" onClick={() => void logout()}>Выйти</button>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

Filter primary `/` and `/crm` links out of the drawer. Preserve every group heading that has a visible item. Every link calls `onOpenChange(false)` before route navigation. The footer calls the passed `logout()` unchanged.

- [ ] **Step 5: Compose the components and remove only the responsive strip**

```tsx
const [moreOpen, setMoreOpen] = useState(false);

<div className="app-shell-mobile-header border-b bg-white/92 px-2 py-2 backdrop-blur-sm 2xl:hidden">{headerIdentity}</div>
<main className="app-shell-main min-w-0 px-2 py-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-3 md:py-3 2xl:px-4 2xl:py-4">{children}</main>
<MobileBottomNav pathname={pathname} isAdmin={isAdmin} moreOpen={moreOpen} onMoreClick={() => setMoreOpen(true)} />
<MobileMoreMenu open={moreOpen} onOpenChange={setMoreOpen} groups={visibleNavGroups} displayName={displayName} roleLabel={roleLabel} logout={logout} />
```

Delete only the mobile `NavGroupButton`, `MobileNavLink`, and header logout strip. Keep the desktop sidebar interaction path unchanged.

- [ ] **Step 6: Verify that focused behavior is green**

Run: `npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx`

Expected: PASS for role counts, route state, drawer content, drawer close and no legacy group controls.

- [ ] **Step 7: Commit tested responsive behavior**

```powershell
git add sm-techno-web/components/mobile sm-techno-web/components/app-shell.tsx sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx
git commit -m "feat: add responsive bottom navigation"
```

### Task 3: Generate, wire and validate WEBP assets

**Files:**
- Create: `sm-techno-web/public/mobile-icons/{stock,crm,settings,more,price-work,invoice-work,orders,offer-create,offer-journal,clients,documents,documents-journal,references}.webp`
- Modify: `sm-techno-web/components/navigation/app-navigation.tsx`
- Modify: `sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx`

**Interfaces:**
- Every `mobileIcon` in `navigationGroups` resolves to its named local WebP.
- Both mobile components render local icons through Next Image.

- [ ] **Step 1: Add the red WebP reference test**

```tsx
it('uses local WEBP imagery for every mobile navigation entry', async () => {
  const user = userEvent.setup();
  renderShell({ isAdmin: true }, '/orders');
  await user.click(screen.getByRole('button', { name: 'Ещё' }));
  for (const image of screen.getAllByRole('img')) {
    expect(image).toHaveAttribute('src', expect.stringMatching(/\/mobile-icons\/.+\.webp$/));
  }
});
```

- [ ] **Step 2: Verify the WebP test is red before final assets**

Run: `npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx`

Expected: FAIL while the complete mobile image rendering and asset set are absent.

- [ ] **Step 3: Generate and optimize thirteen WEBP assets**

Use one built-in image-generation request per subject. All prompts require: centered isolated 64x64 B2B icon, transparent background, restrained blue/slate palette, no text, no logo, no cartoon styling, no external shadow. Subjects: stock container, contact-card person, settings gear, section grid, price tag, invoice document, order clipboard, new quotation document, quotation journal, customer group, document, document journal, and reference book. Preserve alpha, downscale selected outputs to 64x64 (96x96 only for legibility), encode as WebP and save at the declared paths.

- [ ] **Step 4: Wire actual paths and inspect output**

```tsx
{ href: '/orders', label: 'Заказы', mobileIcon: '/mobile-icons/orders.webp', Icon: ClipboardIcon }
```

Inspect every final asset: WebP format, alpha channel, maximum 96x96 pixels, and near the 10–25 KB target where visual quality permits.

- [ ] **Step 5: Run focused and final verification**

```powershell
npx vitest run --config vitest.auth.config.ts tests/auth/mobile-navigation.integration.test.tsx
npx vitest run --config vitest.auth.config.ts
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all tests pass, TypeScript and build exit 0, and diff check has no output.

- [ ] **Step 6: Commit finalized assets**

```powershell
git add sm-techno-web/public/mobile-icons sm-techno-web/components/navigation/app-navigation.tsx sm-techno-web/components/mobile sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx
git commit -m "feat: add mobile navigation webp icons"
```
