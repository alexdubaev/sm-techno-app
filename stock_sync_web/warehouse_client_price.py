"""Warehouse visibility in customer price exports, independent of stock activity."""

SETTING_PREFIX = 'warehouse_client_price:'


def decorate_warehouses(db, rows):
    with db.connect() as conn:
        settings = dict(conn.execute('SELECT key,value FROM app_settings WHERE key LIKE ?', (SETTING_PREFIX + '%',)))
    return [{**row, 'include_in_client_price': settings.get(SETTING_PREFIX + str(row['id']), '1') == '1'} for row in rows]


def set_client_price(db, warehouse_id, *, include):
    if type(include) is not bool:
        raise ValueError('Укажите, включать ли склад в клиентский прайс.')
    with db.transaction() as conn:
        row = conn.execute('SELECT * FROM warehouses WHERE id=? AND is_active=1', (warehouse_id,)).fetchone()
        if row is None:
            raise LookupError('Склад не найден.')
        conn.execute('''INSERT INTO app_settings(key,value) VALUES(?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value''',
                     (SETTING_PREFIX + str(warehouse_id), '1' if include else '0'))
    return {**dict(row), 'include_in_client_price': include}


def filter_client_price_rows(db, rows):
    # One read snapshot keeps flags and the fallback-row check consistent.
    with db.connect() as conn:
        conn.execute('BEGIN')
        excluded = {row[0] for row in conn.execute('''SELECT w.id FROM warehouses w
            JOIN app_settings s ON s.key=? || CAST(w.id AS TEXT)
            WHERE w.is_active=1 AND s.value<>'1' ''', (SETTING_PREFIX,))}
        if not excluded:
            return rows
        # Zero-stock items may have catalog fallback rows with no warehouse ID.
        hidden_only = {row[0] for row in conn.execute('''SELECT b.item_id
            FROM item_warehouse_balances b JOIN warehouses w ON w.id=b.warehouse_id
            LEFT JOIN app_settings s ON s.key=? || CAST(w.id AS TEXT)
            WHERE w.is_active=1 GROUP BY b.item_id
            HAVING MAX(CASE WHEN COALESCE(s.value,'1')='1' THEN 1 ELSE 0 END)=0''', (SETTING_PREFIX,))}
    return [row for row in rows if row.get('row_warehouse_id') not in excluded
            and not (row.get('row_warehouse_id') is None and row['id'] in hidden_only)]
