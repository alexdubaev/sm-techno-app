# Autonomous continuation handoff: мини-CRM СМ ТЕХНО

Дата: 4 сентября 2026. Этот документ передаёт работу следующему агенту без
необходимости ждать сообщений пользователя между этапами.

## Non-negotiable execution loop

Работай автономно и последовательно в одном worktree. Не завершай работу после
простого статуса: после каждого небольшого законченного этапа сделай проверку,
локальный коммит и **сразу** возьми следующий незавершённый пункт из раздела
«Очередь». Пиши короткий отчёт только как промежуточный результат и продолжай
тем же ходом. Запрашивай пользователя только при реальном блокере, когда нужна
новая продуктовая развилка, внешняя авторизация или необратимое действие за
пределами проекта.

Для каждого этапа:

1. Добавь/исправь тест до production-кода и наблюдай ожидаемое RED-падение.
2. Реализуй минимум кода для GREEN.
3. Запусти относящиеся `unittest`, `py_compile` затронутых Python-файлов и
   `git diff --check`.
4. Создай отдельный локальный commit с ясным сообщением.
5. Без паузы переходи к следующему пункту.

Не создавать новые worktree/ветки, не использовать параллельных исполнителей в
общих CRM-файлах, не делать push/merge/main/Sites, не запускать
`start_all.bat`/`stop_all.bat`, не изменять `D:\codex\sm-techno-app\sm-techno-app`
и не выполнять записи в рабочую 1С.

## Workspace and history

- Worktree: `D:\codex\sm-techno-app\worktrees\mini-crm`
- Branch: `codex/mini-crm`
- Use Git commands with
  `-c safe.directory=D:/codex/sm-techno-app/worktrees/mini-crm` only; do not
  set `safe.directory=*` globally.
- Read first: `AGENTS.md`,
  `docs/superpowers/plans/2026-09-03-mini-crm.md`,
  `docs/superpowers/handoffs/2026-09-03-mini-crm.md`, and
  `docs/superpowers/handoffs/2026-09-03-mini-crm-continuation.md`.
- Latest committed CRM work:
  - `7b109ec feat(crm): add guarded CRM API routes`
  - `0d0d8d7 feat(crm): validate personal row preferences`
  - `28dba4d feat(crm): add versioned personal row ordering`
  - `51f8975 feat(crm): support admin removal of shared assignments`

## Current uncommitted state — preserve and finish it

There are intentional changes only in these files:

- `stock_sync_web/crm_repository.py`
  - `archive_local_client(...)` archives only a local lead owned by the target
    employee; it archives its assignment, cancels active reminders, preserves
    identifiers/history, marks the card `is_inactive=1` and `sync_status='archived'`,
    and records `archive_local_client` audit action.
  - `restore_local_client(...)` restores the archived assignment to its prior tab
    (or work tab if missing), sets `is_inactive=0`, `sync_status='local'`, and
    records `restore_local_client`.
- `stock_sync_api.py`
  - `POST /api/crm/clients/{client_id}/local-archive?ownerId=...`
  - `POST /api/crm/clients/{client_id}/local-restore?ownerId=...`
- `tests/test_crm_persistence.py`
  - `test_admin_can_archive_and_restore_local_card` is green for repository
    behavior.

The current API endpoints still lack API-level tests. Add those first, verify
role/context failures and normal archive/restore, then commit this stage. Do
not silently replace the local archive with ordinary assignment archive: local
card archive must remain distinct from shared-company “leave only in primary”.

## Reuse map

- Auth/session/roles: `_get_current_user`, `_get_admin_user` in
  `stock_sync_api.py`; do not create a second auth system.
- CRM card/store: existing `crm_clients`, `WebDatabase`, `CrmRepository`; do
  not create a second company database.
- Shared client removal: `remove_assignment_for_admin`; only for 1С-linked
  cards and it preserves personal history.
- Assignment archive: `archive_assignment`/`restore_assignment`; retain for
  personal assignment archive, but do not conflate with local-card archive.
- 1С/OData: existing service and `OneCClient`; do not contact real 1С until
  the explicit read-only/fake-client phase in the plan.
- Excel: existing `openpyxl` server-side patterns; do not introduce another
  Excel library.

## Queue — work in this order

1. Finish current local-card archive stage: API tests, negative role/context
   checks, full persistence/API tests, commit.
2. Finish server invariants: card version/conflict contracts, protected
   assignment transitions, ensure archived cards do not leak into active lists.
3. Build CRM UI `/crm` in existing app shell: main 1С list, personal tabs,
   table/card/search, move menu, labels, owner context in admin view.
4. UI history, reminders, administrative archive/restore confirmation and audit.
5. Excel export (`all`/`tab`) with owner isolation, two sheets, order/colors,
   formula-safe strings.
6. Explicit 1С linking/creation, persistent queue, fake-1С retry/unknown POST
   and field-level conflict tests. Read-only metadata checks before any write.
7. Full acceptance: existing Python tests, `npm ci`, lint, TypeScript,
   frontend tests/build, and local-only ports `8012`/`3012`.

## Verification commands

```powershell
Set-Location 'D:\codex\sm-techno-app\worktrees\mini-crm'
.\.venv\Scripts\python.exe -m unittest tests.test_crm_persistence
.\.venv\Scripts\python.exe -m unittest tests.test_crm_api
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_clients*.py'
.\.venv\Scripts\python.exe -m py_compile stock_sync_api.py stock_sync_web\crm_repository.py
git -c safe.directory=D:/codex/sm-techno-app/worktrees/mini-crm diff --check
```

The full `pip install -r requirements.txt` previously hit a Windows `WinError 32`
lock in `pandas`; FastAPI dependencies required by CRM tests are installed. Do
not remove/replace the virtual environment blindly; record an exact error if it
blocks a needed test.
