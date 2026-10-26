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
    fixed = None if terms is None else (terms['fixed'] if terms['mode'] == 'always' or total >= terms['plan'] else 0)
    return dict(salesTotal=total, commission=commission if terms is not None else None, fixed=fixed,
                income=None if terms is None else fixed + commission,
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
        rows = [dict(r) for r in conn.execute('''SELECT id, date, client, amount, rate, cancelled, source
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
        self._admin(actor)
        month_key(month)
        version = integer(payload.get('version'), 'Версия', 2**31-1)
        reason = text(payload.get('reason'), 'Причина', 500)
        kind = payload.get('kind')
        with self.db.transaction(immediate=True) as conn:
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
                if payload.get('mode') not in ('plan', 'always'):
                    raise ValueError('Выберите правило начисления фикса.')
                conn.execute('''UPDATE manager_periods SET plan=?,fixed=?,rate=?,mode=? WHERE manager_id=? AND month=?''',
                             (terms['plan'], terms['fixed'], terms['rate'], payload['mode'], manager_id, month))
            elif kind in ('sale', 'cancel'):
                sale_id = payload.get('saleId')
                if sale_id is not None:
                    integer(sale_id, 'Продажа', 2**53-1)
                    row = conn.execute('SELECT * FROM manager_sales WHERE id=? AND manager_id=? AND month=?',
                                       (sale_id, manager_id, month)).fetchone()
                    if not row or row['cancelled']:
                        raise ValueError('Продажа не найдена или уже отменена.')
                    details_before = dict(row)
                if kind == 'cancel':
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
                    if sale_id is None:
                        count = conn.execute('SELECT COUNT(*) FROM manager_sales WHERE manager_id=? AND month=?', (manager_id, month)).fetchone()[0]
                        if count >= 10000:
                            raise ValueError('Достигнут лимит 10 000 записей в месяце.')
                        cursor = conn.execute('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,created_by,updated_at)
                            VALUES(?,?,?,?,?,?,?,?)''', (manager_id, month, date_value, client, amount, rate, actor['id'], now()))
                        sale_id = cursor.lastrowid
                    else:
                        conn.execute('UPDATE manager_sales SET date=?,client=?,amount=?,rate=?,updated_at=? WHERE id=?',
                                     (date_value, client, amount, rate, now(), sale_id))
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
            if preview:
                conn.rollback()
                return after
            actor_name = actor.get('full_name') or actor.get('username') or str(actor['id'])
            before_record = dict(terms=before['terms'], summary=before['summary'], closed=before['closed'], version=version, sale=details_before)
            details_after = None
            if kind in ('sale', 'cancel'):
                details_after = dict(conn.execute('SELECT * FROM manager_sales WHERE id=?', (sale_id,)).fetchone())
            after_record = dict(terms=after['terms'], summary=after['summary'], closed=after['closed'], version=version+1, sale=details_after)
            conn.execute('''INSERT INTO manager_audit(manager_id,month,actor_id,actor_name,at,kind,reason,before_json,after_json)
                VALUES(?,?,?,?,?,?,?,?,?)''', (manager_id, month, actor['id'], actor_name, now(), kind, reason,
                                             json.dumps(before_record, ensure_ascii=False), json.dumps(after_record, ensure_ascii=False)))
            if kind == 'close':
                snapshot = dict(after)
                all_rows = [dict(r) for r in conn.execute('SELECT id,date,client,amount,rate,cancelled,source FROM manager_sales WHERE manager_id=? AND month=?', (manager_id, month))]
                snapshot['sales'] = calculate(all_rows, after['terms'])['sales']
                conn.execute('INSERT INTO manager_snapshots(manager_id,month,at,actor_name,version,data_json) VALUES(?,?,?,?,?,?)',
                             (manager_id, month, now(), actor_name, version+1, json.dumps(snapshot, ensure_ascii=False)))
            return after

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
