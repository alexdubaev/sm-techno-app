"""Authenticated HTTP contract and private receipt/file boundaries, synthetic only."""
from tests.support.bank_statement_fixture import (
    make_statement, SYNTHETIC_OWNER_INN, SYNTHETIC_ACCOUNT, SYNTHETIC_BIK, SYNTHETIC_PAYER_INNS,
)


def setup_bank(auth_api):
    db = auth_api.service.db
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    uid = db.create_user(username='bank-http-seller', password='synthetic-password', full_name='Synthetic bank seller')
    user = auth_api.bearer(auth_api.login('bank-http-seller', 'synthetic-password'))
    mid = auth_api.client.get('/api/manager/dashboard?month=2026-11', headers=user).json()['account']['id']
    with db.transaction() as conn:
        org = conn.execute("INSERT INTO organizations(onec_key,name,inn,updated_at) VALUES('bank-api','Synthetic bank organization',?,'test')", (SYNTHETIC_OWNER_INN,)).lastrowid
    c = auth_api.client
    approved = c.post('/api/bank-statements/accounts', headers=admin, json=dict(organizationId=org, ownerInn=SYNTHETIC_OWNER_INN, account=SYNTHETIC_ACCOUNT, bik=SYNTHETIC_BIK, reason='Synthetic approval'))
    assert approved.status_code == 200, approved.text
    terms = c.post('/api/manager/changes', headers=admin, json=dict(managerId=mid,month='2026-11',kind='terms',version=0,plan=0,fixed=0,rate=500,mode='always',reason='Synthetic November conditions'))
    assert terms.status_code == 200, terms.text
    clients = []
    for i, inn in enumerate(SYNTHETIC_PAYER_INNS):
        client = db.create_crm_client_card(dict(document_name=f'Synthetic bank client {i}', full_name=f'Synthetic bank client {i}', inn=inn, kpp='000001001'), owner_user_id=uid)
        clients.append(client['id'])
        r = c.put(f"/api/bank-statements/clients/{client['id']}/assignment", headers=admin, json=dict(version=0,managerId=mid,startDate='2026-11-01',reason='Synthetic attribution'))
        assert r.status_code == 200, r.text
    return admin,user,approved.json()['id'],clients,mid


def test_bank_http_control_private_download_and_direct_id_acl(auth_api):
    c = auth_api.client
    admin,user,account,clients,mid = setup_bank(auth_api)
    raw = make_statement()
    upload = c.post('/api/bank-statements/uploads', headers=admin, data={'accountId':str(account)}, files={'file':('synthetic.xlsx',raw,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert upload.status_code == 200, upload.text
    detail = upload.json()
    assert detail['summary']['readyCount'] == 6
    assert detail['summary']['readyAmount'] == 198906300
    assert c.get('/api/bank-statements/uploads',headers=admin).headers['cache-control']=='no-store'
    items=[dict(operationId=o['id'],version=o['version'],fingerprint=o['fingerprint']) for o in detail['operations']]
    preview=c.post('/api/bank-statements/preview',headers=admin,json={'items':items})
    assert preview.status_code==200,preview.text
    assert preview.json()['effects'][0]['after']['commission']==9945315
    request={'items':items,'idempotencyKey':'http-control-key'}
    result=c.post('/api/bank-statements/commit',headers=admin,json=request)
    assert result.status_code==200 and result.json()['createdCount']==6,result.text
    assert c.post('/api/bank-statements/commit',headers=admin,json=request).json()==result.json()
    for method,path,kwargs in [
        ('get','/accounts',{}),('get','/uploads',{}),('get',f"/uploads/{detail['id']}",{}),
        ('get',f"/uploads/{detail['id']}/file",{}),('post',f"/uploads/{detail['id']}/refresh",{}),
        ('post','/preview',{'json':{'items':items}}),('post','/commit',{'json':request}),
        ('post',f"/operations/{items[0]['operationId']}/company-cancel",{'json':{'version':1,'reason':'forbidden'}}),
        ('patch',f"/operations/{items[0]['operationId']}",{'json':{'version':1,'classification':'sale','reason':'forbidden'}}),
        ('put',f"/clients/{clients[0]}/assignment",{'json':{'version':1,'managerId':mid,'startDate':'2026-11-01','reason':'forbidden'}}),
        ('get','/clients/search?query=Synthetic',{}),
    ]:
        assert getattr(c,method)('/api/bank-statements'+path,headers=user,**kwargs).status_code==403,path
    downloaded=c.get(f"/api/bank-statements/uploads/{detail['id']}/file",headers=admin)
    assert downloaded.status_code==200 and downloaded.content==raw
    assert downloaded.headers['x-content-type-options']=='nosniff'
    mine=c.get(f'/api/bank-statements/clients/{clients[-1]}',headers=user)
    assert mine.status_code==200,mine.text
    assert len(mine.json()['payments'])==2
    for receipt in mine.json()['payments']:
        assert not {'rate','income','commission','purpose','account','bik','payerName'} & receipt.keys()
    assert mine.json()['history']==[] and mine.json()['pending']['amount']==0
    assert c.get('/api/bank-statements/uploads').status_code==401


def test_bank_file_failures_and_account_mismatch_create_no_sales(auth_api):
    admin,user,account,clients,mid=setup_bank(auth_api)
    c=auth_api.client
    for name,raw in [('bad.xlsx',b'not xlsx'),('wrong.pdf',make_statement())]:
        assert c.post('/api/bank-statements/uploads',headers=admin,data={'accountId':str(account)},files={'file':(name,raw)}).status_code==400
    mismatch=make_statement(edit=lambda s:s.__setitem__('B2',SYNTHETIC_PAYER_INNS[0]))
    blocked=c.post('/api/bank-statements/uploads',headers=admin,data={'accountId':str(account)},files={'file':('wrong-owner.xlsx',mismatch)})
    assert blocked.status_code==200,blocked.text
    assert blocked.json()['status']=='blocked'
    assert all(o['status']=='data_error' for o in blocked.json()['operations'])
    with auth_api.service.db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_operations').fetchone()[0]==0
    assert c.get(f'/api/manager/dashboard?month=2026-11&managerId={mid}',headers=admin).json()['summary']['count']==0


def test_bank_upload_declared_request_limit_rejected_before_form_parsing(auth_api):
    admin=auth_api.bearer(auth_api.login('admin','admin-test-password'))
    response=auth_api.client.post('/api/bank-statements/uploads',
        headers={**admin,'Content-Length':str(20*1024*1024),'Content-Type':'multipart/form-data; boundary=synthetic'},
        content=b'')
    assert response.status_code==413,response.text


def test_bank_chunked_upload_limit_does_not_depend_on_content_length(auth_api):
    admin=auth_api.bearer(auth_api.login('admin','admin-test-password'))
    def chunks():
        yield b'--synthetic\r\nContent-Disposition: form-data; name="file"; filename="large.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n'
        for _ in range(12):
            yield b'x'*(1024*1024)
        yield b'\r\n--synthetic--\r\n'
    response=auth_api.client.post('/api/bank-statements/uploads',
        headers={**admin,'Content-Type':'multipart/form-data; boundary=synthetic'},content=chunks())
    assert response.status_code==413,response.text


def test_shared_client_does_not_expose_another_managers_receipts(auth_api):
    admin,user,account,clients,mid=setup_bank(auth_api)
    c=auth_api.client
    detail=c.post('/api/bank-statements/uploads',headers=admin,data={'accountId':str(account)},files={'file':('private.xlsx',make_statement())}).json()
    items=[dict(operationId=o['id'],version=o['version'],fingerprint=o['fingerprint']) for o in detail['operations']]
    assert c.post('/api/bank-statements/commit',headers=admin,json={'items':items,'idempotencyKey':'privacy-control-key'}).status_code==200
    db=auth_api.service.db
    db.create_user(username='bank-other-viewer',password='synthetic-password')
    other=auth_api.bearer(auth_api.login('bank-other-viewer','synthetic-password'))
    assert c.get(f'/api/bank-statements/clients/{clients[0]}',headers=other).status_code==403
    with db.transaction() as conn:
        cp=conn.execute("INSERT INTO counterparties(onec_key,name,inn,updated_at) VALUES('synthetic-shared-bank','Synthetic shared client',?,'test')",(SYNTHETIC_PAYER_INNS[0],)).lastrowid
        conn.execute('UPDATE crm_clients SET linked_counterparty_id=? WHERE id=?',(cp,clients[0]))
    shared=c.get(f'/api/bank-statements/clients/{clients[0]}',headers=other)
    assert shared.status_code==200,shared.text
    assert shared.json()['payments']==[] and shared.json()['history']==[]
    assert shared.json()['assignment']['managerId']==mid
    assert c.get(f"/api/bank-statements/uploads/{detail['id']}/file",headers=other).status_code==403


def test_import_requires_no_deepseek_or_remote_onec_access(auth_api,monkeypatch):
    import os
    import socket
    admin,user,account,clients,mid=setup_bank(auth_api)
    assert 'DEEPSEEK_API_KEY' not in os.environ
    def forbidden(*args,**kwargs):
        raise AssertionError('Bank import must not open a network connection or query remote 1C')
    monkeypatch.setattr(socket,'create_connection',forbidden)
    monkeypatch.setattr(auth_api.service,'list_organizations',forbidden)
    c=auth_api.client
    uploaded=c.post('/api/bank-statements/uploads',headers=admin,data={'accountId':str(account)},files={'file':('offline.xlsx',make_statement())})
    assert uploaded.status_code==200,uploaded.text
    assert uploaded.json()['summary']['readyCount']==6
    items=[dict(operationId=o['id'],version=o['version'],fingerprint=o['fingerprint']) for o in uploaded.json()['operations']]
    assert c.post('/api/bank-statements/commit',headers=admin,json={'items':items,'idempotencyKey':'offline-control-key'}).status_code==200


def test_company_confirmation_cancel_http_and_private_receipts(auth_api):
    admin, user, account, clients, mid = setup_bank(auth_api)
    c = auth_api.client
    with auth_api.service.db.transaction() as conn:
        conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (clients[0],))
    detail = c.post('/api/bank-statements/uploads', headers=admin, data={'accountId': str(account)},
                    files={'file': ('company.xlsx', make_statement())}).json()
    operation = detail['operations'][0]
    assert operation['status'] == 'manager_missing' and operation['companyCanConfirm']
    items = [dict(operationId=operation['id'], version=operation['version'], fingerprint=operation['fingerprint'])]
    request = dict(items=items, idempotencyKey='http-company-only')
    assert c.post('/api/bank-statements/commit', headers=user, json=request).status_code == 403
    assert c.post('/api/bank-statements/commit', headers=admin, json=request).json()['companyCount'] == 1
    assert c.get(f'/api/bank-statements/clients/{clients[0]}', headers=user).json()['payments'] == []
    report = c.get('/api/admin/dashboard/sales?period=month&date=2026-11-06', headers=admin).json()
    assert report['totals']['unallocatedSalesTotal'] == 36000000
    confirmed = c.post(f"/api/bank-statements/uploads/{detail['id']}/refresh", headers=admin).json()['operations'][0]
    path = f"/api/bank-statements/operations/{operation['id']}/company-cancel"
    payload = dict(version=confirmed['version'], reason='Synthetic wrong customer payment')
    assert c.post(path, json=payload).status_code == 401
    assert c.post(path, headers=user, json=payload).status_code == 403
    assert c.post(path, headers=admin, json=dict(version=operation['version'], reason='Stale')).status_code == 409
    assert c.post(path, headers=admin, json=dict(version=confirmed['version'], reason='')).status_code == 400
    cancelled = c.post(path, headers=admin, json=payload)
    assert cancelled.status_code == 200 and cancelled.json()['companyCancelled'], cancelled.text
    assert cancelled.headers['cache-control'] == 'no-store'
    assert c.post('/api/bank-statements/commit', headers=admin,
                  json=dict(items=items, idempotencyKey='http-company-replay-new')).status_code == 409
    assert c.post('/api/bank-statements/operations/999999/company-cancel', headers=admin, json=payload).status_code == 404
