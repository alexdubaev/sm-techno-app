from io import BytesIO
import sqlite3
from unittest.mock import patch

import pytest
from starlette.datastructures import UploadFile

from stock_sync_web.assistant_repository import AssistantRepository
from stock_sync_web.assistant_service import DocumentAssistantService
from tests.document_assistant.test_storage_flow import api, docx_bytes, upload
from tests.document_assistant.test_clients_contracts import FIELDS, requisites, confirm


@pytest.mark.parametrize('flow', ['upload', 'intake', 'version', 'generated_contract'])
def test_committed_files_survive_response_lookup_failure(api, monkeypatch, flow):
    http, service, users, cid = api
    original = docx_bytes('Immutable original')
    document = None
    job = None
    if flow == 'version':
        asset = upload(http, users, cid, original).json()
        document = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
            json={'type':'contract', 'assetId':asset['id'], 'number':'17', 'date':'2026-10-30'}).json()
    elif flow == 'generated_contract':
        job, source = requisites(http, users, monkeypatch, cid=cid)
        original = http.get(f"/api/document-assets/{source['id']}/download", headers=users['alice']['headers']).content
    before = {row['id'] for row in AssistantRepository(service.db).list_client_assets(cid)}
    lookup = 'get_document' if flow == 'generated_contract' else 'get_asset'
    content = docx_bytes('Durably saved new bytes')
    with patch.object(AssistantRepository, lookup, side_effect=sqlite3.OperationalError('response lookup unavailable')):
        try:
            if flow == 'upload':
                upload(http, users, cid, content)
            elif flow == 'intake':
                http.post('/api/document-assistant/intake', headers=users['alice']['headers'],
                    data={'kind':'requisites'}, files={'file':('source.docx', content)})
            elif flow == 'version':
                http.post(f"/api/crm/clients/{cid}/documents/{document['id']}/versions", headers=users['alice']['headers'],
                    data={'role':'contract_version', 'expectedVersion':1}, files={'file':('version.docx', content)})
            else:
                confirm(http, users, job, 'generate_contract', {**FIELDS, 'contract_number':'17', 'contract_date':'2026-10-30'})
        except sqlite3.OperationalError:
            pass  # A failed response is allowed; a committed file must remain downloadable.
    with service.db.connect() as conn:
        rows = [dict(row) for row in conn.execute('SELECT * FROM client_document_assets ORDER BY id') if row['id'] not in before]
    assert len(rows) == 1
    saved = http.get(f"/api/document-assets/{rows[0]['id']}/download", headers=users['alice']['headers'])
    assert saved.status_code == 200, saved.text
    if flow == 'generated_contract':
        assert saved.content.startswith(b'PK')
        assert http.get(f"/api/document-assets/{source['id']}/download", headers=users['alice']['headers']).content == original
        # A new confirmation must retain the same canonical root, never add a second contract.
        retry_job, _ = requisites(http, users, monkeypatch, cid=cid)
        retry = confirm(http, users, retry_job, 'generate_contract',
            {**FIELDS, 'contract_number':'17', 'contract_date':'2026-10-30'}, key='retry-after-response-failure')
        assert retry.status_code == 200, retry.text
        assert retry.json()['resultId'] == rows[0]['document_id']
    else:
        assert saved.content == content
    if document:
        assert http.get(f"/api/document-assets/{asset['id']}/download", headers=users['alice']['headers']).content == original
        assert http.get(f"/api/documents/{document['id']}/download", headers=users['alice']['headers']).content == content
        stale = http.post(f"/api/crm/clients/{cid}/documents/{document['id']}/versions", headers=users['alice']['headers'],
            data={'role':'contract_version', 'expectedVersion':1}, files={'file':('retry.docx', content)})
        assert stale.status_code == 409


@pytest.mark.parametrize('flow', ['upload', 'intake', 'version'])
def test_committed_files_survive_response_serialization_failure(api, flow):
    http, service, users, cid = api
    content = docx_bytes('Committed before serialization')
    actor = {'id':users['alice']['id'], 'role':'user'}
    assistant = DocumentAssistantService(service)
    document = None
    if flow == 'version':
        asset = upload(http, users, cid, docx_bytes('Original')).json()
        document = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
            json={'type':'contract', 'assetId':asset['id'], 'number':'17', 'date':'2026-10-30'}).json()
    with patch('stock_sync_web.assistant_service.serialize_asset', side_effect=RuntimeError('response serialization unavailable')):
        with pytest.raises(RuntimeError, match='serialization unavailable'):
            file = UploadFile(BytesIO(content), filename='saved.docx')
            if flow == 'upload':
                assistant.upload_asset(actor, cid, 'attachment', file)
            elif flow == 'intake':
                assistant.intake(actor, 'requisites', file)
            else:
                assistant.upload_version(actor, cid, document['id'], 'contract_version', file, 1)
    with service.db.connect() as conn:
        asset_id = conn.execute('SELECT MAX(id) FROM client_document_assets').fetchone()[0]
    response = http.get(f'/api/document-assets/{asset_id}/download', headers=users['alice']['headers'])
    assert response.status_code == 200, response.text
    assert response.content == content


def test_legacy_cached_counterparty_has_one_contract_without_creating_crm_card(api):
    http, service, users, _ = api
    service.db.upsert_counterparties([{'onec_key':'synthetic-unlinked', 'name':'Program label',
        'full_name':'ООО Документное имя', 'inn':'7701234567', 'kpp':'770101001'}])
    counterparty = service.db.get_counterparty_by_onec_key('synthetic-unlinked')
    before_clients = service.db.list_crm_clients()
    body = {'documentType':'contract', 'clientSource':'onec', 'clientId':counterparty['id'],
        'number':'17', 'documentDate':'2026-10-30'}
    first = http.post('/api/documents', headers=users['alice']['headers'], json=body)
    assert first.status_code == 200, first.text
    second = http.post('/api/documents', headers=users['boris']['headers'], json={**body, 'number':'18'})
    assert second.status_code == 409, second.text
    assert service.db.list_crm_clients() == before_clients
    assert http.get(f"/api/documents/{first.json()['document']['id']}/download", headers=users['boris']['headers']).status_code == 200
    assert len(service.db.list_documents()) == 1


@pytest.mark.parametrize('new_root', ['imported', 'generated', 'legacy'])
def test_new_contract_root_restarts_sequence_but_version_and_replay_preserve_it(api, monkeypatch, new_root):
    http, service, users, cid = api
    def import_contract(number):
        asset = upload(http, users, cid, docx_bytes('Contract '+number)).json()
        response = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
            json={'type':'contract', 'assetId':asset['id'], 'number':number, 'date':'2026-10-30'})
        assert response.status_code == 200, response.text
        return response.json(), asset
    contract, asset = import_contract('17')
    archived = upload(http, users, cid, docx_bytes('Archive specification 5')).json()
    spec = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
        json={'type':'specification', 'assetId':archived['id'], 'number':'5', 'date':'2026-10-30'}).json()
    replay = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
        json={'type':'contract', 'assetId':asset['id'], 'number':'17', 'date':'2026-10-30'})
    assert replay.status_code == 200, replay.text
    version = http.post(f"/api/crm/clients/{cid}/documents/{contract['id']}/versions", headers=users['alice']['headers'],
        data={'role':'contract_version', 'expectedVersion':1}, files={'file':('version.docx', docx_bytes('Updated contract'))})
    assert version.status_code == 200, version.text
    assert http.get(f'/api/crm/clients/{cid}/documents', headers=users['alice']['headers']).json()['nextSpecNumber'] == 6
    for document in (spec, contract):
        deleted = http.delete(f"/api/documents/{document['id']}", headers=users['admin']['headers'])
        assert deleted.status_code == 200, deleted.text
    if new_root == 'imported':
        created, _ = import_contract('18')
    elif new_root == 'generated':
        job, _ = requisites(http, users, monkeypatch, cid=cid)
        response = confirm(http, users, job, 'generate_contract', {**FIELDS, 'contract_number':'18', 'contract_date':'2026-10-30'})
        assert response.status_code == 200, response.text
        created = {'id':response.json()['resultId']}
    else:
        response = http.post('/api/documents', headers=users['alice']['headers'], json={
            'documentType':'contract', 'clientSource':'local', 'clientId':cid, 'number':'18', 'documentDate':'2026-10-30'})
        assert response.status_code == 200, response.text
        created = response.json()['document']
    summary = http.get(f'/api/crm/clients/{cid}/documents', headers=users['alice']['headers']).json()
    assert summary['contract']['id'] == created['id'] != contract['id']
    assert summary['nextSpecNumber'] == 1

@pytest.mark.parametrize('flow', ['upload', 'intake', 'version', 'generated_contract'])
def test_precommit_failure_rolls_back_metadata_and_new_bytes(api, monkeypatch, flow):
    from contextlib import contextmanager
    http, service, users, cid = api
    assistant = DocumentAssistantService(service)
    actor = {'id':users['alice']['id'], 'role':'user'}
    original = docx_bytes('Original remains intact')
    document = job = None
    if flow == 'version':
        asset = upload(http, users, cid, original).json()
        document = http.post(f'/api/crm/clients/{cid}/documents/import', headers=users['alice']['headers'],
            json={'type':'contract', 'assetId':asset['id'], 'number':'17', 'date':'2026-10-30'}).json()
    elif flow == 'generated_contract':
        job, _ = requisites(http, users, monkeypatch, cid=cid)
    with service.db.connect() as conn:
        before = [tuple(row) for row in conn.execute('SELECT id,storage_key FROM client_document_assets ORDER BY id')]
    before_files = {path for path in assistant.store.root.glob('*/*') if path.is_file()}
    transaction = service.db.transaction
    @contextmanager
    def fail_before_commit(*args, **kwargs):
        with transaction(*args, **kwargs) as conn:
            yield conn
            count = conn.execute('SELECT COUNT(*) FROM client_document_assets').fetchone()[0]
            if count > len(before):
                raise sqlite3.OperationalError('metadata transaction failed before commit')
    with patch.object(service.db, 'transaction', fail_before_commit):
        with pytest.raises(sqlite3.OperationalError, match='before commit'):
            file = UploadFile(BytesIO(docx_bytes('Rejected new bytes')), filename='rejected.docx')
            if flow == 'upload':
                assistant.upload_asset(actor, cid, 'attachment', file)
            elif flow == 'intake':
                assistant.intake(actor, 'requisites', file)
            elif flow == 'version':
                assistant.upload_version(actor, cid, document['id'], 'contract_version', file, 1)
            else:
                assistant.confirm_extraction(actor, job['id'], job['version'],
                    {**FIELDS, 'contract_number':'17', 'contract_date':'2026-10-30'}, 'precommit-contract-failure', 'generate_contract')
    with service.db.connect() as conn:
        assert [tuple(row) for row in conn.execute('SELECT id,storage_key FROM client_document_assets ORDER BY id')] == before
    assert {path for path in assistant.store.root.glob('*/*') if path.is_file()} == before_files
    assert not list(assistant.store.staging.iterdir())
    if document:
        assert http.get(f"/api/documents/{document['id']}/download", headers=users['alice']['headers']).content == original
