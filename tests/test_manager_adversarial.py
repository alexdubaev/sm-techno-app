"""Independent adversarial checks for the manager compensation ledger."""
from decimal import Decimal, ROUND_HALF_UP
import random

import pytest

from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository, calculate
from stock_sync_web.database import WebDatabase


def decimal_reference(rows, plan):
    """Allocate each sale against remaining plan, independent of production formula."""
    running_sales = 0
    total_commission = 0
    expected = {}
    for row in sorted(rows, key=lambda item: (item['date'], item['id'])):
        base = 0
        cents = None
        if not row['cancelled']:
            amount = row['amount']
            unpaid_plan = max(0, plan - running_sales)
            base = max(0, amount - unpaid_plan)
            running_sales += amount
            raw_rubles_in_kopecks = Decimal(base) * Decimal(row['rate']) / Decimal(10000)
            cents = int(raw_rubles_in_kopecks.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            total_commission += cents
        else:
            cents = 0
        expected[row['id']] = (base, cents)
    return running_sales, total_commission, expected


def test_randomized_sales_match_independent_decimal_allocation_and_ordering():
    rng = random.Random(0xC0FFEE)
    for case in range(120):
        rows = []
        for sale_id in range(1, rng.randint(2, 45)):
            rows.append({
                'id': sale_id,
                # Repeated dates exercise the stable ID tie-breaker.
                'date': f"2026-{rng.randint(1, 4):02}-{rng.randint(1, 8):02}",
                'amount': rng.randint(1, 100_000_000),
                'rate': rng.randint(0, 10_000),
                'cancelled': rng.random() < 0.23,
            })
        plan = rng.randint(0, 300_000_000)
        expected_total, expected_commission, expected_sales = decimal_reference(rows, plan)
        terms = {'plan': plan, 'fixed': 0, 'rate': 0, 'mode': 'plan'}

        for candidate_rows in (rows, rng.sample(rows, len(rows))):
            actual = calculate(candidate_rows, terms)
            assert actual['salesTotal'] == expected_total, f'case={case}'
            assert actual['commission'] == expected_commission, f'case={case}'
            by_id = {item['id']: item for item in actual['sales']}
            assert list(item['id'] for item in actual['sales']) == [r['id'] for r in sorted(rows, key=lambda x: (x['date'], x['id']))]
            for sale_id, (base, cents) in expected_sales.items():
                assert (by_id[sale_id]['base'], by_id[sale_id]['commission']) == (base, cents), f'case={case}, sale={sale_id}'


@pytest.mark.parametrize(('value', 'label'), [
    (True, 'plan'), (1.0, 'plan'), ('1', 'plan'), (-1, 'plan'), (10**12 + 1, 'fixed'),
    (False, 'rate'), (10001, 'rate'),
])
def test_numeric_bounds_reject_non_integer_boolean_and_out_of_range_values(repo, value, label):
    repository, actors = repo
    account, change = _setup_period(repository, actors)
    payload = {'kind': 'terms', 'plan': 1, 'fixed': 1, 'rate': 1, 'mode': 'plan', label: value}
    with pytest.raises(ValueError):
        change(payload, 1)


def _setup_period(repository, actors):
    admin, user = actors
    account = repository.dashboard(user, None, '2026-10')['account']['id']

    def change(payload, version, preview=False):
        return repository.mutate(admin, account, '2026-10',
                                 {**payload, 'version': version, 'reason': 'Adversarial review'}, preview=preview)

    change({'kind': 'terms', 'plan': 10_000, 'fixed': 500, 'rate': 100, 'mode': 'plan'}, 0)
    return account, change


@pytest.mark.parametrize('month', ['2026-00', '2026-13', '1899-12', '2200-01', '2026-1', None, 202610])
def test_month_parser_rejects_malformed_or_out_of_supported_range(repo, month):
    repository, actors = repo
    with pytest.raises(ValueError):
        repository.dashboard(actors[0], None, month)


@pytest.mark.parametrize('date_value', ['2026-02-30', '2026-1-01', '2026-10-1', '2026-10-01T00:00:00', '2026-11-01'])
def test_sale_dates_must_be_real_iso_dates_inside_selected_month(repo, date_value):
    repository, actors = repo
    _account, change = _setup_period(repository, actors)
    with pytest.raises(ValueError):
        change({'kind': 'sale', 'date': date_value, 'client': 'Client', 'amount': 100, 'rate': 100}, 1)


def test_stale_preview_cannot_mutate_or_bypass_a_closed_period(repo):
    repository, actors = repo
    account, change = _setup_period(repository, actors)
    change({'kind': 'close'}, 1)
    with pytest.raises(ManagerConflict):
        change({'kind': 'sale', 'date': '2026-10-12', 'client': 'Late preview', 'amount': 20_000, 'rate': 100}, 2, preview=True)
    data = repository.dashboard(actors[0], account, '2026-10')
    assert data['closed'] is True
    assert data['version'] == 2
    assert data['total'] == 0


def test_concurrent_distinct_sales_with_same_revision_create_one_record(repo):
    from concurrent.futures import ThreadPoolExecutor

    repository, actors = repo
    account, change = _setup_period(repository, actors)

    def submit(name):
        try:
            change({'kind': 'sale', 'date': '2026-10-15', 'client': name, 'amount': 20_000, 'rate': 100}, 1)
            return 'saved'
        except ManagerConflict:
            return 'conflict'

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, ('First concurrent', 'Second concurrent')))
    assert sorted(results) == ['conflict', 'saved']
    data = repository.dashboard(actors[0], account, '2026-10')
    assert data['version'] == 2
    assert data['total'] == 1


def test_month_total_limit_rolls_back_the_sale_audit_and_revision(repo):
    repository, actors = repo
    account, change = _setup_period(repository, actors)
    admin_id = actors[0]['id']
    with repository.db.transaction() as conn:
        conn.executemany('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,created_by,updated_at)
            VALUES(?,?,?,?,?,?,?,?)''', [
                (account, '2026-10', '2026-10-01', f'Existing {index}', 10**12, 500, admin_id,
                 '2026-10-01T00:00:00+00:00')
                for index in range(100)
            ])

    with pytest.raises(ValueError, match='превышает допустимый лимит'):
        change({'kind': 'sale', 'date': '2026-10-02', 'client': 'Over limit', 'amount': 1, 'rate': 100}, 1)

    data = repository.dashboard(actors[0], account, '2026-10')
    assert data['summary']['salesTotal'] == 10**14
    assert data['total'] == 100
    assert data['version'] == 1
    assert repository.history(actors[0], account, '2026-10')['total'] == 1


def test_closed_snapshot_detail_paginates_without_mutating_saved_snapshot(repo):
    repository, actors = repo
    account, change = _setup_period(repository, actors)
    with repository.db.transaction() as conn:
        conn.executemany('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,created_by,updated_at)
            VALUES(?,?,?,?,?,?,?,?)''', [
                (account, '2026-10', f'2026-10-{index:02}', f'Sale {index:02}', index, 500, actors[0]['id'],
                 '2026-10-01T00:00:00+00:00')
                for index in range(1, 26)
            ])
    change({'kind': 'close'}, 1)
    listed = repository.snapshots(actors[0], account, '2026-10')
    assert len(listed) == 1
    assert set(listed[0]) == {'id', 'at', 'actor', 'version'}

    with repository.db.transaction() as conn:
        stored_before = conn.execute('SELECT data_json FROM manager_snapshots WHERE id=?', (listed[0]['id'],)).fetchone()[0]
    first = repository.snapshot(actors[0], listed[0]['id'], page=1)
    second = repository.snapshot(actors[0], listed[0]['id'], page=2)
    clamped = repository.snapshot(actors[0], listed[0]['id'], page=99)
    assert (first['data']['total'], first['data']['page'], first['data']['pages']) == (25, 1, 2)
    assert len(first['data']['sales']) == 20
    assert (second['data']['page'], len(second['data']['sales'])) == (2, 5)
    assert second['data']['sales'] == clamped['data']['sales']
    assert first['data']['sales'][0]['id'] == second['data']['sales'][0]['id'] - 20
    with repository.db.transaction() as conn:
        stored_after = conn.execute('SELECT data_json FROM manager_snapshots WHERE id=?', (listed[0]['id'],)).fetchone()[0]
    assert stored_after == stored_before


def test_read_refreshes_manager_name_from_user_record(repo):
    repository, actors = repo
    manager = actors[1]
    account = repository.dashboard(manager, None, '2026-10')['account']['id']
    with repository.db.transaction() as conn:
        conn.execute("UPDATE users SET full_name='Updated Manager Name' WHERE id=?", (manager['id'],))
    data = repository.dashboard(manager, None, '2026-10')
    assert data['account']['id'] == account
    assert data['account']['name'] == 'Updated Manager Name'


@pytest.fixture
def repo(tmp_path):
    db = WebDatabase(tmp_path / 'manager-adversarial.db')
    db.initialize()
    admin_id = db.create_user(username='review-admin', password='testpassword', role='admin')
    manager_id = db.create_user(username='review-manager', password='testpassword', role='user')
    actors = [db.get_user_by_id(admin_id), db.get_user_by_id(manager_id)]
    return ManagerRepository(db), actors
