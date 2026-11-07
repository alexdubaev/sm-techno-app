"""Synthetic integration checks for schema and the sales attribution boundary."""
import json
import sqlite3

import pytest

from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerRepository, ManagerConflict
from stock_sync_web.bank_assignment_repository import BankAssignmentRepository


def test_bank_schema_clean_and_repeated_initialization(tmp_path):
    db = WebDatabase(tmp_path / 'clean.db')
    expected = {'bank_import_accounts', 'bank_uploads', 'bank_source_rows', 'bank_operations',
                'bank_decisions', 'bank_decision_audit', 'bank_sale_links', 'bank_commits', 'bank_company_sales',
                'crm_sales_assignments', 'crm_sales_assignment_versions', 'crm_sales_assignment_audit'}
    with db.connect() as conn:
        assert expected <= {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    db.initialize()
    with db.connect() as conn:
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert {'crm_client_id', 'bank_operation_id'} <= {r['name'] for r in conn.execute('PRAGMA table_info(manager_sales)')}


@pytest.fixture
def ledger(tmp_path):
    db = WebDatabase(tmp_path / 'foundation.db')
    admin_id = db.create_user(username='synthetic-admin', password='synthetic-password', role='admin')
    user_id = db.create_user(username='synthetic-manager', password='synthetic-password', role='user')
    # Deliberately separate the account sequence from users.id.
    with db.transaction() as conn:
        conn.execute("INSERT INTO manager_accounts(id,display_name) VALUES(100,'Archived synthetic')")
        client_id = conn.execute("INSERT INTO crm_clients(name,document_name,full_name,inn,created_at,updated_at) VALUES('Internal','Synthetic legal document','Synthetic full name','9900000017','now','now')").lastrowid
    repository = ManagerRepository(db)
    admin, user = db.get_user_by_id(admin_id), db.get_user_by_id(user_id)
    manager_id = repository.dashboard(user, None, '2026-11')['account']['id']
    repository.mutate(admin, manager_id, '2026-11', dict(kind='terms', version=0, reason='Synthetic terms', plan=0, fixed=0, rate=500, mode='always'))
    return db, repository, admin, user, manager_id, client_id


def test_generic_editor_cannot_rewrite_a_bank_sale_but_cancellation_is_audited(ledger):
    db, repository, admin, _, manager_id, _ = ledger
    with db.transaction() as conn:
        sale_id = conn.execute("""INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,source,external_id,created_by,updated_at)
                        VALUES(?,'2026-11','2026-11-03','Synthetic',36000000,500,'bank_statement','bank-test',?,'now')""", (manager_id, admin['id'])).lastrowid
    payload = dict(kind='sale', version=1, reason='Attempt rewrite', saleId=sale_id, date='2026-11-03', client='Changed', amount=1, rate=0)
    with pytest.raises(ManagerConflict, match='банковск'):
        repository.mutate(admin, manager_id, '2026-11', payload)
    result = repository.mutate(admin, manager_id, '2026-11', dict(kind='cancel', version=1, reason='Synthetic correction', saleId=sale_id))
    assert result['summary']['salesTotal'] == 0
    assert repository.history(admin, manager_id, '2026-11')['items'][0]['kind'] == 'cancel'


def test_legacy_migration_preserves_all_sales_fields_sequence_and_snapshots(tmp_path):
    class LegacyDatabase(WebDatabase):
        WEB_MIGRATIONS = tuple(m for m in WebDatabase.WEB_MIGRATIONS if 'bank' not in m[0])

    path = tmp_path / 'legacy.db'
    db = LegacyDatabase(path)
    with db.transaction() as conn:
        manager_id = conn.execute("INSERT INTO manager_accounts(display_name) VALUES('Synthetic')").lastrowid
        conn.execute("INSERT INTO manager_periods(manager_id,month,plan,fixed,rate,mode,version,closed) VALUES(?,'2026-11',0,0,500,'always',6,1)", (manager_id,))
        conn.execute("""INSERT INTO manager_sales(id,manager_id,month,date,client,amount,rate,cancelled,
                     source,external_id,created_by,updated_at,invoice_number,invoice_date)
                     VALUES(17,?,'2026-11','2026-11-03','Synthetic document',36000000,500,0,
                     'onec','legacy-id',7,'stored','255','2026-09-09')""", (manager_id,))
        conn.execute("INSERT INTO manager_sales(id,manager_id,month,date,client,amount,rate,created_by,updated_at) VALUES(900,?,'2026-11','2026-11-04','Deleted',1,0,7,'stored')", (manager_id,))
        conn.execute('DELETE FROM manager_sales WHERE id=900')
        conn.execute('CREATE INDEX synthetic_sales_invoice ON manager_sales(invoice_number)')
        conn.execute("INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json) VALUES(?,'2026-11',7,'Synthetic','old','close','reason','{}','{}')", (manager_id,))
        conn.execute("INSERT INTO manager_snapshots(manager_id,month,at,actor_name,version,data_json) VALUES(?,'2026-11','old','Synthetic',6,?)", (manager_id, json.dumps({'saved': 'unchanged'})))
        old_sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=17').fetchone())
    upgraded = WebDatabase(path)
    upgraded.initialize()
    with upgraded.transaction() as conn:
        row = dict(conn.execute('SELECT * FROM manager_sales WHERE id=17').fetchone())
        assert {k: row[k] for k in old_sale} == old_sale
        assert row['crm_client_id'] is None and row['bank_operation_id'] is None
        assert conn.execute("SELECT seq FROM sqlite_sequence WHERE name='manager_sales'").fetchone()[0] == 900
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE name='synthetic_sales_invoice'").fetchone()
        assert conn.execute('SELECT data_json FROM manager_snapshots').fetchone()[0] == json.dumps({'saved': 'unchanged'})
        assert conn.execute('SELECT version,closed FROM manager_periods').fetchone()[:] == (6, 1)
        assert conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0] == 1
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()


def test_assignment_intervals_backdating_removal_history_and_sales_unchanged(ledger):
    db, repository, admin, user, manager_id, client_id = ledger
    assignments = BankAssignmentRepository(db)
    other_id = db.create_user(username='other-manager', password='synthetic-password', role='user')
    other_manager = repository.dashboard(db.get_user_by_id(other_id), None, '2026-11')['account']['id']
    assert manager_id != user['id']
    sale = repository.mutate(admin, manager_id, '2026-11', dict(kind='sale', version=1, date='2026-11-03', client='Synthetic old', amount=36000000, rate=500))
    first = assignments.set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial synthetic attribution', 0)
    assert first['version'] == 1
    assignments.set_assignment(admin, client_id, other_manager, '2026-11-10', 'Transfer', 1)
    assignments.set_assignment(admin, client_id, other_manager, '2026-10-01', 'Backfill earlier gap', 2)
    assignments.set_assignment(admin, client_id, None, '2026-11-05', 'Remove in this interval', 3)
    assert assignments.client_assignment(admin, client_id, '2026-10-15')['assignment']['managerId'] == other_manager
    assert assignments.client_assignment(admin, client_id, '2026-11-04')['assignment']['managerId'] == manager_id
    assert assignments.client_assignment(admin, client_id, '2026-11-05')['assignment']['managerId'] is None
    assert assignments.client_assignment(admin, client_id, '2026-11-10')['assignment']['managerId'] == other_manager
    assert len(assignments.client_assignment(admin, client_id)['history']) == 4
    assert repository.dashboard(admin, manager_id, '2026-11')['sales'][0] == sale['sales'][0]
    with db.transaction() as conn:
        with pytest.raises(sqlite3.IntegrityError, match='overlap'):
            conn.execute("""INSERT INTO crm_sales_assignments(client_id,manager_id,start_date,end_date,created_by,created_at,updated_by,updated_at,reason)
                        VALUES(?,?,'2026-11-03','2026-11-08',?,'now',?,'now','Forbidden overlap')""", (client_id, manager_id, admin['id'], admin['id']))


def test_assignments_admin_version_activity_and_archive_guards(ledger):
    db, _, admin, user, manager_id, client_id = ledger
    assignments = BankAssignmentRepository(db)
    with pytest.raises(PermissionError):
        assignments.set_assignment(user, client_id, manager_id, '2026-11-01', 'Forbidden', 0)
    with pytest.raises(ValueError):
        assignments.set_assignment(admin, client_id, manager_id, '', 'Missing date', 0)
    with pytest.raises(ValueError):
        assignments.set_assignment(admin, client_id, manager_id, '2026-11-01', '', 0)
    assignments.set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial', 0)
    with pytest.raises(ManagerConflict):
        assignments.set_assignment(admin, client_id, None, '2026-11-01', 'Stale', 0)
    with db.transaction() as conn:
        conn.execute('UPDATE users SET is_active=0 WHERE id=?', (user['id'],))
    with pytest.raises(ManagerConflict):
        assignments.set_assignment(admin, client_id, manager_id, '2026-11-02', 'Inactive', 1)
    with db.transaction() as conn:
        conn.execute('UPDATE crm_clients SET crm_archived_at=? WHERE id=?', ('now', client_id))
    with pytest.raises(ManagerConflict):
        assignments.set_assignment(admin, client_id, None, '2026-11-02', 'Archived', 1)


def test_account_confirmation_requires_existing_organization_and_exact_known_inn(ledger):
    db, _, admin, user, _, _ = ledger
    assignments = BankAssignmentRepository(db)
    with db.transaction() as conn:
        org_id = conn.execute("INSERT INTO organizations(onec_key,name,inn,updated_at) VALUES('synthetic-org','Synthetic organization','9900000017','now')").lastrowid
    with pytest.raises(PermissionError):
        assignments.confirm_account(user, org_id, '9900000017', '00000000000000000001', '000000001', 'Forbidden')
    with pytest.raises(ValueError):
        assignments.confirm_account(admin, org_id, '990000000041', '00000000000000000001', '000000001', 'Wrong owner')
    account = assignments.confirm_account(admin, org_id, '9900000017', '00000000000000000001', '000000001', 'Explicit import setting')
    assert account['organizationId'] == org_id and account['account'] == '00000000000000000001'
    assert assignments.confirm_account(admin, org_id, '9900000017', account['account'], account['bik'], 'Same confirmed setting')['id'] == account['id']


def seed_operation(db, admin, amount=36000000, document='synthetic-payment'):
    with db.transaction() as conn:
        org_id = conn.execute("INSERT INTO organizations(onec_key,name,inn,updated_at) VALUES(?, 'Synthetic organization','9900000017','now')", (document,)).lastrowid
    account = BankAssignmentRepository(db).confirm_account(admin, org_id, '9900000017', '00000000000000000001', '000000001', 'Synthetic setting')
    with db.transaction() as conn:
        return conn.execute('''INSERT INTO bank_operations(account_id,organization_id,our_account,currency,direction,
            date,document_number,payer_name,inn,amount,credit,purpose,strict_key,probable_key,created_at)
            VALUES(?,?,?,'RUB','credit','2026-11-03',?,'Synthetic payer','9900000017',?,?,'Оплата товара с НДС',?,?,'now')''',
            (account['id'], org_id, account['account'], document, amount, amount, document, document)).lastrowid


def test_bank_helper_uses_gross_amount_current_terms_document_name_and_audit(ledger):
    db, repository, admin, _, manager_id, client_id = ledger
    BankAssignmentRepository(db).set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial', 0)
    operation_id = seed_operation(db, admin)
    with db.transaction(immediate=True) as conn:
        result = repository._mutate_in_transaction(conn, admin, manager_id, '2026-11',
            dict(kind='sale', version=1, reason='Synthetic import', date='2026-11-03',
                 client='Ignored internal name', amount=36000000, rate=500, invoiceNumber='216', invoiceDate='2026-09-09'),
            bank_operation_id=operation_id, crm_client_id=client_id)
        sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (result['changedSaleId'],)).fetchone())
    assert sale['amount'] == 36000000 and sale['rate'] == 500
    assert sale['date'] == '2026-11-03' and sale['month'] == '2026-11'
    assert sale['client'] == 'Synthetic legal document' and sale['source'] == 'bank_statement'
    assert sale['crm_client_id'] == client_id and sale['bank_operation_id'] == operation_id
    assert result['summary']['commission'] == 1800000 and result['version'] == 2
    audit = repository.history(admin, manager_id, '2026-11')['items'][0]
    assert audit['after']['sale']['source'] == 'bank_statement'
    with db.transaction() as conn:
        with pytest.raises(sqlite3.IntegrityError, match='immutable'):
            conn.execute('UPDATE bank_operations SET amount=1 WHERE id=?', (operation_id,))


def test_shared_transaction_rolls_back_first_sale_version_and_audit_when_later_row_fails(ledger):
    db, repository, admin, _, manager_id, client_id = ledger
    BankAssignmentRepository(db).set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial', 0)
    first_op = seed_operation(db, admin, document='first')
    second_op = seed_operation(db, admin, document='second')
    before_audits = repository.history(admin, manager_id, '2026-11')['total']
    with pytest.raises(ManagerConflict, match='Ставка'):
        with db.transaction(immediate=True) as conn:
            repository._mutate_in_transaction(conn, admin, manager_id, '2026-11',
                dict(kind='sale', version=1, date='2026-11-03', client='Synthetic', amount=36000000, rate=500),
                bank_operation_id=first_op, crm_client_id=client_id)
            repository._mutate_in_transaction(conn, admin, manager_id, '2026-11',
                dict(kind='sale', version=2, date='2026-11-03', client='Synthetic', amount=36000000, rate=0),
                bank_operation_id=second_op, crm_client_id=client_id)
    data = repository.dashboard(admin, manager_id, '2026-11')
    assert data['total'] == 0 and data['version'] == 1
    assert repository.history(admin, manager_id, '2026-11')['total'] == before_audits


def test_pending_assignment_refresh_invalidates_only_affected_unposted_decisions(ledger):
    db, _, admin, _, manager_id, client_id = ledger
    operation_id = seed_operation(db, admin)
    with db.transaction() as conn:
        conn.execute("INSERT INTO bank_decisions(operation_id,client_id,classification,fingerprint,updated_at) VALUES(?,?,'sale','old-preview','now')", (operation_id, client_id))
    refreshed = []
    def refresh(conn, target_client_id):
        refreshed.append(target_client_id)
        conn.execute("UPDATE bank_decisions SET manager_id=?,rate=500,status='ready' WHERE operation_id=?", (manager_id, operation_id))
    result = BankAssignmentRepository(db).set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial', 0, refresh_pending=refresh)
    assert result['pending'] == dict(count=1, amount=36000000, periodStart='2026-11-03', periodEnd='2026-11-03')
    assert refreshed == [client_id]
    with db.connect() as conn:
        decision = conn.execute('SELECT * FROM bank_decisions WHERE operation_id=?', (operation_id,)).fetchone()
        assert decision['version'] == 2 and decision['fingerprint'] == '' and decision['manager_id'] == manager_id
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0


def test_existing_sale_link_is_exposed_without_rewriting_source_and_preserved_on_cancel(ledger):
    db, repository, admin, _, manager_id, client_id = ledger
    operation_id = seed_operation(db, admin)
    sale = repository.mutate(admin, manager_id, '2026-11', dict(kind='sale', version=1,
        date='2026-11-03', client='Synthetic old', amount=36000000, rate=500))['sales'][0]
    with db.transaction() as conn:
        conn.execute('''INSERT INTO bank_sale_links(operation_id,sale_id,client_id,manager_id,amount,kind,
            linked_by,linked_at,reason) VALUES(?,?,?,?,?,'existing',?,'now','Synthetic bank confirmation')''',
            (operation_id, sale['id'], client_id, manager_id, 36000000, admin['id']))
    linked = repository.dashboard(admin, manager_id, '2026-11')['sales'][0]
    assert linked['source'] == 'manual' and linked['bankOperationId'] == operation_id
    with pytest.raises(ManagerConflict, match='банковск'):
        repository.mutate(admin, manager_id, '2026-11', dict(kind='sale', version=2, reason='Forbidden edit',
            saleId=sale['id'], date='2026-11-03', client='Changed', amount=1, rate=0))
    cancelled = repository.mutate(admin, manager_id, '2026-11', dict(kind='cancel', version=2,
        saleId=sale['id'], reason='Synthetic correction'))['sales'][0]
    assert cancelled['cancelled'] and cancelled['bankOperationId'] == operation_id
    with db.connect() as conn:
        assert conn.execute('SELECT sale_id FROM bank_sale_links WHERE operation_id=?', (operation_id,)).fetchone()[0] == sale['id']


def existing_sale_to_confirm(ledger):
    db, repository, admin, _, manager_id, client_id = ledger
    BankAssignmentRepository(db).set_assignment(admin, client_id, manager_id, '2026-11-01', 'Initial', 0)
    operation_id = seed_operation(db, admin)
    sale_id = repository.mutate(admin, manager_id, '2026-11', dict(kind='sale', version=1,
        date='2026-11-03', client='Synthetic legal document', amount=36000000, rate=400))['sales'][0]['id']
    with db.transaction() as conn:
        conn.execute('''INSERT INTO bank_decisions(operation_id,client_id,manager_id,rate,classification,status,updated_at)
            VALUES(?,?,?,500,'sale','ready','now')''', (operation_id, client_id, manager_id))
    return operation_id, sale_id


@pytest.mark.parametrize('source', ['manual', 'onec'])
def test_bank_link_common_ledger_audit_increments_version_without_rewriting_sale(ledger, source):
    db, repository, admin, _, manager_id, client_id = ledger
    operation_id, sale_id = existing_sale_to_confirm(ledger)
    with db.transaction() as conn:
        conn.execute('UPDATE manager_sales SET source=?,external_id=? WHERE id=?', (source, 'synthetic-legacy', sale_id))
        original = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
    before = repository.dashboard(admin, manager_id, '2026-11')
    with db.transaction(immediate=True) as conn:
        result = repository.record_bank_link_in_transaction(conn, admin, manager_id, '2026-11', 2, sale_id,
                                                            'Confirm synthetic bank payment', operation_id)
        conn.execute('''INSERT INTO bank_sale_links(operation_id,sale_id,client_id,manager_id,amount,kind,
            linked_by,linked_at,reason) VALUES(?,?,?,?,?,'existing',?,'now','Synthetic confirmation')''',
            (operation_id, sale_id, client_id, manager_id, 36000000, admin['id']))
        assert dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone()) == original
    assert result['version'] == 3 and result['summary'] == before['summary']
    audit = repository.history(admin, manager_id, '2026-11')['items'][0]
    assert audit['kind'] == 'bank_link' and audit['reason'] == 'Confirm synthetic bank payment'
    assert audit['before']['sale'] == audit['after']['sale']
    assert audit['after']['sale']['rate'] == 400 and audit['after']['sale']['source'] == source
    assert audit['before']['summary'] == audit['after']['summary']
    assert audit['after']['bankOperationId'] == operation_id


@pytest.mark.parametrize('invalid', ['stale', 'closed', 'duplicate', 'different_client', 'nonadmin', 'missing_reason'])
def test_bank_link_validation_failure_keeps_period_and_sale_unchanged(ledger, invalid):
    db, repository, admin, user, manager_id, client_id = ledger
    operation_id, sale_id = existing_sale_to_confirm(ledger)
    with db.transaction() as conn:
        if invalid == 'closed':
            conn.execute("UPDATE manager_periods SET closed=1 WHERE manager_id=? AND month='2026-11'", (manager_id,))
        if invalid == 'duplicate':
            conn.execute('''INSERT INTO bank_sale_links(operation_id,sale_id,client_id,manager_id,amount,kind,
                linked_by,linked_at,reason) VALUES(?,?,?,?,?,'existing',?,'now','Already linked')''',
                (operation_id, sale_id, client_id, manager_id, 36000000, admin['id']))
        if invalid == 'different_client':
            conn.execute("UPDATE manager_sales SET client='Different synthetic client' WHERE id=?", (sale_id,))
        original = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
        audit_count = conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0]
    with pytest.raises((ManagerConflict, PermissionError, ValueError)):
        with db.transaction(immediate=True) as conn:
            repository.record_bank_link_in_transaction(conn, user if invalid == 'nonadmin' else admin,
                manager_id, '2026-11', 1 if invalid == 'stale' else 2, sale_id,
                '' if invalid == 'missing_reason' else 'Synthetic confirmation', operation_id)
    with db.connect() as conn:
        assert dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone()) == original
        assert conn.execute('SELECT COUNT(*) FROM manager_audit').fetchone()[0] == audit_count
        assert conn.execute("SELECT version FROM manager_periods WHERE manager_id=? AND month='2026-11'", (manager_id,)).fetchone()[0] == 2
