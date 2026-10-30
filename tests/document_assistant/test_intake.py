from io import BytesIO
import pytest
from tests.document_assistant.test_storage_flow import api, docx_bytes, upload


def test_intake_job_persists_review_and_actor_scope(api, monkeypatch):
    http, service, users, cid = api
    response = http.post('/api/document-assistant/intake', headers=users['alice']['headers'],
        data={'kind':'requisites'}, files={'file':('source.docx', docx_bytes('ООО Тест ИНН 7701234567'))})
    assert response.status_code == 200, response.text
    asset = response.json()
    assert asset['clientId'] is None
    assert http.get(f'/api/document-assets/{asset["id"]}/download',headers=users['boris']['headers']).status_code == 403
    from stock_sync_web.assistant_extraction import ExtractionResult
    seen = []
    def extract(self, request):
        seen.append(request)
        return ExtractionResult('requisites', {'document_name':'ООО Тест','inn':'7701234567'}, [], ['signer_name'], [])
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',extract)
    response = http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'requisites','assetIds':[asset['id']]})
    assert response.status_code == 200, response.text
    job = http.get('/api/document-assistant/jobs/'+response.json()['id'],headers=users['alice']['headers']).json()
    assert job['status'] == 'review' and job['result']['payload']['inn'] == '7701234567'
    assert job['missingFields'] == ['signer_name'] and len(seen) == 1
    assert http.get('/api/document-assistant/jobs/'+job['id'],headers=users['boris']['headers']).status_code == 403
    body = {'version':job['version'],'operationKey':'review-operation-0001','action':'review','fields':{'document_name':'ООО Исправлено','inn':'7701234567'}}
    result = http.post('/api/document-assistant/jobs/'+job['id']+'/confirm',headers=users['alice']['headers'],json=body)
    assert result.status_code == 200, result.text
    assert result.json()['job']['status'] == 'confirmed'
    assert result.json()['job']['result']['payload']['document_name'] == 'ООО Исправлено'
    assert result.json()['job']['result']['extracted_payload']['document_name'] == 'ООО Тест'
    assert result.json()['job']['result']['review']['actorUserId'] == users['alice']['id']
    assert http.post('/api/document-assistant/jobs/'+job['id']+'/confirm',headers=users['alice']['headers'],json=body).json() == result.json()
    assert not service.db.list_documents()


def test_review_binding_is_explicit_atomic_and_replay_cannot_change_fields(api,monkeypatch):
    http,service,users,cid=api
    from stock_sync_web.assistant_extraction import ExtractionResult
    from stock_sync_web.assistant_repository import AssistantRepository, DocumentConflict, DocumentPermissionError
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,req:ExtractionResult('articles',{'rows':[{'article':'00123','requested_qty':None,'source_row':1}]}))
    source=http.post('/api/document-assistant/intake',headers=users['alice']['headers'],data={'kind':'articles'},files={'file':('source.txt',b'00123')}).json()
    created=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'articles','assetIds':[source['id']]}).json()
    job=http.get('/api/document-assistant/jobs/'+created['id'],headers=users['alice']['headers']).json()
    payload={'version':job['version'],'operationKey':'atomic-review-001','action':'review','fields':job['result']['payload']}
    confirmed=http.post('/api/document-assistant/jobs/'+job['id']+'/confirm',headers=users['alice']['headers'],json=payload).json()['job']
    changed={**payload,'fields':{'rows':[{'article':'CHANGED','requested_qty':None,'source_row':1}]}}
    assert http.post('/api/document-assistant/jobs/'+job['id']+'/confirm',headers=users['alice']['headers'],json=changed).status_code==409
    repo=AssistantRepository(service.db)
    with pytest.raises(DocumentPermissionError):repo.bind_reviewed_job(job['id'],users['boris']['id'],cid,confirmed['version'])
    assert repo.get_asset(source['id'])['crm_client_id'] is None
    bound=repo.bind_reviewed_job(job['id'],users['alice']['id'],cid,confirmed['version'])
    assert bound['crm_client_id']==cid and repo.get_asset(source['id'])['crm_client_id']==cid
    assert http.get('/api/document-assistant/jobs/'+job['id'],headers=users['boris']['headers']).status_code==200
    assert http.get(f'/api/document-assets/{source["id"]}/download',headers=users['boris']['headers']).status_code==200
    assert http.get(f'/api/crm/clients/{cid}',headers=users['boris']['headers']).status_code==403
    assert http.get('/api/document-assistant/jobs',headers=users['alice']['headers']).json()['items']==[]


@pytest.mark.parametrize('body',[{'kind':[],'assetIds':[1]},{'kind':'articles','assetIds':[{}]},{'kind':'articles','clientId':True,'assetIds':[1]}])
def test_malformed_job_requests_are_rejected_without_runtime(api,body):
    http,service,users,cid=api
    assert http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json=body).status_code==422


def test_failed_extraction_is_sanitized_and_invoice_requires_docx(api, monkeypatch):
    http,service,users,cid=api
    response=http.post('/api/document-assistant/intake',headers=users['alice']['headers'],data={'kind':'invoice'},files={'file':('source.txt',b'00123')})
    assert response.status_code==422
    asset=upload(http,users,cid,docx_bytes('00123'),'requisites').json()
    def fail(self,request): raise RuntimeError('SECRET/path/database.db')
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',fail)
    response=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'requisites','clientId':cid,'assetIds':[asset['id']]})
    assert response.status_code==200,response.text
    job=http.get('/api/document-assistant/jobs/'+response.json()['id'],headers=users['boris']['headers'])
    assert job.json()['status']=='failed' and 'SECRET' not in job.text and '/path' not in job.text
