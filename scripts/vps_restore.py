from __future__ import annotations

import argparse
import shutil
import tarfile
import tempfile
from pathlib import Path


def restore_backup(archive: Path, target_root: Path) -> None:
    archive = archive.resolve()
    target_root = target_root.resolve()
    if not archive.is_file():
        raise RuntimeError(f"Archive does not exist: {archive}")
    with tempfile.TemporaryDirectory(prefix="sm-techno-restore-", dir=target_root.parent) as temp_dir:
        temporary_root = Path(temp_dir)
        with tarfile.open(archive, "r:gz") as tar:
            members = tar.getmembers()
            if any(
                member.name.startswith("/")
                or ".." in Path(member.name).parts
                or member.issym()
                or member.islnk()
                for member in members
            ):
                raise RuntimeError("Archive contains an unsafe path.")
            names = {member.name for member in members}
            if "stock_sync.db" not in names or not any(name.startswith("storage/") for name in names):
                raise RuntimeError("Archive must contain stock_sync.db and storage/.")
            tar.extractall(temporary_root, members=members)
        data_dir = target_root / "data"
        storage_dir = target_root / "storage"
        if data_dir.exists() or storage_dir.exists():
            raise RuntimeError("Target data or storage already exists; choose an empty restore root.")
        data_dir.mkdir(parents=True)
        shutil.move(str(temporary_root / "stock_sync.db"), str(data_dir / "stock_sync.db"))
        shutil.move(str(temporary_root / "storage"), str(storage_dir))


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore an SM Techno backup into an empty root.")
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--target-root", required=True, type=Path)
    args = parser.parse_args()
    restore_backup(args.archive, args.target_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
