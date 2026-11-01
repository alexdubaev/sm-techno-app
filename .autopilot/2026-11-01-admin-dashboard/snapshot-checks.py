"""Snapshot tracked and new nonignored task source for isolated Linux checks."""
import hashlib
from pathlib import Path
import subprocess
import tarfile

root = Path.cwd()
out = Path('D:/codex-task-artifacts/admin-dashboard-20261101/linux-source.tar.gz')
names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).decode('utf-8').split('\0')
hashes = []
with tarfile.open(out, 'w:gz') as archive:
    for name in names:
        if not name or name.startswith('.autopilot/'):
            continue
        path = root / name
        if path.name == '.env' or path.suffix == '.db' or not path.is_file():
            continue
        if path.name.startswith('.env.') and path.name != '.env.example':
            continue
        archive.add(path, arcname=name, recursive=False)
        hashes.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + name)
out.with_suffix('.files.sha256').write_text('\n'.join(hashes) + '\n', encoding='utf-8')
print('Source files:', len(hashes))
print('Archive SHA256:', hashlib.sha256(out.read_bytes()).hexdigest())
