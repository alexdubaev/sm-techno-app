# Локальный SSH-доступ к VPS

## Проверенная настройка

Для текущего пользователя Windows установлен SSH config `C:\Users\Alexandr\.ssh\sm-techno-app.conf`, alias `sm-techno-vps`. Он подключается к `91.227.68.176` как `codex-deploy` по порту 22, используя отдельную identity из `C:\Users\Alexandr\.ssh\sm-techno-app\deploy_ed25519`. SSH config требует identity-only, batch mode и строгую проверку host key.

Подключение из PowerShell:

```powershell
ssh -F "$env:USERPROFILE\.ssh\sm-techno-app.conf" sm-techno-vps
```

Проверка read-only входа успешна по состоянию на 2026-10-27. Все агенты на этой Windows-машине под тем же пользователем могут использовать существующие настройки. На других машинах каждый оператор должен получить собственный отдельно разрешённый доступ. Не копировать ключи в репозиторий, Git, архивы проекта или другим пользователям.

## Границы доступа и данных

Известный текущий контур — `/srv/sm-techno-test`, Compose project `sm-techno-test`; checkout расположен в `/srv/sm-techno-test/app`. База SQLite находится в `/srv/sm-techno-test/data/stock_sync.db`, файлы — в `/srv/sm-techno-test/storage`, runtime credentials — в `/srv/sm-techno-test/app/.env`. Не раскрывать и не коммитить содержимое `.env` или ключей.

Наличие доступа не разрешает менять SSH-аутентификацию, DNS, proxy/Caddy, другие проекты, контейнеры, сети, тома, рабочую базу или storage. Перед каждым выпуском заново проверять серверный SHA и health. Backup и deployment выполняются отдельно по согласованной процедуре; это описание доступа не подтверждает их выполнение.

## Проверка backup для отдельного `/storage`

В текущем Compose storage смонтирован отдельно в `/storage`, и база может содержать такие абсолютные пути. При проверке backup и restore указывайте этот префикс явно; содержимое базы и сохранённые в ней пути не переписываются:

```sh
python scripts/vps_backup.py --root /srv/sm-techno-test --backups-dir /srv/sm-techno-test/backups --stored-storage-root /storage
python scripts/vps_restore.py --archive /path/to/backup.tar.gz --target-root /srv/sm-techno-restore --stored-storage-root /storage --verify-only
python scripts/vps_restore.py --archive /path/to/backup.tar.gz --target-root /srv/sm-techno-restore --stored-storage-root /storage
```

Флаг принимает только явно заданный нормализованный POSIX-префикс, например `/storage`; без него проверка сохраняет прежнее требование относительных путей. Абсолютные ссылки под указанным префиксом проверяются на соответствие включённому storage, существование обычного файла и отсутствие обхода или symlink.

## Совместимость при откате менеджерского начисления

После включения гарантированной минимальной зарплаты старый backend нельзя запускать поверх записанных условий `manager_periods.mode='minimum'`: он не знает этот режим и рассчитает начисление неверно. Перед любым переходом на старый код проверьте фактическую базу запросом `SELECT DISTINCT mode FROM manager_periods WHERE mode NOT IN ('plan','always');`. Если запрос вернул `minimum` или любое другое неподдерживаемое значение, не выполняйте downgrade и не переписывайте условия автоматически. Продолжайте откат только до появления таких записей и после проверки совместимости фактических данных; иначе используйте исправленный roll-forward либо запросите у владельца отдельное решение по восстановлению. Не восстанавливайте старую копию базы поверх новых рабочих записей.
