def test_interactive_table_intake_requires_session_and_allows_existing_manager_role(auth_api):
    payload = {'file': ('list.csv', b'00123\n00456')}
    assert auth_api.client.post('/api/stock/valuation/table-intake', files=payload).status_code == 401
    auth_api.service.db.create_user(username='table-manager', password='table-manager-test', role='user')
    token = auth_api.login('table-manager', 'table-manager-test')
    result = auth_api.client.post('/api/stock/valuation/table-intake', files=payload,
        headers=auth_api.bearer(token))
    assert result.status_code == 200
    assert [row['article'] for row in result.json()['rows']] == ['00123', '00456']
    assert result.headers['cache-control'] == 'no-store'
