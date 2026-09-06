# Mobile navigation design

## Goal

Replace the responsive shell's horizontal navigation with a dedicated, persistent
bottom navigation and a large "More" drawer for mobile phones and tablets. The
existing desktop sidebar and all route-level authorization remain unchanged.

## Scope and breakpoints

- The new shell applies below the existing desktop breakpoint (`2xl`). This
  includes phones and tablets.
- At `2xl` and above, the current sidebar, expandable groups, links, and logout
  control remain as they are.
- The existing compact header remains below `2xl`, but contains only the logo,
  current user's display name, and role.
- The old horizontal group strip, expanded mobile links, and header logout
  control are removed below `2xl`. No primary navigation element will use
  horizontal overflow.

## Navigation model

Route and role descriptions continue to use the shell's existing navigation
data. Desktop group rendering is retained. The mobile components receive only
the visible entries, so `adminOnly` stays aligned with the existing `isAdmin`
gate and does not change backend protection.

The primary mobile destinations are:

| Item | Route | Availability | Active when |
| --- | --- | --- | --- |
| Остатки | `/` | all users | pathname is `/` |
| CRM | `/crm` | all users | pathname starts with `/crm` |
| Настройки | `/settings` | admin | pathname starts with `/settings` |
| Ещё | drawer trigger | all users | every other application route |

Available items use an equal-width grid. An ordinary user sees three items;
an administrator sees four. No spacer is rendered for the unavailable settings
item.

## Mobile components

### `MobileBottomNav`

The fixed bottom bar is rendered by `AppShell` below `2xl` with a z-index below
modal and drawer overlays. Each full-width item is a link or button with a
64px-class touch target, a 22--28px WEBP icon, and a short label. The active
item uses a blue-tinted surface, stronger text, and a small indicator; its
raster asset does not need a second active variant.

The bar includes `env(safe-area-inset-bottom)`. `AppShell` adds matching bottom
padding to the normal page-content area below `2xl`, preventing the final
interactive page element from sitting underneath it. Full-screen forms and
modal scenarios retain priority because their existing overlays sit above the
bar.

### `MobileMoreMenu`

The `Ещё` trigger controls the existing Base UI-backed drawer primitive. The
drawer is modal, closes from its backdrop and after selecting a route, and uses
the primitive's downward swipe support and visible drag handle. Its scrolling
content occupies approximately 80% of the dynamic viewport while respecting
the component's existing maximum-height behavior and bottom safe area.

The drawer contains visually separated groups:

- Прайсы: Работа с прайсом (admin only), Работа со счётом, Заказы
- Коммерческие предложения: Создать КП, Журнал КП
- Клиенты: Клиенты
- Документы: Документы, Журнал документов
- Справочники: Справочники

At the bottom it shows the current user's display name and role, plus a
`Выйти` action that calls the existing `logout()` function. CRM is intentionally
not duplicated in the drawer because it is a primary destination.

## Assets

Create transparent, optimized WEBP assets under `sm-techno-web/public/mobile-icons/`.
They are 64x64 px (or 96x96 px only if required by a source) and are rendered
at 22--28px. The set shares a restrained, modern B2B visual style, no text, no
cartoon treatment, and no SVG assets.

Primary assets:

- `stock.webp`
- `crm.webp`
- `settings.webp`
- `more.webp`

Drawer assets:

- `price-work.webp`
- `invoice-work.webp`
- `orders.webp`
- `offer-create.webp`
- `offer-journal.webp`
- `clients.webp`
- `documents.webp`
- `documents-journal.webp`
- `references.webp`

## Tests and verification

Add a focused AppShell integration suite covering:

- admin and user primary destination sets;
- active state for the three main routes and the `Ещё` fallback routes;
- absence of the legacy horizontal navigation markup;
- drawer groups, admin-only price entry, logout action, and closing the drawer
  after an item is chosen.

Run the focused suite first, followed by the complete Node/Vitest suite,
`npx tsc --noEmit`, production build, and `git diff --check`. Confirm generated
assets are valid WEBP files and are referenced only by the new mobile
components.

## Out of scope

No changes to the backend, SQLite, API contracts, authorization rules,
authentication, business logic, page internals, or desktop navigation.
