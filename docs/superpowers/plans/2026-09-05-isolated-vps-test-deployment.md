# Isolated VPS Test Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a safe, data-bearing SM Techno test instance on the VPS as an isolated Docker Compose project, without Sites, DNS, Caddy, or dependencies on pre-existing VPS containers.

**Architecture:** Backend and frontend have separate production images and a private Compose network. Only loopback host ports expose the two services, so the operator accesses them through SSH forwarding. SQLite and generated files live in `/srv/sm-techno-test`, are populated by a sanitised online-copy utility, and are never built into images.

**Tech Stack:** Python 3.12, FastAPI/Uvicorn, SQLite, `cryptography` Fernet, Next.js 16 standalone, Node 22, Docker Compose v2.

**Spec:** `docs/superpowers/specs/2026-09-05-vps-self-hosting-design.md`

## Global Constraints

- Work only on `codex/vps-self-hosting`; preserve Sites and the existing Windows workflow.
- The Compose project is named `sm-techno-test`, has no external network, and contains no name or configuration belonging to other VPS projects.
- Bind frontend to `127.0.0.1:3000` and backend to `127.0.0.1:8000`; do not occupy public ports.
- Persist only under `/srv/sm-techno-test/{data,storage,backups}` on VPS.
- Use exactly one Uvicorn worker for SQLite.
- Keep `dpapi:` behaviour on Windows. On non-Windows, only `fernet:` credentials encrypted by `SM_TECHNO_CREDENTIAL_KEY` are valid for new writes.
- Transfer a copied database and storage; clear `app_sessions` and `users.onec_password` only in the copy.
- Never commit `.env`, Fernet keys, private keys, SQLite files, storage, or backup archives.
- VPS 1C validation is read-only: do not create orders or counterparties.

---

## File structure

- `stock_sync_desktop/database.py` — resolve the default SQLite path from `SM_TECHNO_DB_PATH` while retaining the repository database default.
- `stock_sync_web/service.py` — resolve the generated-file root from `SM_TECHNO_STORAGE_ROOT` and construct the default service from explicit DB/storage settings.
- `stock_sync_web/database.py` — platform-aware DPAPI/Fernet credential codec.
- `scripts/prepare_vps_transfer.py` — online SQLite copy, integrity validation, credential/session sanitisation, and storage copy CLI.
- `tests/test_vps_runtime.py` — path resolution, Fernet and migration-copy unit tests.
- `requirements.txt` — runtime dependencies usable in a Linux image.
- `sm-techno-web/package.json`, `package-lock.json`, `next.config.ts`, `postcss.config.mjs` — standard Node Next runtime and standalone build.
- `sm-techno-web/tests/node-api-proxy.test.mjs` — same-origin proxy and Node-runtime regression checks.
- `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `.dockerignore`, `.env.example` — isolated image and Compose definition.
- `scripts/vps_backup.py`, `scripts/vps_restore.py`, `docs/isolated-vps-test-deployment.md` — operator-only backup/restore and deployment runbook.

### Task 1: Make paths portable and protect Linux 1C credentials

**Files:**
- Modify: `stock_sync_desktop/database.py:1-12`
- Modify: `stock_sync_web/service.py:1-55, 2029-2041`
- Modify: `stock_sync_web/database.py:1-18, 328-376`
- Modify: `requirements.txt`
- Create: `tests/test_vps_runtime.py`

**Interfaces:**
- Produces `resolve_db_path() -> Path`, `resolve_storage_root() -> Path` and `create_default_service() -> WebStockSyncService` that honour `SM_TECHNO_DB_PATH` and `SM_TECHNO_STORAGE_ROOT`.
- Produces `_protect_onec_password(value: str) -> str` and `_unprotect_onec_password(value: str | None) -> str` supporting `dpapi:` and `fernet:`.
- Consumes `SM_TECHNO_CREDENTIAL_KEY`, a URL-safe base64 Fernet key, only on non-Windows.

- [ ] **Step 1: Write failing path and encryption tests**

```python
def test_explicit_db_and_storage_variables_override_legacy_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("SM_TECHNO_DB_PATH", str(tmp_path / "data" / "stock_sync.db"))
    monkeypatch.setenv("SM_TECHNO_STORAGE_ROOT", str(tmp_path / "storage"))
    service = create_default_service()
    assert service.db.db_path == tmp_path / "data" / "stock_sync.db"
    assert service.document_storage_dir == tmp_path / "storage" / "documents"

def test_linux_stores_fernet_never_plaintext(monkeypatch):
    monkeypatch.setattr(database.os, "name", "posix")
    monkeypatch.setenv("SM_TECHNO_CREDENTIAL_KEY", Fernet.generate_key().decode())
    stored = database._protect_onec_password("onec-secret")
    assert stored.startswith("fernet:") and stored != "onec-secret"
    assert database._unprotect_onec_password(stored) == "onec-secret"
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py -v`

Expected: failure because the resolver and Fernet path do not exist.

- [ ] **Step 3: Implement explicit resolution and the codec**

```python
def resolve_db_path() -> Path:
    configured = os.environ.get("SM_TECHNO_DB_PATH", "").strip()
    return Path(configured).expanduser().resolve() if configured else LEGACY_DB_PATH

def _fernet() -> Fernet:
    key = os.environ.get("SM_TECHNO_CREDENTIAL_KEY", "").strip()
    if not key:
        raise RuntimeError("SM_TECHNO_CREDENTIAL_KEY is required to store 1C passwords on Linux.")
    return Fernet(key.encode("ascii"))
```

Use `resolve_storage_root() / "commercial_offers"` and `/ "documents"` in `create_default_service`; retain `SM_TECHNO_DATA_DIR` as a compatibility fallback only when the new explicit variables are absent. Add `cryptography>=43,<46` and remove the unused invalid `httpx2` requirement.

- [ ] **Step 4: Add negative and regression cases**

Add tests that missing/invalid Linux keys raise `RuntimeError`, stored `dpapi:` values raise on Linux rather than becoming plaintext, and Windows continues to emit `dpapi:`. Update `tests/test_security_hardening.py` to select `dpapi:` only under Windows and `fernet:` under Linux.

- [ ] **Step 5: Run the backend security test set**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py tests/test_security_hardening.py tests/auth/test_service_factory.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the self-contained change**

```powershell
git add stock_sync_desktop/database.py stock_sync_web/database.py stock_sync_web/service.py requirements.txt tests/test_vps_runtime.py tests/test_security_hardening.py
git commit -m "feat: support portable VPS data and credentials"
```

### Task 2: Create a verified sanitised transfer utility

**Files:**
- Create: `scripts/prepare_vps_transfer.py`
- Modify: `tests/test_vps_runtime.py`

**Interfaces:**
- Produces `prepare_transfer(source_db: Path, source_storage: Path, target_db: Path, target_storage: Path) -> None`.
- The function opens `source_db` through `file:...?...mode=ro`, uses `sqlite3.Connection.backup`, requires `PRAGMA integrity_check` to equal `ok`, deletes sessions, nulls 1C passwords, and copies storage without modifying sources.

- [ ] **Step 1: Write a failing transfer test**

```python
def test_prepare_transfer_copies_business_data_and_sanitises_sensitive_rows(tmp_path):
    source = tmp_path / "source.db"
    create_fixture_database(source, user_password="dpapi:old", active_session=True)
    (tmp_path / "source-storage" / "documents").mkdir(parents=True)
    (tmp_path / "source-storage" / "documents" / "offer.docx").write_bytes(b"copy-me")
    prepare_transfer(source, tmp_path / "source-storage", tmp_path / "out.db", tmp_path / "out-storage")
    assert query(tmp_path / "out.db", "SELECT onec_password FROM users") == [(None,)]
    assert query(tmp_path / "out.db", "SELECT COUNT(*) FROM app_sessions") == [(0,)]
    assert (tmp_path / "out-storage" / "documents" / "offer.docx").read_bytes() == b"copy-me"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py -k transfer -v`

Expected: FAIL because the import and utility are absent.

- [ ] **Step 3: Implement copy-before-sanitise**

```python
with sqlite3.connect(f"file:{source_db.as_posix()}?mode=ro", uri=True) as source_conn:
    with sqlite3.connect(target_db) as target_conn:
        source_conn.backup(target_conn)
        assert target_conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        target_conn.execute("DELETE FROM app_sessions")
        target_conn.execute("UPDATE users SET onec_password = NULL")
        target_conn.commit()
shutil.copytree(source_storage, target_storage, dirs_exist_ok=False)
```

Create parent directories, refuse an existing target unless `--replace` is explicitly passed, and fail before copying storage when integrity fails. CLI arguments are `--source-db`, `--source-storage`, `--target-db`, `--target-storage`, and optional `--replace`.

- [ ] **Step 4: Add safety tests**

Test a corrupt source produces an error without storage copy; an existing target is refused; source rows and source storage remain unchanged after success.

- [ ] **Step 5: Run focused tests and commit**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py -v`

```powershell
git add scripts/prepare_vps_transfer.py tests/test_vps_runtime.py
git commit -m "feat: add sanitised VPS transfer utility"
```

### Task 3: Replace the Sites runtime with standard Next.js

**Files:**
- Modify: `sm-techno-web/package.json`, `sm-techno-web/package-lock.json`, `sm-techno-web/next.config.ts`
- Create: `sm-techno-web/postcss.config.mjs`
- Delete: `sm-techno-web/vite.config.ts`
- Rename: `sm-techno-web/tests/sites-api-proxy.test.mjs` to `sm-techno-web/tests/node-api-proxy.test.mjs`
- Modify: `sm-techno-web/tests/node-api-proxy.test.mjs`

**Interfaces:**
- Produces `npm run build` using `next build`, `npm run start` using `next start`, and a standalone `.next/standalone/server.js`.
- Keeps `BACKEND_API_BASE_URL` only server-side in `app/api/[...path]/route.ts`; browser calls remain relative `/api/*`.

- [ ] **Step 1: Write Node runtime assertions first**

```javascript
test("Node build is configured for standalone output", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(config, /output:\s*["']standalone["']/);
  assert.equal(manifest.scripts.build, "next build");
  assert.equal(manifest.scripts.start, "next start");
});
```

- [ ] **Step 2: Run the Node test to verify failure**

Run: `npm --prefix sm-techno-web exec -- node --test tests/node-api-proxy.test.mjs`

Expected: FAIL because current scripts invoke Vinext/Wrangler and standalone output is absent.

- [ ] **Step 3: Implement the Node runtime migration**

Set `output: "standalone"` in `next.config.ts`; create `postcss.config.mjs` with `"@tailwindcss/postcss": {}`. Change scripts to `next dev`, `next build`, and `next start`. Remove only Sites, Cloudflare, Vinext, Vite, Wrangler and their plugins from `package.json`, retain Vitest because auth tests use it, then regenerate the lockfile with `npm install --package-lock-only`.

- [ ] **Step 4: Verify API contract and production build**

Run: `npm --prefix sm-techno-web exec -- node --test tests/node-api-proxy.test.mjs tests/public-api-base-url.test.mjs`

Run: `npm --prefix sm-techno-web run build`

Expected: both commands PASS and `.next/standalone/server.js` exists.

- [ ] **Step 5: Commit**

```powershell
git add sm-techno-web
git commit -m "feat: run frontend on standard Next.js"
```

### Task 4: Add isolated Docker images and operational scripts

**Files:**
- Create: `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `.dockerignore`, `.env.example`
- Create: `scripts/vps_backup.py`, `scripts/vps_restore.py`
- Create: `docs/isolated-vps-test-deployment.md`
- Modify: `.gitignore`

**Interfaces:**
- `docker compose --project-name sm-techno-test --env-file .env up -d --build` creates exactly two services on an internal `sm-techno-test` network.
- `.env` provides `SM_TECHNO_DB_PATH=/srv/sm-techno-test/data/stock_sync.db`, `SM_TECHNO_STORAGE_ROOT=/srv/sm-techno-test/storage`, `SM_TECHNO_CREDENTIAL_KEY`, `SM_TECHNO_INITIAL_ADMIN_PASSWORD`, and `BACKEND_API_BASE_URL=http://backend:8000`.

- [ ] **Step 1: Write Compose/configuration tests**

```python
def test_compose_isolated_services_and_loopback_only():
    compose = Path("docker-compose.yml").read_text(encoding="utf-8")
    assert "backend:" in compose and "frontend:" in compose
    assert '"127.0.0.1:8000:8000"' in compose
    assert '"127.0.0.1:3000:3000"' in compose
    assert "external:" not in compose
```

Add this test to `tests/test_vps_runtime.py`; assert `.env.example` contains names but no values and `.gitignore` excludes `.env`, `*.db`, `storage/`, and `backups/`.

- [ ] **Step 2: Run the test and confirm failure**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py -k compose -v`

Expected: FAIL because Compose and environment files do not exist.

- [ ] **Step 3: Implement images and Compose**

Backend image: Python 3.12 slim, install `requirements.txt`, copy only runtime source plus `assets/templates`, run `uvicorn stock_sync_api:app --host 0.0.0.0 --port 8000 --workers 1`. Its healthcheck uses `python -c` with `urllib.request.urlopen("http://127.0.0.1:8000/api/health")`, so it does not depend on curl in the slim image. Frontend image: Node 22 build stage, copy standalone output/static/public into a Node 22 runtime stage and run `node server.js` with `HOSTNAME=0.0.0.0` and `PORT=3000`. Compose must use `restart: unless-stopped`, bind only loopback ports, mount only `/srv/sm-techno-test/data` and `/srv/sm-techno-test/storage` into backend, configure `depends_on` with backend health, and give frontend the same `python`-free Node healthcheck through `node -e` fetching `http://127.0.0.1:3000/api/health` (the route is proxied by Next).

`vps_backup.py` must use SQLite backup then create a timestamped `.tar.gz` containing the copied database and storage. `vps_restore.py` must require an explicit `--archive` and `--target-root`, stop with a non-zero status if the archive lacks `stock_sync.db`, and restore only below target root. The runbook documents commands, SSH port forwarding, health/login/restart/backup tests, and read-only 1C check.

- [ ] **Step 4: Run static and image verification**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_vps_runtime.py -v`

Run: `docker compose --project-name sm-techno-test --env-file .env.example config`

Run: `docker compose --project-name sm-techno-test --env-file .env.example build`

Expected: tests and Compose validation pass; image build succeeds after supplying throwaway, valid local secret values through environment variables instead of editing `.env.example`.

- [ ] **Step 5: Commit**

```powershell
git add Dockerfile.backend Dockerfile.frontend docker-compose.yml .dockerignore .env.example .gitignore scripts/vps_backup.py scripts/vps_restore.py docs/isolated-vps-test-deployment.md tests/test_vps_runtime.py
git commit -m "feat: add isolated Docker VPS deployment"
```

### Task 5: Verify locally and deploy the isolated VPS test stack

**Files:**
- Modify: `docs/isolated-vps-test-deployment.md` only if commands need correction after evidence.

**Interfaces:**
- Consumes an operator-created server-only `/srv/sm-techno-test/.env` and sanitized transfer files.
- Produces a running `sm-techno-test` project accessible only through SSH forwarding.

- [ ] **Step 1: Run full local verification**

Run: `./.venv/Scripts/python.exe -m pytest`

Run: `npm --prefix sm-techno-web run test:auth`

Run: `npm --prefix sm-techno-web run build`

Run: `docker compose --project-name sm-techno-test config`

Expected: all pass before copying anything to VPS.

- [ ] **Step 2: Generate a sanitized transfer copy locally**

Run: `./.venv/Scripts/python.exe scripts/prepare_vps_transfer.py --source-db stock_sync.db --source-storage storage --target-db transfer/stock_sync.db --target-storage transfer/storage`

Expected: output reports integrity `ok`, sessions cleared, 1C passwords cleared, and copied storage. Inspect only metadata/counts; do not print database credentials.

- [ ] **Step 3: Provision the isolated server directory and secret environment**

Use SSH to create only `/srv/sm-techno-test/{app,data,storage,backups}` and copy application artifacts plus `transfer/stock_sync.db`/`transfer/storage`. Generate Fernet key on VPS with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`; write it and the initial-admin password into mode-600 `/srv/sm-techno-test/.env`. Do not print the file or commit it.

- [ ] **Step 4: Start and inspect only the new project**

Run on VPS from `/srv/sm-techno-test/app`: `docker compose --project-name sm-techno-test --env-file /srv/sm-techno-test/.env up -d --build`

Run: `docker compose --project-name sm-techno-test ps` and `curl --fail http://127.0.0.1:8000/api/health`.

Expected: only `sm-techno-test` frontend/backend are created; backend returns `{"status":"ok"}`.

- [ ] **Step 5: Validate via SSH tunnel and acceptance checks**

Open `ssh -N -L 3000:127.0.0.1:3000 -L 8000:127.0.0.1:8000 ...` and use `http://127.0.0.1:3000`. Log in with an existing account, check transferred data, create only a local test record, restart `sm-techno-test`, then verify persistence. Execute runbook backup and restore against a separate test root. Perform a read-only 1C catalog request only; do not invoke order/client creation endpoints.

- [ ] **Step 6: Record deployment evidence and commit documentation correction only if needed**

Record command outcomes, image IDs, health result, and test time in the handoff/runbook without secrets. If the runbook changed, commit it separately with `git commit -m "docs: record isolated VPS verification"`.
