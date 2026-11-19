"""Focused SQLite coverage for moving one existing compensation ledger row."""
import json
import sqlite3

import pytest

from stock_sync_web.bank_assignment_repository import BankAssignmentRepository
from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository
from tests.test_bank_repository import bank, selected
from tests.support.bank_statement_fixture import make_statement


def _target(db, managers, admin, seller, *, terms=True):
    user_id = db.create_user(username='transfer-target', password='synthetic-password', role='user')
    user = db.get_user_by_id(user_id)
    account = managers.dashboard(user, None, '2026-11')['account']['id']
    assert account != user_id
    if terms:
        managers.mutate(admin, account, '2026-11', dict(kind='terms', version=0, plan=0,
            fixed=0, rate=1000, mode='always', reason='Synthetic target terms'))
    return account


def _committed_sale(db, repo, managers, admin, mid, account):
    upload = repo.upload(admin, account, 'transfer.xlsx', make_statement())
    repo.commit(admin, selected(upload), 'transfer-source')
    return managers.dashboard(admin, mid, '2026-11')['sales'][0]


def _linked_client(db, sale_id):
    with db.transaction() as conn:
        return conn.execute('SELECT client_id FROM bank_sale_links WHERE sale_id=?', (sale_id,)).fetchone()[0]


def _transfer(db, managers, admin, sale_id, source_id, target_id, *, crm_client_id=None, reason='Synthetic transfer'):
    source = managers.dashboard(admin, source_id, '2026-11')
    target = managers.dashboard(admin, target_id, '2026-11')
    with db.transaction(immediate=True) as conn:
        return managers.transfer_sale_in_transaction(conn, admin, sale_id, target_id,
            source['version'], target['version'], reason, crm_client_id=crm_client_id)


def test_bank_sale_transfer_preserves_row_and_recalculates_both_managers(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    sale = _committed_sale(db, repo, managers, admin, mid, account)
    target_id = _target(db, managers, admin, seller)
    client_id = _linked_client(db, sale['id'])
    BankAssignmentRepository(db).set_assignment(admin, client_id, target_id, '2026-11-06',
                                                 'Synthetic reassignment', 1)
    with db.transaction() as conn:
        before = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale['id'],)).fetchone())
        before_link = dict(conn.execute('SELECT * FROM bank_sale_links WHERE sale_id=?', (sale['id'],)).fetchone())
        company_before = conn.execute('SELECT COUNT(*),SUM(amount) FROM manager_sales').fetchone()
    result = _transfer(db, managers, admin, sale['id'], mid, target_id, crm_client_id=client_id)
    assert result['saleId'] == sale['id'] and result['effects'][0]['managerId'] == mid
    assert result['effects'][1]['managerId'] == target_id
    assert result['effects'][0]['before']['salesTotal'] - result['effects'][0]['after']['salesTotal'] == before['amount']
    assert result['effects'][1]['after']['salesTotal'] - result['effects'][1]['before']['salesTotal'] == before['amount']
    assert result['effects'][1]['after']['commission'] == (before['amount'] * before['rate'] + 5000) // 10000
    with db.transaction() as conn:
        after = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale['id'],)).fetchone())
        after_link = dict(conn.execute('SELECT * FROM bank_sale_links WHERE sale_id=?', (sale['id'],)).fetchone())
        company_after = conn.execute('SELECT COUNT(*),SUM(amount) FROM manager_sales').fetchone()
        audit = [dict(r) for r in conn.execute("SELECT manager_id,kind,before_json,after_json FROM manager_audit WHERE kind LIKE 'transfer_%' ORDER BY id")]
        bank_audit = conn.execute('SELECT COUNT(*) FROM bank_decision_audit WHERE operation_id=?', (before_link['operation_id'],)).fetchone()[0]
    for key in ('id', 'date', 'month', 'client', 'amount', 'rate', 'source', 'external_id',
                'invoice_number', 'invoice_date', 'cancelled', 'crm_client_id', 'bank_operation_id'):
        if key not in ('crm_client_id',):
            assert after[key] == before[key]
    assert after['manager_id'] == target_id
    assert after_link['operation_id'] == before_link['operation_id'] and after_link['sale_id'] == before_link['sale_id']
    assert after_link['client_id'] == before_link['client_id'] and after_link['amount'] == before_link['amount']
    assert after_link['kind'] == before_link['kind'] and after_link['manager_id'] == target_id
    assert tuple(company_after) == tuple(company_before)
    assert [entry['kind'] for entry in audit] == ['transfer_out', 'transfer_in']
    assert bank_audit == 2
    with db.transaction() as conn:
        latest_bank_audit = json.loads(conn.execute('''SELECT after_json FROM bank_decision_audit
            WHERE operation_id=? ORDER BY id DESC LIMIT 1''', (before_link['operation_id'],)).fetchone()[0])
    assert latest_bank_audit['action'] == 'sale_transfer'
    assert managers.dashboard(admin, mid, '2026-11')['version'] == 8
    assert managers.dashboard(admin, target_id, '2026-11')['version'] == 2


def test_preview_performs_no_manager_sales_writes_and_matches_transfer(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    sale = _committed_sale(db, repo, managers, admin, mid, account)
    target_id = _target(db, managers, admin, seller)
    client_id = _linked_client(db, sale['id'])
    BankAssignmentRepository(db).set_assignment(admin, client_id, target_id, '2026-11-06', 'Reassign', 1)
    source_before = managers.dashboard(admin, mid, '2026-11')
    target_before = managers.dashboard(admin, target_id, '2026-11')
    with db.transaction(immediate=True) as conn:
        audit_before = conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0]
        versions_before = [tuple(row) for row in conn.execute(
            'SELECT manager_id,version FROM manager_periods WHERE manager_id IN (?,?) ORDER BY manager_id', (mid,target_id))]
        def deny_ledger_write(action, table, column, database, trigger):
            if table == 'manager_sales' and action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE):
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK
        conn.set_authorizer(deny_ledger_write)
        try:
            preview = managers.transfer_sale_in_transaction(conn, admin, sale['id'], target_id,
                source_before['version'], target_before['version'], 'Preview only',
                crm_client_id=client_id, preview=True)
        finally:
            # Python 3.10 cannot disable an authorizer by passing None.
            conn.set_authorizer(lambda *args: sqlite3.SQLITE_OK)
        assert conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0] == audit_before
        assert [tuple(row) for row in conn.execute(
            'SELECT manager_id,version FROM manager_periods WHERE manager_id IN (?,?) ORDER BY manager_id', (mid,target_id))] == versions_before
        assert conn.execute('SELECT manager_id FROM manager_sales WHERE id=?', (sale['id'],)).fetchone()[0] == mid
    committed = _transfer(db, managers, admin, sale['id'], mid, target_id, crm_client_id=client_id)
    assert preview['effects'] == committed['effects']


def test_same_manager_is_noop_and_manual_sale_can_attach_explicit_crm(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    sale = _committed_sale(db, repo, managers, admin, mid, account)
    source = managers.dashboard(admin, mid, '2026-11')
    with db.transaction(immediate=True) as conn:
        noop = managers.transfer_sale_in_transaction(conn, admin, sale['id'], mid,
            source['version'], source['version'], 'No-op')
    assert noop['effects'] == []

    target_id = _target(db, managers, admin, seller)
    # A manual row with no CRM identity can be explicitly attached while moving.
    managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=source['version'],
        date='2026-11-10', client='Synthetic document client 1', amount=12345, rate=777,
        reason='Synthetic manual sale'))
    manual_id = managers.dashboard(admin, mid, '2026-11')['sales'][0]['id']
    BankAssignmentRepository(db).set_assignment(admin, clients[1], target_id, '2026-11-10',
                                                 'Synthetic reassignment', 1)
    _transfer(db, managers, admin, manual_id, mid, target_id, crm_client_id=clients[1])
    with db.transaction() as conn:
        row = conn.execute('SELECT * FROM manager_sales WHERE id=?', (manual_id,)).fetchone()
    assert row['manager_id'] == target_id and row['crm_client_id'] == clients[1]
    assert row['client'] == 'Synthetic document client 1' and row['rate'] == 777 and row['source'] == 'manual'


def test_same_manager_preview_then_commit_attaches_explicit_client_without_financial_change(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1,
        date='2026-11-10', client='Synthetic document client 1', amount=12345, rate=777,
        reason='Synthetic manual sale'))
    sale_id = managers.dashboard(admin, mid, '2026-11')['sales'][0]['id']
    before = managers.dashboard(admin, mid, '2026-11')
    with db.transaction(immediate=True) as conn:
        audit_before = conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0]
        preview = managers.transfer_sale_in_transaction(conn, admin, sale_id, mid,
            before['version'], before['version'], 'Attach existing client',
            crm_client_id=clients[1], preview=True)
        assert conn.execute('SELECT crm_client_id FROM manager_sales WHERE id=?', (sale_id,)).fetchone()[0] is None
        assert conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0] == audit_before
    assert preview['effects'] == []
    committed = _transfer(db, managers, admin, sale_id, mid, mid,
                          crm_client_id=clients[1], reason='Attach existing client')
    after = managers.dashboard(admin, mid, '2026-11')
    with db.transaction() as conn:
        sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
        audit = json.loads(conn.execute("SELECT after_json FROM manager_audit WHERE kind='sale' ORDER BY id DESC LIMIT 1").fetchone()[0])
    assert committed['effects'] == []
    assert after['summary'] == before['summary']
    assert sale['crm_client_id'] == clients[1] and sale['client'] == 'Synthetic document client 1'
    assert sale['rate'] == 777 and sale['source'] == 'manual' and sale['amount'] == 12345
    assert audit['version'] == before['version'] + 1 and audit['sale']['crm_client_id'] == clients[1]


def test_unlinked_onec_sale_can_move_without_target_terms(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1,
        date='2026-11-10', client='Synthetic document client 2', amount=12345, rate=321,
        reason='Synthetic imported sale'))
    sale_id = managers.dashboard(admin, mid, '2026-11')['sales'][0]['id']
    with db.transaction() as conn:
        conn.execute("UPDATE manager_sales SET source='onec',external_id='synthetic-onec-1' WHERE id=?", (sale_id,))
    target_id = _target(db, managers, admin, seller, terms=False)
    BankAssignmentRepository(db).set_assignment(admin, clients[2], target_id, '2026-11-10', 'Reassign', 1)
    _transfer(db, managers, admin, sale_id, mid, target_id, crm_client_id=clients[2])
    with db.transaction() as conn:
        sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
    assert sale['manager_id'] == target_id and sale['source'] == 'onec'
    assert sale['external_id'] == 'synthetic-onec-1' and sale['rate'] == 321
    assert managers.dashboard(admin, target_id, '2026-11')['summary']['commission'] is None


def test_target_record_limit_rolls_back_transfer(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    sale = _committed_sale(db, repo, managers, admin, mid, account)
    target_id = _target(db, managers, admin, seller)
    client_id = _linked_client(db, sale['id'])
    BankAssignmentRepository(db).set_assignment(admin, client_id, target_id, '2026-11-06', 'Reassign', 1)
    with db.transaction() as conn:
        conn.executemany('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,created_by,updated_at)
            VALUES(?,?,?,?,?,?,?,?)''', [(target_id, '2026-11', '2026-11-01', 'Synthetic filler', 0, 0,
                                           admin['id'], 'test') for _ in range(10000)])
    with pytest.raises(ValueError, match='10 000'):
        _transfer(db, managers, admin, sale['id'], mid, target_id, crm_client_id=client_id)
    with db.transaction() as conn:
        assert conn.execute('SELECT manager_id FROM manager_sales WHERE id=?', (sale['id'],)).fetchone()[0] == mid


@pytest.mark.parametrize('failure', ['closed', 'inactive', 'cancelled', 'stale', 'target_terms_missing'])
def test_transfer_rejects_invalid_state_atomically(bank, failure):
    db, repo, admin, seller, managers, mid, account, clients = bank
    sale = _committed_sale(db, repo, managers, admin, mid, account)
    target_id = _target(db, managers, admin, seller, terms=failure != 'target_terms_missing')
    client_id = _linked_client(db, sale['id'])
    BankAssignmentRepository(db).set_assignment(admin, client_id, target_id, '2026-11-06', 'Reassign', 1)
    if failure == 'closed':
        managers.mutate(admin, target_id, '2026-11', dict(kind='close', version=1, reason='Synthetic close'))
    elif failure == 'inactive':
        target_user_id = managers.dashboard(admin, target_id, '2026-11')['account']['userId']
        with db.transaction() as conn:
            conn.execute('UPDATE users SET is_active=0 WHERE id=?', (target_user_id,))
    elif failure == 'cancelled':
        source = managers.dashboard(admin, mid, '2026-11')
        managers.mutate(admin, mid, '2026-11', dict(kind='cancel', version=source['version'], saleId=sale['id'], reason='Cancel'))
    source = managers.dashboard(admin, mid, '2026-11')
    target = managers.dashboard(admin, target_id, '2026-11')
    source_version = source['version']
    if failure == 'stale':
        source_version -= 1
    with pytest.raises((ManagerConflict, ValueError)):
        with db.transaction(immediate=True) as conn:
            managers.transfer_sale_in_transaction(conn, admin, sale['id'], target_id,
                source_version, target['version'], 'Expected rejection', crm_client_id=client_id)
    with db.transaction() as conn:
        stored = conn.execute('SELECT manager_id FROM manager_sales WHERE id=?', (sale['id'],)).fetchone()[0]
        assert stored == mid
