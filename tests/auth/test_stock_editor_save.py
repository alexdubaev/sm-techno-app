import pytest

from .conftest import INITIAL_ADMIN_PASSWORD


@pytest.fixture
def stock_editor(auth_api):
    db = auth_api.service.db
    first = db.create_warehouse(name='Synthetic First')
    second = db.create_warehouse(name='Synthetic Second')
    db.import_stock_rows([
        {'sku': 'SYN-SAVE-1', 'name': 'Synthetic item', 'price': 100, 'quantity': 5, 'warehouse_name': first['name']},
        {'sku': 'SYN-SAVE-1', 'name': 'Synthetic item', 'price': 250, 'quantity': 2, 'warehouse_name': second['name']},
    ])
    with db.connect() as conn:
        item_id = conn.execute("SELECT id FROM items WHERE sku='SYN-SAVE-1'").fetchone()[0]
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    return auth_api, headers, item_id, first['id'], second['id']


def saved_rows(db, item_id):
    with db.connect() as conn:
        return {r['warehouse_id']: dict(r) for r in conn.execute(
            'SELECT warehouse_id,quantity,price,rack,cell FROM item_warehouse_balances WHERE item_id=?', (item_id,))}


def patch_body(**extra):
    return dict(sku='SYN-SAVE-1', name='Saved name', printName='Saved name', categoryName='', groupName='', price=150, **extra)


def test_metadata_price_save_does_not_restore_stale_stock(stock_editor):
    api, headers, item_id, first, second = stock_editor
    added = api.client.post(f'/api/stock/items/{item_id}/add-stock', headers=headers,
                           json={'warehouseId': first, 'quantity': 1})
    assert added.status_code == 200
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers,
                              json=patch_body(priceWarehouseId=first))
    assert result.status_code == 200, result.text
    rows = saved_rows(api.service.db, item_id)
    assert (rows[first]['quantity'], rows[first]['price']) == (6, 150)
    assert (rows[second]['quantity'], rows[second]['price']) == (2, 250)
    detail = api.client.get(f'/api/stock/items/{item_id}', headers=headers).json()['item']
    assert detail['price'] == 250  # Targeted edit leaves the fallback price unchanged.
    assert next(w for w in detail['warehouses'] if w['warehouseId'] == first)['price'] == 150
    assert detail['quantity'] == 8
    catalog = api.client.get('/api/stock/catalog', headers=headers, params={'search': 'SYN-SAVE-1'}).json()['items']
    assert {(row['rowWarehouseId'], row['rowQuantity'], row['price']) for row in catalog} == {(first, 6, 150), (second, 2, 250)}


def test_zero_price_is_saved_for_only_selected_warehouse(stock_editor):
    api, headers, item_id, first, second = stock_editor
    body = patch_body(priceWarehouseId=first); body['price'] = 0
    assert api.client.patch(f'/api/stock/items/{item_id}', headers=headers, json=body).status_code == 200
    rows = saved_rows(api.service.db, item_id)
    assert rows[first]['price'] == 0 and rows[second]['price'] == 250


def test_unknown_price_target_rolls_back_metadata(stock_editor):
    api, headers, item_id, _, _ = stock_editor
    before = saved_rows(api.service.db, item_id)
    response = api.client.patch(f'/api/stock/items/{item_id}', headers=headers,
                                json=patch_body(priceWarehouseId=999999))
    assert response.status_code == 400
    assert saved_rows(api.service.db, item_id) == before
    assert api.client.get(f'/api/stock/items/{item_id}', headers=headers).json()['item']['name'] == 'Synthetic item'


def test_new_stock_row_inherits_price_but_existing_zero_is_preserved(stock_editor):
    api, headers, item_id, first, _ = stock_editor
    third = api.service.db.create_warehouse(name='Synthetic Third')['id']
    response = api.client.post(f'/api/stock/items/{item_id}/add-stock', headers=headers,
                               json={'warehouseId': third, 'quantity': 1})
    assert response.status_code == 200
    assert saved_rows(api.service.db, item_id)[third]['price'] == 250
    body = patch_body(priceWarehouseId=first); body['price'] = 0
    assert api.client.patch(f'/api/stock/items/{item_id}', headers=headers, json=body).status_code == 200
    assert api.client.post(f'/api/stock/items/{item_id}/add-stock', headers=headers,
                            json={'warehouseId': first, 'quantity': 1}).status_code == 200
    assert saved_rows(api.service.db, item_id)[first]['price'] == 0


def test_created_and_explicit_warehouse_prices_survive_reload(auth_api):
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    first = auth_api.service.db.create_warehouse(name='Create First')['id']
    second = auth_api.service.db.create_warehouse(name='Create Second')['id']
    result = auth_api.client.post('/api/stock/items', headers=headers, json={
        'sku': 'SYN-CREATE', 'name': 'Synthetic created', 'price': 100,
        'warehouses': [{'warehouseId': first, 'quantity': 1}, {'warehouseId': second, 'quantity': 2, 'price': 0}]})
    assert result.status_code == 200
    item_id = result.json()['item']['id']
    rows = saved_rows(auth_api.service.db, item_id)
    assert rows[first]['price'] == 100 and rows[second]['price'] == 0


def test_legacy_full_payload_keeps_unspecified_warehouse_prices(stock_editor):
    api, headers, item_id, first, second = stock_editor
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers,
                              json=patch_body(warehouses=[{'warehouseId': first, 'quantity': 5}, {'warehouseId': second, 'quantity': 2}]))
    assert result.status_code == 200
    rows = saved_rows(api.service.db, item_id)
    assert rows[first]['price'] == 100 and rows[second]['price'] == 250


def test_base_price_save_leaves_all_stock_and_warehouse_prices_intact(stock_editor):
    api, headers, item_id, _, _ = stock_editor
    before = saved_rows(api.service.db, item_id)
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers, json=patch_body())
    assert result.status_code == 200
    assert saved_rows(api.service.db, item_id) == before
    assert api.client.get(f'/api/stock/items/{item_id}', headers=headers).json()['item']['price'] == 150


@pytest.mark.parametrize('price', [-1, 'NaN', 'Infinity'])
def test_invalid_warehouse_price_cannot_partially_save_card(stock_editor, price):
    api, headers, item_id, first, _ = stock_editor
    before = saved_rows(api.service.db, item_id)
    body = patch_body(priceWarehouseId=first); body['price'] = price
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers, json=body)
    assert result.status_code == 400 and saved_rows(api.service.db, item_id) == before
    assert api.client.get(f'/api/stock/items/{item_id}', headers=headers).json()['item']['name'] == 'Synthetic item'


def test_inactive_target_and_mixed_stock_snapshot_are_rejected(stock_editor):
    api, headers, item_id, first, _ = stock_editor
    before = saved_rows(api.service.db, item_id)
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers,
                              json=patch_body(priceWarehouseId=first, quantity=0))
    assert result.status_code == 400
    with api.service.db.transaction() as conn:
        conn.execute('UPDATE warehouses SET is_active=0 WHERE id=?', (first,))
    result = api.client.patch(f'/api/stock/items/{item_id}', headers=headers, json=patch_body(priceWarehouseId=first))
    assert result.status_code == 400 and saved_rows(api.service.db, item_id) == before
