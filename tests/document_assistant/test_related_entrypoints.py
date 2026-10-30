import pytest

from tests.document_assistant.test_storage_flow import api


@pytest.mark.parametrize('mapping', ['linked', 'unlinked', 'ambiguous'])
def test_related_order_and_legacy_offer_resolve_only_unique_client(api, mapping):
    http, service, users, cid = api
    with service.db.transaction() as conn:
        conn.execute("INSERT INTO counterparties(id,onec_key,name,full_name,updated_at) VALUES(901,'synthetic-navigation','Program name','ООО Документное имя','2026-10-30')")
        if mapping != 'unlinked':
            conn.execute('UPDATE crm_clients SET linked_counterparty_id=901 WHERE id=?', (cid,))
    if mapping == 'ambiguous':
        other = service.db.create_crm_client_card({'document_name':'Another card'})
        with service.db.transaction() as conn:
            conn.execute('DROP INDEX idx_crm_clients_linked_counterparty_unique')
            conn.execute('UPDATE crm_clients SET linked_counterparty_id=901 WHERE id=?', (other['id'],))
    order_id = service.db.create_order(counterparty_id=901, contract_id=None, organization_key=None,
        order_date='2026-10-30', comment='', lines=[], created_by_user_id=users['boris']['id'])
    offer_id = service.db.create_commercial_offer(number='SYNTHETIC-NAV', client_source='onec',
        counterparty_id=901, crm_client_id=None, client_name='ООО Документное имя', offer_date='2026-10-30',
        source_filename=None, source_path=None, output_path='not-downloaded.xlsx', notes='',
        lines=[{'row_no':1, 'name':'Synthetic item', 'qty':1, 'price_vat':100, 'amount_vat':100}],
        created_by_user_id=users['boris']['id'])
    before = service.db.list_crm_clients()
    headers = users['boris']['headers']
    expected = cid if mapping == 'linked' else None
    for path, key in [('/api/orders','items'), (f'/api/orders/{order_id}','order'),
                      ('/api/commercial-offers','items'), (f'/api/commercial-offers/{offer_id}','offer')]:
        response = http.get(path, headers=headers)
        assert response.status_code == 200, response.text
        row = response.json()[key]
        if isinstance(row, list):
            row = row[0]
        assert row['crmClientId'] == expected
        assert 'PRIVATE CANARY' not in response.text
    assert service.db.list_crm_clients() == before
    assert http.get(f'/api/orders/{order_id}', headers=users['alice']['headers']).status_code == 404
    assert http.get(f'/api/commercial-offers/{offer_id}', headers=users['alice']['headers']).status_code == 404
    if mapping == 'linked':
        summary = http.get(f'/api/crm/clients/{cid}/documents', headers=headers)
        assert summary.status_code == 200
        assert summary.json()['clientId'] == cid
        assert 'PRIVATE CANARY' not in summary.text
