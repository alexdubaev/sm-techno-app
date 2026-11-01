from .conftest import INITIAL_ADMIN_PASSWORD

def test_shortcut_credential_is_scoped_and_revocable(auth_api):
    token = auth_api.login('admin', INITIAL_ADMIN_PASSWORD)
    headers = auth_api.bearer(token)
    created = auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label': 'iPhone'})
    assert created.status_code == 200
    code = created.json()['credential']
    device_id = created.json()['device']['id']
    assert auth_api.client.get('/api/auth/me', headers={'Authorization': f'Shortcut {code}'}).status_code == 401
    assert auth_api.client.delete(f'/api/stock/shortcut-devices/{device_id}', headers=headers).status_code == 200
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers={'Authorization': f'Shortcut {code}'}, json={'rows': [{'article': 'a', 'sourceRow': 1}], 'format': 'valuation'}).status_code == 401


def test_device_hash_ownership_expiry_and_account_lifecycle(auth_api):
    import hashlib
    from datetime import datetime, timedelta, timezone
    db = auth_api.service.db
    admin = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    user = db.create_user(username='phone-user', password='password123', role='user', full_name='Phone', onec_username='', is_active=True)
    own = auth_api.bearer(auth_api.login('phone-user', 'password123'))
    created = auth_api.client.post('/api/stock/shortcut-devices', headers=own, json={'label':'Phone'}).json()
    code, ident = created['credential'], created['device']['id']
    with db.connect() as conn:
        row = conn.execute('SELECT * FROM app_shortcut_devices WHERE id=?', (ident,)).fetchone()
        assert row['token_hash'] == hashlib.sha256(code.encode()).hexdigest()
        assert code not in tuple(str(v) for v in row)
    assert auth_api.client.delete(f'/api/stock/shortcut-devices/{ident}', headers=admin).status_code == 404
    assert auth_api.client.get('/api/stock/shortcut-devices', headers=admin).json()['devices'] == []
    auth = {'Authorization': 'Shortcut ' + code}
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={'rows':[{'article':'missing','sourceRow':1}], 'format':'valuation'}).status_code == 200
    db.update_user_account(user, role='admin', is_active=True)
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={}).status_code == 401
    new = auth_api.client.post('/api/stock/shortcut-devices', headers=own, json={'label':'Again'}).json()['credential']
    with db.transaction() as conn:
        conn.execute('UPDATE app_shortcut_devices SET idle_expires_at=? WHERE token_hash=?', ((datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),hashlib.sha256(new.encode()).hexdigest()))
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers={'Authorization':'Shortcut '+new}, json={}).status_code == 401


def test_rate_limits_and_pre_auth_body(auth_api):
    from concurrent.futures import ThreadPoolExecutor
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    created = auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label':'Phone'}).json()
    auth = {'Authorization':'Shortcut '+created['credential']}
    # A rejected key must be checked before even a declared oversized multipart body.
    assert auth_api.client.post('/api/shortcuts/stock/intake', headers={'Authorization':'Shortcut invalid', 'Content-Type':'multipart/form-data; boundary=x', 'Content-Length':'999999999'}, content=b'').status_code == 401
    def request(_):
        return auth_api.client.post('/api/shortcuts/stock/intake', headers=auth, content=b'').status_code
    with ThreadPoolExecutor(max_workers=10) as pool:
        statuses = list(pool.map(request, range(10)))
    assert statuses.count(400) == 6
    assert statuses.count(429) == 4
    for i in range(4):
        assert auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label':str(i)}).status_code == 200
    assert auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label':'six'}).status_code == 429



def test_logout_does_not_revoke_but_password_reset_and_deactivation_do(auth_api):
    db = auth_api.service.db
    user = db.create_user(username='mobile', password='password123', role='user', full_name='Mobile', onec_username='', is_active=True)
    token = auth_api.login('mobile', 'password123')
    headers = auth_api.bearer(token)
    code = auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label':'Phone'}).json()['credential']
    auth = {'Authorization':'Shortcut '+code}
    assert auth_api.client.post('/api/auth/logout', headers=headers).status_code == 200
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={}).status_code == 422
    db.reset_user_password(user, 'new-password123')
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={}).status_code == 401
    new_headers = auth_api.bearer(auth_api.login('mobile', 'new-password123'))
    code2 = auth_api.client.post('/api/stock/shortcut-devices', headers=new_headers, json={'label':'Phone 2'}).json()['credential']
    db.update_user_account(user, role='user', is_active=False)
    db.update_user_account(user, role='user', is_active=True)
    assert auth_api.client.post('/api/shortcuts/stock/resolve', headers={'Authorization':'Shortcut '+code2}, json={}).status_code == 401


def test_intake_and_both_workbooks_do_not_persist_business_data(auth_api, monkeypatch, tmp_path):
    import base64
    from io import BytesIO
    from openpyxl import load_workbook
    import stock_sync_web.stock_valuation as valuation
    from stock_sync_web.assistant_extraction import ExtractionResult
    class FakeExtractor:
        def extract(self, request, *, temp_root=None):
            return ExtractionResult('articles', {'rows':[{'article':'00123', 'requested_qty':None, 'source_row':1}]}, warnings=['Проверьте список'])
    monkeypatch.setattr(valuation, 'CodexDocumentExtractor', FakeExtractor)
    db = auth_api.service.db
    db.create_local_item(sku='00123', name='Тест', print_name='Тест', category_name='Тест', group_name='Тест', price=42, warehouses=[{'warehouse_name':'Первый','quantity':2,'price':42}])
    with db.transaction() as conn:
        conn.execute("UPDATE item_warehouse_balances SET price=42 WHERE item_id=(SELECT id FROM items WHERE sku='00123')")
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    code = auth_api.client.post('/api/stock/shortcut-devices', headers=headers, json={'label':'Phone'}).json()['credential']
    auth = {'Authorization':'Shortcut '+code}
    with db.connect() as conn:
        before = {table: conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in ('commercial_offers','documents')}
    intake = auth_api.client.post('/api/shortcuts/stock/intake', headers=auth, files={'file':('list.txt',b'00123','text/plain')})
    assert intake.status_code == 200
    data = intake.json()
    assert '00123' in data['previewText'] and data['warnings'] == ['Проверьте список']
    for format in ('valuation','offer'):
        response = auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={'rows':data['rows'], 'format':format})
        assert response.status_code == 200, (format, response.text, db.lookup_stock_articles(["00123"]))
        workbook = load_workbook(BytesIO(base64.b64decode(response.json()['workbook']['base64'])))
        assert any(cell.value == '00123' for row in workbook.active for cell in row)
        workbook.close()
    empty = auth_api.client.post('/api/shortcuts/stock/resolve', headers=auth, json={'rows':[{'article':'unknown','sourceRow':1}], 'format':'offer'})
    assert empty.status_code == 422
    with db.connect() as conn:
        assert before == {table: conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in before}


