# Аудит веток 2026-10-01 — dry-run

Ничего не слито, настройки защиты не изменены, remote-ветки и теги не изменены. Все 12 старых tips — предки main, уникальных относительно main коммитов нет. Основной SHA: `063ddbca7eda5cb62f3205d0ebba8acaad9e1ea1`. При применении повторно проверить refs, открытые PR, активную работу и внешние зависимости; совпадения с этим снимком недостаточно для удаления.

| Ветка | SHA | Отставание | Тег (локальный) | Решение |
|---|---|---:|---|---|
| backup/pre-commercial-offers-2026-07-09 | `de87b63a5e80ef37d3f40fe5d80a640b2cff2d58` | 408 | `archive/2026-10-01/backup/pre-commercial-offers-2026-07-09` | archive-delete-proposed |
| backup/pre-storage-locations-2026-07-07 | `7deaaff09407a8492f9778f65a44a639c5b6f081` | 414 | `archive/2026-10-01/backup/pre-storage-locations-2026-07-07` | archive-delete-proposed |
| codex/crm-client-cache | `1fb6edf541a4c74750f897e13290e71b9d422fca` | 247 | `archive/2026-10-01/codex/crm-client-cache` | archive-delete-proposed |
| codex/crm-contact-person-display | `44a1a805fca4b63272805f21cbc91bf663cc9265` | 128 | `archive/2026-10-01/codex/crm-contact-person-display` | archive-delete-proposed |
| codex/crm-contact-selector-position | `c0ceb03cbe337482c22ebf496dfb29d5d5ab9417` | 125 | `archive/2026-10-01/codex/crm-contact-selector-position` | archive-delete-proposed |
| codex/crm-mobile-contact-delete | `6e7cba58fb46276bdaba1976fc05ef9ebe699850` | 16 | `archive/2026-10-01/codex/crm-mobile-contact-delete` | archive-delete-proposed |
| codex/crm-mobile-delete-label | `2d8bba6b97d0019fd0d754dbbfd42111b4388ae2` | 14 | `archive/2026-10-01/codex/crm-mobile-delete-label` | archive-delete-proposed |
| codex/retire-legacy-ui | `aa765758df6b67405cee2929bbb4794868bc0bc0` | 241 | `archive/2026-10-01/codex/retire-legacy-ui` | archive-delete-proposed |
| codex/storage-location | `48c473379550938ed7619d0c82288ec31b16a560` | 382 | `archive/2026-10-01/codex/storage-location` | keep |
| codex/vps-self-hosting | `dff06d285e9d5a60afb89a3e83cb0e1a648379a9` | 11 | `archive/2026-10-01/codex/vps-self-hosting` | keep |
| codex/warehouse-prices | `109176cd2cb84e0264a1445b576c260152324a4d` | 2 | `archive/2026-10-01/codex/warehouse-prices` | archive-delete-proposed |
| feature/settings-redesign | `78e7892249748dcb6dfc48aba6365deaa0db66bc` | 227 | `archive/2026-10-01/feature/settings-redesign` | archive-delete-proposed |
| main | `063ddbca7eda5cb62f3205d0ebba8acaad9e1ea1` | 0 | `archive/2026-10-01/main-before-cleanup` | keep |

archive-delete-proposed — только предложение: tip включён в main, открытых PR на момент аудита нет, окончательная проверка зависимостей обязательна. main сохраняется. storage-location сохраняется из-за исходной локальной работы; vps-self-hosting — из-за непроверенной серверной зависимости. Локальные пользовательские ветки и stash не удаляются.

## Проверки и блокеры

Fernet-причина Linux CI воспроизведена. Исправлена изоляция тестов, subprocess и E2E без изменения production-шифрования. Backend auth/transport/security/CI: 104 passed (включая 103 subtests); frontend auth 134 passed; settings 42 passed; TypeScript и build проходят. Полный backend ещё перепроверяется; существующий тест цены заказа ожидал 100 вместо фактической складской цены 0. Node suite: 60 passed, 9 failed (устаревший CRM loader и source assertions). Общий lint: 72 errors, 1 warning. Проверки не отключены; PR не готов к merge.

npm ci сообщил 10 audit vulnerabilities (3 moderate, 6 high, 1 critical); зависимости не обновлялись массово. Браузерная проверка требует фактического запуска, не заменяется build. Ручные бизнес-сценарии не считаются пройденными по результату auth-набора.

CI включает полный pytest, settings, общий lint, TypeScript, build, browser и Node checks. Предлагаемые обязательные checks main после подтверждения: critical-backend и auth; PR required, запрет force push/deletion, проверки без обхода и без обязательного второго человека. Текущей защиты нет; ничего не применено.

Внешние блокеры: production deployment Vercel при merge в main требует отдельной сверки/исключения; Sites v26 имеет source SHA вне GitHub-клона; VPS checkout и зависимости имени ветки не подтверждены. См. [контуры](deployment-source-of-truth.md). До разрешения блокеров не выполнять merge/выпуск/деплой; до подтверждения пользователя также не менять защиту, не публиковать архивные теги и не удалять ветки. Архивы — не релизы.
