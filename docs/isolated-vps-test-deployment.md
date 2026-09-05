# Isolated VPS test deployment

This deployment creates only the Docker Compose project `sm-techno-test`. It
does not connect to, inspect, or modify other Docker projects, Caddy, DNS, or
Sites. Frontend and backend listen only on VPS loopback ports 3000 and 8000.

## Prepare data locally

```powershell
.\.venv\Scripts\python.exe scripts\prepare_vps_transfer.py `
  --source-db stock_sync.db --source-storage storage `
  --target-db transfer\stock_sync.db --target-storage transfer\storage
```

The command uses a SQLite online backup, checks integrity, clears app sessions
and stored 1C passwords in the copy, and copies storage. Existing app accounts
and all business data remain. Do not transfer the source database directly.

## Deploy to VPS

1. Create `/srv/sm-techno-test/{app,data,storage,backups}` only.
2. Copy this branch's runtime files into `app`, then copy the prepared database
   to `data/stock_sync.db` and prepared storage to `storage`.
3. Create `/srv/sm-techno-test/app/.env` from `.env.example`, generate the
   Fernet value with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`, and set mode 600. Never commit or print it.
4. From `app`, run:

```bash
docker compose --project-name sm-techno-test --env-file .env up -d --build
docker compose --project-name sm-techno-test ps
curl --fail http://127.0.0.1:8000/api/health
```

## Access and acceptance

On the operator workstation, open an SSH tunnel:

```powershell
ssh -N -L 3000:127.0.0.1:3000 -L 8000:127.0.0.1:8000 -p 22 codex-deploy@91.227.68.176
```

Open `http://127.0.0.1:3000`, sign in with an existing app account, and
confirm transferred records. Re-enter 1C passwords when needed. Create only a
local test record, restart `sm-techno-test`, and verify it remains. For 1C,
perform only a read-only catalogue request.

## Backup and restore

On VPS, run the backup from the application checkout:

```bash
python3 scripts/vps_backup.py --root /srv/sm-techno-test --backups-dir /srv/sm-techno-test/backups
python3 scripts/vps_restore.py --archive /srv/sm-techno-test/backups/NAME.tar.gz --target-root /srv/sm-techno-restore-test
```

Restore requires an empty target root. Stop only `sm-techno-test` before a
restore into its live data root; do not run a restore against any other project.
