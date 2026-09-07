# Глобальный архив клиентов 1С в CRM — handoff (2026-09-07)

## Состояние

- Worktree: `D:/codex/sm-techno-app/worktrees/vps-self-hosting`.
- Ветка: `codex/vps-self-hosting`, опубликована на GitHub до `78a3c29`.
- VPS checkout: `/srv/sm-techno-test/app`, также на `78a3c29`.
- Публичный CRM: `https://crm-cmteh.ru`.
- Деплой выполнен после этой работы: backend и frontend пересобраны и пересозданы с Compose-проектом `sm-techno-test`.
- На момент handoff оба контейнера healthy; внутренний `http://127.0.0.1:3000/api/health` и публичный `https://crm-cmteh.ru/api/health` вернули `{"status":"ok"}`.

## Реализовано

Глобальный CRM-архив для связанных клиентов 1С:

- В `crm_clients` добавлены локальные, не управляемые 1С поля `crm_archived_at`, `crm_archived_by_user_id`, `crm_archive_reason`.
- Синхронизация 1С не очищает метаданные архива.
- Только `admin` может архивировать, восстанавливать, видеть архив и открывать архивную карточку.
- Доступны `POST /api/crm/clients/{id}/primary-archive`, `POST /api/crm/clients/{id}/primary-restore`, `GET /api/crm/primary-archive`.
- Активные primary/personal списки, work owners, reminders, due reminders и Excel export исключают архивные записи.
- Excel import распознаёт архивного клиента, не восстанавливает и не изменяет его, сообщает: «Клиент находится в архиве — импорт пропущен».
- Assignments, контакты, события, reminders, цвета, ручной порядок и row preferences не удаляются. После restore клиент возвращается в прежние рабочие окна.
- Audit использует `archive_primary_client` и `restore_primary_client`; интерфейсные подписи: «Клиент архивирован из CRM», «Клиент восстановлен в CRM».
- В «Клиенты 1С» admin видит системный переключатель «Активные | Архив» с количеством; desktop показывает таблицу, mobile — карточки. Архивная детальная карточка read-only, основное действие — восстановление.

Ключевые коммиты: `4ef1093`, `441c060`, `4cb2dc2`, `9f1ddba`, `d35c88e`, `ee3f1fa`, `78a3c29`.

## Проверки

- Адресные backend-тесты архива, sync, export/import и reminders проходили при реализации.
- Frontend CRM-тесты: 89/89; полный frontend suite: 127/127; TypeScript и production build проходили.
- Перед деплоем production build локально прошёл.
- На VPS после фактического пересоздания контейнеров подтверждены оба health endpoint.

Известные старые проблемы полной backend CRM-проверки, не относящиеся к архиву:

1. Тест создания лида ожидает Telegram, но получает пустое значение.
2. Старый тест напоминания передаёт timezone-naive дату и теперь получает `400`, а не `201`.

## Важно сохранить

Рабочее дерево сейчас содержит сторонние незакоммиченные изменения; не удалять и не сбрасывать их. В частности: `.dockerignore`, `docs/isolated-vps-test-deployment.md`, `requirements-dev.txt`, `sm-techno-web/lib/api.ts`, `sm-techno-web/next-env.d.ts`, `stock_sync_web/database.py`, `stock_sync_web/service.py`, несколько тестов и прежние handoff/plan документы.

Не использовать `git clean`, `git reset --hard` или массовое восстановление файлов в этом worktree.

## Если продолжать

1. Сначала выполнить `git status --short` и отделить новые изменения от перечисленных сторонних.
2. Для CRM-изменений запускать адресные `.venv` backend-тесты и frontend CRM tests; учитывать две известные baseline ошибки выше.
3. При изменении backend заново собирать и перезапускать оба VPS-сервиса явно: `docker compose -p sm-techno-test build backend frontend` затем `docker compose -p sm-techno-test up -d --force-recreate backend frontend`.
4. После деплоя всегда проверять `docker compose -p sm-techno-test ps`, внутренний health и публичный health.
