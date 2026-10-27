import io

from PIL import Image


def setup(auth_api):
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    user_id = auth_api.service.db.create_user(username='seller', password='seller-password', full_name='Seller')
    user = auth_api.bearer(auth_api.login('seller', 'seller-password'))
    response = auth_api.client.get('/api/manager/dashboard', params={'month': '2026-10'}, headers=user)
    assert response.status_code == 200, response.text
    return admin, user, response.json()['account']['id']


def test_manager_api_access_and_revision(auth_api):
    c = auth_api.client
    assert c.get('/api/manager/dashboard?month=2026-10').status_code == 401
    admin, user, account = setup(auth_api)
    other = c.get('/api/manager/dashboard?month=2026-10', headers=admin).json()['account']['id']
    assert c.get(f'/api/manager/dashboard?month=2026-10&managerId={other}', headers=user).status_code == 403
    assert c.get('/api/manager/managers', headers=user).status_code == 403
    payload = dict(managerId=account, month='2026-10', version=0, reason='Условия месяца', kind='terms', plan=100000000, fixed=5000000, rate=500, mode='plan')
    assert c.post('/api/manager/changes', json=payload, headers=user).status_code == 403
    preview = c.post('/api/manager/preview', json=payload, headers=admin)
    assert preview.status_code == 200, preview.text
    assert c.get(f'/api/manager/dashboard?month=2026-10&managerId={account}', headers=admin).json()['version'] == 0
    assert c.post('/api/manager/changes', json=payload, headers=admin).status_code == 200
    assert c.post('/api/manager/changes', json=payload, headers=admin).status_code == 409
    mine = c.get('/api/manager/dashboard?month=2026-10', headers=user)
    assert mine.json()['terms']['fixed'] == 5000000
    assert mine.headers['cache-control'] == 'no-store'
    assert c.get(f'/api/manager/history?managerId={account}&month=2026-10', headers=user).status_code == 403


def test_protected_avatar_and_invalid_payload(auth_api):
    c = auth_api.client
    admin, user, account = setup(auth_api)
    path = f'/api/manager/avatar/{account}'
    body = io.BytesIO()
    Image.new('RGB', (20, 20), 'red').save(body, format='PNG')
    content = body.getvalue()
    assert c.post(path, headers=user, files={'file': ('face.png', content, 'image/png')}, data={'version': '0'}).status_code == 403
    response = c.post(path, headers=admin, files={'file': ('face.png', content, 'image/png')}, data={'version': '0'})
    assert response.status_code == 200, response.text
    assert c.get(path).status_code == 401
    assert c.get(path, headers=user).headers['content-type'] == 'image/webp'
    assert c.post(path, headers=admin, files={'file': ('bad.svg', b'<svg/>', 'image/svg+xml')}, data={'version': '1'}).status_code == 400
    assert c.post('/api/manager/changes', json={'month':'2026-10','managerId':account}, headers=admin).status_code == 400
