"""Administrator-only sale card flow over real isolated API dependencies."""
from tests.auth.test_bank_api import setup_bank
from tests.support.bank_statement_fixture import make_statement


def test_sale_manager_api_assigns_company_receipt_once_and_rejects_employee_ids(auth_api):
    admin, user, account, clients, mid = setup_bank(auth_api)
    c, db = auth_api.client, auth_api.service.db
    with db.transaction() as conn:
        conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (clients[0],))
    upload = c.post('/api/bank-statements/uploads', headers=admin, data={'accountId': str(account)},
        files={'file': ('sale-card.xlsx', make_statement())}).json()
    op = upload['operations'][0]
    posted = c.post('/api/bank-statements/commit', headers=admin, json=dict(
        items=[dict(operationId=op['id'],version=op['version'],fingerprint=op['fingerprint'])],
        idempotencyKey='card-company-receipt'))
    assert posted.status_code == 200, posted.text
    path = f"/api/bank-statements/sales/bank/{op['id']}"
    for headers, status in (({},401),(user,403)):
        assert c.get(path, headers=headers).status_code == status
        assert c.post(path+'/manager-preview', headers=headers, json=dict(managerId=mid)).status_code == status
        assert c.post(path+'/manager', headers=headers, json={}).status_code == status
    detail = c.get(path, headers=admin)
    assert detail.status_code == 200 and detail.headers['cache-control'] == 'no-store'
    assert detail.json()['managerId'] is None
    proposal = c.post(path+'/manager-preview', headers=admin, json=dict(managerId=mid))
    assert proposal.status_code == 200, proposal.text
    assert proposal.json()['canSave']
    payload = dict(managerId=mid,proposalToken=proposal.json()['token'],idempotencyKey='one-click-sale-card')
    result = c.post(path+'/manager', headers=admin, json=payload)
    assert result.status_code == 200, result.text
    assert result.json()['managerId'] == mid
    assert c.post(path+'/manager', headers=admin, json=payload).json() == result.json()
    client = c.get(f'/api/bank-statements/clients/{clients[0]}', headers=admin).json()
    assert client['assignment']['managerId'] == mid
    overview = c.get('/api/admin/dashboard/sales?period=month&date=2026-11-06', headers=admin).json()
    assert overview['totals']['salesTotal'] == 36000000 and overview['totals']['count'] == 1
    assert c.get('/api/admin/dashboard/sales/entries?period=month&date=2026-11-06', headers=user).status_code == 403
    assert c.get('/api/bank-statements/sales/bank/9999999', headers=admin).status_code == 404


def test_sale_assignment_api_rejects_unconfirmed_bank_row(auth_api):
    admin, user, account, clients, mid = setup_bank(auth_api)
    c = auth_api.client
    upload = c.post('/api/bank-statements/uploads', headers=admin, data={'accountId': str(account)},
        files={'file': ('not-yet-a-sale.xlsx', make_statement())}).json()
    path = f"/api/bank-statements/sales/bank/{upload['operations'][0]['id']}"
    assert c.get(path, headers=admin).status_code == 404
    assert c.post(path+'/manager-preview', headers=admin, json=dict(managerId=mid)).status_code == 404
