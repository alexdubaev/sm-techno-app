# Выпуск текущей задачи — разрешён владельцем в сессии

Разрешение: «все действия с апи и деплоем разрешаю делать без моего подтверждения в текущей сессии». Только существующий crm-cmteh.ru / VPS91.227.68.176 / Compose sm-techno-test. Не повторять прежний выпуск. Exact target SHA будет записан после verified PR merge.

## Read-only preflight 2026-11-01 около 21:34 Москва
- /srv/sm-techno-test/app чистый main на 5f73a355710140059aedf0c6296171bb05f1ee66.
- Frontend image sha256:228d872ea80bfb50a4f6877cb7ef2bd4ba6d9c062cb8435ca370fbbf9bcf8021, healthy.
- Backend image sha256:4726d4da9daa556229d174ad40560c7125aea949e1767233005d9af1b9a9a4d0, healthy.
- Converter service active, free disk8.6GiB. Backend started2026-11-01T08:32:06.761464685Z; этот выпуск меняет backend, его restart ожидаем.
- GitHub hooks пусты; main protection API возвращает Branch not protected. Это не снимает owner release checks. auth-tests.yml существующий push/PR CI, sign-stock-shortcut.yml manual only. Vercel git deploymentEnabled false в обеих конфигурациях. Новые CI/внешние publish не вводятся.

## Процедура после проверок и merge
1. Собрать exact main SHA из trusted git archive в отдельном stage20261101-admin-dashboard, tar --same-permissions. Использовать Docker cache без pruning старых образов/backup. Labels revision exact SHA, сохранить immutable image IDs.
2. Проверить candidate backend/frontend на синтетическом хранилище и отдельной сети/loopback портах; без рабочей .env, DeepSeek key или 1С. Подтвердить migration/auth/API и health.
3. Проверить code rollback: прежний backend4726 может работать с аддитивно обновлённой тестовой БД, данные/устройства не теряются. Существующие minimum условия поддерживаются этим образом. Сохранить rollback.yaml с обоими текущими образами, не старой версией frontend1b39.
4. Перед switch свежий backup через текущие scripts/vps_backup.py --stored-storage-root /storage; verify-only и restore в уникальный пустой stage каталог. Реальную БД/storage не заменять; повторная проверка free disk/actual source/health.
5. Fast-forward app checkout на exact target, Compose с существующей document-runtime overlay и release.yaml; --no-build --pull never, только backend/frontend этого проекта. Сохранить provider/model/key из существующей .env, никакого нового привилегированного аккаунта. Converter/DNS/Caddy/прочие контейнеры не менять.
6. Health, strict public HTTPS auth-proxy smoke, anonymous admin endpoints denied, static dashboard artifact доставлен. Runtime numeric migration verified safely без печати бизнес-данных/ключей. Отдельная проверка баланса допустима server-side read-only с существующим key, без платной генерации и без сохранения его значения в логах. Live model canary этой задачей не требуется.
7. Failure after switch: вернуть оба прежних image IDs, текущую БД/storage сохранить. Не reset Git; честно записать source/image mismatch при аварии и расследовать. Не продолжать при несовместимости или недоказанном rollback.

## Время
Сохранить full wall interval с нижней границей начала AP21:11:05 (первый запрос/инструмент был раньше), отдельно ожидание ответов, working-ready, cleanup/report tail; server operation отдельно. Не выдавать server switch time за всю разработку.
