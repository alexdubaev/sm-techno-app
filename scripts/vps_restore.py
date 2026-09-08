from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tarfile
import tempfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath, PureWindowsPath

from stock_sync_web.vps_integrity import (
    STORAGE_OPERATION_LOCK_NAME,
    STORAGE_STAGING_DIR_NAME,
    validate_database_storage_pair,
)


DATABASE_NAME = "stock_sync.db"
MANIFEST_NAME = "manifest.json"
MANIFEST_VERSION = 1


@contextmanager
def _target_lock(target_root: Path):
    lock_path = target_root.parent / f".{target_root.name}.sm-techno-backup-restore.lock"
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise RuntimeError(f"Another backup or restore is already using {target_root}.") from exc
    try:
        os.write(descriptor, f"pid={os.getpid()}\n".encode("ascii"))
        yield
    finally:
        os.close(descriptor)
        lock_path.unlink(missing_ok=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_member_name(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        bool(name)
        and "\\" not in name
        and "//" not in name
        and not path.is_absolute()
        and not PureWindowsPath(name).is_absolute()
        and all(part not in {"", ".", ".."} and not PureWindowsPath(part).drive for part in path.parts)
    )


def _safe_extraction_path(destination: Path, name: str) -> Path:
    output = destination.joinpath(*PurePosixPath(name).parts)
    try:
        output.resolve().relative_to(destination.resolve())
    except ValueError as exc:
        raise RuntimeError("Archive contains an unsafe extraction path.") from exc
    return output


def _is_internal_storage_member(name: str) -> bool:
    normalized_name = PurePosixPath(name).as_posix().casefold()
    return (
        normalized_name == f"storage/{STORAGE_OPERATION_LOCK_NAME}".casefold()
        or normalized_name.startswith(f"storage/{STORAGE_OPERATION_LOCK_NAME}/".casefold())
        or normalized_name == f"storage/{STORAGE_STAGING_DIR_NAME}".casefold()
        or normalized_name.startswith(f"storage/{STORAGE_STAGING_DIR_NAME}/".casefold())
    )


def _validate_members(tar: tarfile.TarFile) -> dict[str, tarfile.TarInfo]:
    members: dict[str, tarfile.TarInfo] = {}
    for member in tar.getmembers():
        if not _safe_member_name(member.name) or not (member.isfile() or member.isdir()):
            raise RuntimeError("Archive contains an unsafe path or member type.")
        if _is_internal_storage_member(member.name):
            raise RuntimeError("Archive contains internal storage artifacts.")
        if member.name in members:
            raise RuntimeError("Archive contains duplicate member names.")
        if member.name not in {DATABASE_NAME, MANIFEST_NAME, "storage"} and not member.name.startswith("storage/"):
            raise RuntimeError("Archive contains an unexpected member path.")
        members[member.name] = member
    if not members.get(DATABASE_NAME) or not members[DATABASE_NAME].isfile():
        raise RuntimeError("Archive must contain stock_sync.db as a regular file.")
    if not members.get(MANIFEST_NAME) or not members[MANIFEST_NAME].isfile():
        raise RuntimeError("Archive must contain manifest.json as a regular file.")
    if not members.get("storage") or not members["storage"].isdir():
        raise RuntimeError("Archive must contain storage as a real directory.")
    return members


def _load_manifest(tar: tarfile.TarFile, members: dict[str, tarfile.TarInfo]) -> dict[str, object]:
    manifest_file = tar.extractfile(members[MANIFEST_NAME])
    if manifest_file is None:
        raise RuntimeError("Archive manifest cannot be read.")
    try:
        manifest = json.load(manifest_file)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("Archive manifest is invalid JSON.") from exc
    if not isinstance(manifest, dict) or manifest.get("schema_version") != MANIFEST_VERSION:
        raise RuntimeError("Archive manifest schema is unsupported.")
    if manifest.get("database") != DATABASE_NAME or not isinstance(manifest.get("created_at"), str):
        raise RuntimeError("Archive manifest is incomplete.")
    files = manifest.get("files")
    if not isinstance(files, dict):
        raise RuntimeError("Archive manifest file checksums are invalid.")
    archived_files = {name for name, member in members.items() if member.isfile() and name != MANIFEST_NAME}
    if set(files) != archived_files:
        raise RuntimeError("Archive manifest does not describe the exact archive contents.")
    for name, digest in files.items():
        if not isinstance(name, str) or not isinstance(digest, str) or len(digest) != 64:
            raise RuntimeError("Archive manifest file checksums are invalid.")
        try:
            int(digest, 16)
        except ValueError as exc:
            raise RuntimeError("Archive manifest file checksums are invalid.") from exc
    return manifest


def _extract_verified(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, "r:gz") as tar:
        members = _validate_members(tar)
        manifest = _load_manifest(tar, members)
        for name, member in members.items():
            output = _safe_extraction_path(destination, name)
            if member.isdir():
                output.mkdir(parents=True, exist_ok=False)
                continue
            source = tar.extractfile(member)
            if source is None:
                raise RuntimeError(f"Archive member cannot be read: {name}")
            output.parent.mkdir(parents=True, exist_ok=True)
            with source, output.open("xb") as target:
                shutil.copyfileobj(source, target)
        for name, expected_digest in manifest["files"].items():
            if _sha256(_safe_extraction_path(destination, name)) != expected_digest:
                raise RuntimeError(f"Archive checksum mismatch for {name}.")


def _target_is_empty(target_root: Path) -> bool:
    return not target_root.exists() or (target_root.is_dir() and not target_root.is_symlink() and not any(target_root.iterdir()))


def restore_backup(archive: Path, target_root: Path, *, verify_only: bool = False) -> None:
    """Verify an archive, then atomically materialize it only into an empty root."""
    archive = archive.expanduser().resolve()
    target_root = target_root.expanduser().resolve()
    if not archive.is_file():
        raise RuntimeError(f"Archive does not exist: {archive}")
    with tempfile.TemporaryDirectory(prefix="sm-techno-restore-verify-") as verification_dir:
        extracted = Path(verification_dir)
        _extract_verified(archive, extracted)
        validate_database_storage_pair(extracted / DATABASE_NAME, extracted / "storage")
        if verify_only:
            return
        target_root.parent.mkdir(parents=True, exist_ok=True)
        with _target_lock(target_root):
            if not _target_is_empty(target_root):
                raise RuntimeError("Target root already contains data; choose an empty restore root.")
            staging = Path(tempfile.mkdtemp(prefix=f".{target_root.name}.restore-", dir=target_root.parent))
            try:
                (staging / "data").mkdir()
                shutil.copyfile(extracted / DATABASE_NAME, staging / "data" / DATABASE_NAME)
                shutil.copytree(extracted / "storage", staging / "storage")
                validate_database_storage_pair(staging / "data" / DATABASE_NAME, staging / "storage")
                if target_root.exists():
                    target_root.rmdir()
                staging.replace(target_root)
            except Exception:
                if staging.exists():
                    shutil.rmtree(staging)
                raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore an SM Techno backup into an empty root.")
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--target-root", required=True, type=Path)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    restore_backup(args.archive, args.target_root, verify_only=args.verify_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
