from pathlib import Path

import pytest
from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerRepository, ManagerConflict, calculate


def test_crossing_rates_and_half_up():
    rows = [dict(id=1, date='2026-10-02', amount=90000000, rate=500, cancelled=False),
            dict(id=2, date='2026-10-03', amount=30000000, rate=500, cancelled=False),
            dict(id=3, date='2026-10-04', amount=10000, rate=600, cancelled=False)]
    result = calculate(rows, dict(plan=100000000, fixed=5000000, mode='plan', rate=500))
    assert result['commission'] == 1000600
    assert result['fixed'] == 5000000
    assert result['sales'][1]['base'] == 20000000
    assert calculate([dict(rows[0], amount=1, rate=5000)], dict(plan=0, fixed=0, mode='plan', rate=0))['commission'] == 1
    assert calculate(rows, None)['commission'] is None
    assert calculate(rows, dict(plan=200000000, fixed=5000, mode='always', rate=0))['fixed'] == 5000


@pytest.fixture
def repo(tmp_path: Path):
    db = WebDatabase(tmp_path / 'manager.db')
    db.initialize()
    admin = db.create_user(username='boss', password='testpassword', role='admin', full_name='Boss')
    user = db.create_user(username='manager', password='testpassword', role='user', full_name='Manager')
    repository = ManagerRepository(db)
    actors = [db.get_user_by_id(admin), db.get_user_by_id(user)]
    return repository, actors


def setup_period(repository, actors):
    admin, user = actors
    account = repository.dashboard(user, None, '2026-10')['account']['id']
    def change(payload, version, preview=False):
        return repository.mutate(admin, account, '2026-10', {**payload, 'version': version, 'reason': 'Test'}, preview=preview)
    terms = {'kind': 'terms', 'plan': 100000000, 'fixed': 5000000, 'rate': 500, 'mode': 'plan'}
    change(terms, 0)
    return account, change


def test_revisions_preview_and_snapshots(repo):
    repository, actors = repo
    account, change = setup_period(repository, actors)
    sale = {'kind': 'sale', 'date': '2026-10-03', 'client': 'ООО Тест', 'amount': 120000000, 'rate': 500}
    preview = change(sale, 1, True)
    assert preview['summary']['commission'] == 1000000
    assert repository.dashboard(actors[0], account, '2026-10')['version'] == 1
    saved = change(sale, 1)
    with pytest.raises(ManagerConflict): change(sale, 1)
    change({'kind': 'close'}, 2)
    with pytest.raises(ManagerConflict): change(sale, 3)
    change({'kind': 'reopen'}, 3)
    sale_id = saved['sales'][0]['id']
    change({'kind': 'cancel', 'saleId': sale_id}, 4)
    assert repository.dashboard(actors[0], account, '2026-10')['summary']['salesTotal'] == 0
    history = repository.history(actors[0], account, '2026-10')
    assert history['total'] == 5
    snapshots = repository.snapshots(actors[0], account, '2026-10')
    assert snapshots[0]['data']['summary']['commission'] == 1000000


def test_identity_permissions_and_deletion(repo):
    repository, actors = repo
    account, change = setup_period(repository, actors)
    with pytest.raises(PermissionError):
        repository.mutate(actors[1], account, '2026-10', {'kind': 'close', 'version': 1, 'reason': 'x'})
    boss_account = repository.dashboard(actors[0], None, '2026-10')['account']['id']
    with pytest.raises(PermissionError): repository.dashboard(actors[1], boss_account, '2026-10')
    # Existing CRM references independently restrict physical account deletion.
    with repository.db.transaction() as conn:
        conn.execute('DELETE FROM crm_tabs WHERE owner_user_id=?', (actors[1]['id'],))
    repository.db.delete_user(actors[1]['id'], current_user_id=actors[0]['id'])
    replacement = repository.db.create_user(username='new', password='password1', role='user')
    replacement_user = repository.db.get_user_by_id(replacement)
    assert repository.dashboard(replacement_user, None, '2026-10')['account']['id'] != account
    assert repository.dashboard(actors[0], account, '2026-10')['terms']['plan'] == 100000000
    repository.db.initialize()
    assert repository.dashboard(actors[0], account, '2026-10')['version'] == 1


def test_zero_missing_cancel_backdated_and_saved_rates(repo):
    repository, actors = repo
    account, change = setup_period(repository, actors)
    change({'kind': 'sale', 'date': '2026-10-20', 'client': 'Late', 'amount': 110000000, 'rate': 600}, 1)
    change({'kind': 'sale', 'date': '2026-10-01', 'client': 'Early', 'amount': 20000000, 'rate': 500}, 2)
    data = repository.dashboard(actors[0], account, '2026-10')
    assert data['summary']['commission'] == 1800000
    change({'kind': 'terms', 'plan': 0, 'fixed': 100, 'mode': 'plan', 'rate': 1000}, 3)
    data = repository.dashboard(actors[0], account, '2026-10')
    assert data['summary']['commission'] == 7600000
    assert {s['rate'] for s in data['sales']} == {500, 600}
    assert repository.dashboard(actors[0], account, '2026-11')['summary']['commission'] is None


@pytest.mark.parametrize('field,value', [('plan', -1), ('rate', 10001), ('fixed', 1.5), ('plan', True)])
def test_invalid_terms(repo, field, value):
    repository, actors = repo
    account, change = setup_period(repository, actors)
    payload = {'kind': 'terms', 'plan': 1, 'fixed': 1, 'rate': 1, 'mode': 'plan', field: value}
    with pytest.raises(ValueError): change(payload, 1)


def test_concurrent_changes_only_one_wins_and_migration_repairs_index(repo):
    from concurrent.futures import ThreadPoolExecutor
    repository, actors = repo
    account, change = setup_period(repository, actors)
    def write():
        try:
            change({'kind': 'sale', 'date': '2026-10-05', 'client': 'Concurrent', 'amount': 1, 'rate': 5000}, 1)
            return 'saved'
        except ManagerConflict:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: write(), range(2))) == ['conflict', 'saved']
    with repository.db.transaction() as conn:
        conn.execute('DROP INDEX manager_sales_period')
    repository.db.initialize()
    with repository.db.connect() as conn:
        assert conn.execute("SELECT name FROM sqlite_master WHERE name='manager_sales_period'").fetchone()
    assert repository.dashboard(actors[0], account, '2026-10')['total'] == 1
