from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

from scripts.vps_backup import create_backup
from scripts.vps_restore import restore_backup


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
    (root / "storage" / "documents" / "contract.docx").unlink()
    archive = create_backup(root, tmp_path / "backups")
    target = tmp_path / "restore"
    target.mkdir()
    sentinel = target / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")

    with pytest.raises(RuntimeError, match="missing storage file"):
        restore_backup(archive, target)

    assert sentinel.read_text(encoding="utf-8") == "keep"
    assert not (target / "data").exists()


def test_verify_only_rejects_foreign_key_violations_without_target_write(tmp_path: Path) -> None:
    """Foreign key corruption must be caught even when SQLite's page integrity is sound."""
    root = _make_root(tmp_path)
    with sqlite3.connect(root / "data" / "stock_sync.db") as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("UPDATE child SET parent_id = 404 WHERE id = 1")
    archive = create_backup(root, tmp_path / "backups")
    target = tmp_path / "restore"

    with pytest.raises(RuntimeError, match="foreign_key_check"):
        restore_backup(archive, target, verify_only=True)

    assert not target.exists()


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
