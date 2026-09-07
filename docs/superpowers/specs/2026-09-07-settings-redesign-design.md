# Settings Redesign Design

## Goal

Turn `/settings` into an admin center with two independent destinations—Users and 1C Integration—whose desktop and mobile experiences are purpose-built rather than one long shared form.

## Git and scope boundary

- Base: `aa765758df6b67405cee2929bbb4794868bc0bc0` (`main` at task start).
- Integration branch: `feature/settings-redesign`.
- Integration worktree: `D:\codex\sm-techno-app\worktrees\settings-redesign`.
- Allowed changes: Settings UI, user administration, recoverable encrypted application passwords, individual 1C credentials, additive Settings migrations, and focused tests/assets.
- Forbidden changes: order creation/send/idempotency, stock and inventory, 1C retry/timeout/network transport, order payload/finalization, CRM/archive/assignments/sync/import/export.

## Information architecture

`/settings` is a small landing page with exactly two large cards:

1. **Пользователи** — «Учетные записи, роли и доступ к 1С», with total and active counts.
2. **Интеграция с 1С** — «Подключение, заказы, документы и НДС».

The cards navigate to `/settings/users` and `/settings/onec`. The Users route owns list, detail, and create flows. The 1C route owns only global non-secret system settings and connection testing.

## Backend contract

The ordinary user representation is:

```ts
type AppUser = {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "user";
  isActive: boolean;
  onecUsername: string;
  hasOnecPassword: boolean;
  hasRecoverableAppPassword: boolean;
  createdAt: string;
  updatedAt: string;
};
```

No password value, password hash, encrypted blob, token, key, cookie, environment value, or other system secret is returned by `GET /api/users`, login, or `/api/auth/me`.

Secrets are exposed only through these admin-only requests:

- `POST /api/users/{id}/reveal-app-password`
- `POST /api/users/{id}/reveal-onec-password`

Both return `{ "available": boolean, "password": string | null }`. Missing recoverable data is a successful response with `available: false`; it is not reconstructed from a hash. A non-admin receives 403. An admin may reveal their own user secrets.

## Password storage and audit

Authentication continues to use PBKDF2 `password_hash`. A new additive nullable column, `app_password_encrypted`, stores a recoverable copy encrypted with the existing Windows DPAPI mechanism already used for individual 1C passwords. The legacy `app_password` plaintext column remains unused and is cleared by the existing hardening migration.

Create and password-change operations write the hash and encrypted copy inside the same database transaction. A password change also retains the existing session-revocation behavior. Legacy rows with only a hash report `hasRecoverableAppPassword: false` until a new password is set.

Successful reveals append an event to an additive `user_secret_reveal_audit` table with actor admin ID, target user ID, action (`reveal_user_app_password` or `reveal_user_onec_password`), and timestamp. Password values are never audited.

## Users experience

Desktop uses a split view: searchable/refreshable user list on the left and selected user detail on the right. Mobile uses separate list, detail, and full-screen create views with large touch targets and sticky primary actions.

User detail is divided into «Основное», «Доступ в СМ ТЕХНО», «Доступ к 1С», and a danger zone. Password reveal state exists only in component memory, is cleared when the selected detail closes/changes, and automatically hides after 45 seconds. Password changes use a confirm-password dialog/sheet and are included in the next unified «Сохранить изменения» operation.

Create uses «Создать пользователя». Delete requires explicit confirmation and preserves current backend invariants.

Users dirty-state protection covers switching selection, back/navigation, refresh, and browser unload. It uses an in-app confirmation dialog where possible and `beforeunload` for browser refresh/close.

## 1C Integration experience

Desktop shows four structured cards: «Подключение», «Заказы и документы», «Структура и единицы», and «НДС». Mobile presents the same groups as accordions and keeps «Сохранить настройки 1С» sticky.

Connection testing calls the existing `/api/onec/test` contract and does not save anything or alter the transport client. Since global 1C credentials are not an existing entity, this work does not create them; the integration page edits only the existing non-secret system settings.

Dirty-state protection covers navigation, refresh, and screen close.

## Visual system

Settings uses the existing dark navy/yellow brand palette, white cards, restrained shadows, clear state badges, and accessible focus treatment. Two new large landing illustrations are transparent, web-optimized WEBP assets in a consistent non-cartoon B2B style. Small functional controls may continue using the existing icon system.

## Testing

- Backend: focused auth/user/security/migration tests on temporary SQLite databases, including fresh and upgrade paths.
- Frontend: Vitest/Testing Library coverage for landing, user flows, reveals, dirty-state, mobile/desktop structures, and 1C save/test behavior.
- Verification: relevant pytest, frontend tests, build, lint, TypeScript, secret-pattern review, history/diff scope review, and browser QA at desktop and mobile widths.

