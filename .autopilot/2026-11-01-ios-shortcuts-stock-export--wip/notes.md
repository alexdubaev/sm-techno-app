# Read-only карта текущего приложения

Base origin/main8f8e768, live runtime00d6152. Existing API/business paths/1С/auth/rollback safeguards сохраняются. Независимые read-only discovery agents shortcut_surface и stock_template_surface не меняли файлы.

## Shortcuts

- stock_sync_web/stock_valuation.py: PrivateRoute(no-store/sanitized errors), create_stock_valuation_router/intake/resolve, _authorize→require_document_reader, FORMATS/UploadLimits, extraction semaphore, private _stock_workspace finally/crash cleanup. Никаких client/CP/job/history; UI stock-valuation-panel сохраняет editable review.
- stock_sync_api.py:_get_current_user, database.py:app_sessions/create_session/get_user_by_session_token — только полный bearer session (hashed, sliding180d/absolute365d, проверка active/role, accountchanges удаляют sessions). Упоминание старого bearer migration не означает scoped API credential. Широкую web session не копировать в распространяемую Shortcut.
- Новые pairing/scoped credentials отсутствуют. Кандидат: явная привязка из существующего logged-in UI, отдельный hashed revocable credential с узкими stock-правами, проверка текущего пользователя/роли каждый раз; bounded lifetime/rates/cleanup/concurrency. Выбор конкретного контракта и хранения после продуктового ответа и подтверждения защищённого плана.
- Если нужен handoff в web: one-time expiring owner-bound identifier, credential не в URL; current user и device снова проверяются при получении. Это временный источник, не бизнес-история/КП. Нужна проверка Safari vs installed PWA: нельзя обещать автоматическое открытие установленной PWA через обычный URL наiOS.
- Next app/api/[...path]/route.ts proxy и lib/api.ts должны сохранить границу существующей авторизации. Общего per-device rate limiter нет; semaphore не заменяет throttling. 1С интеграция не меняется.

## Stock и шаблон

- Точные tracked шаблоны: assets/templates/commercial_offer_template.xlsx и client_price_template.xlsx. stock_sync_web/service.py:24,55 задаёт default CP template (может injectable), uploaded/runtime template settings не обнаружены.
- stock_sync_web/commercial_offers.py:CommercialOfferLine и generator≈286: actual template, стили rows/merged footer/images;A–I:number/article/name/brand/qty/priceVAT/sumformula/delivery/note;A7 номер,A9 покупатель,F9 дата. Обычные create_* service пути создают DB/storage и не подходят для stateless export.
- Existing warehouse-note convention assistant_service.py≈538: `<warehouse> · наличие: <physical quantity>`. Формирование stateless workbook через BytesIO/private temp и аккуратные blanknumber/buyer только после решения R05. Guard spreadsheet formula injection для неtrusted article/name/note, сохранять deliberate sum formulas. Plainstockworkbook уже forces text; shared CP renderer этого пока не гарантирует.
- stock_valuation.py≈225–247: один resolve snapshot, только matched variants с физическим>0; ambiguous по нескольким item IDs/conflicting qty, duplicates cleared; notfound/zerocleared. _workbook regular содержит placeholders сознательно — его не менять.
- stock_sync_desktop/database.py:lookup_stock_articles≈1515: name print_name→name, category_name, warehouse,id,physicalquantity, warehouseprice→catalogprice→0. NULL и настоящий0 в текущем snapshot неразличимы. Frontend variants не содержат name/category; строить второй workbook на сервере из того же snapshot, не доверять клиентской цене/остатку и не делать второй lookup.

## Проверки и UI

- Ready Python C:/Users/Alexandr/.codex/worktrees/f3c0/sm-techno-app/.venv/Scripts/python.exe. Synthetic isolated test env обязательно. Backend affected tests/auth, tests/stock_valuation, tests/test_auth_session_persistence.py, tests/test_commercial_offers.py; точный checkset после плана, не повторять всё формально.
- Frontend ready cache D:/codex/sm-techno-app/sm-techno-web/node_modules; для Next/Turbopack внешняя junction не подходит, при необходимости копировать готовые зависимости в isolated worktree. Browser только allowlisted npm scripts, synthetic ports/data/keys.
- UI/UX skill ui-ux-pro-max: targeted accessible authentication search verified. Разрешать paste/autofill кодов, accessiblelabels/focus, существующая оболочка/стили; два понятных download действия и отдельная привязка iPhone внутри Остатков, без переноса stock в Клиенты. Никакого глобального redesign.
- Apple docs: ShareSheet input, iCloud sharing/import questions, Get Contents URL POST form/file. Реальный iPhone/подписанная Shortcut проверяются честно: Windows не выдаётся за физический iOS и не публикует выдуманную iCloud ссылку.
