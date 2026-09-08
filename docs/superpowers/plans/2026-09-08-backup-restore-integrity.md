# Backup and Restore Integrity Implementation Plan

**Goal:** Make VPS SQLite-and-storage backups restorable only as a verified, self-consistent pair, without exposing partially created production data.

**Scope:** `scripts/vps_backup.py`, `scripts/vps_restore.py`, and focused tests under `tests/`. The existing desktop single-DB PowerShell transfer scripts are outside this VPS archive workflow.

## Design decisions

- A backup is a `.tar.gz` containing `stock_sync.db`, `storage/`, and `manifest.json`. The manifest has a schema version, UTC creation time, SQLite filename, and SHA-256 checksums for every regular archived file.
- SQLite is copied with SQLite's online backup API. Storage is copied into a temporary snapshot before checksums and archive creation. A process-level lock file in the selected root prevents two backup/restore operations from overlapping; the database snapshot and storage copy are taken while that lock is held.
- Restore never extracts into the target. It first validates member paths/types, manifest schema, exact member set, checksums, `PRAGMA integrity_check`, foreign-key integrity, and that every `commercial_offers`/`documents` file reference remains inside `storage/` and exists.
- `--verify-only` performs those validations without writing the target. A normal restore materializes a sibling staging root, validates it again, then atomically renames it only into an empty target. Existing target data or storage is never overwritten.
- The validator must tolerate database schemas that do not yet contain optional document tables, but must reject malformed referenced paths whenever the corresponding table is present.

## Tasks

### 1. Red tests for a durable archive contract

- Create a temporary valid SQLite database plus storage fixtures.
- Assert generated archives contain a manifest and matching hashes.
- Assert verify-only detects a corrupted payload, unsafe tar paths, SQLite corruption, missing document/offer referenced files, and FK violations without creating a target.
- Assert restore stages first and leaves an existing target unchanged on every failure.

### 2. Implement backup snapshot and manifest

- Add a narrow root-operation lock/context manager.
- Use SQLite backup API and a temporary storage copy; reject symlinks and files escaping the root.
- Build deterministic manifest entries and write the archive only after all content is hashed.

### 3. Implement staged validation and restore

- Safely extract to a temporary directory, validate manifest/checksums and database/reference integrity, and support `--verify-only`.
- Move validated staged `data/stock_sync.db` and `storage/` into a new staging root and atomically rename it to an empty target.
- Keep failed archive/staging data isolated and clean it up.

### 4. Verify

- Run the focused backup/restore tests, `tests/test_vps_runtime.py`, `python -m compileall scripts`, and `git diff --check`.
- Perform an independent review before treating ТЗ 18 as complete.
