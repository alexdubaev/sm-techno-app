<!-- autopilot:progress -->
# СМ ТЕХНО — серверный выпуск завершён 2026-11-01

Развёрнут main00d61528f0c26df56e1f75de28b0d1ace8ebf78a (PR13) на /srv/sm-techno-test/app, project sm-techno-test. Backend37a83f27…/frontend4dc605fe… healthy, own converter broker active. Активный провайдер DeepSeek Flash(deepseek-flash), ключ только в protected server.env. Результат: `.autopilot/2026-10-30-server-document-deployment/acceptance-report.md`.

## Договорились — не пересматривать

- Артикулы загружаются в Остатках; результат временная расценка/Excel, без клиента, КП и сохранённой подборки. Резервы не учитываются.
- КП остаётся отдельным сохраняемым клиентским процессом; КП без клиента отменено владельцем.
- Договоры/спецификации в Документах после файла и review менеджером, доступны в полной CRM-карточке. Входной счёт DOCX; условия менеджер заполняет в Word.
- У клиента один договор с версиями; новый клиент после подтверждения идёт через прежний путь1С. Наименование документов=document_name/full_name.
- Владелец разрешил deploy, заменил API-ключ и подтвердил Flash. Не просить ключи в чат. Прямое переключение конфигурации, никакого автоматического fallback.
- Старая подготовка C:/Users/Alexandr/.codex/worktrees/server-release-20261030/sm-techno-app и исходная private feature сохранены. Bundle private history не публиковать.

## Recovery и проверки

- FINAL quiesced backup20261101T060408197811Z, SHAa859e168d6a8a17dd64f6fc5acd5eaaeb743c48898d4805bea5c786f9b8bf42d, verify+emptyrestorePASS. Старые source/images/config сохранены; code-only rollback на текущих данных проверен, старую DB поверх новых записей не восстанавливать.
- Stop→verified-ready26.685s. Реальная модель проверена5syntheticcalls и Word; manager дополнял missing legal/signer/currency поля. Linux42/local35/CRM8/managerbrowser1PASS; live broker10014B и same-originhealth/authPASS. Подробности и исторические неуспешные проверки в отчёте, не подменять их одним allgreen прогоном.
- Рабочие DB/storage/1С не использовались для тестовых записей, настройки1С,DNS/Caddy/чужие ресурсы не менялись. Финальные imageIDs, sourceSHA и rollback overrides на сервере в releases/20261030-document-workflows.

## Не вошло и ограничения

- G01 — необязательная очистка служебного файла после редкого отказа удаления отложена владельцем.
- Codex runtime сохранён как опция; прежний OpenAI403 на VPS egress не устранён, активному DeepSeek не мешает. Системный DNS вне HTTP socket watchdog.
- Прежние dev-only npm advisories и наблюдение React duplicate job keys остаются отдельным обслуживанием, подтверждённого нового сбоя нет.

## Правки без автопилота

—
