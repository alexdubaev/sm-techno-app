"""One action binds CRM and allocates or transfers a counted company sale."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from stock_sync_web.bank_repository import BankRepository
from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerConflict
from stock_sync_web.admin_dashboard import sales_overview
from tests.test_bank_repository import bank
from tests.support.bank_statement_fixture import make_statement


def item(op):
    return dict(operationId=op['id'], version=op['version'], fingerprint=op['fingerprint'])


def unallocated(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    monkeypatch.setattr(repo, '_sale_today', lambda: '2026-11-19', raising=False)
    with db.transaction() as conn:
        conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (clients[0],))
    upload = repo.upload(admin, account, 'assignment.xlsx', make_statement())
    op = upload['operations'][0]
    repo.commit(admin, [item(op)], 'company-before-assignment')
    return op


def target_manager(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    uid = db.create_user(username='synthetic-transfer-target', password='synthetic-password', role='user')
    other = managers.dashboard(db.get_user_by_id(uid), None, '2026-11')['account']['id']
    managers.mutate(admin, other, '2026-11', dict(kind='terms', version=0, plan=0, fixed=0,
        rate=1700, mode='always', reason='Synthetic target terms'))
    return other


def request(proposal, manager_id, key='sale-assignment-key', **extra):
    return dict(managerId=manager_id, proposalToken=proposal['token'], idempotencyKey=key, **extra)


def test_one_save_posts_manager_and_binds_client_without_recounting_company(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    before = sales_overview(db, 'month', '2026-11-06')['totals']
    with db.transaction() as conn:
        audit_before = conn.execute('SELECT COUNT(*) FROM crm_sales_assignment_audit').fetchone()[0]
        assignments_before = [tuple(r) for r in conn.execute('SELECT * FROM crm_sales_assignments ORDER BY id')]
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    assert proposal['canSave'] and proposal['rate'] == 500
    assert proposal['effects'][0]['after']['salesTotal'] == 36000000
    with db.transaction() as conn:
        assert [tuple(r) for r in conn.execute('SELECT * FROM crm_sales_assignments ORDER BY id')] == assignments_before
        assert conn.execute('SELECT COUNT(*) FROM crm_sales_assignment_audit').fetchone()[0] == audit_before
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0
    payload = request(proposal, mid)
    detail = repo.assign_sale_manager(admin, 'bank', op['id'], payload)
    assert detail['managerId'] == mid and detail['kind'] == 'bank' and detail['id'] == op['id']
    assert repo.assign_sale_manager(admin, 'bank', op['id'], payload) == detail
    assert sales_overview(db, 'month', '2026-11-06')['totals']['salesTotal'] == before['salesTotal']
    assert sales_overview(db, 'month', '2026-11-06')['totals']['count'] == 1
    assert managers.dashboard(admin, mid, '2026-11')['summary']['commission'] == 1800000
    client = repo.client(admin, clients[0])
    assert client['assignment']['managerId'] == mid
    assert client['assignment']['startDate'] == op['date']
    with pytest.raises(ManagerConflict):
        repo.assign_sale_manager(admin, 'bank', op['id'], {**payload, 'managerId': target_manager(bank)})


def test_selected_sale_transfer_preserves_deal_rate_and_changes_both_payrolls(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    first = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    repo.assign_sale_manager(admin, 'bank', op['id'], request(first, mid))
    with db.transaction() as conn:
        original = dict(conn.execute('SELECT * FROM manager_sales').fetchone())
    other = target_manager(bank)
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=other))
    assert proposal['canSave'] and proposal['rate'] == 500  # fixed deal rate, not target's 17%
    assert len(proposal['effects']) == 2
    payload = request(proposal, other, 'transfer-single-bank-sale')
    result = repo.assign_sale_manager(admin, 'bank', op['id'], payload)
    assert result['managerId'] == other
    assert repo.assign_sale_manager(admin, 'bank', op['id'], payload) == result
    with db.transaction() as conn:
        saved = dict(conn.execute('SELECT * FROM manager_sales').fetchone())
        assert {k:v for k,v in saved.items() if k not in ('manager_id','updated_at')} == {
            k:v for k,v in original.items() if k not in ('manager_id','updated_at')}
        assert conn.execute('SELECT manager_id FROM bank_sale_links').fetchone()[0] == other
        assert conn.execute('SELECT COUNT(*) FROM bank_company_sales').fetchone()[0] == 1
    assert managers.dashboard(admin, mid, '2026-11')['summary']['salesTotal'] == 0
    assert managers.dashboard(admin, other, '2026-11')['summary']['commission'] == 1800000
    assert sales_overview(db, 'month', '2026-11-06')['totals']['salesTotal'] == 36000000
    assert repo.client(admin, clients[0])['assignment']['managerId'] == other


@pytest.mark.parametrize('gate', ['no_terms','closed','inactive_manager','archived_client'])
def test_blocked_assignment_leaves_crm_and_financial_records_unchanged(bank, monkeypatch, gate):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    with db.transaction() as conn:
        if gate == 'no_terms':
            conn.execute('UPDATE manager_periods SET plan=NULL,fixed=NULL,rate=NULL,mode=NULL WHERE manager_id=?', (mid,))
        elif gate == 'closed':
            conn.execute('UPDATE manager_periods SET closed=1 WHERE manager_id=?', (mid,))
        elif gate == 'inactive_manager':
            conn.execute('UPDATE users SET is_active=0 WHERE id=?', (seller['id'],))
        else:
            conn.execute("UPDATE crm_clients SET crm_archived_at='synthetic' WHERE id=?", (clients[0],))
        before = [tuple(r) for r in conn.execute('SELECT * FROM crm_sales_assignments ORDER BY id')]
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    assert not proposal['canSave'] and proposal['problem']
    with pytest.raises(ManagerConflict):
        repo.assign_sale_manager(admin, 'bank', op['id'], request(proposal, mid))
    with db.transaction() as conn:
        assert [tuple(r) for r in conn.execute('SELECT * FROM crm_sales_assignments ORDER BY id')] == before
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0


@pytest.mark.parametrize('drift', ['terms','client_assignment'])
def test_changed_proposal_conflicts_before_binding_or_posting(bank, monkeypatch, drift):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    if drift == 'terms':
        managers.mutate(admin, mid, '2026-11', dict(kind='terms', version=1, plan=0, fixed=0,
            rate=0, mode='always', reason='Changed while sale open'))
    else:
        repo.set_assignment(admin, clients[0], None, '2026-11-01', 'Changed while sale open', 1)
    with pytest.raises(ManagerConflict):
        repo.assign_sale_manager(admin, 'bank', op['id'], request(proposal, mid))
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0


def test_backdated_payment_assignment_also_assigns_client_today_without_moving_other_sales(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    other = target_manager(bank)
    repo.set_assignment(admin, clients[0], other, '2026-11-19', 'Existing current owner', 1)
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    assert proposal['canSave'] and proposal['assignment']['managerId'] == mid
    repo.assign_sale_manager(admin, 'bank', op['id'], request(proposal, mid))
    assert repo.client(admin, clients[0])['assignment']['managerId'] == mid
    with db.transaction() as conn:
        assert conn.execute('SELECT manager_id FROM crm_sales_assignments WHERE client_id=? AND start_date<=? AND (end_date IS NULL OR end_date>?)',
            (clients[0],op['date'],op['date'])).fetchone()[0] == mid
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 1


def test_legacy_manual_sale_requires_explicit_crm_choice_and_preserves_snapshot(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    monkeypatch.setattr(repo, '_sale_today', lambda: '2026-11-19', raising=False)
    saved = managers.mutate(admin, mid, '2026-11', dict(kind='sale', version=1, date='2026-11-06',
        client='Historical manual snapshot', amount=90000, rate=350))
    sale_id = saved['sales'][0]['id']
    other = target_manager(bank)
    missing = repo.preview_sale_manager(admin, 'manager', sale_id, dict(managerId=other))
    assert not missing['canSave'] and 'CRM' in missing['problem']
    proposal = repo.preview_sale_manager(admin, 'manager', sale_id, dict(managerId=other,clientId=clients[0]))
    assert proposal['canSave']
    repo.assign_sale_manager(admin, 'manager', sale_id, request(proposal, other, clientId=clients[0]))
    with db.transaction() as conn:
        row = conn.execute('SELECT client,source,rate,crm_client_id,manager_id FROM manager_sales WHERE id=?', (sale_id,)).fetchone()
        assert tuple(row) == ('Historical manual snapshot','manual',350,clients[0],other)


def test_two_admin_saves_cannot_allocate_one_payment_twice(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    proposal = repo.preview_sale_manager(admin, 'bank', op['id'], dict(managerId=mid))
    barrier = Barrier(2)
    def save(index):
        concurrent = BankRepository(WebDatabase(db.db_path), repo.storage_root)
        concurrent._sale_today = lambda: '2026-11-19'
        barrier.wait(timeout=10)
        try:
            return concurrent.assign_sale_manager(admin, 'bank', op['id'], request(proposal, mid, f'two-admin-assignment-{index}'))
        except ManagerConflict as exc:
            return exc
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, range(2)))
    assert sum(isinstance(r, ManagerConflict) for r in results) == 1
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 1


def test_employee_cannot_open_or_mutate_company_sale_assignment(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    op = unallocated(bank, monkeypatch)
    for action in (
        lambda: repo.sale_details(seller,'bank',op['id']),
        lambda: repo.preview_sale_manager(seller,'bank',op['id'],dict(managerId=mid)),
        lambda: repo.assign_sale_manager(seller,'bank',op['id'],dict(managerId=mid,proposalToken='0'*64,idempotencyKey='forbidden-owner')),
    ):
        with pytest.raises(PermissionError):
            action()
