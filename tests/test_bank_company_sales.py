"""Company receipts and manager attribution over real isolated SQLite/storage."""
import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from stock_sync_web.admin_dashboard import sales_overview
from stock_sync_web.bank_repository import BankRepository
from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository
from tests.test_bank_repository import bank  # shared synthetic integration setup
from tests.support.bank_statement_fixture import make_statement


def item(operation):
    return dict(operationId=operation['id'], version=operation['version'], fingerprint=operation['fingerprint'])


def remove_assignment(db, client):
    with db.transaction() as conn:
        conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (client,))


def overview(db, kind='month', day='2026-11-06'):
    return sales_overview(db, kind, day)


def test_company_only_receipt_then_manager_posting_is_one_general_sale(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'company.xlsx', make_statement())
    op = detail['operations'][0]
    assert op['status'] == 'manager_missing' and op['companyCanConfirm']
    preview = repo.preview(admin, [item(op)])
    assert (preview['companyCount'], preview['companyAmount'], preview['managerCount'], preview['pendingManagerCount']) == (1, 36000000, 0, 1)
    assert preview['effects'] == []
    result = repo.commit(admin, [item(op)], 'company-only-key')
    assert result['createdCount'] == 0 and result['saleIds'] == []
    assert repo.commit(admin, [item(op)], 'company-only-key') == result
    assert managers.dashboard(admin, mid, '2026-11')['summary']['count'] == 0
    totals = overview(db)
    assert totals['totals'] == dict(salesTotal=36000000, count=1, unallocatedSalesTotal=36000000, unallocatedCount=1)
    assert totals['sources']['bankCount'] == 1 and totals['sources']['manualCount'] == 0
    saved = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert saved['companyAccounted'] and not saved['companyCanConfirm']
    with pytest.raises(ManagerConflict):
        repo.commit(admin, [item(saved)], 'already-company-new-key')
    assert repo.client(seller, clients[0])['payments'] == []
    payment = repo.client(admin, clients[0])['payments'][0]
    assert payment['companyAccounted'] and not payment['companyCancelled']
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Attribute confirmed payment', 1)
    ready = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert ready['status'] == 'ready' and ready['companyAccounted']
    later = repo.commit(admin, [item(ready)], 'manager-later-key')
    assert (later['companyCount'], later['companyAmount'], later['managerCount'], later['createdCount']) == (0, 0, 1, 1)
    assert overview(db)['totals'] == dict(salesTotal=36000000, count=1, unallocatedSalesTotal=0, unallocatedCount=0)
    ledger = managers.dashboard(admin, mid, '2026-11')
    managers.mutate(admin, mid, '2026-11', dict(kind='cancel', saleId=later['saleIds'][0], version=ledger['version'], reason='Cancel payment'))
    assert overview(db)['totals']['salesTotal'] == 0
    assert repo.refresh_upload(admin, detail['id'])['operations'][0]['companyCancelled']


@pytest.mark.parametrize('gate', ['terms_missing', 'month_closed', 'manager_inactive'])
def test_manager_gates_do_not_block_company_confirmation(bank, gate):
    db, repo, admin, seller, managers, mid, account, clients = bank
    with db.transaction() as conn:
        if gate == 'terms_missing':
            conn.execute('UPDATE manager_periods SET plan=NULL,fixed=NULL,rate=NULL,mode=NULL WHERE manager_id=?', (mid,))
        elif gate == 'month_closed':
            conn.execute('UPDATE manager_periods SET closed=1 WHERE manager_id=?', (mid,))
        else:
            conn.execute('UPDATE users SET is_active=0 WHERE id=?', (seller['id'],))
    detail = repo.upload(admin, account, 'gate.xlsx', make_statement())
    op = detail['operations'][0]
    assert op['status'] == gate and op['companyCanConfirm']
    result = repo.commit(admin, [item(op)], 'company-gate-key')
    assert result['companyCount'] == 1 and result['pendingManagerCount'] == 1 and result['createdCount'] == 0
    assert overview(db)['totals']['salesTotal'] == op['amount']


def test_company_cancel_is_audited_versioned_and_cannot_replay(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    raw = make_statement()
    detail = repo.upload(admin, account, 'cancel.xlsx', raw)
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'company-before-cancel')
    confirmed = repo.refresh_upload(admin, detail['id'])['operations'][0]
    with pytest.raises(PermissionError):
        repo.cancel_company_sale(seller, op['id'], dict(version=confirmed['version'], reason='Forbidden'))
    with pytest.raises(ManagerConflict):
        repo.cancel_company_sale(admin, op['id'], dict(version=op['version'], reason='Stale'))
    cancelled = repo.cancel_company_sale(admin, op['id'], dict(version=confirmed['version'], reason='Wrong incoming payment'))
    assert cancelled['companyCancelled'] and not cancelled['companyAccounted'] and not cancelled['companyCanConfirm']
    assert cancelled['status'] == 'accounted'
    assert overview(db)['totals']['count'] == 0
    assert repo.upload(admin, account, 'renamed.xlsx', raw)['operations'][0]['companyCancelled']
    with pytest.raises(ManagerConflict):
        repo.commit(admin, [item(cancelled)], 'new-key-cannot-replay')
    with pytest.raises(ManagerConflict):
        repo.update_operation(admin, op['id'], dict(version=cancelled['version'],
            duplicateAction='new', reason='Cancelled confirmations remain immutable'))
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_company_sales').fetchone()[0] == 1
        assert conn.execute('SELECT COUNT(*) FROM bank_decision_audit WHERE operation_id=?', (op['id'],)).fetchone()[0] == 2


def test_company_decision_is_frozen_until_manager_assignment(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'freeze.xlsx', make_statement())
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'freeze-company-key')
    confirmed = repo.refresh_upload(admin, detail['id'])['operations'][0]
    for change in [dict(clientId=clients[1]), dict(classification='excluded'), dict(invoiceNumber='changed')]:
        with pytest.raises(ManagerConflict):
            repo.update_operation(admin, op['id'], dict(version=confirmed['version'], reason='Cannot rewrite confirmation', **change))
    with db.transaction() as conn:
        conn.execute("UPDATE crm_clients SET document_name='Renamed later' WHERE id=?", (clients[0],))
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Attribute original snapshot', 1)
    ready = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert ready['clientName'] == 'Synthetic document client 0'
    repo.commit(admin, [item(ready)], 'frozen-manager-key')
    assert managers.dashboard(admin, mid, '2026-11')['sales'][0]['client'] == 'Synthetic document client 0'


def test_confirmed_company_can_resolve_later_manual_duplicate_without_new_general_sale(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'company-before-manual.xlsx', make_statement())
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'company-before-manual-key')
    manual = managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1, date=op['date'],
        client=op['clientName'], amount=op['amount'], rate=500, reason='Matching sale appeared later'))
    sale_id = manual['sales'][0]['id']
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Attribute receipt with later duplicate', 1)
    duplicate = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert duplicate['companyAccounted'] and duplicate['status'] == 'possible_duplicate'
    before = overview(db)['totals']['salesTotal']
    ready = repo.update_operation(admin, op['id'], dict(version=duplicate['version'],
        duplicateAction='link', linkSaleId=sale_id, reason='Verified same payment recorded manually'))
    assert ready['status'] == 'ready' and ready['clientName'] == op['clientName']
    preview = repo.preview(admin, [item(ready)])
    assert preview['companyCount'] == -1 and preview['companyAmount'] == -op['amount']
    result = repo.commit(admin, [item(ready)], 'link-later-manual-key')
    assert result['createdCount'] == 0 and result['linkedCount'] == 1
    assert result['companyCount'] == preview['companyCount'] and result['companyAmount'] == preview['companyAmount']
    assert overview(db)['totals']['salesTotal'] == before - op['amount'] == op['amount']
    linked = repo.refresh_upload(admin, detail['id'])['operations'][0]
    with pytest.raises(ManagerConflict):
        repo.update_operation(admin, op['id'], dict(version=linked['version'],
            duplicateAction='new', reason='Linked confirmations remain immutable'))
    with db.transaction() as conn:
        assert conn.execute('SELECT client_name FROM bank_company_sales WHERE operation_id=?', (op['id'],)).fetchone()[0] == op['clientName']
        assert conn.execute('SELECT COUNT(*) FROM bank_decision_audit WHERE operation_id=?', (op['id'],)).fetchone()[0] == 2


def test_confirmed_company_can_acknowledge_later_probable_duplicate_without_unfreezing_finances(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'company-before-overlap.xlsx', make_statement())
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'company-before-overlap-key')
    repo.upload(admin, account, 'later-overlap.xlsx', make_statement(edit=lambda s: s.__setitem__('K13', s['K13'].value + ' уточнение')))
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Attribute after later overlap', 1)
    duplicate = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert duplicate['status'] == 'possible_duplicate'
    ready = repo.update_operation(admin, op['id'], dict(version=duplicate['version'],
        duplicateAction='new', reason='Verified original is a distinct real payment'))
    assert ready['status'] == 'ready' and ready['companyAccounted']
    with pytest.raises(ManagerConflict):
        repo.update_operation(admin, op['id'], dict(version=ready['version'], duplicateAction='new',
            classification='excluded', reason='Mixed request cannot alter financial decision'))
    result = repo.commit(admin, [item(ready)], 'resolve-original-overlap-key')
    assert result['companyCount'] == result['companyAmount'] == 0 and result['createdCount'] == 1
    assert overview(db)['totals']['salesTotal'] == op['amount']


def test_duplicate_checks_precede_missing_manager_and_invalid_provenance(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1, date='2026-11-06', client='Synthetic document client 0', amount=36000000, rate=500, reason='Historical sale'))
    remove_assignment(db, clients[0])
    original = repo.upload(admin, account, 'duplicate.xlsx', make_statement())
    assert original['operations'][0]['status'] == 'possible_duplicate'
    assert not original['operations'][0]['companyCanConfirm']
    changed = repo.upload(admin, account, 'probable.xlsx', make_statement(edit=lambda s: s.__setitem__('K13', s['K13'].value + ' уточнение')))
    assert not changed['operations'][0]['companyCanConfirm']
    bad = repo.upload(admin, account, 'bad-total.xlsx', make_statement(edit=lambda s: s.__setitem__('D7', '1 000,00')))
    assert all(not o['companyCanConfirm'] for o in bad['operations'])


def test_legacy_link_changes_no_general_total_and_company_cancel_requires_domain(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    saved = managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1, date='2026-11-06', client='Synthetic document client 0', amount=36000000, rate=500, reason='Historical sale'))
    sale = saved['sales'][0]['id']
    detail = repo.upload(admin, account, 'legacy.xlsx', make_statement())
    op = detail['operations'][0]
    ready = repo.update_operation(admin, op['id'], dict(version=op['version'], duplicateAction='link', linkSaleId=sale, reason='Same payment'))
    preview = repo.preview(admin, [item(ready)])
    assert preview['companyCount'] == preview['companyAmount'] == 0 and preview['managerCount'] == 1
    result = repo.commit(admin, [item(ready)], 'legacy-company-key')
    assert result['createdCount'] == 0 and result['linkedCount'] == 1
    assert overview(db)['totals']['salesTotal'] == 36000000
    confirmed = repo.refresh_upload(admin, detail['id'])['operations'][0]
    with pytest.raises(ManagerConflict):
        repo.cancel_company_sale(admin, op['id'], dict(version=confirmed['version'], reason='Use manager domain'))


def test_atomic_mixed_company_and_manager_batch_rollback(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'mixed.xlsx', make_statement())
    items = [item(o) for o in detail['operations']]
    preview = repo.preview(admin, items)
    assert (preview['companyCount'], preview['managerCount'], preview['pendingManagerCount']) == (6, 5, 1)
    original = ManagerRepository._mutate_in_transaction
    def fail(*args, **kwargs):
        raise ValueError('Injected manager failure')
    with monkeypatch.context() as patch:
        patch.setattr(ManagerRepository, '_mutate_in_transaction', fail)
        with pytest.raises(ValueError, match='Injected'):
            repo.commit(admin, items, 'mixed-atomic-key')
    with db.transaction() as conn:
        for table in ('bank_company_sales', 'bank_sale_links', 'manager_sales', 'bank_commits', 'bank_decision_audit'):
            assert conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 0
    result = repo.commit(admin, items, 'mixed-atomic-key')
    assert result['companyAmount'] == 198906300 and result['createdCount'] == 5
    for kind in ('week', 'month', 'quarter', 'year'):
        report = overview(db, kind)
        assert report['totals']['salesTotal'] == sum(p['amount'] for p in report['series']) == 198906300
        assert report['totals']['count'] == sum(p['count'] for p in report['series']) == 6


def test_repeat_additive_migration_preserves_company_and_old_idempotency_response(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'migration.xlsx', make_statement())
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'migration-company-key')
    with db.transaction() as conn:
        company = dict(conn.execute('SELECT * FROM bank_company_sales').fetchone())
        conn.execute("DELETE FROM web_schema_migrations WHERE version='2026-11-07-bank-company-sales-v1'")
        legacy = dict(count=1, amount=36000000, createdCount=0, linkedCount=1, effects=[], saleIds=[123])
        from stock_sync_web.bank_repository import digest
        request_hash = digest(dict(actorId=admin['id'], items=[item(op)]))
        conn.execute('INSERT INTO bank_commits VALUES(?,?,?,?,?)', ('old-response-key', admin['id'], request_hash, json.dumps(legacy), 'synthetic'))
    restarted = WebDatabase(db.db_path)
    restarted.initialize()
    with restarted.transaction() as conn:
        assert dict(conn.execute('SELECT * FROM bank_company_sales').fetchone()) == company
        assert conn.execute('PRAGMA foreign_key_check').fetchall() == []
    assert BankRepository(restarted, repo.storage_root).commit(admin, [item(op)], 'old-response-key') == legacy


def test_two_admins_company_only_confirmation_has_one_winner(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    second_id = db.create_user(username='company-second-admin', password='synthetic-password', role='admin')
    second = db.get_user_by_id(second_id)
    detail = repo.upload(admin, account, 'company-race.xlsx', make_statement())
    items = [item(detail['operations'][0])]
    def confirm(actor, key):
        isolated = BankRepository(WebDatabase(db.db_path), repo.storage_root)
        try:
            return isolated.commit(actor, items, key)['companyCount']
        except ManagerConflict:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda pair: confirm(*pair), [(admin, 'company-race-first'), (second, 'company-race-second')]))
    assert sorted(map(str, outcomes)) == ['1', 'conflict']
    assert overview(db)['totals']['count'] == 1


def test_cancel_invalidates_entire_later_mixed_selection(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'stale-cancel.xlsx', make_statement())
    initial = detail['operations'][0]
    repo.commit(admin, [item(initial)], 'confirm-before-stale')
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Ready before cancellation', 1)
    refreshed = repo.refresh_upload(admin, detail['id'])
    ready = refreshed['operations'][0]
    repo.cancel_company_sale(admin, ready['id'], dict(version=ready['version'], reason='Cancel while selected elsewhere'))
    with pytest.raises(ManagerConflict):
        repo.commit(admin, [item(o) for o in refreshed['operations']], 'cancelled-mixed-selection')
    assert overview(db)['totals']['salesTotal'] == 0
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0
        assert conn.execute('SELECT COUNT(*) FROM bank_company_sales').fetchone()[0] == 1


def test_confirmed_company_identity_survives_rematching_and_client_archive(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'client-freeze.xlsx', make_statement())
    initial = detail['operations'][0]
    repo.commit(admin, [item(initial)], 'client-freeze-company')
    with db.transaction() as conn:
        old_inn = conn.execute('SELECT inn FROM crm_clients WHERE id=?', (clients[0],)).fetchone()[0]
        conn.execute("UPDATE crm_clients SET inn='',crm_archived_at='synthetic' WHERE id=?", (clients[0],))
        conn.execute('UPDATE crm_clients SET inn=? WHERE id=?', (old_inn, clients[1]))
    frozen = repo.refresh_upload(admin, detail['id'])['operations'][0]
    assert frozen['clientId'] == clients[0] and frozen['companyAccounted']
    assert frozen['status'] == 'client_archived' and not frozen['companyCanConfirm']
    assert overview(db)['totals']['salesTotal'] == 36000000


@pytest.mark.parametrize('drift', ['archived', 'mismatched', 'cancelled'])
def test_shared_manager_domain_rejects_invalid_company_confirmation(bank, drift):
    db, repo, admin, seller, managers, mid, account, clients = bank
    remove_assignment(db, clients[0])
    detail = repo.upload(admin, account, 'domain-guard.xlsx', make_statement())
    op = detail['operations'][0]
    repo.commit(admin, [item(op)], 'domain-company-key')
    if drift == 'cancelled':
        confirmed = repo.refresh_upload(admin, detail['id'])['operations'][0]
        repo.cancel_company_sale(admin, op['id'], dict(version=confirmed['version'], reason='Cancelled before direct helper'))
    repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Resolve manager for domain check', 1)
    if drift == 'archived':
        with db.transaction() as conn:
            conn.execute("UPDATE crm_clients SET crm_archived_at='synthetic' WHERE id=?", (clients[0],))
    client_id = clients[1] if drift == 'mismatched' else clients[0]
    with pytest.raises(ManagerConflict):
        with db.transaction(immediate=True) as conn:
            managers._mutate_in_transaction(conn, admin, mid, '2026-11',
                dict(kind='sale', version=1, date=op['date'], client='Cannot forge snapshot', amount=op['amount'], rate=500),
                bank_operation_id=op['id'], crm_client_id=client_id)
    assert managers.dashboard(admin, mid, '2026-11')['summary']['count'] == 0
