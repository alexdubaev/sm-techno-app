"""Synthetic code-only rollback proof, before any persistent bank-feature use.

Run with the task Python environment. Archives both revisions into disposable
directories, never opens workspace DB/storage or contacts an external network.
This does not authorize deployment or implement a production rollback guard.

Empty-state guard contract for the release runbook:
  * Every table named in BANK_TABLES, and every other bank_%/crm_sales_% table,
    has zero rows (including account settings and assignment versions/audits).
  * No manager_sales source='bank_statement', bank_operation_id, or crm_client_id.
  * No persistent files under the bank_statements private storage directory.
These are synthetic checks here, not a runtime guard implementation. Once any
new-feature state exists, use roll-forward or obtain a separate owner decision;
never restore an old DB over newly recorded data. Windows asyncio's internal
loopback self-pipe is permitted; all external connections/DNS attempts fail.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time


ACCEPTED = 'c61bffcea72e8de669fcdef7756cfd0fadf4193e'
BANK_TABLES = (
    'bank_import_accounts', 'bank_uploads', 'bank_source_rows', 'bank_operations',
    'bank_decisions', 'bank_decision_audit', 'bank_sale_links', 'bank_commits',
    'crm_sales_assignments', 'crm_sales_assignment_versions', 'crm_sales_assignment_audit',
)

COMMON = r'''
import hashlib, json, logging, os, socket
from pathlib import Path
logging.disable(logging.CRITICAL)
network_attempts = []
def deny_network(*args, **kwargs):
    network_attempts.append(True)
    raise AssertionError('Network access is forbidden in the rollback probe')
# Windows asyncio creates a loopback socketpair for its internal self-pipe.
# Permit only loopback literals/local sockets; deny external connections/DNS.
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex
original_create_connection = socket.create_connection
original_getaddrinfo = socket.getaddrinfo
def local_address(address):
    return isinstance(address, tuple) and address[0] in ('127.0.0.1', '::1', 'localhost')
def guarded_connect(sock, address):
    if sock.family == getattr(socket, 'AF_UNIX', None) or local_address(address):
        return original_connect(sock, address)
    return deny_network()
def guarded_connect_ex(sock, address):
    if sock.family == getattr(socket, 'AF_UNIX', None) or local_address(address):
        return original_connect_ex(sock, address)
    return deny_network()
def guarded_create_connection(address, *args, **kwargs):
    if local_address(address):
        return original_create_connection(address, *args, **kwargs)
    return deny_network()
def guarded_getaddrinfo(host, *args, **kwargs):
    if host in (None, '', '127.0.0.1', '::1', 'localhost', b'127.0.0.1', b'::1', b'localhost'):
        return original_getaddrinfo(host, *args, **kwargs)
    return deny_network()
socket.socket.connect = guarded_connect
socket.socket.connect_ex = guarded_connect_ex
socket.create_connection = guarded_create_connection
socket.getaddrinfo = guarded_getaddrinfo
assert not os.environ.get('DEEPSEEK_API_KEY')
assert not os.environ.get('SM_TECHNO_CRM_SYNC_USER_ID')
assert not any('ONEC' in name for name in os.environ)
import stock_sync_api as api
from fastapi.testclient import TestClient
assert Path(api.__file__).resolve() == Path.cwd() / 'stock_sync_api.py'
data_dir = Path(os.environ['SM_TECHNO_DATA_DIR']).resolve()
assert api.SERVICE.db.db_path.resolve() == data_dir / 'stock_sync.db'
state_path = data_dir.parent / 'probe-state.json'
bank_tables = (
    'bank_import_accounts', 'bank_uploads', 'bank_source_rows', 'bank_operations',
    'bank_decisions', 'bank_decision_audit', 'bank_sale_links', 'bank_commits',
    'crm_sales_assignments', 'crm_sales_assignment_versions', 'crm_sales_assignment_audit',
)
def verify_empty_bank_state():
    with api.SERVICE.db.connect() as conn:
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'bank_%' OR name LIKE 'crm_sales_%')")}
        assert set(bank_tables) <= names, 'New feature tables were lost'
        for table in names:
            assert conn.execute('SELECT COUNT(*) FROM "' + table.replace('"','""') + '"').fetchone()[0] == 0, 'Bank feature state must stay empty'
        assert conn.execute("SELECT COUNT(*) FROM manager_sales WHERE source='bank_statement' OR bank_operation_id IS NOT NULL OR crm_client_id IS NOT NULL").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM web_schema_migrations WHERE version='2026-11-07-bank-statements-v1'").fetchone()[0] == 1
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    statement_root = data_dir / 'bank_statements'
    assert not statement_root.exists() or not any(p.is_file() for p in statement_root.rglob('*'))
    return len(names)
def snapshot_hash():
    with api.SERVICE.db.connect() as conn:
        raw = conn.execute('SELECT data_json FROM manager_snapshots ORDER BY id').fetchall()
    return hashlib.sha256(json.dumps([r[0] for r in raw], ensure_ascii=False).encode()).hexdigest()
def authenticate(client):
    response = client.post('/api/auth/login', json={'username':'rollback-probe-admin','password':'synthetic-rollback-password'})
    assert response.status_code == 200, 'Synthetic administrator login failed'
    return {'Authorization':'Bearer ' + response.json()['token']}
def assert_summary(data, total, commission, income):
    assert data['terms']['mode'] == 'minimum'
    assert data['summary']['salesTotal'] == total
    assert data['summary']['commission'] == commission
    assert data['summary']['fixed'] == 1000000
    assert data['summary']['income'] == income
def emit(result):
    assert not network_attempts, 'Unexpected network call was attempted'
    print('PROBE_PHASE_RESULT=' + json.dumps(result, sort_keys=True))
'''

SEED = r'''
from stock_sync_web.manager_repository import ManagerRepository
with TestClient(api.app) as client:
    assert client.get('/api/health').status_code == 200
    db = api.SERVICE.db
    admin_id = db.create_user(username='rollback-probe-admin', password='synthetic-rollback-password', role='admin')
    user_id = db.create_user(username='rollback-probe-manager', password='synthetic-rollback-password', role='user')
    admin = db.get_user_by_id(admin_id)
    repository = ManagerRepository(db)
    manager_id = repository.dashboard(db.get_user_by_id(user_id), None, '2026-11')['account']['id']
    repository.mutate(admin, manager_id, '2026-11', dict(kind='terms',version=0,reason='Synthetic minimum terms',plan=0,fixed=1000000,rate=500,mode='minimum'))
    before = repository.mutate(admin, manager_id, '2026-11', dict(kind='sale',version=1,date='2026-11-03',client='Synthetic payer A',amount=36000000,rate=500,invoiceNumber='synthetic-216',invoiceDate='2026-09-09'))
    assert_summary(before, 36000000, 1800000, 1800000)
    repository.mutate(admin, manager_id, '2026-10', dict(kind='terms',version=0,reason='Synthetic closed period',plan=0,fixed=100,rate=0,mode='always'))
    repository.mutate(admin, manager_id, '2026-10', dict(kind='sale',version=1,date='2026-10-01',client='Synthetic prior payer',amount=10000,rate=0))
    repository.mutate(admin, manager_id, '2026-10', dict(kind='close',version=2,reason='Synthetic historical close'))
    state = dict(managerId=manager_id, snapshotHash=snapshot_hash(), initialVersion=before['version'])
    state_path.write_text(json.dumps(state), encoding='utf-8')
    emit(dict(stage='candidate_seed', emptyBankTables=verify_empty_bank_state(), minimumMode=True, snapshotCount=1))
'''

OLD = r'''
state = json.loads(state_path.read_text(encoding='utf-8'))
with TestClient(api.app) as client:
    assert client.get('/api/health').status_code == 200
    headers = authenticate(client)
    params = dict(month='2026-11', managerId=state['managerId'])
    response = client.get('/api/manager/dashboard', params=params, headers=headers)
    assert response.status_code == 200, 'Accepted dashboard could not read migrated DB'
    before = response.json()
    assert before['version'] == state['initialVersion']
    assert_summary(before, 36000000, 1800000, 1800000)
    response = client.post('/api/manager/changes', headers=headers, json=dict(managerId=state['managerId'],month='2026-11',kind='sale',version=before['version'],date='2026-11-04',client='Synthetic payer B',amount=2000000,rate=500,reason='Synthetic write under accepted code'))
    assert response.status_code == 200, 'Accepted manual write on migrated DB failed'
    after = response.json()
    assert after['version'] == before['version'] + 1
    assert_summary(after, 38000000, 1900000, 1900000)
    response = client.post('/api/manager/preview', headers=headers, json=dict(managerId=state['managerId'],month='2026-11',kind='sale',version=after['version'],date='2026-11-05',client='Synthetic preview only',amount=1000000,rate=500))
    assert response.status_code == 200, 'Accepted preview failed'
    assert_summary(response.json(), 39000000, 1950000, 1950000)
    persisted = client.get('/api/manager/dashboard', params=params, headers=headers).json()
    assert persisted['version'] == after['version']
    assert_summary(persisted, 38000000, 1900000, 1900000)
    assert snapshot_hash() == state['snapshotHash'], 'Accepted code changed a closed snapshot'
    state['acceptedWriteVersion'] = after['version']
    state_path.write_text(json.dumps(state), encoding='utf-8')
    emit(dict(stage='accepted_startup_read_write', emptyBankTables=verify_empty_bank_state(), minimumMode=True, previewRolledBack=True, closedSnapshotUnchanged=True))
'''

VERIFY = r'''
state = json.loads(state_path.read_text(encoding='utf-8'))
with TestClient(api.app) as client:
    assert client.get('/api/health').status_code == 200
    headers = authenticate(client)
    response = client.get('/api/manager/dashboard', params=dict(month='2026-11',managerId=state['managerId']), headers=headers)
    assert response.status_code == 200, 'Candidate could not reopen data written by accepted code'
    data = response.json()
    assert data['version'] == state['acceptedWriteVersion']
    assert_summary(data, 38000000, 1900000, 1900000)
    assert data['total'] == 2 and all(s['source'] == 'manual' for s in data['sales'])
    assert snapshot_hash() == state['snapshotHash'], 'Closed snapshot changed across code rollback/return'
    emit(dict(stage='candidate_reopen', emptyBankTables=verify_empty_bank_state(), manualSales=2, salesTotal=38000000, commission=1900000, income=1900000, closedSnapshotUnchanged=True))
'''


def archive(repo: Path, revision: str, target: Path) -> str:
    sha = subprocess.check_output(['git', 'rev-parse', '--verify', revision + '^{commit}'], cwd=repo, text=True).strip()
    target.mkdir()
    tar_path = target.parent / (target.name + '.tar')
    with tar_path.open('wb') as output:
        subprocess.run(['git', 'archive', '--format=tar', sha], cwd=repo, stdout=output, check=True)
    with tarfile.open(tar_path, 'r:') as content:
        content.extractall(target, filter='data')
    return sha


def run_phase(source: Path, payload: str, environment: dict[str, str], label: str) -> dict:
    result = subprocess.run([sys.executable, '-c', COMMON + payload], cwd=source, env=environment,
                            capture_output=True, text=True, encoding='utf-8', timeout=120)
    if result.returncode:
        last_line = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'no exception text'
        raise RuntimeError(label + ' failed: ' + last_line)
    prefix = 'PROBE_PHASE_RESULT='
    rows = [line[len(prefix):] for line in result.stdout.splitlines() if line.startswith(prefix)]
    if len(rows) != 1:
        raise RuntimeError(label + ' did not return its proof marker')
    return json.loads(rows[0])


def main() -> None:
    started = time.monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', default='HEAD', help='Frozen candidate commit to migrate and reopen with')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo))
    from tests.support.isolated_environment import create_test_environment
    with tempfile.TemporaryDirectory(prefix='sm-techno-bank-rollback-', ignore_cleanup_errors=True) as directory:
        root = Path(directory)
        candidate_dir, accepted_dir = root / 'candidate', root / 'accepted'
        candidate_sha = archive(repo, args.candidate, candidate_dir)
        accepted_sha = archive(repo, ACCEPTED, accepted_dir)
        data_dir = root / 'synthetic-data'
        data_dir.mkdir()
        environment = create_test_environment(os.environ, data_dir)
        environment['PYTHONIOENCODING'] = 'utf-8'
        phases = [run_phase(candidate_dir, SEED, environment, 'candidate seed'),
                  run_phase(accepted_dir, OLD, environment, 'accepted startup/read/write'),
                  run_phase(candidate_dir, VERIFY, environment, 'candidate reopen')]
        print(json.dumps(dict(result='PASS', candidate=candidate_sha, accepted=accepted_sha, phases=phases,
            tableEmptyGuards=list(BANK_TABLES), externalNetworkAttempts=0,
            limitation='Code-only rollback proven only before any persistent bank import/account/assignment state; after use requires roll-forward or a separate owner decision, never restore an old DB over new data.',
            elapsedSeconds=round(time.monotonic()-started, 2)), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
