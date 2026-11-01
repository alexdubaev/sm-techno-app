def test_admin_sales_access_and_empty_period(auth_api):
    client = auth_api.client
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    assert client.get('/api/admin/dashboard/sales?period=month&date=2026-10-15').status_code == 401
    response = client.get('/api/admin/dashboard/sales?period=month&date=2026-10-15', headers=admin)
    assert response.status_code == 200
    data = response.json()
    assert data['totals'] == {'salesTotal': 0, 'count': 0}
    assert len(data['series']) == 31
    assert data['period']['start'] == '2026-10-01'

def test_sales_periods_cancellations_and_plans(auth_api):
    c = auth_api.client
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    uid = auth_api.service.db.create_user(username='dash-user', password='dash-pass', role='user', full_name='Dash User')
    user = auth_api.bearer(auth_api.login('dash-user', 'dash-pass'))
    assert c.get('/api/admin/dashboard/sales', headers=user).status_code == 403
    accounts = c.get('/api/manager/managers', headers=admin).json()
    manager = next(a for a in accounts if a['userId'] == uid)
    with auth_api.service.db.transaction(immediate=True) as conn:
        conn.execute('INSERT INTO manager_periods(manager_id,month,plan) VALUES(?,?,?)', (manager['id'], '2026-10', 1000))
        for d, amount, cancelled, source in [('2026-10-01',1500,0,'manual'),('2026-10-31',500,0,'onec'),('2026-10-02',9000,1,'manual')]:
            conn.execute('INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,cancelled,source,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (manager['id'],'2026-10',d,'test',amount,0,cancelled,source,uid,'2026-10-01'))
    result = c.get('/api/admin/dashboard/sales?period=quarter&date=2026-10-15', headers=admin)
    assert result.status_code == 200 and result.headers['cache-control'] == 'no-store'
    data = result.json()
    assert data['totals'] == {'salesTotal':2000, 'count':2}
    assert sum(x['amount'] for x in data['series']) == 2000
    assert sum(x['salesTotal'] for x in data['managers']) == 2000
    assert data['sources'] == {'manualCount':1,'onecCount':1,'odataConnected':False}
    plan = next(x for x in data['monthlyPlans']['managers'] if x['id'] == manager['id'])
    assert (plan['status'],plan['progress']) == ('planned',200)
    assert c.get('/api/admin/dashboard/sales?period=month&date=2026-02-30', headers=admin).status_code == 400


def test_usage_migration_and_null_values(auth_api):
    from stock_sync_web.deepseek_usage import sink_for
    db = auth_api.service.db
    sink = sink_for(db)
    sink('deepseek-flash','success',{'prompt_tokens':5,'completion_tokens':True,'total_tokens':'5'})
    admin = auth_api.bearer(auth_api.login('admin', 'admin-test-password'))
    result = auth_api.client.get('/api/admin/dashboard/deepseek', headers=admin)
    assert result.status_code == 200
    data = result.json()
    assert data['trackingStartedAt'] and data['totals']['requests'] == 1
    assert data['totals']['promptTokens'] == 5
    assert data['totals']['completionTokens'] is None and data['totals']['unknownUsageRequests'] == 1
    db.initialize()
    assert auth_api.client.get('/api/admin/dashboard/deepseek', headers=admin).json()['totals']['requests'] == 1

def test_week_year_history_and_plan_states(auth_api):
    c=auth_api.client; db=auth_api.service.db
    admin=auth_api.bearer(auth_api.login('admin','admin-test-password'))
    uid=db.create_user(username='inactive-dashboard',password='synthetic-pass',role='user',full_name='Inactive')
    c.get('/api/manager/managers',headers=admin)
    with db.transaction(immediate=True) as conn:
        admin_id=conn.execute("SELECT a.id FROM manager_accounts a JOIN users u ON u.id=a.user_id WHERE u.username='admin'").fetchone()[0]
        inactive_id=conn.execute('SELECT id FROM manager_accounts WHERE user_id=?',(uid,)).fetchone()[0]
        conn.execute("INSERT INTO manager_accounts(user_id,display_name) VALUES(NULL,'Archive')")
        archive_id=conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        for manager, month, plan in [(admin_id,'2025-12',None),(inactive_id,'2026-01',0),(archive_id,'2026-01',100)]:
            conn.execute('INSERT INTO manager_periods(manager_id,month,plan) VALUES(?,?,?)',(manager,month,plan))
        for manager, month, day, amount in [(admin_id,'2025-12','2025-12-31',100),(inactive_id,'2026-01','2026-01-01',200),(archive_id,'2026-01','2026-01-04',300)]:
            conn.execute('INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,cancelled,source,created_by,updated_at) VALUES(?,?,?,?,?,0,0,?,?,?)',(manager,month,day,'synthetic',amount,'manual',uid,'2026-01-01'))
    db.update_user_account(uid,role='user',is_active=False)
    week=c.get('/api/admin/dashboard/sales?period=week&date=2026-01-01',headers=admin).json()
    assert (week['period']['start'],week['period']['end']) == ('2025-12-29','2026-01-04')
    assert week['totals'] == {'salesTotal':600,'count':3}
    assert sum(x['salesTotal'] for x in week['managers']) == 600
    assert next(x for x in week['managers'] if x['id']==inactive_id)['active'] is False
    assert next(x for x in week['managers'] if x['id']==archive_id)['archived'] is True
    plans={x['id']:x for x in week['monthlyPlans']['managers']}
    assert plans[admin_id]['status']=='unset' and plans[inactive_id]['status']=='no_plan'
    assert plans[archive_id]['status']=='planned' and plans[archive_id]['progress']==300
    year=c.get('/api/admin/dashboard/sales?period=year&date=2026-06-01',headers=admin).json()
    assert len(year['series'])==12 and year['series'][0]['amount']==500 and year['totals']['salesTotal']==500


def test_usage_and_balance_admin_guard(auth_api):
    db=auth_api.service.db; c=auth_api.client
    uid=db.create_user(username='metrics-user',password='synthetic-pass',role='user',full_name='Metrics')
    user=auth_api.bearer(auth_api.login('metrics-user','synthetic-pass'))
    admin=auth_api.bearer(auth_api.login('admin','admin-test-password'))
    for path in ('/api/admin/dashboard/deepseek','/api/admin/dashboard/deepseek/balance'):
        assert c.get(path).status_code==401
        assert c.get(path,headers=user).status_code==403
        assert c.get(path,headers=admin).status_code==200
    db.update_user_account(uid,role='user',is_active=False)
    for path in ('/api/admin/dashboard/deepseek','/api/admin/dashboard/deepseek/balance'):
        assert c.get(path,headers=user).status_code==401

def test_all_extraction_consumers_share_persistent_sink(auth_api, monkeypatch):
    from stock_sync_web.assistant_deepseek import DeepSeekDocumentExtractor
    from stock_sync_web.assistant_extraction import ExtractionRequest, ExtractionResult
    from stock_sync_web.assistant_service import DocumentAssistantService
    monkeypatch.setenv('DOCUMENT_ASSISTANT_PROVIDER','deepseek')
    def fake_extract(self, request, *, temp_root=None):
        assert self.usage_sink is not None
        self.usage_sink('deepseek-flash','success',{'prompt_tokens':2,'completion_tokens':1,'total_tokens':3})
        return ExtractionResult('articles',{'rows':[{'article':'00123','requested_qty':None,'source_row':1}]})
    monkeypatch.setattr(DeepSeekDocumentExtractor,'extract',fake_extract)
    service=DocumentAssistantService(auth_api.service,repository=object(),store=object())
    service.extractor.extract(ExtractionRequest('articles',[],[],[]))
    admin=auth_api.bearer(auth_api.login('admin','admin-test-password'))
    upload={'file':('list.txt',b'00123','text/plain')}
    assert auth_api.client.post('/api/stock/valuation/intake',headers=admin,files=upload).status_code==200
    credential=auth_api.client.post('/api/stock/shortcut-devices',headers=admin,json={'label':'Synthetic'}).json()['credential']
    assert auth_api.client.post('/api/shortcuts/stock/intake',headers={'Authorization':'Shortcut '+credential},files=upload).status_code==200
    data=auth_api.client.get('/api/admin/dashboard/deepseek',headers=admin).json()
    assert data['totals']['requests']==3 and data['totals']['totalTokens']==9


def test_usage_upgrade_preserves_populated_legacy_ledger(tmp_path, monkeypatch):
    import sqlite3
    import pytest
    from stock_sync_web.database import WebDatabase
    from stock_sync_web.deepseek_usage import VERSION, sink_for

    with monkeypatch.context() as legacy:
        legacy.setattr(WebDatabase, 'WEB_MIGRATIONS', tuple(m for m in WebDatabase.WEB_MIGRATIONS if m[0] != VERSION))
        db = WebDatabase(tmp_path / 'legacy.db')
        db.initialize()
    with db.transaction(immediate=True) as conn:
        conn.execute("INSERT INTO manager_accounts(id,display_name) VALUES(1,'Historical employee')")
        conn.execute("INSERT INTO manager_periods(manager_id,month,plan,fixed,rate,mode) VALUES(1,'2026-10',100,50,200,'minimum')")
        conn.execute("INSERT INTO manager_sales(id,manager_id,month,date,client,amount,rate,created_by,updated_at) VALUES(1,1,'2026-10','2026-10-31','Synthetic client',150,200,1,'2026-10-31')")
        before = {table: [tuple(r) for r in conn.execute('SELECT * FROM ' + table)] for table in ('manager_accounts','manager_periods','manager_sales')}
        assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name='deepseek_usage'").fetchone()
    db.initialize()
    sink_for(db)('deepseek-flash', 'success', {'prompt_tokens':2,'completion_tokens':1,'total_tokens':3})
    db.initialize()
    with db.transaction() as conn:
        assert all([tuple(r) for r in conn.execute('SELECT * FROM ' + table)] == rows for table, rows in before.items())
        assert conn.execute('SELECT COUNT(*) FROM deepseek_usage').fetchone()[0] == 1
        assert conn.execute('SELECT COUNT(*) FROM web_schema_migrations WHERE version=?',(VERSION,)).fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO deepseek_usage(occurred_at,model,outcome,total_tokens) VALUES('2026-11-01','deepseek-flash','success',-1)")
