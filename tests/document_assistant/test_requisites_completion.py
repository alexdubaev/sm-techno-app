from io import BytesIO
import json

from docx import Document
import pytest

from stock_sync_web.assistant_repository import AssistantRepository
from stock_sync_web.documents import build_document_context
from tests.document_assistant.test_clients_contracts import requisites, confirm, FIELDS
from tests.document_assistant.test_storage_flow import api


def test_review_completes_signer_and_replaces_heading_without_changing_extraction(api, monkeypatch):
    http, service, users, cid = api
    raw = {**FIELDS, 'document_name': 'Карточка организации', 'full_name': 'ООО «АгроВольтаж»',
           'signer_position': 'Генеральный директор', 'signer_name': 'Заздравных Алексей Юрьевич',
           'signer_position_genitive': None, 'signer_name_genitive': None, 'signer_short_name': None}
    job, _ = requisites(http, users, monkeypatch, fields=raw, cid=cid)
    fields = job['result']['payload']
    assert fields['document_name'] == raw['full_name']
    assert fields['signer_position_genitive'] == 'генерального директора'
    assert fields['signer_name_genitive'] == 'Заздравных Алексея Юрьевича'
    assert fields['signer_short_name'] == 'Заздравных А.Ю.'
    assert job['result']['extracted_payload'] == raw
    # Reopening an existing unconfirmed job uses the same completion, without DB writes.
    stored = AssistantRepository(service.db).get_job(job['id'])
    assert stored['result']['payload'] == raw
    assert http.get('/api/document-assistant/jobs/' + job['id'], headers=users['alice']['headers']).json() == job
    assert any('автоматически' in warning for warning in job['warnings'])
    assert not service.db.list_documents()


@pytest.mark.parametrize('full_name', [None, 'Реквизиты организации'])
def test_heading_without_company_name_stays_missing(api, monkeypatch, full_name):
    http, _, users, _ = api
    raw = {'document_name': 'КАРТОЧКА ОРГАНИЗАЦИИ:', 'full_name': full_name, 'inn': '7701234567'}
    job, _ = requisites(http, users, monkeypatch, fields=raw)
    assert not job['result']['payload']['document_name']
    assert 'document_name' in job['missingFields']
    assert not job['result']['payload'].get('signer_name_genitive')
    assert not job['result']['payload'].get('signer_short_name')
    response = confirm(http, users, job, 'review')
    assert response.status_code == 422


def test_manager_corrections_reach_contract_snapshot_and_word(api, monkeypatch):
    http, service, users, cid = api
    raw = {**FIELDS, 'signer_position': 'Генеральный директор', 'signer_name': 'Заздравных Алексей Юрьевич'}
    job, _ = requisites(http, users, monkeypatch, fields=raw, cid=cid)
    corrected = {**job['result']['payload'], 'signer_position_genitive': 'Генерального директора',
                 'signer_name_genitive': 'Заздравных Алексея Юрьевича', 'signer_short_name': 'Заздравных А. Ю.'}
    reviewed = confirm(http, users, job, 'review', corrected).json()['job']
    result = confirm(http, users, reviewed, 'generate_contract',
                     {**corrected, 'contract_number': 'Д-42', 'contract_date': '2026-11-02'}, key='completed-contract-42')
    assert result.status_code == 200, result.text
    document_id = result.json()['resultId']
    snapshot = json.loads(AssistantRepository(service.db).get_document(document_id)['legal_snapshot_json'])
    word = Document(BytesIO(http.get(f'/api/documents/{document_id}/download', headers=users['alice']['headers']).content))
    text = '\n'.join([*(p.text for p in word.paragraphs), *(cell.text for table in word.tables for row in table.rows for cell in row.cells)])
    for key in ('signer_position_genitive', 'signer_name_genitive', 'signer_short_name'):
        assert snapshot[key] == corrected[key]
        assert corrected[key] in text
    assert 'Заздравныха' not in text


def test_correcting_signer_refreshes_unchanged_automatic_forms_and_replays(api, monkeypatch):
    http, _, users, cid = api
    job, _ = requisites(http, users, monkeypatch, cid=cid)
    fields = {**job['result']['payload'], 'signer_name': 'Заздравных Алексей Юрьевич'}
    response = confirm(http, users, job, 'review', fields)
    assert response.status_code == 200, response.text
    reviewed = response.json()['job']['result']['payload']
    assert reviewed['signer_name_genitive'] == 'Заздравных Алексея Юрьевича'
    assert reviewed['signer_short_name'] == 'Заздравных А.Ю.'
    assert confirm(http, users, job, 'review', fields).json() == response.json()


def test_review_preserves_printed_forms_and_clears_completed_missing_fields():
    from stock_sync_web.assistant_requisites import complete_requisites_review
    raw = {'payload': {**FIELDS, 'signer_short_name': 'Иванов И. И.'},
           'missing_fields': ['signer_name_genitive', 'signer_position_genitive', 'bank_account'], 'warnings': []}
    result = complete_requisites_review(raw)
    assert result['payload']['signer_short_name'] == 'Иванов И. И.'
    assert result['missing_fields'] == ['bank_account']
    assert 'signer_name_genitive' not in raw['payload']


@pytest.mark.parametrize('name, expected', [
    ('Заздравных Алексей Юрьевич', 'Заздравных Алексея Юрьевича'),
    ('Черных Анна Сергеевна', 'Черных Анны Сергеевны'),
    ('Долгих Сергей Михайлович', 'Долгих Сергея Михайловича'),
    ('Иванов Иван Иванович', 'Иванова Ивана Ивановича'),
])
def test_contract_declension_keeps_indeclinable_surnames(name, expected):
    context = build_document_context(client={'signer_name': name}, document_number='1', document_date='2026-11-02')
    assert context['client']['signer_name_genitive'] == expected
