"""Manager compensation ledger. Money is kopecks; rates are basis points."""
from __future__ import annotations

import calendar
from contextlib import contextmanager
import json
import re
import sqlite3
from datetime import date, datetime, timezone
from typing import Any

MAX_MONEY = 10**12
MAX_MONTH_TOTAL = 10**14
PAGE_SIZE = 20


class ManagerNotFound(LookupError):
    pass


class ManagerConflict(ValueError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def integer(value: Any, label: str, maximum: int = MAX_MONEY) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f'{label}: требуется целое число от 0 до {maximum}.')
    return value


def month_key(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'(19|20|21)\d{2}-(0[1-9]|1[0-2])', value):
        raise ValueError('Период должен иметь формат ГГГГ-ММ (1900–2199).')
    return value


def text(value: Any, label: str, maximum: int = 300) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f'{label}: заполните поле (до {maximum} символов).')
    return value.strip()


def optional_invoice_number(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError('Номер счёта: введите текст до 100 символов.')
    value = value.strip()
    if len(value) > 100:
        raise ValueError('Номер счёта: введите текст до 100 символов.')
    return value or None


def optional_invoice_date(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError('Дата счёта должна быть корректной датой.')
    if not value:
        return None
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Дата счёта должна быть корректной датой.')
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError('Дата счёта должна быть корректной датой.') from exc
    return value


def calculate(rows: list[dict], terms: dict | None) -> dict:
    total = 0
    commission = 0
    calculated = []
    for row in sorted(rows, key=lambda r: (r['date'], r['id'])):
        item = dict(row)
        base = 0
        if not row['cancelled']:
            before = total
            total += row['amount']
            if terms is not None:
                base = max(0, total - terms['plan']) - max(0, before - terms['plan'])
        item['base'] = base if terms is not None else None
        item['commission'] = (base * row['rate'] + 5000) // 10000 if terms is not None else None
        commission += item['commission'] or 0
        calculated.append(item)
    fixed = None if terms is None else (
        terms['fixed'] if terms['mode'] in ('always', 'minimum') or total >= terms['plan'] else 0
    )
    income = None if terms is None else (
        max(fixed, commission) if terms['mode'] == 'minimum' else fixed + commission
    )
    return dict(salesTotal=total, commission=commission if terms is not None else None, fixed=fixed,
                income=income,
                above=None if terms is None else max(0, total - terms['plan']),
                remaining=None if terms is None else max(0, terms['plan'] - total),
                count=sum(not row['cancelled'] for row in rows), sales=calculated)


SCHEMA = (
    '''CREATE TABLE IF NOT EXISTS manager_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT NOT NULL, avatar BLOB, avatar_version INTEGER NOT NULL DEFAULT 0)''',
    '''CREATE TABLE IF NOT EXISTS manager_periods (
        manager_id INTEGER NOT NULL REFERENCES manager_accounts(id), month TEXT NOT NULL,
        plan INTEGER, fixed INTEGER, rate INTEGER, mode TEXT,
        version INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(manager_id, month))''',
    '''CREATE TABLE IF NOT EXISTS manager_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, manager_id INTEGER NOT NULL, month TEXT NOT NULL,
        date TEXT NOT NULL, client TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0),
        rate INTEGER NOT NULL CHECK(rate BETWEEN 0 AND 10000), cancelled INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'onec')), external_id TEXT,
        created_by INTEGER NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(manager_id, month) REFERENCES manager_periods(manager_id, month), UNIQUE(source, external_id))''',
    '''CREATE INDEX IF NOT EXISTS manager_sales_period ON manager_sales(manager_id, month, date, id)''',
    '''CREATE TABLE IF NOT EXISTS manager_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, manager_id INTEGER NOT NULL REFERENCES manager_accounts(id),
        month TEXT NOT NULL, actor_id INTEGER NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL,
        kind TEXT NOT NULL, reason TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL)''',
    '''CREATE INDEX IF NOT EXISTS manager_audit_period ON manager_audit(manager_id, month, id)''',
    '''CREATE TABLE IF NOT EXISTS manager_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, manager_id INTEGER NOT NULL REFERENCES manager_accounts(id),
        month TEXT NOT NULL, at TEXT NOT NULL, actor_name TEXT NOT NULL, version INTEGER NOT NULL,
        data_json TEXT NOT NULL)''',
    '''CREATE INDEX IF NOT EXISTS manager_snapshots_period ON manager_snapshots(manager_id, month, id)''',
)


def migrate(conn: sqlite3.Connection) -> None:
    for statement in SCHEMA:
        conn.execute(statement)


def migration_present(conn: sqlite3.Connection) -> bool:
    expected = {'manager_accounts', 'manager_periods', 'manager_sales', 'manager_sales_period',
                'manager_audit', 'manager_audit_period', 'manager_snapshots', 'manager_snapshots_period'}
    found = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE name LIKE 'manager_%'")}
    return expected <= found


class ManagerRepository:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def _admin(actor):
        if actor.get('role') != 'admin':
            raise PermissionError('Изменения доступны только администратору.')

    @staticmethod
    def _sync_accounts(conn):
        conn.execute('''INSERT INTO manager_accounts(user_id, display_name)
            SELECT id, COALESCE(NULLIF(full_name, ''), username) FROM users
            WHERE NOT EXISTS (SELECT 1 FROM manager_accounts a WHERE a.user_id=users.id)''')
        conn.execute('''UPDATE manager_accounts SET display_name=(SELECT COALESCE(NULLIF(full_name,''), username) FROM users WHERE id=user_id)
            WHERE user_id IS NOT NULL AND display_name IS NOT (SELECT COALESCE(NULLIF(full_name,''), username) FROM users WHERE id=user_id)''')

    @contextmanager
    def _read(self):
        # Account creation/name synchronization is exceptional, not a write on every GET.
        with self.db.transaction() as conn:
            needs_sync = conn.execute("""SELECT 1 FROM users u LEFT JOIN manager_accounts a ON a.user_id=u.id
                WHERE a.id IS NULL OR a.display_name IS NOT COALESCE(NULLIF(u.full_name,''),u.username)
                LIMIT 1""").fetchone()
        if needs_sync:
            with self.db.transaction(immediate=True) as conn:
                self._sync_accounts(conn)
        with self.db.transaction() as conn:
            conn.execute('BEGIN')
            yield conn

    def _account(self, conn, actor, manager_id):
        if manager_id is None:
            row = conn.execute('SELECT id,user_id,display_name,avatar_version,avatar IS NOT NULL AS has_avatar FROM manager_accounts WHERE user_id=?', (actor['id'],)).fetchone()
        else:
            row = conn.execute('SELECT id,user_id,display_name,avatar_version,avatar IS NOT NULL AS has_avatar FROM manager_accounts WHERE id=?', (manager_id,)).fetchone()
        # Do not disclose existence of other employees to regular users.
        if not row or (actor.get('role') != 'admin' and row['user_id'] != actor['id']):
            raise PermissionError('Нет доступа к кабинету этого сотрудника.')
        return dict(id=row['id'], userId=row['user_id'], name=row['display_name'],
                    archived=row['user_id'] is None, avatarVersion=row['avatar_version'], hasAvatar=bool(row['has_avatar']))

    def managers(self, actor):
        self._admin(actor)
        with self._read() as conn:
            return [dict(id=r['id'], userId=r['user_id'], name=r['display_name'],
                         archived=r['user_id'] is None, active=bool(r['is_active']))
                    for r in conn.execute('''SELECT a.id, a.user_id, a.display_name, u.is_active
                        FROM manager_accounts a LEFT JOIN users u ON u.id=a.user_id
                        ORDER BY a.user_id IS NULL, a.display_name COLLATE NOCASE''')]

    @staticmethod
    def _period(conn, manager_id, month):
        row = conn.execute('SELECT * FROM manager_periods WHERE manager_id=? AND month=?', (manager_id, month)).fetchone()
        return dict(row) if row else dict(version=0, closed=0, plan=None)

    def _data(self, conn, account, month, query='', page=1):
        period = self._period(conn, account['id'], month)
        terms = None if period['plan'] is None else {k: period[k] for k in ('plan', 'fixed', 'rate', 'mode')}
        rows = [dict(r) for r in conn.execute('''SELECT id, date, client, amount, rate, cancelled, source,
                COALESCE(bank_operation_id,(SELECT operation_id FROM bank_sale_links l WHERE l.sale_id=manager_sales.id)) AS bankOperationId,
                invoice_number AS invoiceNumber, invoice_date AS invoiceDate
            FROM manager_sales WHERE manager_id=? AND month=? ORDER BY date,id''', (account['id'], month))]
        result = calculate(rows, terms)
        sales = result.pop('sales')
        selected = [s for s in reversed(sales) if query.casefold() in (s['client'] + ' ' + str(s['id'])).casefold()]
        pages = max(1, (len(selected) + PAGE_SIZE - 1) // PAGE_SIZE)
        page = min(max(1, page), pages)
        year, month_number = map(int, month.split('-'))
        daily, cumulative = [], 0
        by_date = {}
        for row in sales:
            if not row['cancelled']:
                by_date[row['date']] = by_date.get(row['date'], 0) + row['amount']
        for day in range(1, calendar.monthrange(year, month_number)[1] + 1):
            amount = by_date.get(f'{month}-{day:02}', 0)
            cumulative += amount
            daily.append(dict(day=day, amount=amount, cumulative=cumulative))
        return dict(account=account, month=month, version=period['version'], closed=bool(period['closed']),
                    terms=terms, summary=result, daily=daily, sales=selected[(page-1)*PAGE_SIZE:page*PAGE_SIZE],
                    total=len(selected), page=page, pages=pages)

    def dashboard(self, actor, manager_id, month, query='', page=1):
        month_key(month)
        with self._read() as conn:
            account = self._account(conn, actor, manager_id)
            return self._data(conn, account, month, query[:300], page)

    def mutate(self, actor, manager_id, month, payload, preview=False):
        with self.db.transaction(immediate=True) as conn:
            result = self._mutate_in_transaction(conn, actor, manager_id, month, payload)
            result.pop('changedSaleId', None)
            if preview:
                conn.rollback()
            return result

    def _mutate_in_transaction(self, conn, actor, manager_id, month, payload, *,
                               bank_operation_id=None, crm_client_id=None):
        if not conn.in_transaction:
            raise ValueError('Общий механизм записи требует открытую транзакцию.')
        self._admin(actor)
        month_key(month)
        version = integer(payload.get('version'), 'Версия', 2**31-1)
        kind = payload.get('kind')
        if kind == 'sale_rate' and set(payload) - {'kind', 'managerId', 'month', 'version', 'reason', 'saleId', 'rate'}:
            raise ValueError('При изменении процента можно передать только ставку выбранной продажи.')
        reason_value = payload.get('reason')
        creating_sale = kind == 'sale' and payload.get('saleId') is None
        if (creating_sale or kind == 'sale_rate') and (
                reason_value is None or isinstance(reason_value, str) and not reason_value.strip()):
            reason = 'Создание продажи' if creating_sale else 'Изменение ставки продажи'
        else:
            reason = text(reason_value, 'Причина', 500)
        self._sync_accounts(conn)
        account = self._account(conn, actor, manager_id)
        manager_id = account['id']
        before = self._data(conn, account, month)
        if before['version'] != version:
            raise ManagerConflict('Данные изменились. Обновите кабинет и повторите действие.')
        if before['closed'] and kind != 'reopen':
            raise ManagerConflict('Месяц закрыт. Сначала откройте его с указанием причины.')
        conn.execute('INSERT OR IGNORE INTO manager_periods(manager_id,month) VALUES(?,?)', (manager_id, month))
        details_before = None
        if kind == 'terms':
            terms = {key: integer(payload.get(key), key, 10000 if key == 'rate' else MAX_MONEY)
                     for key in ('plan', 'fixed', 'rate')}
            if payload.get('mode') not in ('plan', 'always', 'minimum'):
                raise ValueError('Выберите правило начисления фикса.')
            if payload['mode'] == 'minimum' and terms['plan'] != 0:
                raise ValueError('Для гарантированной минимальной зарплаты план должен быть равен нулю.')
            conn.execute('''UPDATE manager_periods SET plan=?,fixed=?,rate=?,mode=? WHERE manager_id=? AND month=?''',
                         (terms['plan'], terms['fixed'], terms['rate'], payload['mode'], manager_id, month))
        elif kind in ('sale', 'cancel', 'sale_rate'):
            sale_id = payload.get('saleId')
            row = None
            if sale_id is not None:
                integer(sale_id, 'Продажа', 2**53-1)
                row = conn.execute('SELECT * FROM manager_sales WHERE id=? AND manager_id=? AND month=?',
                                   (sale_id, manager_id, month)).fetchone()
                if not row or row['cancelled']:
                    raise ValueError('Продажа не найдена или уже отменена.')
                if kind == 'sale' and (row['source'] == 'bank_statement' or conn.execute(
                        'SELECT 1 FROM bank_sale_links WHERE sale_id=?', (sale_id,)).fetchone()):
                    raise ManagerConflict('У банковской продажи можно изменить только процент или отменить её с причиной.')
                details_before = dict(row)
            if kind == 'sale_rate':
                if sale_id is None:
                    raise ValueError('Выберите продажу для изменения процента.')
                rate = integer(payload.get('rate'), 'Процент', 10000)
                conn.execute('UPDATE manager_sales SET rate=?,updated_at=? WHERE id=?', (rate, now(), sale_id))
            elif kind == 'cancel':
                if sale_id is None:
                    raise ValueError('Выберите продажу для отмены.')
                conn.execute('UPDATE manager_sales SET cancelled=1,updated_at=? WHERE id=?', (now(), sale_id))
            else:
                date_value = payload.get('date')
                if not isinstance(date_value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date_value):
                    raise ValueError('Укажите дату продажи.')
                date.fromisoformat(date_value)
                if date_value[:7] != month:
                    raise ValueError('Дата должна относиться к выбранному месяцу.')
                client = text(payload.get('client'), 'Наименование клиента')
                amount = integer(payload.get('amount'), 'Сумма')
                if amount == 0:
                    raise ValueError('Сумма продажи должна быть больше нуля.')
                rate = integer(payload.get('rate'), 'Процент', 10000)
                bank_values = None
                if bank_operation_id is not None:
                    if sale_id is not None:
                        raise ValueError('Банковский импорт создаёт новую продажу.')
                    integer(bank_operation_id, 'Банковская операция', 2**53-1)
                    integer(crm_client_id, 'Клиент CRM', 2**53-1)
                    operation = conn.execute('SELECT * FROM bank_operations WHERE id=?', (bank_operation_id,)).fetchone()
                    client_row = conn.execute('SELECT * FROM crm_clients WHERE id=?', (crm_client_id,)).fetchone()
                    company = conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?', (bank_operation_id,)).fetchone()
                    if company and (company['cancelled_at'] or company['client_id'] != crm_client_id
                                    or company['classification'] != 'sale'):
                        raise ManagerConflict('Подтверждение общих продаж отменено или клиент не совпадает.')
                    active_manager = conn.execute('''SELECT 1 FROM manager_accounts a JOIN users u ON u.id=a.user_id
                        WHERE a.id=? AND u.is_active=1''', (manager_id,)).fetchone()
                    if not operation or operation['direction'] != 'credit' or operation['currency'] != 'RUB':
                        raise ValueError('Требуется подтверждённое рублёвое поступление.')
                    if operation['date'] != date_value or operation['amount'] != amount:
                        raise ManagerConflict('Дата или сумма не совпадает с банковской операцией.')
                    if not client_row or client_row['is_inactive'] or client_row['crm_archived_at']:
                        raise ManagerConflict('Клиент недоступен или архивирован.')
                    if not active_manager:
                        raise ManagerConflict('Менеджер неактивен или удалён.')
                    # The same tax-identity/date rule is used by preview and the
                    # trusted ledger write, including duplicate CRM cards.
                    from stock_sync_web.bank_assignment_repository import BankAssignmentRepository
                    assignment = BankAssignmentRepository.resolve_payment_assignment(
                        conn, crm_client_id, date_value)['assignment']
                    if not assignment or assignment['manager_id'] != manager_id:
                        raise ManagerConflict('Закрепление клиента изменилось. Обновите результат.')
                    if before['terms'] is None:
                        raise ManagerConflict('Не заданы условия месяца.')
                    if rate != before['terms']['rate']:
                        raise ManagerConflict('Ставка месяца изменилась. Обновите результат.')
                    client = text(company['client_name'] if company else
                                  client_row['document_name'] or client_row['full_name'] or client_row['name'], 'Наименование клиента')
                    bank_values = ('bank_statement', str(bank_operation_id), crm_client_id, bank_operation_id)
                elif crm_client_id is not None:
                    raise ValueError('Связь CRM задаётся только для банковской операции.')
                if 'invoiceNumber' in payload:
                    invoice_number = optional_invoice_number(payload.get('invoiceNumber'))
                else:
                    invoice_number = row['invoice_number'] if row else None
                if 'invoiceDate' in payload:
                    invoice_date = optional_invoice_date(payload.get('invoiceDate'))
                else:
                    invoice_date = row['invoice_date'] if row else None
                if sale_id is None:
                    count = conn.execute('SELECT COUNT(*) FROM manager_sales WHERE manager_id=? AND month=?', (manager_id, month)).fetchone()[0]
                    if count >= 10000:
                        raise ValueError('Достигнут лимит 10 000 записей в месяце.')
                    source, external_id, linked_client_id, linked_operation_id = bank_values or ('manual', None, None, None)
                    cursor = conn.execute('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,
                        invoice_number,invoice_date,created_by,updated_at,source,external_id,crm_client_id,bank_operation_id)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                        (manager_id, month, date_value, client, amount, rate, invoice_number, invoice_date, actor['id'], now(),
                         source, external_id, linked_client_id, linked_operation_id))
                    sale_id = cursor.lastrowid
                else:
                    conn.execute('''UPDATE manager_sales SET date=?,client=?,amount=?,rate=?,
                        invoice_number=?,invoice_date=?,updated_at=? WHERE id=?''',
                                 (date_value, client, amount, rate, invoice_number, invoice_date, now(), sale_id))
        elif kind in ('close', 'reopen'):
            if kind == 'close' and before['terms'] is None:
                raise ValueError('Перед закрытием задайте условия месяца.')
            if kind == 'reopen' and not before['closed']:
                raise ManagerConflict('Месяц уже открыт.')
            conn.execute('UPDATE manager_periods SET closed=? WHERE manager_id=? AND month=?',
                         (int(kind == 'close'), manager_id, month))
        else:
            raise ValueError('Неизвестное действие.')
        conn.execute('UPDATE manager_periods SET version=version+1 WHERE manager_id=? AND month=?', (manager_id, month))
        after = self._data(conn, account, month)
        if after['summary']['salesTotal'] > MAX_MONTH_TOTAL:
            raise ValueError('Сумма продаж месяца превышает допустимый лимит.')
        actor_name = actor.get('full_name') or actor.get('username') or str(actor['id'])
        before_record = dict(terms=before['terms'], summary=before['summary'], closed=before['closed'], version=version, sale=details_before)
        details_after = None
        if kind in ('sale', 'cancel', 'sale_rate'):
            details_after = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
            details_after['invoiceNumber'] = details_after['invoice_number']
            details_after['invoiceDate'] = details_after['invoice_date']
        if details_before is not None:
            details_before['invoiceNumber'] = details_before['invoice_number']
            details_before['invoiceDate'] = details_before['invoice_date']
        after_record = dict(terms=after['terms'], summary=after['summary'], closed=after['closed'], version=version+1, sale=details_after)
        conn.execute('''INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json)
            VALUES(?,?,?,?,?,?,?,?,?)''', (manager_id, month, actor['id'], actor_name, now(), kind, reason,
                                         json.dumps(before_record, ensure_ascii=False), json.dumps(after_record, ensure_ascii=False)))
        if kind == 'close':
            snapshot = dict(after)
            all_rows = [dict(r) for r in conn.execute('''SELECT id,date,client,amount,rate,cancelled,source,
                COALESCE(bank_operation_id,(SELECT operation_id FROM bank_sale_links l WHERE l.sale_id=manager_sales.id)) AS bankOperationId,
                invoice_number AS invoiceNumber, invoice_date AS invoiceDate
                FROM manager_sales WHERE manager_id=? AND month=?''', (manager_id, month))]
            snapshot['sales'] = calculate(all_rows, after['terms'])['sales']
            conn.execute('INSERT INTO manager_snapshots(manager_id,month,at,actor_name,version,data_json) VALUES(?,?,?,?,?,?)',
                         (manager_id, month, now(), actor_name, version+1, json.dumps(snapshot, ensure_ascii=False)))
        if kind in ('sale', 'cancel', 'sale_rate'):
            after['changedSaleId'] = sale_id
        return after

    def record_bank_link_in_transaction(self, conn, actor, manager_id, month, expected_version,
                                        sale_id, reason, operation_id):
        """Audit 1:1 bank confirmation without rewriting the historical sale.

        The caller inserts bank_sale_links in the same outer transaction; no
        commit, snapshot rewrite, or remuneration-rate replacement happens here.
        """
        if not conn.in_transaction:
            raise ValueError('Банковское подтверждение требует открытую транзакцию.')
        self._admin(actor)
        month_key(month)
        integer(expected_version, 'Версия', 2**31-1)
        integer(manager_id, 'Менеджер', 2**53-1)
        integer(sale_id, 'Продажа', 2**53-1)
        integer(operation_id, 'Банковская операция', 2**53-1)
        reason = text(reason, 'Причина банковского подтверждения', 500)
        self._sync_accounts(conn)
        account = self._account(conn, actor, manager_id)
        before = self._data(conn, account, month)
        if before['version'] != expected_version:
            raise ManagerConflict('Данные изменились. Обновите результат и повторите действие.')
        if before['closed']:
            raise ManagerConflict('Месяц закрыт. Сначала откройте его с указанием причины.')
        if before['terms'] is None:
            raise ManagerConflict('Не заданы условия месяца.')
        if before['summary']['salesTotal'] > MAX_MONTH_TOTAL:
            raise ValueError('Сумма продаж месяца превышает допустимый лимит.')
        sale = conn.execute('SELECT * FROM manager_sales WHERE id=? AND manager_id=? AND month=?',
                            (sale_id, manager_id, month)).fetchone()
        if not sale or sale['cancelled'] or sale['source'] not in ('manual', 'onec') or sale['bank_operation_id'] is not None:
            raise ManagerConflict('Продажа недоступна для банковского подтверждения.')
        if conn.execute('SELECT 1 FROM bank_sale_links WHERE sale_id=? OR operation_id=?',
                        (sale_id, operation_id)).fetchone():
            raise ManagerConflict('Продажа или банковская операция уже связана.')
        operation = conn.execute('SELECT * FROM bank_operations WHERE id=?', (operation_id,)).fetchone()
        decision = conn.execute('SELECT client_id,manager_id FROM bank_decisions WHERE operation_id=?',
                                (operation_id,)).fetchone()
        if not operation or operation['direction'] != 'credit' or operation['currency'] != 'RUB':
            raise ManagerConflict('Требуется рублёвое входящее банковское поступление.')
        if operation['date'] != sale['date'] or operation['amount'] != sale['amount']:
            raise ManagerConflict('Дата или сумма продажи не совпадает с банковской операцией.')
        if not decision or decision['client_id'] is None or decision['manager_id'] != manager_id:
            raise ManagerConflict('Сопоставление клиента или менеджера изменилось. Обновите результат.')
        client = conn.execute('SELECT * FROM crm_clients WHERE id=?', (decision['client_id'],)).fetchone()
        if not client or client['is_inactive'] or client['crm_archived_at']:
            raise ManagerConflict('Клиент недоступен или архивирован.')
        if sale['crm_client_id'] is not None:
            client_agrees = sale['crm_client_id'] == client['id']
        else:
            document_names = [client['document_name'], client['full_name']]
            if not any(name and name.strip() for name in document_names):
                document_names = [client['name']]
            normalize_name = lambda value: re.sub(r'\s+', ' ', value or '').strip().casefold()
            client_agrees = normalize_name(sale['client']) in {normalize_name(name) for name in document_names if name}
        if not client_agrees:
            raise ManagerConflict('Клиент продажи не совпадает с выбранной карточкой CRM.')
        if not conn.execute('''SELECT 1 FROM manager_accounts a JOIN users u ON u.id=a.user_id
            WHERE a.id=? AND u.is_active=1''', (manager_id,)).fetchone():
            raise ManagerConflict('Менеджер неактивен или удалён.')
        assignment = conn.execute('''SELECT manager_id FROM crm_sales_assignments WHERE client_id=?
            AND start_date<=? AND (end_date IS NULL OR end_date>?)''',
            (client['id'], operation['date'], operation['date'])).fetchone()
        if not assignment or assignment['manager_id'] != manager_id:
            raise ManagerConflict('Закрепление клиента изменилось. Обновите результат.')
        updated = conn.execute('''UPDATE manager_periods SET version=version+1
            WHERE manager_id=? AND month=? AND version=? AND closed=0''', (manager_id, month, expected_version))
        if updated.rowcount != 1:
            raise ManagerConflict('Период изменился. Обновите результат.')
        after = self._data(conn, account, month)
        sale_snapshot = dict(sale)
        sale_snapshot['invoiceNumber'] = sale_snapshot['invoice_number']
        sale_snapshot['invoiceDate'] = sale_snapshot['invoice_date']
        before_record = dict(terms=before['terms'], summary=before['summary'], closed=before['closed'],
                             version=expected_version, sale=sale_snapshot)
        after_record = dict(terms=after['terms'], summary=after['summary'], closed=after['closed'],
                            version=expected_version+1, sale=sale_snapshot, bankOperationId=operation_id)
        actor_name = actor.get('full_name') or actor.get('username') or str(actor['id'])
        conn.execute('''INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json)
            VALUES(?,?,?,?,?,'bank_link',?,?,?)''', (manager_id, month, actor['id'], actor_name, now(), reason,
                json.dumps(before_record, ensure_ascii=False), json.dumps(after_record, ensure_ascii=False)))
        after['changedSaleId'] = sale_id
        return after

    def transfer_sale_in_transaction(self, conn, actor, sale_id, target_manager_id,
                                    expected_source_version, expected_target_version,
                                    reason, *, crm_client_id=None, preview=False):
        """Move one existing ledger row between managers without rewriting it.

        The caller owns the surrounding write transaction and may combine this
        with a CRM assignment update. Existing per-sale rates and snapshots are
        intentionally retained.
        """
        if not conn.in_transaction:
            raise ValueError('Перенос продажи требует открытую транзакцию.')
        self._admin(actor)
        sale_id = integer(sale_id, 'Продажа', 2**53-1)
        target_manager_id = integer(target_manager_id, 'Менеджер', 2**53-1)
        expected_source_version = integer(expected_source_version, 'Версия источника', 2**31-1)
        expected_target_version = integer(expected_target_version, 'Версия получателя', 2**31-1)
        reason = text(reason, 'Причина переноса', 500)
        if crm_client_id is not None:
            crm_client_id = integer(crm_client_id, 'Клиент CRM', 2**53-1)
        if type(preview) is not bool:
            raise ValueError('Режим предпросмотра должен быть логическим значением.')
        self._sync_accounts(conn)
        sale_row = conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone()
        if not sale_row:
            raise ManagerNotFound('Продажа не найдена.')
        sale = dict(sale_row)
        source_manager_id, month = sale['manager_id'], sale['month']
        if sale['cancelled']:
            raise ManagerConflict('Отменённую продажу перенести нельзя.')
        source_account = self._account(conn, actor, source_manager_id)
        target_account = self._account(conn, actor, target_manager_id)
        active = conn.execute('''SELECT 1 FROM manager_accounts a JOIN users u ON u.id=a.user_id
            WHERE a.id=? AND u.is_active=1''', (target_manager_id,)).fetchone()
        if not active:
            raise ManagerConflict('Менеджер неактивен или удалён.')
        # A bank-linked sale must have a complete, internally consistent link.
        link_row = conn.execute('SELECT * FROM bank_sale_links WHERE sale_id=?', (sale_id,)).fetchone()
        direct_operation = sale.get('bank_operation_id')
        if (sale['source'] == 'bank_statement' or direct_operation is not None) and not link_row:
            raise ManagerConflict('Связь банковской продажи неполная. Перенос заблокирован.')
        if link_row:
            link = dict(link_row)
            if (link['manager_id'] != source_manager_id or link['amount'] != sale['amount'] or
                    (direct_operation is not None and direct_operation != link['operation_id'])):
                raise ManagerConflict('Реквизиты банковской связи не совпадают с продажей.')
            if crm_client_id is not None and crm_client_id != link['client_id']:
                raise ManagerConflict('Нельзя изменить CRM-клиента подтверждённой банковской оплаты.')
            client_id = link['client_id']
            operation = conn.execute('SELECT * FROM bank_operations WHERE id=?', (link['operation_id'],)).fetchone()
            company = conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?', (link['operation_id'],)).fetchone()
            if (not operation or operation['direction'] != 'credit' or operation['currency'] != 'RUB' or
                    operation['date'] != sale['date'] or operation['amount'] != sale['amount']):
                raise ManagerConflict('Банковская операция не совпадает с продажей.')
            if company and (company['cancelled_at'] or company['client_id'] != client_id or
                            company['classification'] != 'sale'):
                raise ManagerConflict('Подтверждение общих продаж отменено или клиент не совпадает.')
        else:
            client_id = sale.get('crm_client_id')
            if crm_client_id is not None:
                if client_id is not None and client_id != crm_client_id:
                    raise ManagerConflict('CRM-клиента существующей продажи изменить нельзя.')
                client_id = crm_client_id

        if client_id is not None:
            client = conn.execute('SELECT * FROM crm_clients WHERE id=?', (client_id,)).fetchone()
            if not client or client['is_inactive'] or client['crm_archived_at']:
                raise ManagerConflict('Клиент недоступен или архивирован.')
            from stock_sync_web.bank_assignment_repository import BankAssignmentRepository
            assignment = BankAssignmentRepository.resolve_payment_assignment(conn, client_id, sale['date'])['assignment']
            if not assignment or assignment['manager_id'] != target_manager_id or not assignment['manager_active']:
                raise ManagerConflict('На дату продажи CRM-клиент должен быть закреплён за выбранным активным менеджером.')

        source_before = self._data(conn, source_account, month)
        target_before = self._data(conn, target_account, month)
        if source_before['version'] != expected_source_version or target_before['version'] != expected_target_version:
            raise ManagerConflict('Данные изменились. Обновите результат и повторите действие.')
        if source_before['closed'] or target_before['closed']:
            raise ManagerConflict('Один из месяцев закрыт. Сначала откройте его штатным способом.')
        if source_manager_id == target_manager_id:
            attach_client = (link_row is None and sale['source'] in ('manual', 'onec') and
                             sale.get('crm_client_id') is None and crm_client_id is not None)
            response = dict(saleId=sale_id, sourceManagerId=source_manager_id,
                            targetManagerId=target_manager_id, month=month, effects=[])
            if not attach_client or preview:
                return response
            conn.execute('INSERT OR IGNORE INTO manager_periods(manager_id,month) VALUES(?,?)',
                         (source_manager_id, month))
            cursor = conn.execute('''UPDATE manager_periods SET version=version+1
                WHERE manager_id=? AND month=? AND version=? AND closed=0''',
                                  (source_manager_id, month, expected_source_version))
            if cursor.rowcount != 1:
                raise ManagerConflict('Период изменился. Обновите результат.')
            timestamp = now()
            conn.execute('UPDATE manager_sales SET crm_client_id=?,updated_at=? WHERE id=? AND crm_client_id IS NULL',
                         (client_id, timestamp, sale_id))
            if conn.execute('SELECT changes()').fetchone()[0] != 1:
                raise ManagerConflict('Продажа изменилась. Обновите результат.')
            after_sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
            before_sale = dict(sale)
            for snapshot in (before_sale, after_sale):
                snapshot['invoiceNumber'] = snapshot.get('invoice_number')
                snapshot['invoiceDate'] = snapshot.get('invoice_date')
            actor_name = actor.get('full_name') or actor.get('username') or str(actor['id'])
            before_record = dict(terms=source_before['terms'], summary=source_before['summary'],
                                 closed=source_before['closed'], version=expected_source_version, sale=before_sale)
            after_record = dict(terms=source_before['terms'], summary=source_before['summary'],
                                closed=source_before['closed'], version=expected_source_version+1, sale=after_sale)
            conn.execute('''INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json)
                VALUES(?,?,?,?,?,'sale',?,?,?)''', (source_manager_id, month, actor['id'], actor_name,
                    timestamp, reason, json.dumps(before_record, ensure_ascii=False),
                    json.dumps(after_record, ensure_ascii=False)))
            return response
        if link_row and target_before['terms'] is None:
            raise ManagerConflict('Не заданы условия месяца менеджера-получателя.')
        target_count = conn.execute('SELECT COUNT(*) FROM manager_sales WHERE manager_id=? AND month=?',
                                    (target_manager_id, month)).fetchone()[0]
        if target_count >= 10000:
            raise ValueError('Достигнут лимит 10 000 записей в месяце.')
        if target_before['summary']['salesTotal'] + sale['amount'] > MAX_MONTH_TOTAL:
            raise ValueError('Сумма продаж месяца превышает допустимый лимит.')

        def period_rows(manager_id):
            return [dict(row) for row in conn.execute('''SELECT id,date,client,amount,rate,cancelled,source,
                COALESCE(bank_operation_id,(SELECT operation_id FROM bank_sale_links l WHERE l.sale_id=manager_sales.id)) AS bankOperationId,
                invoice_number AS invoiceNumber,invoice_date AS invoiceDate
                FROM manager_sales WHERE manager_id=? AND month=? ORDER BY date,id''', (manager_id, month))]

        def totals(rows, terms):
            result = calculate(rows, terms)
            return {key: result[key] for key in ('salesTotal', 'commission', 'fixed', 'income')}

        source_rows = period_rows(source_manager_id)
        target_rows = period_rows(target_manager_id)
        source_rows_after = [row for row in source_rows if row['id'] != sale_id]
        target_rows_after = target_rows + [dict(id=sale['id'], date=sale['date'], client=sale['client'],
            amount=sale['amount'], rate=sale['rate'], cancelled=sale['cancelled'], source=sale['source'],
            bankOperationId=direct_operation or (link_row['operation_id'] if link_row else None),
            invoiceNumber=sale['invoice_number'], invoiceDate=sale['invoice_date'])]
        source_after_summary = totals(source_rows_after, source_before['terms'])
        target_after_summary = totals(target_rows_after, target_before['terms'])
        if target_after_summary['salesTotal'] > MAX_MONTH_TOTAL:
            raise ValueError('Сумма продаж месяца превышает допустимый лимит.')

        keys = ('salesTotal', 'commission', 'fixed', 'income')
        effects = [
            dict(managerId=source_manager_id, managerName=source_account['name'], month=month,
                 before={key: source_before['summary'][key] for key in keys},
                 after={key: source_after_summary[key] for key in keys}),
            dict(managerId=target_manager_id, managerName=target_account['name'], month=month,
                 before={key: target_before['summary'][key] for key in keys},
                 after={key: target_after_summary[key] for key in keys}),
        ]
        response = dict(saleId=sale_id, sourceManagerId=source_manager_id,
                        targetManagerId=target_manager_id, month=month, effects=effects)
        if preview:
            return response

        for manager_id, version in ((source_manager_id, expected_source_version),
                                    (target_manager_id, expected_target_version)):
            conn.execute('INSERT OR IGNORE INTO manager_periods(manager_id,month) VALUES(?,?)',
                         (manager_id, month))
            cursor = conn.execute('''UPDATE manager_periods SET version=version+1
                WHERE manager_id=? AND month=? AND version=? AND closed=0''', (manager_id, month, version))
            if cursor.rowcount != 1:
                raise ManagerConflict('Период изменился. Обновите результат.')

        timestamp = now()
        conn.execute('UPDATE manager_sales SET manager_id=?,crm_client_id=COALESCE(crm_client_id,?),updated_at=? WHERE id=?',
                     (target_manager_id, client_id, timestamp, sale_id))
        if link_row:
            conn.execute('''UPDATE bank_sale_links SET manager_id=?,linked_by=?,linked_at=?,reason=?
                WHERE operation_id=? AND sale_id=?''',
                         (target_manager_id, actor['id'], timestamp, reason, link_row['operation_id'], sale_id))
            before_link = dict(link_row)
            after_link = dict(before_link, manager_id=target_manager_id, linked_by=actor['id'],
                              linked_at=timestamp, reason=reason)
            conn.execute('''INSERT INTO bank_decision_audit(operation_id,actor_id,at,reason,before_json,after_json)
                VALUES(?,?,?,?,?,?)''', (link_row['operation_id'], actor['id'], timestamp, reason,
                    json.dumps(dict(action='sale_transfer',link=before_link), ensure_ascii=False),
                    json.dumps(dict(action='sale_transfer',link=after_link), ensure_ascii=False)))

        source_after = self._data(conn, source_account, month)
        target_after = self._data(conn, target_account, month)
        if (source_after['summary']['salesTotal'] > MAX_MONTH_TOTAL or
                target_after['summary']['salesTotal'] > MAX_MONTH_TOTAL):
            raise ValueError('Сумма продаж месяца превышает допустимый лимит.')
        before_sale = dict(sale)
        before_sale['invoiceNumber'] = before_sale.get('invoice_number')
        before_sale['invoiceDate'] = before_sale.get('invoice_date')
        after_sale = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
        after_sale['invoiceNumber'] = after_sale.get('invoice_number')
        after_sale['invoiceDate'] = after_sale.get('invoice_date')
        actor_name = actor.get('full_name') or actor.get('username') or str(actor['id'])
        for account, before, after, kind in (
                (source_account, source_before, source_after, 'transfer_out'),
                (target_account, target_before, target_after, 'transfer_in')):
            before_record = dict(terms=before['terms'], summary=before['summary'], closed=before['closed'],
                                 version=before['version'], sale=before_sale)
            after_record = dict(terms=after['terms'], summary=after['summary'], closed=after['closed'],
                                version=after['version'], sale=after_sale)
            conn.execute('''INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json)
                VALUES(?,?,?,?,?,?,?,?,?)''', (account['id'], month, actor['id'], actor_name, timestamp, kind, reason,
                    json.dumps(before_record, ensure_ascii=False), json.dumps(after_record, ensure_ascii=False)))
        response['effects'][0]['after'] = {key: source_after['summary'][key] for key in keys}
        response['effects'][1]['after'] = {key: target_after['summary'][key] for key in keys}
        return response

    def history(self, actor, manager_id, month, page=1):
        self._admin(actor)
        month_key(month)
        with self._read() as conn:
            account = self._account(conn, actor, manager_id)
            args = (account['id'], month)
            total = conn.execute('SELECT COUNT(*) FROM manager_audit WHERE manager_id=? AND month=?', args).fetchone()[0]
            items = []
            for row in conn.execute('SELECT * FROM manager_audit WHERE manager_id=? AND month=? ORDER BY id DESC LIMIT ? OFFSET ?', (*args, PAGE_SIZE, (max(1, page)-1)*PAGE_SIZE)):
                record = dict(row)
                record['before'] = json.loads(record.pop('before_json'))
                record['after'] = json.loads(record.pop('after_json'))
                items.append(record)
            return dict(items=items, total=total)

    def snapshots(self, actor, manager_id, month):
        self._admin(actor)
        month_key(month)
        with self._read() as conn:
            account = self._account(conn, actor, manager_id)
            return [dict(id=r['id'], at=r['at'], actor=r['actor_name'], version=r['version'])
                    for r in conn.execute('SELECT id,at,actor_name,version FROM manager_snapshots WHERE manager_id=? AND month=? ORDER BY id DESC LIMIT 30', (account['id'], month))]

    def snapshot(self, actor, snapshot_id, page=1):
        self._admin(actor)
        with self._read() as conn:
            row = conn.execute('SELECT * FROM manager_snapshots WHERE id=?', (snapshot_id,)).fetchone()
            if row is None:
                raise ManagerNotFound('Снимок не найден.')
            self._account(conn, actor, row['manager_id'])
            data = json.loads(row['data_json'])
            sales = data['sales']
            total = len(sales)
            pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
            page = min(max(1, page), pages)
            data.update(sales=sales[(page-1)*PAGE_SIZE:page*PAGE_SIZE], total=total, page=page, pages=pages)
            return dict(id=row['id'], at=row['at'], actor=row['actor_name'], version=row['version'], data=data)

    def avatar(self, actor, manager_id):
        with self._read() as conn:
            account = self._account(conn, actor, manager_id)
            row = conn.execute('SELECT avatar FROM manager_accounts WHERE id=?', (account['id'],)).fetchone()
            return row['avatar']

    def set_avatar(self, actor, manager_id, image, expected_version):
        self._admin(actor)
        integer(expected_version, 'Версия фото', 2**31-1)
        with self.db.transaction(immediate=True) as conn:
            self._sync_accounts(conn)
            account = self._account(conn, actor, manager_id)
            if account['avatarVersion'] != expected_version:
                raise ManagerConflict('Фото уже изменено. Обновите кабинет.')
            conn.execute('UPDATE manager_accounts SET avatar=?,avatar_version=avatar_version+1 WHERE id=?', (image, account['id']))
            return dict(ok=True)
