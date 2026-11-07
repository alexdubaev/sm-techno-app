"""Dated sales attribution, independent of personal CRM ownership and permissions."""
from __future__ import annotations

from datetime import date, datetime
import json
import re
from zoneinfo import ZoneInfo

from stock_sync_web.bank_parser import normalize_inn, valid_inn
from stock_sync_web.manager_repository import ManagerConflict, ManagerNotFound, ManagerRepository, integer, now, text


def calendar_date(value, label='Дата начала действия'):
    if not isinstance(value, str) or not re.fullmatch(r'(?:19|20|21)\d{2}-\d{2}-\d{2}', value):
        raise ValueError(f'{label}: укажите календарную дату ГГГГ-ММ-ДД.')
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f'{label}: некорректная дата.') from exc
    return value


def _identifier(value, lengths, label):
    if not isinstance(value, str):
        raise ValueError(f'{label}: введите реквизит текстом, сохранив ведущие нули.')
    value = re.sub(r'\s+', '', value)
    if not value.isascii() or not value.isdigit() or len(value) not in lengths:
        raise ValueError(f'{label}: некорректный формат.')
    return value


def _valid_inn(value):
    if not value.strip('0'):
        return False
    digits = [int(c) for c in value]
    if len(digits) == 10:
        return sum(a*b for a, b in zip(digits, [2,4,10,3,5,9,4,6,8])) % 11 % 10 == digits[9]
    return (sum(a*b for a, b in zip(digits, [7,2,4,10,3,5,9,4,6,8])) % 11 % 10 == digits[10]
            and sum(a*b for a, b in zip(digits, [3,7,2,4,10,3,5,9,4,6,8])) % 11 % 10 == digits[11])


class BankAssignmentRepository:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def _admin(actor):
        ManagerRepository._admin(actor)

    @staticmethod
    def _client(conn, client_id):
        integer(client_id, 'Клиент', 2**53-1)
        row = conn.execute('SELECT * FROM crm_clients WHERE id=?', (client_id,)).fetchone()
        if not row:
            raise ManagerNotFound('Клиент не найден.')
        return row

    @staticmethod
    def assignment_at(conn, client_id, on_date):
        """Internal lookup; callers enforce their own CRM visibility before disclosure."""
        calendar_date(on_date, 'Дата оплаты')
        row = conn.execute('''SELECT a.*,m.display_name AS manager_name,m.user_id,u.is_active AS manager_active
            FROM crm_sales_assignments a LEFT JOIN manager_accounts m ON m.id=a.manager_id
            LEFT JOIN users u ON u.id=m.user_id WHERE a.client_id=? AND a.start_date<=?
            AND (a.end_date IS NULL OR a.end_date>?)''', (client_id, on_date, on_date)).fetchone()
        return dict(row) if row else None

    @staticmethod
    def resolve_payment_assignment(conn, client_id, on_date):
        """Resolve dated attribution across CRM cards of one proven tax identity.

        This does not merge cards or change their personal CRM access/assignment
        editors. Every matching assignment is a dependency of a payment preview;
        conflicting assignments (including an explicit removal) require a human
        decision instead of preferring the selected card or an arbitrary row.
        """
        calendar_date(on_date, 'Дата оплаты')
        client = BankAssignmentRepository._client(conn, client_id)
        inn = normalize_inn(client['inn'])
        kpp = normalize_inn(client['kpp'])
        identities = [dict(client)]
        if valid_inn(inn):
            identities = [dict(row) for row in conn.execute('SELECT * FROM crm_clients ORDER BY id')
                          if normalize_inn(row['inn']) == inn and
                          (len(inn) == 12 or normalize_inn(row['kpp']) == kpp)]
        ids = [row['id'] for row in identities]
        placeholders = ','.join('?' for _ in ids)
        intervals = [dict(row) for row in conn.execute(f'''SELECT a.*,m.display_name AS manager_name,
            m.user_id,u.is_active AS manager_active FROM crm_sales_assignments a
            LEFT JOIN manager_accounts m ON m.id=a.manager_id LEFT JOIN users u ON u.id=m.user_id
            WHERE a.client_id IN ({placeholders}) ORDER BY a.client_id,a.start_date,a.id''', ids)]
        versions = [dict(row) for row in conn.execute(f'''SELECT client_id,version
            FROM crm_sales_assignment_versions WHERE client_id IN ({placeholders}) ORDER BY client_id''', ids)]
        result = dict(assignment=None, explanation='На дату оплаты не назначен менеджер по продажам.', warning=None,
                      dependencies=dict(clients=[{key: row[key] for key in
                          ('id', 'inn', 'kpp', 'is_inactive', 'crm_archived_at')} for row in identities],
                          intervals=intervals, versions=versions))
        effective = [row for row in intervals if row['start_date'] <= on_date and
                     (row['end_date'] is None or row['end_date'] > on_date)]
        if not effective:
            future = [row for row in intervals if row['start_date'] > on_date and row['manager_id'] is not None]
            if future:
                start = min(row['start_date'] for row in future)
                result['explanation'] = (f"Закрепление действует с {date.fromisoformat(start):%d.%m.%Y}, "
                    f"а оплата поступила {date.fromisoformat(on_date):%d.%m.%Y}. "
                    'Для зачёта менеджеру проверьте дату начала закрепления в CRM.')
            return result
        if len({row['manager_id'] for row in effective}) > 1:
            result['explanation'] = ('Противоречивые закрепления у карточек с одинаковыми ИНН/КПП. '
                                     'Проверьте менеджера и даты закреплений в CRM.')
            return result
        by_id = {row['id']: row for row in identities}
        if any(by_id[row['client_id']]['is_inactive'] or by_id[row['client_id']]['crm_archived_at']
               for row in effective):
            result['explanation'] = ('Закрепление найдено у неактивной или архивной карточки с теми же ИНН/КПП. '
                                     'Требуется проверка закреплений в CRM.')
            return result
        assignment = next((row for row in effective if row['client_id'] == client_id), effective[0])
        result['assignment'] = assignment
        if assignment['manager_id'] is not None and assignment['client_id'] != client_id:
            result['warning'] = ('Менеджер определён по ИНН/КПП и дате оплаты: '
                                 'закрепление сохранено в другой карточке этого клиента.')
        return result

    @staticmethod
    def _intervals(conn, client_id):
        return [dict(r) for r in conn.execute('''SELECT a.*,m.display_name AS manager_name
            FROM crm_sales_assignments a LEFT JOIN manager_accounts m ON m.id=a.manager_id
            WHERE a.client_id=? ORDER BY a.start_date''', (client_id,))]

    @staticmethod
    def pending_summary(conn, client_id):
        row = conn.execute('''SELECT COUNT(*) AS count,COALESCE(SUM(o.amount),0) AS amount,
            MIN(o.date) AS periodStart,MAX(o.date) AS periodEnd FROM bank_operations o
            JOIN bank_decisions d ON d.operation_id=o.id LEFT JOIN bank_sale_links l ON l.operation_id=o.id
            WHERE d.client_id=? AND l.operation_id IS NULL AND o.direction='credit'
            AND d.classification NOT IN ('excluded','return')''', (client_id,)).fetchone()
        return dict(row)

    def set_assignment(self, actor, client_id, manager_id, start_date, reason, version, *, refresh_pending=None):
        self._admin(actor)
        with self.db.transaction(immediate=True) as conn:
            return self._set_assignment_in_transaction(conn, actor, client_id, manager_id, start_date, reason,
                                                       version, refresh_pending=refresh_pending)

    def _set_assignment_in_transaction(self, conn, actor, client_id, manager_id, start_date, reason, version,
                                       *, refresh_pending=None):
        self._admin(actor)
        start_date = calendar_date(start_date)
        reason = text(reason, 'Причина изменения', 500)
        integer(version, 'Версия закрепления', 2**31-1)
        client = self._client(conn, client_id)
        if client['is_inactive'] or client['crm_archived_at']:
            raise ManagerConflict('Клиент неактивен или архивирован; закрепление требует решения администратора.')
        ManagerRepository._sync_accounts(conn)
        if manager_id is not None:
            integer(manager_id, 'Менеджер', 2**53-1)
            active = conn.execute('''SELECT 1 FROM manager_accounts m JOIN users u ON u.id=m.user_id
                WHERE m.id=? AND u.is_active=1''', (manager_id,)).fetchone()
            if not active:
                raise ManagerConflict('Выберите действующий активный аккаунт менеджерского кабинета.')
        previous = conn.execute('SELECT version FROM crm_sales_assignment_versions WHERE client_id=?', (client_id,)).fetchone()
        current_version = previous['version'] if previous else 0
        if current_version != version:
            raise ManagerConflict('Закрепление изменилось. Обновите карточку и повторите действие.')
        before = self._intervals(conn, client_id)
        containing = next((row for row in before if row['start_date'] <= start_date
                           and (row['end_date'] is None or start_date < row['end_date'])), None)
        timestamp = now()
        if containing and containing['start_date'] == start_date:
            conn.execute('''UPDATE crm_sales_assignments SET manager_id=?,updated_by=?,updated_at=?,reason=?
                WHERE id=?''', (manager_id, actor['id'], timestamp, reason, containing['id']))
            changed_id = containing['id']
        else:
            if containing:
                end_date = containing['end_date']
                conn.execute('''UPDATE crm_sales_assignments SET end_date=?,updated_by=?,updated_at=?,reason=?
                    WHERE id=?''', (start_date, actor['id'], timestamp, reason, containing['id']))
            else:
                future = next((row for row in before if row['start_date'] > start_date), None)
                end_date = future['start_date'] if future else None
            changed_id = conn.execute('''INSERT INTO crm_sales_assignments(client_id,manager_id,start_date,end_date,
                created_by,created_at,updated_by,updated_at,reason) VALUES(?,?,?,?,?,?,?,?,?)''',
                (client_id, manager_id, start_date, end_date, actor['id'], timestamp, actor['id'], timestamp, reason)).lastrowid
        conn.execute('''INSERT INTO crm_sales_assignment_versions(client_id,version) VALUES(?,?)
            ON CONFLICT(client_id) DO UPDATE SET version=excluded.version''', (client_id, version+1))
        after = self._intervals(conn, client_id)
        changed = next(row for row in after if row['id'] == changed_id)
        conn.execute('''INSERT INTO crm_sales_assignment_audit(client_id,version,actor_id,at,reason,before_json,after_json)
            VALUES(?,?,?,?,?,?,?)''', (client_id, version+1, actor['id'], timestamp, reason,
                                      json.dumps(before, ensure_ascii=False),
                                      json.dumps(dict(intervals=after, changedAssignment=changed), ensure_ascii=False)))
        # A changed version/fingerprint is never silently accepted by a previous preview.
        conn.execute('''UPDATE bank_decisions SET version=version+1,fingerprint='',updated_by=?,updated_at=?
            WHERE client_id=? AND NOT EXISTS(SELECT 1 FROM bank_sale_links l WHERE l.operation_id=bank_decisions.operation_id)''',
            (actor['id'], timestamp, client_id))
        if refresh_pending is not None:
            refresh_pending(conn, client_id)
        return self._client_assignment(conn, client_id)

    def client_assignment(self, actor, client_id, at_date=None):
        self._admin(actor)
        with self.db.transaction() as conn:
            self._client(conn, client_id)
            return self._client_assignment(conn, client_id, at_date)

    def _client_assignment(self, conn, client_id, at_date=None):
        current = self.assignment_at(conn, client_id, at_date or datetime.now(ZoneInfo('Europe/Moscow')).date().isoformat())
        assignment = None if current is None else dict(managerId=current['manager_id'],
            managerName=current['manager_name'], startDate=current['start_date'], endDate=current['end_date'])
        version_row = conn.execute('SELECT version FROM crm_sales_assignment_versions WHERE client_id=?', (client_id,)).fetchone()
        history = []
        for row in conn.execute('''SELECT a.*,COALESCE(NULLIF(u.full_name,''),u.username,CAST(a.actor_id AS TEXT)) AS actor_name
            FROM crm_sales_assignment_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.client_id=? ORDER BY a.id DESC''', (client_id,)):
            changed = json.loads(row['after_json'])['changedAssignment']
            history.append(dict(id=row['id'], managerId=changed['manager_id'], managerName=changed['manager_name'],
                startDate=changed['start_date'], endDate=changed['end_date'], actorName=row['actor_name'],
                changedAt=row['at'], reason=row['reason']))
        return dict(clientId=client_id, version=version_row['version'] if version_row else 0, assignment=assignment,
                    history=history, payments=[], pending=self.pending_summary(conn, client_id))

    def confirm_account(self, actor, organization_id, owner_inn, account, bik, reason):
        self._admin(actor)
        with self.db.transaction(immediate=True) as conn:
            return self._confirm_account_in_transaction(conn, actor, organization_id, owner_inn, account, bik, reason)

    def _confirm_account_in_transaction(self, conn, actor, organization_id, owner_inn, account, bik, reason):
        self._admin(actor)
        integer(organization_id, 'Организация', 2**53-1)
        owner_inn = _identifier(owner_inn, (10,12), 'ИНН владельца')
        if not _valid_inn(owner_inn):
            raise ValueError('ИНН владельца: неверные контрольные цифры.')
        account = _identifier(account, (20,), 'Расчётный счёт')
        bik = _identifier(bik, (9,), 'БИК')
        reason = text(reason, 'Причина подтверждения счёта', 500)
        org = conn.execute('SELECT * FROM organizations WHERE id=?', (organization_id,)).fetchone()
        if not org:
            raise ManagerNotFound('Выберите существующую организацию.')
        known_inn = re.sub(r'\s+', '', str(org['inn'] or ''))
        if known_inn and owner_inn != known_inn:
            raise ValueError('ИНН владельца не совпадает с выбранной организацией.')
        existing = conn.execute('SELECT * FROM bank_import_accounts WHERE organization_id=? AND account=?',
                                 (organization_id, account)).fetchone()
        if existing:
            if existing['owner_inn'] != owner_inn or existing['bik'] != bik or not existing['active']:
                raise ManagerConflict('Этот счёт уже настроен с другими реквизитами или отключён.')
            return self.account_dict(existing)
        account_id = conn.execute('''INSERT INTO bank_import_accounts(organization_id,organization_name,
            owner_inn,account,bik,currency,created_by,created_at,reason) VALUES(?,?,?,?,?,'RUB',?,?,?)''',
            (organization_id, org['name'], owner_inn, account, bik, actor['id'], now(), reason)).lastrowid
        return self.account_dict(conn.execute('SELECT * FROM bank_import_accounts WHERE id=?', (account_id,)).fetchone())

    @staticmethod
    def account_dict(row):
        return dict(id=row['id'], organizationId=row['organization_id'], organizationName=row['organization_name'],
                    ownerInn=row['owner_inn'], account=row['account'], bik=row['bik'], currency=row['currency'], active=bool(row['active']))

    def accounts(self, actor):
        self._admin(actor)
        with self.db.transaction() as conn:
            return dict(organizations=[dict(r) for r in conn.execute('SELECT id,name,inn FROM organizations ORDER BY name,id')],
                        accounts=[self.account_dict(r) for r in conn.execute('SELECT * FROM bank_import_accounts ORDER BY id')])
