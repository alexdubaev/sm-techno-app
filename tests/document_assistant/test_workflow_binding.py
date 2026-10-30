from tests.document_assistant.test_storage_flow import api
from tests.document_assistant.test_clients_contracts import FIELDS, requisites, confirm


def test_preview_and_bind_are_private_versioned_and_replayable(api, monkeypatch):
    http, service, users, cid = api
    with service.db.transaction(immediate=True) as conn:
        conn.execute('UPDATE crm_clients SET inn=?,kpp=? WHERE id=?', (FIELDS['inn'], FIELDS['kpp'], cid))
    job, asset = requisites(http, users, monkeypatch)
    url = f"/api/document-assistant/jobs/{job['id']}"
    before = service.db.list_crm_clients()
    with service.db.connect() as conn:
        state_before = conn.execute('SELECT COUNT(*) FROM client_document_state').fetchone()[0]
    match = http.post(url+'/client-match', headers=users['alice']['headers'], json={'version':job['version'],'fields':FIELDS})
    assert match.status_code == 200, match.text
    assert match.json()['status'] == 'matched' and match.json()['candidates'][0]['clientId'] == cid
    assert 'PRIVATE CANARY' not in match.text and service.db.list_crm_clients() == before
    with service.db.connect() as conn:
        assert conn.execute('SELECT COUNT(*) FROM client_document_state').fetchone()[0] == state_before
    assert http.post(url+'/client-match', headers=users['alice']['headers'], json={'version':job['version']-1,'fields':FIELDS}).status_code == 409
    assert http.post(url+'/client-match', headers=users['boris']['headers'], json={'version':job['version'],'fields':FIELDS}).status_code == 403
    other = service.db.create_crm_client_card({'document_name':'Другой клиент','inn':'7709999999','kpp':'770901001'})
    reviewed = confirm(http, users, job, action='review', key='review-new-bind-001').json()['job']
    body={'version':reviewed['version'],'clientId':cid,'operationKey':'bind-client-key-001'}
    assert http.post(url+'/bind-client', headers=users['boris']['headers'], json=body).status_code == 403
    assert http.post(url+'/bind-client', headers=users['alice']['headers'], json={**body,'clientId':other['id']}).status_code == 409
    assert http.post(url+'/bind-client', headers=users['alice']['headers'], json={**body,'version':body['version']-1}).status_code == 409
    bound=http.post(url+'/bind-client', headers=users['alice']['headers'], json=body)
    assert bound.status_code == 200, bound.text
    assert bound.json()['clientId'] == cid
    assert http.post(url+'/bind-client', headers=users['alice']['headers'], json=body).json() == bound.json()
    assert http.get(f"/api/document-assets/{asset['id']}/download",headers=users['boris']['headers']).status_code == 200
