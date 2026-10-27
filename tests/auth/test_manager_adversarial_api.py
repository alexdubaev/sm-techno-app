"""Adversarial HTTP-level checks for manager authorization and validation."""
import io

from PIL import Image
import pytest


MONTH = '2026-10'


def _actor(auth_api, username, password, role='user'):
    user_id = auth_api.service.db.create_user(username=username, password=password, role=role, full_name=username.title())
    return user_id, auth_api.bearer(auth_api.login(username, password))


def _setup(auth_api):
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    alice_id, alice = _actor(auth_api, 'adversarial-alice', 'alice-password')
    bob_id, bob = _actor(auth_api, 'adversarial-bob', 'bob-password')
    c = auth_api.client
    alice_account = c.get(f'/api/manager/dashboard?month={MONTH}', headers=alice).json()['account']['id']
    bob_account = c.get(f'/api/manager/dashboard?month={MONTH}', headers=bob).json()['account']['id']
    return admin, alice, alice_id, alice_account, bob, bob_id, bob_account


def _png(width=16, height=16):
    output = io.BytesIO()
    Image.new('RGB', (width, height), 'navy').save(output, format='PNG')
    return output.getvalue()


def test_no_cross_user_access_across_manager_endpoints_including_avatar(auth_api):
    c = auth_api.client
    admin, alice, _alice_id, alice_account, bob, _bob_id, bob_account = _setup(auth_api)
    avatar_path = f'/api/manager/avatar/{alice_account}'
    upload = c.post(avatar_path, headers=admin,
                    files={'file': ('avatar.png', _png(), 'image/png')}, data={'version': '0'})
    assert upload.status_code == 200, upload.text

    assert c.get(f'/api/manager/dashboard?month={MONTH}&managerId={alice_account}', headers=bob).status_code == 403
    assert c.get(f'/api/manager/history?month={MONTH}&managerId={alice_account}', headers=bob).status_code == 403
    assert c.get(f'/api/manager/snapshots?month={MONTH}&managerId={alice_account}', headers=bob).status_code == 403
    assert c.get(avatar_path, headers=bob).status_code == 403
    assert c.post(avatar_path, headers=bob,
                  files={'file': ('avatar.png', _png(), 'image/png')}, data={'version': '0'}).status_code == 403
    denied_payload = dict(managerId=alice_account, month=MONTH, version=0, reason='cross-user',
                          kind='terms', plan=1, fixed=1, rate=0, mode='plan')
    assert c.post('/api/manager/preview', headers=bob, json=denied_payload).status_code == 403
    assert c.post('/api/manager/changes', headers=bob, json=denied_payload).status_code == 403
    assert c.get('/api/manager/managers', headers=bob).status_code == 403
    assert c.get(f'/api/manager/dashboard?month={MONTH}&managerId={bob_account}', headers=bob).status_code == 200
    assert c.get(avatar_path, headers=alice).status_code == 200


@pytest.mark.parametrize('field,value', [
    ('plan', True), ('plan', 1.5), ('fixed', -1), ('rate', 10001), ('rate', '5'),
])
def test_http_terms_reject_malformed_or_out_of_bounds_numbers_without_revision_change(auth_api, field, value):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    payload = dict(managerId=account, month=MONTH, version=0, reason='validation',
                   kind='terms', plan=100, fixed=10, rate=500, mode='plan')
    payload[field] = value
    response = c.post('/api/manager/changes', headers=admin, json=payload)
    assert response.status_code == 400, response.text
    data = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={account}', headers=admin).json()
    assert data['version'] == 0
    assert data['terms'] is None


@pytest.mark.parametrize('date_value', ['2026-02-30', '2026-10-1', '2026-11-01', '2026-10-01T12:00:00'])
def test_http_sale_rejects_impossible_or_wrong_month_dates_atomically(auth_api, date_value):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    terms = dict(managerId=account, month=MONTH, version=0, reason='conditions',
                 kind='terms', plan=1000, fixed=100, rate=500, mode='plan')
    assert c.post('/api/manager/changes', headers=admin, json=terms).status_code == 200
    sale = dict(managerId=account, month=MONTH, version=1, reason='bad date',
                kind='sale', date=date_value, client='Customer', amount=5000, rate=500)
    response = c.post('/api/manager/changes', headers=admin, json=sale)
    assert response.status_code == 400, response.text
    data = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={account}', headers=admin).json()
    assert data['version'] == 1
    assert data['total'] == 0


def test_closed_period_rejects_preview_and_persists_original_close_snapshot(auth_api):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    base = dict(managerId=account, month=MONTH, reason='closing')
    assert c.post('/api/manager/changes', headers=admin,
                  json={**base, 'version': 0, 'kind': 'terms', 'plan': 1000, 'fixed': 200, 'rate': 100, 'mode': 'plan'}).status_code == 200
    closed = c.post('/api/manager/changes', headers=admin, json={**base, 'version': 1, 'kind': 'close'})
    assert closed.status_code == 200, closed.text
    stale_preview = c.post('/api/manager/preview', headers=admin,
                           json={**base, 'version': 2, 'kind': 'sale', 'date': '2026-10-03',
                                 'client': 'Late', 'amount': 2000, 'rate': 100})
    assert stale_preview.status_code == 409
    data = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={account}', headers=admin).json()
    assert data['closed'] is True and data['version'] == 2 and data['total'] == 0
    snapshots = c.get(f'/api/manager/snapshots?month={MONTH}&managerId={account}', headers=admin).json()
    assert len(snapshots) == 1
    assert snapshots[0]['version'] == 2
    assert set(snapshots[0]) == {'id', 'at', 'actor', 'version'}
    detail = c.get(f"/api/manager/snapshots/{snapshots[0]['id']}", headers=admin)
    assert detail.status_code == 200
    assert detail.json()['data']['summary']['salesTotal'] == 0


def test_snapshot_detail_requires_admin_and_returns_missing_for_unknown_id(auth_api):
    c = auth_api.client
    admin, alice, _alice_id, account, bob, _bob_id, _bob_account = _setup(auth_api)
    base = dict(managerId=account, month=MONTH, reason='snapshot access')
    assert c.post('/api/manager/changes', headers=admin,
                  json={**base, 'version': 0, 'kind': 'terms', 'plan': 0, 'fixed': 10, 'rate': 0, 'mode': 'always'}).status_code == 200
    assert c.post('/api/manager/changes', headers=admin,
                  json={**base, 'version': 1, 'kind': 'close'}).status_code == 200
    metadata = c.get(f'/api/manager/snapshots?month={MONTH}&managerId={account}', headers=admin).json()
    snapshot_id = metadata[0]['id']

    path = f'/api/manager/snapshots/{snapshot_id}'
    assert c.get(path).status_code == 401
    assert c.get(path, headers=alice).status_code == 403
    assert c.get(path, headers=bob).status_code == 403
    assert c.get(f'/api/manager/snapshots/{snapshot_id + 100000}', headers=admin).status_code == 404


def test_only_one_concurrent_http_change_can_consume_a_revision(auth_api):
    from concurrent.futures import ThreadPoolExecutor

    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    terms = dict(managerId=account, month=MONTH, version=0, reason='conditions',
                 kind='terms', plan=1000, fixed=100, rate=500, mode='plan')
    assert c.post('/api/manager/changes', headers=admin, json=terms).status_code == 200

    def send(name):
        return c.post('/api/manager/changes', headers=admin,
                      json=dict(managerId=account, month=MONTH, version=1, reason=name,
                                kind='sale', date='2026-10-04', client=name, amount=300, rate=500)).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(send, ('Concurrent A', 'Concurrent B')))
    assert sorted(statuses) == [200, 409]
    data = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={account}', headers=admin).json()
    assert data['version'] == 2
    assert data['total'] == 1


def test_role_demotion_deactivation_and_deleted_manager_account_lifecycle(auth_api):
    c = auth_api.client
    admin, _alice, alice_id, alice_account, bob, bob_id, _bob_account = _setup(auth_api)
    # A bearer token cannot retain a role after that account is demoted.
    admin2_id, admin2 = _actor(auth_api, 'second-admin', 'second-admin-password', role='admin')
    auth_api.service.db.update_user_account(admin2_id, role='user', is_active=True)
    assert c.get('/api/manager/managers', headers=admin2).status_code == 403

    # Deactivation immediately revokes an already issued token.
    auth_api.service.db.update_user_account(bob_id, role='user', is_active=False)
    assert c.get(f'/api/manager/dashboard?month={MONTH}', headers=bob).status_code == 401

    # Historical data remains attached to its archived manager identity after deletion.
    with auth_api.service.db.transaction() as conn:
        conn.execute('DELETE FROM crm_tabs WHERE owner_user_id=?', (alice_id,))
    auth_api.service.db.delete_user(alice_id, current_user_id=auth_api.service.db.get_user_by_id(1)['id'])
    managers = c.get('/api/manager/managers', headers=admin).json()
    archived = next(row for row in managers if row['id'] == alice_account)
    assert archived['archived'] is True
    assert archived['active'] is False
    old_dashboard = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={alice_account}', headers=admin)
    assert old_dashboard.status_code == 200
    assert old_dashboard.json()['account']['archived'] is True


@pytest.mark.parametrize('name,content,content_type', [
    ('corrupt.png', b'not an image', 'image/png'),
    ('vector.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'),
    ('animated.gif', b'GIF89a', 'image/gif'),
])
def test_avatar_rejects_undecodable_or_unsupported_payloads(auth_api, name, content, content_type):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    response = c.post(f'/api/manager/avatar/{account}', headers=admin,
                      files={'file': (name, content, content_type)}, data={'version': '0'})
    assert response.status_code == 400, response.text


def test_avatar_rejects_image_over_pixel_limit_and_upload_over_byte_limit(auth_api):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    # A highly compressible image keeps the fixture small while crossing the explicit area limit.
    oversized_dimensions = _png(4000, 4001)
    response = c.post(f'/api/manager/avatar/{account}', headers=admin,
                      files={'file': ('huge.png', oversized_dimensions, 'image/png')}, data={'version': '0'})
    assert response.status_code == 400, response.text

    response = c.post(f'/api/manager/avatar/{account}', headers=admin,
                      files={'file': ('large.png', b'x' * (5 * 1024 * 1024 + 1), 'image/png')}, data={'version': '0'})
    assert response.status_code == 413, response.text


def test_http_numeric_and_date_rejections_do_not_leave_partial_sales(auth_api):
    c = auth_api.client
    admin, _alice, _alice_id, account, *_ = _setup(auth_api)
    terms = dict(managerId=account, month=MONTH, version=0, reason='conditions',
                 kind='terms', plan=1000, fixed=100, rate=500, mode='plan')
    assert c.post('/api/manager/changes', headers=admin, json=terms).status_code == 200
    payload = dict(managerId=account, month=MONTH, version=1, reason='bad amount', kind='sale',
                   date='2026-10-01', client='Customer', amount=True, rate=100)
    response = c.post('/api/manager/changes', headers=admin, json=payload)
    assert response.status_code == 400
    data = c.get(f'/api/manager/dashboard?month={MONTH}&managerId={account}', headers=admin).json()
    assert data['version'] == 1 and data['total'] == 0
