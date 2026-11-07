"""Sale-specific remuneration corrections preserve bank facts and period history."""
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Barrier

import pytest

from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository
from tests.test_bank_repository import bank  # shared isolated SQLite/storage fixture
from tests.support.bank_statement_fixture import make_statement


def posted_sale(bank, source='bank_statement'):
    db, repo, admin, seller, managers, mid, account, clients = bank
    managers.mutate(admin, mid, '2026-11', dict(kind='terms', version=1, plan=0,
        fixed=0, rate=0, mode='always', reason='Explicit initial zero rate'))
    if source != 'bank_statement':
        manual = managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=2,
            date='2026-11-06', client='Synthetic document client 0', amount=36000000,
            rate=0, invoiceNumber='256', invoiceDate='2026-11-06'))
        sale_id = manual['sales'][0]['id']
        if source == 'onec':
            with db.transaction() as conn:
                conn.execute("UPDATE manager_sales SET source='onec',external_id='synthetic-onec' WHERE id=?", (sale_id,))
    detail = repo.upload(admin, account, 'rate-correction.xlsx', make_statement())
    operation = detail['operations'][0]
    if source != 'bank_statement':
        operation = repo.update_operation(admin, operation['id'], dict(version=operation['version'],
            duplicateAction='link', linkSaleId=sale_id, reason='Bank receipt confirms existing sale'))
    item = dict(operationId=operation['id'], version=operation['version'], fingerprint=operation['fingerprint'])
    repo.commit(admin, [item], 'sale-rate-posting')
    ledger = managers.dashboard(admin, mid, '2026-11')
    return ledger, ledger['sales'][0], detail['id']


@pytest.mark.parametrize('source', ['bank_statement', 'manual', 'onec'])
def test_sale_rate_preview_commit_preserves_bank_identity_and_updates_audit(bank, source):
    db, repo, admin, seller, managers, mid, account, clients = bank
    ledger, sale, upload_id = posted_sale(bank, source)
    with db.transaction() as conn:
        before = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale['id'],)).fetchone())
        immutable = {table: [tuple(r) for r in conn.execute(f'SELECT * FROM {table}')]
                     for table in ('bank_operations', 'bank_company_sales', 'bank_sale_links')}
        audit_count = conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0]
    payload = dict(kind='sale_rate', saleId=sale['id'], version=ledger['version'], rate=500)
    preview = managers.mutate(admin, mid, '2026-11', payload, preview=True)
    assert preview['summary']['salesTotal'] == 36000000 and preview['summary']['commission'] == 1800000
    assert managers.dashboard(admin, mid, '2026-11')['version'] == ledger['version']
    assert managers.dashboard(admin, mid, '2026-11')['summary']['commission'] == 0
    with db.transaction() as conn:
        assert dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale['id'],)).fetchone()) == before
        assert conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0] == audit_count
    saved = managers.mutate(admin, mid, '2026-11', payload)
    assert saved['summary']['salesTotal'] == 36000000 and saved['summary']['income'] == 1800000
    assert saved['terms']['rate'] == 0  # An individual sale override never changes new-sale conditions.
    with db.transaction() as conn:
        after = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale['id'],)).fetchone())
        assert {k: v for k, v in after.items() if k not in ('rate', 'updated_at')} == {
            k: v for k, v in before.items() if k not in ('rate', 'updated_at')}
        assert after['rate'] == 500
        for table, rows in immutable.items():
            assert [tuple(r) for r in conn.execute(f'SELECT * FROM {table}')] == rows
        audit = dict(conn.execute("SELECT * FROM manager_audit WHERE kind='sale_rate'").fetchone())
        assert audit['reason'] == 'Изменение ставки продажи' and audit['actor_id'] == admin['id']
        assert json.loads(audit['before_json'])['sale']['rate'] == 0
        assert json.loads(audit['after_json'])['sale']['rate'] == 500
    with pytest.raises(ManagerConflict):
        managers.mutate(admin, mid, '2026-11', payload)
    payment = repo.refresh_upload(admin, upload_id)['operations'][0]
    assert payment['status'] == 'accounted' and payment['rate'] == 500
    assert managers.dashboard(seller, None, '2026-11')['sales'][0]['rate'] == 500


def test_sale_rate_rejects_invalid_fields_access_and_cancelled_or_foreign_sale(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    ledger, sale, _ = posted_sale(bank)
    payload = dict(kind='sale_rate', saleId=sale['id'], version=ledger['version'], rate=500)
    for rate in (-1, 10001, 1.5, True, '500', None):
        with pytest.raises(ValueError):
            managers.mutate(admin, mid, '2026-11', {**payload, 'rate': rate})
    for reason in (False, 'x' * 501):
        with pytest.raises(ValueError):
            managers.mutate(admin, mid, '2026-11', {**payload, 'reason': reason})
    for field, value in (('amount', 1), ('date', '2026-11-01'), ('client', 'Changed client'),
                         ('invoiceNumber', 'other'), ('invoiceDate', '2026-11-01'),
                         ('bankOperationId', 100), ('crmClientId', clients[1])):
        with pytest.raises(ValueError):
            managers.mutate(admin, mid, '2026-11', {**payload, field: value})
    with pytest.raises(ValueError):
        managers.mutate(admin, mid, '2026-11', {**payload, 'saleId': None})
    with pytest.raises(PermissionError):
        managers.mutate(seller, mid, '2026-11', payload)
    with pytest.raises(ValueError):
        managers.mutate(admin, 100, '2026-11', {**payload, 'version': 0})
    with pytest.raises(ManagerConflict):
        managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=ledger['version'],
            saleId=sale['id'], date=sale['date'], client=sale['client'], amount=sale['amount'],
            rate=500, reason='Full bank edits remain forbidden'))
    unchanged = managers.dashboard(admin, mid, '2026-11')
    assert unchanged['version'] == ledger['version'] and unchanged['sales'][0]['rate'] == 0
    for rate in (10000, 0):
        unchanged = managers.mutate(admin, mid, '2026-11', {**payload, 'rate': rate,
            'reason': '  ', 'version': unchanged['version']})
        assert unchanged['sales'][0]['rate'] == rate
        assert unchanged['summary']['commission'] == 36000000 * rate // 10000
    cancelled = managers.mutate(admin, mid, '2026-11', dict(kind='cancel', saleId=sale['id'],
        version=unchanged['version'], reason='Synthetic cancellation'))
    with pytest.raises(ValueError):
        managers.mutate(admin, mid, '2026-11', {**payload, 'version': cancelled['version']})


def test_sale_rate_closed_snapshot_stays_frozen_after_reopen_and_correction(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    ledger, sale, _ = posted_sale(bank)
    closed = managers.mutate(admin, mid, '2026-11', dict(kind='close', version=ledger['version'], reason='Synthetic close'))
    with db.transaction() as conn:
        snapshot = conn.execute('SELECT data_json FROM manager_snapshots WHERE manager_id=?', (mid,)).fetchone()[0]
    payload = dict(kind='sale_rate', saleId=sale['id'], version=closed['version'], rate=500)
    for preview in (False, True):
        with pytest.raises(ManagerConflict):
            managers.mutate(admin, mid, '2026-11', payload, preview=preview)
    reopened = managers.mutate(admin, mid, '2026-11', dict(kind='reopen', version=closed['version'], reason='Explicit correction'))
    saved = managers.mutate(admin, mid, '2026-11', {**payload, 'version': reopened['version'], 'reason': 'Agreed individual commission'})
    assert saved['summary']['commission'] == 1800000
    with db.transaction() as conn:
        assert conn.execute('SELECT data_json FROM manager_snapshots WHERE manager_id=?', (mid,)).fetchone()[0] == snapshot
        audit = conn.execute("SELECT reason FROM manager_audit WHERE kind='sale_rate'").fetchone()[0]
        assert audit == 'Agreed individual commission'
    assert json.loads(snapshot)['sales'][0]['rate'] == 0


def test_two_rate_corrections_with_one_preview_version_cannot_overwrite_each_other(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    ledger, sale, _ = posted_sale(bank)
    start = Barrier(2)
    repositories = [ManagerRepository(WebDatabase(db.db_path)) for _ in range(2)]
    def update(index):
        start.wait(timeout=10)
        try:
            return repositories[index].mutate(admin, mid, '2026-11', dict(kind='sale_rate',
                saleId=sale['id'], version=ledger['version'], rate=(index + 1) * 500))
        except ManagerConflict as exc:
            return exc
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(update, range(2)))
    assert sum(isinstance(result, ManagerConflict) for result in results) == 1
    with db.transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM manager_audit WHERE kind='sale_rate'").fetchone()[0] == 1
    assert managers.dashboard(admin, mid, '2026-11')['version'] == ledger['version'] + 1
