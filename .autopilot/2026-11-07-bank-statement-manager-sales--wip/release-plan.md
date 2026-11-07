# Подготовка выпуска банковского импорта

Это план и проверенные исходные условия, не утверждение о merge/deploy.

- Цель: существующий VPS 91.227.68.176, SSH alias sm-techno-vps, только Compose project sm-techno-test, checkout `/srv/sm-techno-test/app`.
- Принятый checkout c61bffcea72e8de669fcdef7756cfd0fadf4193e, clean; backend/frontend healthy. Backend image `sha256:5ca222aa063b611d640e2f480d39e555c91f43afd7cb82f38bece7ccd514984d`, frontend image `sha256:278a5162b43832a3a2c80ee1e200e1fdbab00d32cb173d6795072c56e13ce817`. Backend source revision fed23f5c6539f36d7733298ce5fd12e07592296c имеет те же backend blobs, что c61 (diff по API/web/desktop/runtime/requirements/Dockerfile пуст).
- Состояние ресурсов до выпуска: 7 336 332 KiB свободно на `/srv`, 2270 MiB available RAM, 1935 MiB свободного swap. Data 3164 KiB, storage 5752 KiB. Эти наблюдения перепроверяются перед реальным обновлением.

## Резервная копия

Принятым кодом выполнены:

```
python3 -m scripts.vps_backup --root /srv/sm-techno-test --backups-dir /srv/sm-techno-test/backups --stored-storage-root /storage
python3 -m scripts.vps_restore --archive /srv/sm-techno-test/backups/sm-techno-20261107T150100896320Z.tar.gz --target-root /srv/sm-techno-test/backups/verify-bank-b85631a-20261107 --stored-storage-root /storage --verify-only
```

Обе команды завершились 0. Архив `/srv/sm-techno-test/backups/sm-techno-20261107T150100896320Z.tar.gz`, mode 600, 5 926 315 bytes, SHA256 `1c0294b2ddc0001515d904f9c14679e62886630af6c43e243a7556c4b7cc1e32`. Проверены безопасное извлечение/manifest/hash и пара БД/storage. Рабочая БД не восстанавливалась; после команд оба сервиса healthy. При паузе перед выпуском создаётся свежая копия той же проверенной процедурой.

## Обновление и восстановление

После отдельного разрешения merge: проверить PR/гейты, получить точный resulting main SHA, сравнить его дерево с проверенной PR head (правило владельца 2026-11-06). Использовать действующий runbook и прежние runtime mounts/env/converter sockets. Не менять DNS/Caddy/1С/чужие контейнеры/сети/тома. Доставлять и маркировать образы точным SHA из main, сохранять старые image IDs/Compose configuration для code-only recovery. После запуска проверить runtime source provenance, backend/frontend health и same-origin proxy, без записи тестовых финансов в рабочие данные.

Изолированный `rollback-probe.py` подтвердил accepted c61 API startup, auth, minimum mode, manual read/write/preview и неизменность закрытого snapshot после новой миграции; candidate затем повторно прочитал эти данные. Parent повторил probe: PASS, 7.32s, external network attempts 0. Доказательство code-only rollback действует только пока все 11 банковских/assignment таблиц пусты; их точный guard перечислен в probe. После сохранённого использования новой функции нужен roll-forward либо отдельное решение владельца. Старую БД поверх новых бизнес-записей автоматически не восстанавливать.

До merge/развёртывания текущий runtime остаётся принятым c61. Merge и deploy пока не выполнялись.
