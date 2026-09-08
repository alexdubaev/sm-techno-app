from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import tarfile
import threading
from contextlib import contextmanager
from pathlib import Path

import pytest

from scripts import vps_backup
from scripts.vps_backup import create_backup
from scripts.vps_restore import restore_backup
import stock_sync_web.service as service_module
import stock_sync_web.commercial_offers as commercial_offers_module
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService
from stock_sync_web.vps_integrity import storage_operation_lock


def _make_root(tmp_path: Path, *, include_references: bool = True) -> Path:
    root = tmp_path / "source"
    data = root / "data"
    storage = root / "storage"
    data.mkdir(parents=True)
    (storage / "commercial_offers").mkdir(parents=True)
    (storage / "documents").mkdir()
    (storage / "commercial_offers" / "offer.xlsx").write_bytes(b"offer")
    (storage / "documents" / "contract.docx").write_bytes(b"contract")
    with sqlite3.connect(data / "stock_sync.db") as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE parent (id INTEGER PRIMARY KEY);
            CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
            INSERT INTO parent VALUES (1);
            INSERT INTO child VALUES (1, 1);
            CREATE TABLE commercial_offers (id INTEGER PRIMARY KEY, output_path TEXT NOT NULL);
            CREATE TABLE documents (id INTEGER PRIMARY KEY, output_path TEXT NOT NULL);
            """
        )
        if include_references:
            conn.execute("INSERT INTO commercial_offers VALUES (1, ?)", ("storage/commercial_offers/offer.xlsx",))
            conn.execute("INSERT INTO documents VALUES (1, ?)", ("storage/documents/contract.docx",))
    return root


def _rewrite_archive_member(archive: Path, changed_name: str, payload: bytes) -> None:
    replacement = archive.with_suffix(".replacement.tar.gz")
    with tarfile.open(archive, "r:gz") as source, tarfile.open(replacement, "w:gz") as destination:
        for member in source.getmembers():
            if not member.isfile():
                destination.addfile(member)
                continue
            content = payload if member.name == changed_name else source.extractfile(member).read()
            member.size = len(content)
            destination.addfile(member, io.BytesIO(content))
    replacement.replace(archive)


def _append_unsafe_member(archive: Path) -> None:
    replacement = archive.with_suffix(".unsafe.tar.gz")
    with tarfile.open(archive, "r:gz") as source, tarfile.open(replacement, "w:gz") as destination:
        for member in source.getmembers():
            if member.isfile():
                destination.addfile(member, source.extractfile(member))
            else:
                destination.addfile(member)
        unsafe = tarfile.TarInfo("../outside.txt")
        unsafe.size = 7
        destination.addfile(unsafe, io.BytesIO(b"outside"))
    replacement.replace(archive)


def _append_symlink_member(archive: Path) -> None:
    replacement = archive.with_suffix(".symlink.tar.gz")
    with tarfile.open(archive, "r:gz") as source, tarfile.open(replacement, "w:gz") as destination:
        for member in source.getmembers():
            if member.isfile():
                destination.addfile(member, source.extractfile(member))
            else:
                destination.addfile(member)
        link = tarfile.TarInfo("storage/documents/link.docx")
        link.type = tarfile.SYMTYPE
        link.linkname = "../../outside.docx"
        destination.addfile(link)
    replacement.replace(archive)


def _append_windows_path_member(archive: Path, member_name: str) -> None:
    replacement = archive.with_suffix(".windows-path.tar.gz")
    with tarfile.open(archive, "r:gz") as source, tarfile.open(replacement, "w:gz") as destination:
        for member in source.getmembers():
            if member.isfile():
                destination.addfile(member, source.extractfile(member))
            else:
                destination.addfile(member)
        unsafe = tarfile.TarInfo(member_name)
        unsafe.size = 4
        destination.addfile(unsafe, io.BytesIO(b"evil"))
    replacement.replace(archive)


def _replace_database_and_update_manifest(archive: Path) -> None:
    replacement = archive.with_suffix(".bad-db.tar.gz")
    with tarfile.open(archive, "r:gz") as source:
        payloads = {
            member.name: source.extractfile(member).read()
            for member in source.getmembers()
            if member.isfile()
        }
        manifest = json.loads(payloads["manifest.json"])
        payloads["stock_sync.db"] = b"this is not sqlite"
        manifest["files"]["stock_sync.db"] = hashlib.sha256(payloads["stock_sync.db"]).hexdigest()
        payloads["manifest.json"] = json.dumps(manifest, sort_keys=True).encode("utf-8")
        with tarfile.open(replacement, "w:gz") as destination:
            for member in source.getmembers():
                if member.isfile():
                    content = payloads[member.name]
                    member.size = len(content)
                    destination.addfile(member, io.BytesIO(content))
                else:
                    destination.addfile(member)
    replacement.replace(archive)


def _remove_archive_member_and_update_manifest(archive: Path, removed_name: str) -> None:
    replacement = archive.with_suffix(".missing-file.tar.gz")
    with tarfile.open(archive, "r:gz") as source:
        payloads = {
            member.name: source.extractfile(member).read()
            for member in source.getmembers()
            if member.isfile()
        }
        manifest = json.loads(payloads["manifest.json"])
        del payloads[removed_name]
        del manifest["files"][removed_name]
        payloads["manifest.json"] = json.dumps(manifest, sort_keys=True).encode("utf-8")
        with tarfile.open(replacement, "w:gz") as destination:
            for member in source.getmembers():
                if member.name == removed_name:
                    continue
                if member.isfile():
                    content = payloads[member.name]
                    member.size = len(content)
                    destination.addfile(member, io.BytesIO(content))
                else:
                    destination.addfile(member)
    replacement.replace(archive)


def _append_internal_member_and_update_manifest(archive: Path, member_name: str) -> None:
    replacement = archive.with_suffix(".internal.tar.gz")
    with tarfile.open(archive, "r:gz") as source:
        payloads = {
            member.name: source.extractfile(member).read()
            for member in source.getmembers()
            if member.isfile()
        }
        manifest = json.loads(payloads["manifest.json"])
        payloads[member_name] = b"internal"
        manifest["files"][member_name] = hashlib.sha256(payloads[member_name]).hexdigest()
        payloads["manifest.json"] = json.dumps(manifest, sort_keys=True).encode("utf-8")
        with tarfile.open(replacement, "w:gz") as destination:
            for member in source.getmembers():
                if member.isfile():
                    content = payloads[member.name]
                    member.size = len(content)
                    destination.addfile(member, io.BytesIO(content))
                else:
                    destination.addfile(member)
            internal = tarfile.TarInfo(member_name)
            internal.size = len(payloads[member_name])
            destination.addfile(internal, io.BytesIO(payloads[member_name]))
    replacement.replace(archive)


def test_backup_writes_complete_manifest_with_file_hashes(tmp_path: Path) -> None:
    """A missing manifest or un-hashed payload would make archive corruption undetectable."""
    root = _make_root(tmp_path)

    archive = create_backup(root, tmp_path / "backups")

    with tarfile.open(archive, "r:gz") as tar:
        manifest = json.load(tar.extractfile("manifest.json"))
        archive_files = {member.name for member in tar.getmembers() if member.isfile()}
        assert manifest["schema_version"] == 1
        assert manifest["database"] == "stock_sync.db"
        assert set(manifest["files"]) == archive_files - {"manifest.json"}
        for name, digest in manifest["files"].items():
            assert hashlib.sha256(tar.extractfile(name).read()).hexdigest() == digest


def test_backup_excludes_only_reserved_storage_entries(tmp_path: Path) -> None:
    """Internal stage/lock entries must not leak into backups, unlike legitimate hidden files."""
    root = _make_root(tmp_path)
    storage = root / "storage"
    (storage / ".sm-techno-storage-staging").mkdir()
    (storage / ".sm-techno-storage-staging" / "partial.xlsx").write_bytes(b"partial")
    (storage / ".sm-techno-storage-operation.lock").write_bytes(b"lock")
    (storage / ".user-visible.txt").write_bytes(b"keep")
    (storage / "documents" / ".sm-techno-storage-staging").mkdir()
    (storage / "documents" / ".sm-techno-storage-staging" / "user-file.docx").write_bytes(b"keep-too")

    archive = create_backup(root, tmp_path / "backups")

    with tarfile.open(archive, "r:gz") as tar:
        names = {member.name for member in tar.getmembers()}
    assert "storage/.user-visible.txt" in names
    assert "storage/documents/.sm-techno-storage-staging/user-file.docx" in names
    assert "storage/.sm-techno-storage-operation.lock" not in names
    assert not any(name.startswith("storage/.sm-techno-storage-staging") for name in names)


def test_verify_only_rejects_corruption_without_creating_target(tmp_path: Path) -> None:
    """Skipping checksum validation could permit a damaged database/storage pair into production."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _rewrite_archive_member(archive, "storage/documents/contract.docx", b"tampered")
    target = tmp_path / "never-created"

    with pytest.raises(RuntimeError, match="checksum"):
        restore_backup(archive, target, verify_only=True)

    assert not target.exists()


def test_verify_only_rejects_unsafe_tar_members_without_creating_target(tmp_path: Path) -> None:
    """Path traversal in a tar member must never be extracted near a restore target."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _append_unsafe_member(archive)
    target = tmp_path / "restore"

    with pytest.raises(RuntimeError, match="unsafe"):
        restore_backup(archive, target, verify_only=True)

    assert not target.exists()
    assert not (tmp_path / "outside.txt").exists()


def test_verify_only_rejects_tar_symlinks_without_creating_target(tmp_path: Path) -> None:
    """Tar links can redirect extraction outside storage and are never part of a backup contract."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _append_symlink_member(archive)
    target = tmp_path / "restore"

    with pytest.raises(RuntimeError, match="unsafe"):
        restore_backup(archive, target, verify_only=True)

    assert not target.exists()


@pytest.mark.parametrize(
    "member_name",
    [
        "storage/.sm-techno-storage-operation.lock",
        "storage/.sm-techno-storage-operation.lock/child",
        "storage/.sm-techno-storage-staging/partial.xlsx",
    ],
)
def test_verify_only_rejects_internal_storage_artifacts(tmp_path: Path, member_name: str) -> None:
    """An archive must never restore the application's own lock or incomplete publication files."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _append_internal_member_and_update_manifest(archive, member_name)

    with pytest.raises(RuntimeError, match="internal"):
        restore_backup(archive, tmp_path / "restore", verify_only=True)


@pytest.mark.parametrize("member_name", ["storage/C:/evil.txt", "storage//server/share/evil.txt"])
def test_verify_only_rejects_windows_qualified_tar_paths(tmp_path: Path, member_name: str) -> None:
    """Drive/UNC-looking members must not become Windows extraction paths."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _append_windows_path_member(archive, member_name)

    with pytest.raises(RuntimeError, match="unsafe"):
        restore_backup(archive, tmp_path / "restore", verify_only=True)


def test_backup_waits_for_reference_publication_then_archives_a_verifiable_pair(tmp_path: Path, monkeypatch) -> None:
    """Without the shared lock, backup can snapshot a new row before its file is published."""
    root = tmp_path / "source"
    (root / "data").mkdir(parents=True)
    (root / "storage" / "documents").mkdir(parents=True)
    monkeypatch.setattr(service_module, "ROOT_DIR", root)
    database = WebDatabase(db_path=root / "data" / "stock_sync.db")
    service = WebStockSyncService(
        db=database,
        commercial_offer_storage_dir=root / "storage" / "commercial_offers",
        document_storage_dir=root / "storage" / "documents",
    )
    database_row_written = threading.Event()
    publish_file = threading.Event()
    backup_requested_lock = threading.Event()
    archive_holder: list[Path] = []
    errors: list[BaseException] = []

    @contextmanager
    def observed_backup_lock(lock_root: Path):
        backup_requested_lock.set()
        with storage_operation_lock(lock_root):
            yield

    monkeypatch.setattr(vps_backup, "storage_operation_lock", observed_backup_lock)

    original_create = database.create_commercial_offer

    def pause_after_database_commit(**kwargs) -> int:
        offer_id = original_create(**kwargs)
        database_row_written.set()
        assert publish_file.wait(timeout=5)
        return offer_id

    monkeypatch.setattr(database, "create_commercial_offer", pause_after_database_commit)

    def writer() -> None:
        try:
            service.create_commercial_offer_from_draft(
                client_source="manual",
                client_id=None,
                client_name="Race client",
                notes="",
                lines=[{"article": "RACE-1", "name": "Race item", "qty": 1, "priceVat": 1}],
                created_by_user_id=None,
            )
        except BaseException as exc:
            errors.append(exc)

    def backup() -> None:
        archive_holder.append(create_backup(root, tmp_path / "backups"))

    writer_thread = threading.Thread(target=writer)
    writer_thread.start()
    assert database_row_written.wait(timeout=5)
    backup_thread = threading.Thread(target=backup)
    backup_thread.start()
    assert backup_requested_lock.wait(timeout=5)
    publish_file.set()
    writer_thread.join(timeout=5)
    backup_thread.join(timeout=5)
    assert not errors
    assert not writer_thread.is_alive()
    assert not backup_thread.is_alive()

    restore_backup(archive_holder[0], tmp_path / "restore", verify_only=True)


def test_service_uses_storage_mount_for_lock_and_staging_when_data_is_elsewhere(tmp_path: Path) -> None:
    """Compose mounts /data and /storage separately, so publication cannot use the database filesystem."""
    data_root = tmp_path / "data-mount"
    storage_root = tmp_path / "storage-mount"
    data_root.mkdir()
    storage_root.mkdir()
    service = WebStockSyncService(
        db=WebDatabase(db_path=data_root / "stock_sync.db"),
        commercial_offer_storage_dir=storage_root / "commercial_offers",
        document_storage_dir=storage_root / "documents",
    )

    staged = service._commercial_offer_staging_path(
        storage_root / "commercial_offers" / "exports" / "offer.xlsx"
    )

    assert service._storage_operation_root() == storage_root
    assert staged.parent == storage_root / ".sm-techno-storage-staging"


def test_backup_excludes_staged_offer_files_during_generation(tmp_path: Path, monkeypatch) -> None:
    """Staging below storage would let a backup retain unreferenced partial output."""
    root = tmp_path / "source"
    (root / "data").mkdir(parents=True)
    (root / "storage" / "documents").mkdir(parents=True)
    monkeypatch.setattr(service_module, "ROOT_DIR", root)
    database = WebDatabase(db_path=root / "data" / "stock_sync.db")
    service = WebStockSyncService(
        db=database,
        commercial_offer_storage_dir=root / "storage" / "commercial_offers",
        document_storage_dir=root / "storage" / "documents",
    )
    generated_stage = threading.Event()
    release_generation = threading.Event()
    errors: list[BaseException] = []
    staged_paths: list[Path] = []
    original_generator = commercial_offers_module.generate_commercial_offer_workbook

    def pause_after_staging_write(**kwargs) -> None:
        original_generator(**kwargs)
        staged_paths.append(Path(kwargs["output_path"]))
        generated_stage.set()
        assert release_generation.wait(timeout=5)

    monkeypatch.setattr(commercial_offers_module, "generate_commercial_offer_workbook", pause_after_staging_write)

    def writer() -> None:
        try:
            service.create_commercial_offer_from_draft(
                client_source="manual",
                client_id=None,
                client_name="Staged client",
                notes="",
                lines=[{"article": "STAGE-1", "name": "Staged item", "qty": 1, "priceVat": 1}],
                created_by_user_id=None,
            )
        except BaseException as exc:
            errors.append(exc)

    writer_thread = threading.Thread(target=writer)
    writer_thread.start()
    assert generated_stage.wait(timeout=5)
    assert staged_paths[0].parent == root / "storage" / ".sm-techno-storage-staging"
    archive = create_backup(root, tmp_path / "backups")
    release_generation.set()
    writer_thread.join(timeout=5)

    with tarfile.open(archive, "r:gz") as tar:
        assert not any(".staging" in member.name for member in tar.getmembers())
    assert not errors
    assert not writer_thread.is_alive()
    restore_backup(archive, tmp_path / "restore", verify_only=True)


def test_backup_releases_writer_lock_before_hashing_archive(tmp_path: Path, monkeypatch) -> None:
    """Hashing an isolated snapshot must not stall a new storage publication."""
    root = _make_root(tmp_path)
    hash_started = threading.Event()
    release_hash = threading.Event()
    writer_acquired = threading.Event()
    archive_holder: list[Path] = []
    original_hash = vps_backup._sha256

    def pause_hash(path: Path) -> str:
        if not hash_started.is_set():
            hash_started.set()
            assert release_hash.wait(timeout=5)
        return original_hash(path)

    monkeypatch.setattr(vps_backup, "_sha256", pause_hash)

    def backup() -> None:
        archive_holder.append(create_backup(root, tmp_path / "backups"))

    def writer() -> None:
        with storage_operation_lock(root / "storage"):
            writer_acquired.set()

    backup_thread = threading.Thread(target=backup)
    backup_thread.start()
    assert hash_started.wait(timeout=5)
    writer_thread = threading.Thread(target=writer)
    writer_thread.start()
    try:
        assert writer_acquired.wait(timeout=2)
    finally:
        release_hash.set()
    backup_thread.join(timeout=5)
    writer_thread.join(timeout=5)

    assert not backup_thread.is_alive()
    assert not writer_thread.is_alive()
    restore_backup(archive_holder[0], tmp_path / "restore", verify_only=True)


def test_verify_only_rejects_sqlite_corruption_even_with_matching_checksum(tmp_path: Path) -> None:
    """A re-hashed invalid database still must fail SQLite integrity validation."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    _replace_database_and_update_manifest(archive)
    target = tmp_path / "restore"

    with pytest.raises(RuntimeError, match="SQLite validation"):
        restore_backup(archive, target, verify_only=True)

    assert not target.exists()


def test_restore_rejects_missing_document_reference_and_preserves_target(tmp_path: Path) -> None:
    """A restore must not replace an existing root with a database pointing at a missing file."""
    root = _make_root(tmp_path)
    archive = create_backup(root, tmp_path / "backups")
    _remove_archive_member_and_update_manifest(archive, "storage/documents/contract.docx")
    target = tmp_path / "restore"
    target.mkdir()
    sentinel = target / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")

    with pytest.raises(RuntimeError, match="missing storage file"):
        restore_backup(archive, target)

    assert sentinel.read_text(encoding="utf-8") == "keep"
    assert not (target / "data").exists()


def test_backup_refuses_foreign_key_violations_before_publishing_archive(tmp_path: Path) -> None:
    """A backup with broken relational integrity must never be published."""
    root = _make_root(tmp_path)
    with sqlite3.connect(root / "data" / "stock_sync.db") as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("UPDATE child SET parent_id = 404 WHERE id = 1")
    with pytest.raises(RuntimeError, match="foreign_key_check"):
        create_backup(root, tmp_path / "backups")

    assert list((tmp_path / "backups").glob("*.tar.gz")) == []


def test_restore_stages_verified_pair_into_empty_target(tmp_path: Path) -> None:
    """A valid pair must appear together below the requested empty root."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    target = tmp_path / "restore"

    restore_backup(archive, target)

    assert (target / "data" / "stock_sync.db").is_file()
    assert (target / "storage" / "documents" / "contract.docx").read_bytes() == b"contract"


def test_restore_never_overwrites_a_nonempty_target(tmp_path: Path) -> None:
    """Removing the empty-target guard would destroy an unrelated production root."""
    archive = create_backup(_make_root(tmp_path), tmp_path / "backups")
    target = tmp_path / "restore"
    target.mkdir()
    sentinel = target / "production.txt"
    sentinel.write_text("do not replace", encoding="utf-8")

    with pytest.raises(RuntimeError, match="already contains data"):
        restore_backup(archive, target)

    assert sentinel.read_text(encoding="utf-8") == "do not replace"
