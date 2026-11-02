from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from openpyxl import load_workbook
import pytest

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService
from .conftest import INITIAL_ADMIN_PASSWORD


def setup_catalog(auth_api):
    db = auth_api.service.db
    visible = db.create_warehouse(name='Склад клиентский')
    hidden = db.create_warehouse(name='Склад внутренний')
    for sku, balances in [
        ('WARE-SHARED', [(visible, 3), (hidden, 5)]),
        ('WARE-HIDDEN', [(hidden, 7)]),
        ('WARE-HIDDEN-ZERO', [(hidden, 0)]),
        ('WARE-CATALOG', []),
    ]:
        db.create_local_item(sku=sku, name=sku, print_name=sku, category_name='Тест', group_name='Тест',
                             price=100, warehouses=[{'warehouse_id': w['id'], 'warehouse_name': w['name'], 'quantity': q} for w, q in balances] or None)
    with db.transaction() as conn:
        conn.execute('UPDATE item_warehouse_balances SET price=100')
        conn.execute('UPDATE item_warehouse_balances SET price=999 WHERE warehouse_id=?', (hidden['id'],))
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    return visible, hidden, headers


def toggle(auth_api, warehouse, headers, value):
    return auth_api.client.patch(f"/api/warehouses/{warehouse['id']}/client-price", headers=headers,
                                 json={'includeInClientPrice': value})


def export_rows(auth_api, headers, query=''):
    response = auth_api.client.get('/api/price/client-export' + query, headers=headers)
    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content), data_only=False).active
    return [row for row in sheet.iter_rows(min_row=2, max_col=6, values_only=True) if str(row[0] or '').startswith('WARE-')]


def test_client_excel_filters_disabled_warehouse_without_changing_internal_stock(auth_api):
    visible, hidden, headers = setup_catalog(auth_api)
    initial = auth_api.client.get('/api/warehouses', headers=headers).json()['items']
    assert all(w['includeInClientPrice'] for w in initial)
    before = auth_api.service.db.list_items(split_by_warehouse=True)
    assert toggle(auth_api, hidden, headers, False).status_code == 200
    assert auth_api.service.db.list_items(split_by_warehouse=True) == before
    rows = export_rows(auth_api, headers)
    assert {row[0] for row in rows} == {'WARE-SHARED', 'WARE-CATALOG'}
    shared = next(row for row in rows if row[0] == 'WARE-SHARED')
    assert shared[3:] == (3, 100, visible['name'])
    assert not export_rows(auth_api, headers, f"?warehouse_id={hidden['id']}")
    assert {row[0] for row in export_rows(auth_api, headers, '?only_in_stock=true')} == {'WARE-SHARED'}
    assert toggle(auth_api, visible, headers, False).status_code == 200
    assert {row[0] for row in export_rows(auth_api, headers)} == {'WARE-CATALOG'}


def test_setting_survives_rename_import_restart_and_can_be_enabled_again(auth_api):
    _, hidden, headers = setup_catalog(auth_api)
    assert toggle(auth_api, hidden, headers, False).status_code == 200
    renamed = auth_api.client.patch(f"/api/warehouses/{hidden['id']}", headers=headers, json={'name': 'Склад после переименования'})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()['warehouse']['includeInClientPrice'] is False
    auth_api.service.db.import_stock_rows([{'sku': 'WARE-IMPORT', 'name': 'WARE-IMPORT', 'print_name': 'WARE-IMPORT',
        'category_name': 'Тест', 'group_name': 'Тест', 'price': 15, 'warehouse_name': 'Склад после переименования', 'quantity': 8}])
    recreated = WebStockSyncService(db=WebDatabase(auth_api.service.db.db_path),
        commercial_offer_storage_dir=auth_api.data_dir/'offers', document_storage_dir=auth_api.data_dir/'documents')
    assert next(w for w in recreated.list_warehouses() if w['id'] == hidden['id'])['include_in_client_price'] is False
    assert 'WARE-IMPORT' not in {row[0] for row in export_rows(auth_api, headers)}
    assert toggle(auth_api, hidden, headers, True).json()['warehouse']['includeInClientPrice'] is True
    assert {'WARE-HIDDEN', 'WARE-IMPORT'} <= {row[0] for row in export_rows(auth_api, headers)}


def test_only_admin_can_change_setting_and_regular_export_cannot_bypass_it(auth_api):
    _, hidden, headers = setup_catalog(auth_api)
    auth_api.service.db.create_user(username='operator', password='operator-password', role='user')
    user_headers = auth_api.bearer(auth_api.login('operator', 'operator-password'))
    assert toggle(auth_api, hidden, {}, False).status_code == 401
    assert toggle(auth_api, hidden, user_headers, False).status_code == 403
    assert toggle(auth_api, hidden, headers, False).status_code == 200
    assert not export_rows(auth_api, user_headers, f"?warehouse_id={hidden['id']}")
    assert 'WARE-HIDDEN' not in {row[0] for row in export_rows(auth_api, user_headers)}


@pytest.mark.parametrize('payload', [{}, {'includeInClientPrice': 'false'}, {'includeInClientPrice': 0},
                                    {'includeInClientPrice': None}, {'includeInClientPrice': False, 'name': 'rename'}])
def test_toggle_rejects_malformed_values_without_changing_settings(auth_api, payload):
    warehouse = auth_api.service.db.create_warehouse(name='Склад')
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    before = auth_api.service.db.get_settings()
    response = auth_api.client.patch(f"/api/warehouses/{warehouse['id']}/client-price", headers=headers, json=payload)
    assert response.status_code == 422
    assert auth_api.service.db.get_settings() == before


def test_missing_or_deleted_warehouse_cannot_be_configured(auth_api):
    warehouse = auth_api.service.db.create_warehouse(name='Удалённый')
    auth_api.service.db.delete_warehouse(warehouse['id'])
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    assert toggle(auth_api, warehouse, headers, False).status_code == 404
    assert toggle(auth_api, {'id': 999999}, headers, False).status_code == 404


def test_independent_flags_do_not_get_lost_or_reset_by_system_settings(auth_api):
    visible, hidden, _ = setup_catalog(auth_api)
    service = auth_api.service
    stale = service.get_system_settings()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda w: service.set_warehouse_client_price(w['id'], include=False), [visible, hidden]))
    # Generic settings round-trips must not overwrite this namespace.
    stale.update(service.db.get_settings())
    for key in list(stale):
        if key.startswith('warehouse_client_price:'):
            stale[key] = '1'
    stale['vat_percent'] = '20'
    service.save_system_settings(stale)
    rows = service.list_warehouses()
    assert all(not next(row for row in rows if row['id'] == w['id'])['include_in_client_price'] for w in (visible, hidden))
    assert not any(key.startswith('warehouse_client_price:') for key in service.get_system_settings())
    assert service.get_system_settings()['vat_percent'] == '20'
