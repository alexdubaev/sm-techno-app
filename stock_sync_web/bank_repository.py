"""Durable, deterministic bank receipts workflow over the existing manager ledger.

Bank facts never change. Decisions are versioned; only an explicit, atomic
administrator confirmation writes to the shared manager accounting domain.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import uuid

from stock_sync_web.bank_assignment_repository import BankAssignmentRepository
from stock_sync_web.bank_parser import MAX_FILE_BYTES, normalize_inn, parse_statement, valid_inn
from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.manager_repository import (
    MAX_MONEY, MAX_MONTH_TOTAL, ManagerConflict, ManagerNotFound, ManagerRepository,
    calculate, integer, now, optional_invoice_date, optional_invoice_number, text,
)
from stock_sync_web.vps_integrity import storage_operation_lock


def dump(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(dump(value).encode('utf-8')).hexdigest()


def document_name(row):
    return row['document_name'] or row['full_name'] or row['name']


def normalized_text(value):
    return ' '.join(str(value or '').split()).casefold().replace('ё', 'е')


def client_snapshot_names(client):
    names = [client['document_name'], client['full_name']]
    if not any(name and name.strip() for name in names):
        names = [client['name']]
    return {' '.join(str(name).split()).casefold() for name in names if name and name.strip()}


def classify(purpose, direction):
    """Explainable rules, deliberately conservative when buyer intent is unclear."""
    value = normalized_text(purpose)
    if direction == 'debit':
        if re.search(r'возврат.*(?:покупател|клиент|оплат|аванс)', value):
            return 'return', 'Возврат покупателю: требуется ручная корректировка, отрицательная продажа не создаётся.'
        return 'excluded', 'Исходящая операция не является входящей оплатой покупателя.'
    third = bool(re.search(r'за\s+(?:третье|третьих|ооо\b|ао\b|ип\s)|треть[еьи].*лиц|по поручению', value))
    excluded = bool(re.search(
        r'собственн.*(?:перевод|счет|средств)|между\s+(?:своими|собственными)|'
        r'займ|заем|займов|кредит(?!ор)|возврат.*(?:поставщик|за\s+товар|за\s+услуг)|'
        r'внесени[ея].*средств|пополнени[ея].*счет|финансовая помощь|уставн.*капитал|'
        r'перевод\s+(?:собственных|своих)\s+средств', value))
    buyer = bool(re.search(r'оплат|предоплат|аванс', value) and re.search(r'товар|услуг|продукц|поставк|работ[уы]|счет', value))
    if third:
        return 'review', 'Оплата за третье лицо: администратор должен подтвердить принадлежность.'
    if excluded and buyer:
        return 'review', 'Назначение содержит противоречивые признаки: требуется ручная проверка.'
    if excluded:
        return 'excluded', 'Непокупательское поступление: собственный перевод, заём, кредит, возврат или внесение средств.'
    if buyer:
        return 'sale', 'Оплата/предоплата покупателя за товары, услуги или по счёту.'
    return 'review', 'Назначение не подтверждает оплату покупателя: требуется ручная проверка.'


class BankRepository:
    def __init__(self, db, storage_root):
        self.db = db
        self.storage_root = Path(storage_root).expanduser().resolve()
        self.assignments = BankAssignmentRepository(db)
        self.managers = ManagerRepository(db)

    @staticmethod
    def _actor(conn, actor, admin=False):
        integer(actor.get('id'), 'Пользователь', 2**53-1)
        row = conn.execute('SELECT id,username,full_name,role,is_active FROM users WHERE id=?', (actor['id'],)).fetchone()
        if not row or not row['is_active'] or admin and (actor.get('role') != 'admin' or row['role'] != 'admin'):
            raise PermissionError('Действие доступно только действующему администратору.' if admin else 'Нет доступа.')
        return dict(row)

    def _admin(self, actor):
        with self.db.transaction() as conn:
            return self._actor(conn, actor, True)

    @staticmethod
    def _row(conn, table, row_id):
        # Table names are internal constants, never request values.
        integer(row_id, 'Идентификатор', 2**53-1)
        row = conn.execute(f'SELECT * FROM {table} WHERE id=?', (row_id,)).fetchone()
        if not row:
            raise ManagerNotFound('Запись не найдена.')
        return dict(row)

    def _file_path(self, key):
        if not isinstance(key, str) or not re.fullmatch(r'[0-9a-f]{32}\.xlsx', key):
            raise ValueError('Недопустимая ссылка на приватный файл.')
        base = self.storage_root / 'bank_statements'
        path = base / key
        if base.is_symlink() or path.is_symlink() or path.resolve() != path:
            raise ValueError('Приватное хранилище недоступно.')
        return path

    @staticmethod
    def _keys(account, normalized, currency):
        fields = ('direction', 'date', 'documentNumber', 'payerName', 'inn', 'kpp', 'account',
                  'bik', 'bankName', 'purpose', 'debtorCode', 'documentType')
        strict = dict(organizationId=account['organization_id'], ourAccount=account['account'],
                      currency=currency, amount=normalized['credit'] or normalized['debit'])
        strict.update({key: normalized_text(normalized.get(key)) for key in fields})
        # A document identifier is essential here: equal client/date/amount alone
        # are not enough to label two complete, different payment orders duplicates.
        probable = {key: strict[key] for key in ('organizationId', 'ourAccount', 'currency', 'amount', 'direction', 'date', 'documentNumber', 'inn')}
        return digest(strict), digest(probable)

    @staticmethod
    def _complete_identity(normalized):
        return (valid_inn(normalized.get('inn')) and bool(normalized.get('documentNumber'))
                and len(normalized.get('account') or '') == 20 and len(normalized.get('bik') or '') == 9
                and (len(normalized['inn']) == 12 or len(normalized.get('kpp') or '') == 9))

    @staticmethod
    def _probable_operations(conn, op):
        rows = conn.execute('''SELECT o.*,l.sale_id AS saleId FROM bank_operations o
            LEFT JOIN bank_sale_links l ON l.operation_id=o.id
            WHERE o.account_id=? AND o.id<>? AND
              (o.strict_key=? OR o.probable_key=? OR
               (o.currency=? AND o.direction=? AND o.date=? AND o.amount=? AND o.document_number=?))
            ORDER BY o.id''',
            (op['account_id'], op['id'], op['strict_key'], op['probable_key'],op['currency'],
             op['direction'],op['date'],op['amount'],op['document_number']))
        candidates=[]
        for row in rows:
            if row['strict_key'] != op['strict_key'] and row['probable_key'] != op['probable_key']:
                if valid_inn(row['inn']) and valid_inn(op['inn']) and row['inn'] != op['inn']:
                    continue
                if row['account'] and op['account'] and row['account'] != op['account']:
                    continue
            candidates.append(dict(id=row['id'],date=row['date'],documentNumber=row['document_number'],
                amount=row['amount'],strict_key=row['strict_key'],saleId=row['saleId']))
        return candidates

    def _account_from_statement(self, actor, parsed):
        """Use only validated owner metadata and an unambiguous existing organization."""
        metadata = parsed['metadata']
        # Only owner/account identity must be sound to register the setting.
        # Row problems and reconciliation failures belong in the saved preview.
        errors = [error for error in parsed['errors']
                  if error.startswith(('ownerInn:', 'account:', 'bik:', 'currency:'))]
        for field, length in (('account', 20), ('bik', 9)):
            if not isinstance(metadata.get(field), str) or not re.fullmatch(rf'[0-9]{{{length}}}', metadata[field]):
                errors.append(f'Некорректный идентификатор выписки: {field}.')
        if metadata.get('currency') != 'RUB':
            errors.append('Не удалось прочитать валюту выписки.' if metadata.get('currency') is None else
                          'Поддерживаются только рублёвые выписки RUB/RUR, без конвертации.')
        if errors:
            raise ValueError('Не удалось прочитать реквизиты банковской выписки: ' + '; '.join(dict.fromkeys(errors)))
        owner_inn = normalize_inn(metadata.get('ownerInn'))
        if not valid_inn(owner_inn):
            raise ValueError('В выписке отсутствует корректный ИНН владельца. Проверьте реквизиты в исходном XLSX.')
        with self.db.transaction(immediate=True) as conn:
            self._actor(conn, actor, True)
            matches = [row['id'] for row in conn.execute('SELECT id,inn FROM organizations')
                       if normalize_inn(row['inn']) == owner_inn]
            if not matches:
                raise ValueError('Организация с ИНН владельца выписки не найдена. Проверьте ИНН в XLSX и справочник наших организаций.')
            if len(matches) != 1:
                raise ValueError('ИНН владельца выписки совпадает с несколькими организациями. Устраните дубли в справочнике наших организаций.')
            organization_id = matches[0]
            # A file upload must never reactivate or replace an existing setting,
            # including a conflicting registration under another organization.
            for account in conn.execute('SELECT * FROM bank_import_accounts WHERE account=?', (metadata['account'],)):
                if (account['organization_id'] != organization_id or account['owner_inn'] != owner_inn
                        or account['bik'] != metadata['bik'] or account['currency'] != 'RUB' or not account['active']):
                    raise ManagerConflict('Счёт выписки уже настроен с другими реквизитами или отключён. Проверьте существующую настройку счёта организации.')
            # Resolve conflicts and register using the same write transaction.
            # Validated facts may precede the separate file publication transaction.
            return self.assignments._confirm_account_in_transaction(conn, actor, organization_id, owner_inn,
                metadata['account'], metadata['bik'],
                'Реквизиты подтверждены загрузкой администратором банковской выписки XLSX.')['id']

    def upload(self, actor, account_id, filename, raw):
        actor = self._admin(actor)  # Before parsing or writing any bytes.
        if account_id is not None:
            integer(account_id, 'Счёт', 2**53-1)
        if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_FILE_BYTES:
            raise ValueError('Выписка должна быть XLSX размером не более 10 МБ.')
        filename = str(filename or '').replace('\\', '/').rsplit('/', 1)[-1]
        filename = re.sub(r'[\x00-\x1f\x7f]', '', filename)[:200]
        if not filename.casefold().endswith('.xlsx'):
            raise ValueError('Выберите банковскую выписку XLSX.')
        parsed = None
        if account_id is None:
            parsed = parse_statement(raw)
            account_id = self._account_from_statement(actor, parsed)
        sha = hashlib.sha256(raw).hexdigest()
        with self.db.transaction() as conn:
            account = self._row(conn, 'bank_import_accounts', account_id)
            existing = conn.execute('SELECT id FROM bank_uploads WHERE account_id=? AND sha256=?', (account_id, sha)).fetchone()
            if existing:
                return self._upload_detail(conn, existing['id'])
        if parsed is None:
            parsed = parse_statement(raw)
        metadata = parsed['metadata']
        errors = list(parsed['errors'])
        ownership_errors = []
        for field, expected, label in (
            ('ownerInn', account['owner_inn'], 'ИНН владельца'),
            ('account', account['account'], 'расчётный счёт'),
            ('bik', account['bik'], 'БИК'),
            ('currency', 'RUB', 'валюта'),
        ):
            if metadata.get(field) != expected:
                ownership_errors.append(f'Не совпадает {label} выписки и подтверждённой настройки организации.')
        if not account['active']:
            ownership_errors.append('Настройка банковского счёта отключена.')
        errors.extend(ownership_errors)
        parsed['errors'] = list(dict.fromkeys(errors))
        self.storage_root.mkdir(parents=True, exist_ok=True)
        new_path = None
        # Keep the same lock order as existing document publication and backup:
        # storage lock first, then the SQLite immediate transaction.
        with storage_operation_lock(self.storage_root):
            try:
                with self.db.transaction(immediate=True) as conn:
                    self._actor(conn, actor, True)
                    current_account = self._row(conn, 'bank_import_accounts', account_id)
                    if current_account != account:
                        raise ManagerConflict('Настройка счёта изменилась. Повторите загрузку.')
                    existing = conn.execute('SELECT id FROM bank_uploads WHERE account_id=? AND sha256=?', (account_id, sha)).fetchone()
                    if existing:
                        return self._upload_detail(conn, existing['id'])
                    key = uuid.uuid4().hex + '.xlsx'
                    new_path = self._file_path(key)
                    new_path.parent.mkdir(exist_ok=True)
                    # Exclusive publication; a DB rollback removes only our own new file.
                    with new_path.open('xb') as handle:
                        handle.write(raw)
                        handle.flush()
                        os.fsync(handle.fileno())
                    upload_id = conn.execute('''INSERT INTO bank_uploads(account_id,sha256,original_filename,
                        storage_key,byte_size,parser_version,metadata_json,errors_json,reconciliation_json,state,created_by,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                        (account_id, sha, filename, key, len(raw), parsed['parserVersion'], dump(metadata),
                         dump(parsed['errors']), dump(parsed['reconciliation']), 'blocked' if parsed['errors'] else 'parsed', actor['id'], now())).lastrowid
                    valid_rows = [r for r in parsed['rows'] if not r['errors'] and not ownership_errors]
                    keys = {r['row']: self._keys(account, r['normalized'], metadata['currency']) for r in valid_rows}
                    counts = Counter(pair[0] for pair in keys.values())
                    operation_ids = []
                    for source in parsed['rows']:
                        norm = source['normalized']
                        operation_id = None
                        if not source['errors'] and not ownership_errors:
                            strict, probable = keys[source['row']]
                            matches = conn.execute('SELECT id FROM bank_operations WHERE account_id=? AND strict_key=?', (account_id, strict)).fetchall()
                            # Only a single occurrence both in this source and in the
                            # operation store can be reused across overlapping exports.
                            if counts[strict] == 1 and len(matches) == 1 and self._complete_identity(norm):
                                operation_id = matches[0]['id']
                            else:
                                columns = ('account_id','organization_id','our_account','currency','direction','date',
                                    'document_number','payer_name','inn','kpp','account','bik','bank_name','amount',
                                    'debit','credit','purpose','debtor_code','document_type','strict_key','probable_key',
                                    'invoice_references_json','normalized_json','created_at')
                                values = (account_id, account['organization_id'], account['account'], metadata['currency'],
                                    norm['direction'], norm['date'], norm['documentNumber'], norm['payerName'],
                                    norm['inn'], norm['kpp'], norm['account'], norm['bik'], norm['bankName'],
                                    norm['credit'] or norm['debit'], norm['debit'], norm['credit'], norm['purpose'],
                                    norm['debtorCode'], norm['documentType'], strict, probable,
                                    dump(norm['invoiceReferences']), dump(norm), now())
                                operation_id = conn.execute(f"INSERT INTO bank_operations({','.join(columns)}) VALUES({','.join('?' for _ in columns)})", values).lastrowid
                                conn.execute('INSERT INTO bank_decisions(operation_id,updated_by,updated_at) VALUES(?,?,?)', (operation_id, actor['id'], now()))
                            operation_ids.append(operation_id)
                        conn.execute('''INSERT INTO bank_source_rows(upload_id,sheet,row_number,raw_json,
                            normalized_json,errors_json,warnings_json,operation_id) VALUES(?,?,?,?,?,?,?,?)''',
                            (upload_id, source['sheet'], source['row'], dump(source['raw']), dump(norm),
                             dump(source['errors'] + ownership_errors), dump(source['warnings']), operation_id))
                    # A new ambiguous/probable sibling also invalidates an older preview.
                    affected = set(operation_ids)
                    for op_id in operation_ids:
                        op = self._row(conn, 'bank_operations', op_id)
                        affected.update(r['id'] for r in self._probable_operations(conn,op))
                    for op_id in sorted(affected):
                        self._refresh(conn, op_id, actor['id'])
                    return self._upload_detail(conn, upload_id)
            except BaseException:
                if new_path is not None:
                    new_path.unlink(missing_ok=True)
                raise

    @staticmethod
    def _decision(conn, operation_id):
        row = conn.execute('SELECT * FROM bank_decisions WHERE operation_id=?', (operation_id,)).fetchone()
        if not row:
            raise ManagerNotFound('Операция не найдена.')
        return dict(row)

    def _evaluate(self, conn, operation_id):
        op = self._row(conn, 'bank_operations', operation_id)
        decision = self._decision(conn, operation_id)
        company_row = conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?', (operation_id,)).fetchone()
        company = dict(company_row) if company_row else None
        frozen = json.loads(company['decision_json']) if company else None
        manual = json.loads(decision['manual_json'])
        norm = json.loads(op['normalized_json'])
        account = self._row(conn, 'bank_import_accounts', op['account_id'])
        org = self._row(conn, 'organizations', account['organization_id'])
        sources = [dict(r) for r in conn.execute('''SELECT s.id,s.upload_id,s.errors_json,s.warnings_json,
            u.state,u.errors_json AS upload_errors,u.reconciliation_json,u.metadata_json FROM bank_source_rows s
            JOIN bank_uploads u ON u.id=s.upload_id WHERE s.operation_id=? ORDER BY s.id''', (operation_id,))]
        warnings = list(dict.fromkeys(w for s in sources for w in json.loads(s['warnings_json'])))
        proof = [s for s in sources if not json.loads(s['errors_json']) and not json.loads(s['upload_errors'])
                 and s['state'] == 'parsed' and json.loads(s['reconciliation_json']).get('valid')]
        errors = [] if proof else ['Нет проверенного источника: исправьте ошибки или сверку оборотов выписки.']
        if not account['active'] or org['inn'] and normalize_inn(org['inn']) != account['owner_inn']:
            errors.append('Счёт отключён или реквизиты организации изменились.')
        if op['currency'] != 'RUB' or op['amount'] > MAX_MONEY:
            errors.append('Валюта или сумма операции не поддерживается менеджерским учётом.')
        classification, explanation = classify(op['purpose'], op['direction'])
        if op['direction'] == 'credit' and op['inn'] == account['owner_inn']:
            classification, explanation = 'excluded', 'Собственный перевод: ИНН плательщика совпадает с владельцем нашего счёта.'
        rule = dict(classification=classification, explanation=explanation)
        if 'classification' in manual:
            classification = manual['classification']
            explanation = 'Решение администратора: ' + manual['reason']
        if op['direction'] == 'debit' and classification == 'sale':
            classification = 'return' if 'возврат' in normalized_text(op['purpose']) else 'excluded'
            explanation = 'Исходящая операция не создаёт отрицательную продажу; требуется ручная корректировка.'
        candidates = []
        if valid_inn(op['inn']):
            candidates = [dict(r) for r in conn.execute('SELECT * FROM crm_clients') if normalize_inn(r['inn']) == op['inn']]
        inn_candidates = list(candidates)
        if len(op['inn']) == 10 and op['kpp']:
            candidates = [r for r in candidates if not r['kpp'] or re.sub(r'\s+', '', r['kpp']) == op['kpp']]
        client = None
        if 'clientId' in manual:
            client = self._row(conn, 'crm_clients', manual['clientId'])
            if normalize_inn(client['inn']) != op['inn']:
                warnings.append('ИНН плательщика отличается от выбранного клиента; подтверждено администратором: ' + manual['reason'])
            elif client['kpp'] and op['kpp'] and re.sub(r'\s+', '', client['kpp']) != op['kpp']:
                warnings.append('КПП плательщика отличается от выбранного клиента; подтверждено администратором: ' + manual['reason'])
        elif len(candidates) == 1:
            client = candidates[0]
        if company:
            # Confirmation pins the chosen CRM identity and document snapshot.
            client = self._row(conn, 'crm_clients', company['client_id'])
            classification = company['classification']
        assignment = self.assignments.assignment_at(conn, client['id'], op['date']) if client else None
        assignment_version = conn.execute('SELECT version FROM crm_sales_assignment_versions WHERE client_id=?', (client['id'],)).fetchone() if client else None
        manager_id = assignment['manager_id'] if assignment else None
        period = self.managers._period(conn, manager_id, op['date'][:7]) if manager_id else None
        link_row = conn.execute('''SELECT l.*,s.cancelled,s.client AS sale_client,s.rate AS sale_rate,s.updated_at,
            m.display_name AS manager_name FROM bank_sale_links l JOIN manager_sales s ON s.id=l.sale_id
            JOIN manager_accounts m ON m.id=l.manager_id WHERE l.operation_id=?''', (operation_id,)).fetchone()
        link = dict(link_row) if link_row else None
        probable = self._probable_operations(conn,op)
        old_sales = []
        if client:
            names = client_snapshot_names(client)
            for row in conn.execute('''SELECT s.*,m.display_name AS managerName,l.operation_id AS linkedOperationId
                FROM manager_sales s JOIN manager_accounts m ON m.id=s.manager_id
                LEFT JOIN bank_sale_links l ON l.sale_id=s.id
                WHERE s.source IN ('manual','onec') AND s.amount=? AND (s.date=? OR
                    (s.invoice_number IS NOT NULL AND s.invoice_number=?)) ORDER BY s.id''',
                (op['amount'], op['date'], norm.get('invoiceNumber'))):
                row = dict(row)
                if row['crm_client_id'] == client['id'] or row['crm_client_id'] is None and ' '.join(row['client'].split()).casefold() in names:
                    old_sales.append(row)
        duplicate_signature = digest(dict(probable=probable, sales=old_sales))
        acknowledged_new = manual.get('duplicateAction') == 'new' and manual.get('duplicateSignature') == duplicate_signature
        link_sale = None
        if manual.get('duplicateAction') == 'link':
            candidate = conn.execute('SELECT * FROM manager_sales WHERE id=?', (manual.get('linkSaleId'),)).fetchone()
            link_sale = dict(candidate) if candidate else None
        status = 'ready'
        if errors:
            status = 'data_error'
        elif classification == 'excluded':
            status = 'excluded'
        elif classification in ('review', 'return'):
            status = 'purpose_review'
        elif not client:
            status = 'multiple_clients' if len(candidates) > 1 else 'client_not_found'
            explanation = ('Несколько карточек CRM с одинаковыми реквизитами.' if len(candidates) > 1 else
                           'Клиент не найден однозначно по ИНН/КПП; выберите карточку вручную с причиной.')
        elif client['is_inactive'] or client['crm_archived_at']:
            status, explanation = 'client_archived', 'Клиент неактивен или архивирован.'
        elif manual.get('duplicateAction') == 'link' and not self._link_compatible(conn, op, client, manager_id, link_sale):
            status, explanation = 'possible_duplicate', 'Связь невозможна: нужны одна несвязанная продажа с теми же клиентом, менеджером, датой и полной суммой.'
        elif manual.get('duplicateAction') != 'link' and (probable or old_sales or manual.get('duplicateAction') == 'review') and not acknowledged_new:
            status, explanation = 'possible_duplicate', 'Возможный дубль: свяжите старую продажу, подтвердите отдельную оплату с причиной или оставьте на проверку.'
        # All bank/company safety and duplicate gates precede attribution gates.
        company_eligible = status == 'ready'
        if status == 'ready':
            if not assignment or manager_id is None:
                status, explanation = 'manager_missing', 'На дату оплаты не назначен менеджер по продажам.'
            elif not assignment['user_id'] or not assignment['manager_active']:
                status, explanation = 'manager_inactive', 'Закреплённый менеджер неактивен или удалён.'
            elif period['plan'] is None:
                status, explanation = 'terms_missing', 'Не заданы условия менеджера за месяц банковской операции.'
            elif period['closed']:
                status, explanation = 'month_closed', 'Месяц закрыт; требуется штатное открытие администратором.'
        # A legacy link must complete atomically in its open manager month:
        # it can never become a second, independent company contribution.
        if manual.get('duplicateAction') == 'link' and status != 'ready':
            company_eligible = False
        company_cancelled = bool(company and company['cancelled_at'] or link and link['cancelled'])
        if company and company['cancelled_at']:
            status, explanation = 'accounted', 'Общие продажи отменены; повторное проведение запрещено.'
        if link:
            status, explanation = 'accounted', 'Оплата уже учтена; отменённая продажа не восстанавливается автоматически.' if link['cancelled'] else 'Оплата уже учтена в продажах.'
            manager_id = link['manager_id']
        invoice_number = manual.get('invoiceNumber', norm.get('invoiceNumber'))
        invoice_date = manual.get('invoiceDate', norm.get('invoiceDate'))
        if frozen:
            invoice_number, invoice_date = frozen.get('invoiceNumber'), frozen.get('invoiceDate')
        result = dict(id=operation_id, version=decision['version'], fingerprint='', date=op['date'], amount=op['amount'],
            direction=op['direction'], documentNumber=op['document_number'], payerName=op['payer_name'],
            inn=op['inn'], kpp=op['kpp'], account=op['account'], bik=op['bik'], bankName=op['bank_name'],
            purpose=op['purpose'], invoiceNumber=invoice_number, invoiceDate=invoice_date,
            invoiceReferences=json.loads(op['invoice_references_json']), clientId=link['client_id'] if link else client['id'] if client else None,
            clientName=link['sale_client'] if link else company['client_name'] if company else document_name(client) if client else None,
            managerId=manager_id, managerName=link['manager_name'] if link else assignment['manager_name'] if assignment else None,
            rate=link['sale_rate'] if link else period.get('rate') if period else None, status=status,
            explanation=explanation, warnings=list(dict.fromkeys(warnings)), errors=errors, classification=classification,
            candidateClients=[dict(id=r['id'], name=document_name(r), inn=r['inn'], kpp=r['kpp']) for r in inn_candidates],
            candidateSales=[dict(id=r['id'], date=r['date'], client=r['client'], amount=r['amount'], managerId=r['manager_id'],
                managerName=r['managerName'], source=r['source'], invoiceNumber=r['invoice_number']) for r in old_sales],
            probableDuplicates=[{key: r[key] for key in ('id','date','documentNumber','amount','saleId')} for r in probable],
            saleId=link['sale_id'] if link else None, cancelled=bool(link and link['cancelled']),
            companyAccounted=bool((company or link) and not company_cancelled),
            companyCanConfirm=bool(company_eligible and not company and not link and manual.get('duplicateAction') != 'link'), companyCancelled=company_cancelled,
            rule=dict(version=1, **rule))
        deps = dict(operation=op, manual=manual, account=account, organization=org, sources=sources,
            clients=inn_candidates, chosenClient=client, assignment=assignment,
            assignmentVersion=assignment_version[0] if assignment_version else 0, period=period,
            probable=probable, sales=old_sales, link=link, linkSale=link_sale, company=company, rule=rule, result={k:v for k,v in result.items() if k not in ('version','fingerprint')})
        result['fingerprint'] = digest(deps)
        return result, duplicate_signature

    @staticmethod
    def _link_compatible(conn, op, client, manager_id, sale):
        if not sale or sale['cancelled'] or sale['source'] not in ('manual','onec'):
            return False
        if sale['manager_id'] != manager_id or sale['amount'] != op['amount'] or sale['date'] != op['date']:
            return False
        if sale['crm_client_id'] is not None:
            if sale['crm_client_id'] != client['id']:
                return False
        elif ' '.join(sale['client'].split()).casefold() not in client_snapshot_names(client):
            return False
        return not conn.execute('SELECT 1 FROM bank_sale_links WHERE sale_id=? OR operation_id=?', (sale['id'], op['id'])).fetchone()

    def _refresh(self, conn, operation_id, actor_id):
        before = self._decision(conn, operation_id)
        result, _ = self._evaluate(conn, operation_id)
        changed = before['fingerprint'] != result['fingerprint']
        version = before['version'] + int(changed and bool(before['fingerprint']))
        result['version'] = version
        conn.execute('''UPDATE bank_decisions SET version=?,classification=?,explanation=?,client_id=?,
            manager_id=?,rate=?,status=?,warnings_json=?,decision_json=?,fingerprint=?,updated_by=?,updated_at=?
            WHERE operation_id=?''', (version, result['classification'], result['explanation'], result['clientId'],
            result['managerId'], result['rate'], result['status'], dump(result['warnings']), dump(result), result['fingerprint'],
            actor_id, now(), operation_id))
        return result

    @staticmethod
    def _invalid_source(source):
        norm = json.loads(source['normalized_json'])
        return dict(id=-source['id'], version=0, fingerprint='', date=norm.get('date'), amount=norm.get('credit') or norm.get('debit'),
            direction=norm.get('direction') or 'invalid', documentNumber=norm.get('documentNumber'), payerName=norm.get('payerName'),
            inn=norm.get('inn'), kpp=norm.get('kpp'), account=norm.get('account'), bik=norm.get('bik'), bankName=norm.get('bankName'),
            purpose=norm.get('purpose') or '', invoiceNumber=norm.get('invoiceNumber'), invoiceDate=norm.get('invoiceDate'),
            invoiceReferences=norm.get('invoiceReferences', []), clientId=None, clientName=None, managerId=None,
            managerName=None, rate=None, status='data_error',
            explanation=f"Ошибка исходной строки {source['row_number']} листа «{source['sheet']}».",
            warnings=json.loads(source['warnings_json']), errors=json.loads(source['errors_json']),
            classification='review', candidateClients=[], candidateSales=[], probableDuplicates=[], saleId=None, cancelled=False,
            companyAccounted=False, companyCanConfirm=False, companyCancelled=False)

    def _upload_summary(self, conn, row):
        account = self._row(conn, 'bank_import_accounts', row['account_id'])
        meta = json.loads(row['metadata_json'])
        count = conn.execute('SELECT COUNT(*) FROM bank_source_rows WHERE upload_id=?', (row['id'],)).fetchone()[0]
        return dict(id=row['id'], filename=row['original_filename'], organizationId=account['organization_id'],
            organizationName=account['organization_name'], account=account['account'], currency=meta.get('currency'),
            periodStart=meta.get('periodStart'), periodEnd=meta.get('periodEnd'), createdAt=row['created_at'],
            parserVersion=row['parser_version'], status=row['state'], operationCount=count,
            debitTotal=meta.get('debitTotal'), creditTotal=meta.get('creditTotal'), errors=json.loads(row['errors_json']))

    def _upload_detail(self, conn, upload_id):
        upload = self._row(conn, 'bank_uploads', upload_id)
        result = self._upload_summary(conn, upload)
        operations = []
        for source in conn.execute('SELECT * FROM bank_source_rows WHERE upload_id=? ORDER BY row_number,id', (upload_id,)):
            if source['operation_id'] is None:
                operations.append(self._invalid_source(source))
            else:
                dto = json.loads(self._decision(conn, source['operation_id'])['decision_json'])
                for key in ('companyAccounted', 'companyCanConfirm', 'companyCancelled'):
                    dto.setdefault(key, False)
                live = conn.execute('SELECT s.cancelled FROM bank_sale_links l JOIN manager_sales s ON s.id=l.sale_id WHERE l.operation_id=?', (source['operation_id'],)).fetchone()
                if live:
                    dto['cancelled'] = bool(live['cancelled'])
                    dto['status'] = 'accounted'
                    dto.update(companyAccounted=not bool(live['cancelled']), companyCancelled=bool(live['cancelled']), companyCanConfirm=False)
                elif upload['state'] == 'blocked':
                    # The same global operation can have independently valid
                    # provenance elsewhere. Never offer posting from this
                    # blocked export or poison the valid saved decision.
                    dto['status'] = 'data_error'
                    dto['companyCanConfirm'] = False
                    dto['errors'] = list(dict.fromkeys(dto['errors'] + json.loads(upload['errors_json'])))
                    dto['explanation'] = 'Эту выписку нельзя провести: не пройдены общие проверки файла. ' + dto['explanation']
                operations.append(dto)
        result.update(metadata=json.loads(upload['metadata_json']), reconciliation=json.loads(upload['reconciliation_json']),
            operations=operations, summary=dict(readyCount=sum(o['status']=='ready' for o in operations),
                readyAmount=sum(o['amount'] for o in operations if o['status']=='ready'),
                companyReadyCount=sum(o['companyCanConfirm'] for o in operations),
                companyReadyAmount=sum(o['amount'] for o in operations if o['companyCanConfirm']),
                accountedCount=sum(o['status']=='accounted' for o in operations),
                excludedCount=sum(o['status']=='excluded' for o in operations),
                reviewCount=sum(o['status'] not in ('ready','accounted','excluded') for o in operations)))
        return result

    def uploads(self, actor):
        with self.db.transaction() as conn:
            self._actor(conn, actor, True)
            return dict(items=[self._upload_summary(conn, dict(r)) for r in conn.execute('SELECT * FROM bank_uploads ORDER BY id DESC')])

    def get_upload(self, actor, upload_id):
        with self.db.transaction() as conn:
            self._actor(conn, actor, True)
            return self._upload_detail(conn, upload_id)

    def refresh_upload(self, actor, upload_id):
        with self.db.transaction(immediate=True) as conn:
            actor = self._actor(conn, actor, True)
            self._row(conn, 'bank_uploads', upload_id)
            for row in conn.execute('SELECT DISTINCT operation_id FROM bank_source_rows WHERE upload_id=? AND operation_id IS NOT NULL', (upload_id,)).fetchall():
                self._refresh(conn, row['operation_id'], actor['id'])
            return self._upload_detail(conn, upload_id)

    def download(self, actor, upload_id):
        with self.db.transaction() as conn:
            self._actor(conn, actor, True)
            row = self._row(conn, 'bank_uploads', upload_id)
        with storage_operation_lock(self.storage_root):
            path = self._file_path(row['storage_key'])
            if not path.is_file() or path.stat().st_nlink != 1:
                raise ManagerNotFound('Исходный файл недоступен.')
            raw = path.read_bytes()
            if len(raw) != row['byte_size'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
                raise ValueError('Целостность исходного файла нарушена.')
        return raw, row['original_filename']

    def update_operation(self, actor, operation_id, payload):
        with self.db.transaction(immediate=True) as conn:
            actor = self._actor(conn, actor, True)
            current = self._decision(conn, operation_id)
            version = integer(payload.get('version'), 'Версия решения', 2**31-1)
            if version != current['version']:
                raise ManagerConflict('Решение изменилось. Обновите результат.')
            if conn.execute('SELECT 1 FROM bank_sale_links WHERE operation_id=?', (operation_id,)).fetchone():
                raise ManagerConflict('Учтённый платёж нельзя изменить; используйте штатную отмену продажи.')
            company = conn.execute('SELECT cancelled_at FROM bank_company_sales WHERE operation_id=?', (operation_id,)).fetchone()
            if company and (company['cancelled_at'] or set(payload) - {'version', 'reason', 'duplicateAction', 'linkSaleId'}):
                raise ManagerConflict('Клиент и финансовое решение общих продаж зафиксированы; разрешено только решение о дубле действующей несвязанной оплаты.')
            reason = text(payload.get('reason'), 'Причина решения', 500)
            manual = json.loads(current['manual_json'])
            allowed = {'version','clientId','classification','reason','duplicateAction','linkSaleId','invoiceNumber','invoiceDate'}
            if set(payload) - allowed:
                raise ValueError('Неизвестное поле решения.')
            for key in ('clientId','linkSaleId'):
                if key in payload:
                    integer(payload[key], 'Клиент' if key=='clientId' else 'Продажа', 2**53-1)
                    if key == 'clientId':
                        self._row(conn, 'crm_clients', payload[key])
                    manual[key] = payload[key]
            if 'classification' in payload:
                if payload['classification'] not in ('sale','excluded','review','return'):
                    raise ValueError('Выберите классификацию платежа.')
                manual['classification'] = payload['classification']
            if 'duplicateAction' in payload:
                if payload['duplicateAction'] not in ('new','link','review'):
                    raise ValueError('Выберите действие с возможным дублем.')
                manual['duplicateAction'] = payload['duplicateAction']
                if payload['duplicateAction'] == 'link' and not manual.get('linkSaleId'):
                    raise ValueError('Выберите существующую продажу для связи.')
            for key, validator in (('invoiceNumber', optional_invoice_number), ('invoiceDate', optional_invoice_date)):
                if key in payload:
                    manual[key] = validator(payload[key])
            manual['reason'] = reason
            conn.execute('UPDATE bank_decisions SET manual_json=?,reason=?,version=version+1,updated_by=?,updated_at=? WHERE operation_id=?',
                         (dump(manual), reason, actor['id'], now(), operation_id))
            if manual.get('duplicateAction') == 'new':
                _, signature = self._evaluate(conn, operation_id)
                manual['duplicateSignature'] = signature
                conn.execute('UPDATE bank_decisions SET manual_json=? WHERE operation_id=?', (dump(manual), operation_id))
            result = self._refresh(conn, operation_id, actor['id'])
            conn.execute('INSERT INTO bank_decision_audit(operation_id,actor_id,at,reason,before_json,after_json) VALUES(?,?,?,?,?,?)',
                         (operation_id, actor['id'], now(), reason, dump(current), dump(self._decision(conn, operation_id))))
            return result

    @staticmethod
    def _items(items):
        if not isinstance(items, list) or not 1 <= len(items) <= 10000:
            raise ValueError('Выберите от 1 до 10 000 готовых оплат.')
        normalized, seen = [], set()
        for item in items:
            if not isinstance(item, dict) or set(item) != {'operationId','version','fingerprint'}:
                raise ValueError('Некорректный состав выбранных оплат.')
            op_id = integer(item['operationId'], 'Операция', 2**53-1)
            version = integer(item['version'], 'Версия решения', 2**31-1)
            if op_id in seen or not isinstance(item['fingerprint'], str) or not re.fullmatch('[0-9a-f]{64}', item['fingerprint']):
                raise ValueError('Повтор или некорректная версия выбранной операции.')
            seen.add(op_id)
            normalized.append(dict(operationId=op_id, version=version, fingerprint=item['fingerprint']))
        return sorted(normalized, key=lambda item:item['operationId'])

    def _selected(self, conn, items):
        rows = []
        for item in items:
            stored = self._decision(conn, item['operationId'])
            current, _ = self._evaluate(conn, item['operationId'])
            if (stored['version'] != item['version'] or stored['fingerprint'] != item['fingerprint']
                    or current['fingerprint'] != item['fingerprint']
                    or not (current['status'] == 'ready' or current['companyCanConfirm'])):
                raise ManagerConflict('Результат изменился или оплата не готова. Обновите выписку и повторите проверку.')
            rows.append(current)
        if sum(row['amount'] for row in rows) > MAX_MONTH_TOTAL:
            raise ValueError('Сумма выбранного пакета превышает допустимый лимит.')
        return rows

    def _effects(self, conn, rows):
        grouped = defaultdict(list)
        for row in rows:
            if row['status'] == 'ready':
                grouped[(row['managerId'],row['date'][:7])].append(row)
        effects = []
        linked = 0
        for (manager_id, month), changes in sorted(grouped.items()):
            period = self.managers._period(conn, manager_id, month)
            terms = {key:period[key] for key in ('plan','fixed','rate','mode')}
            existing = [dict(r) for r in conn.execute('SELECT id,date,client,amount,rate,cancelled FROM manager_sales WHERE manager_id=? AND month=?', (manager_id,month))]
            after_rows = list(existing)
            next_id = max((r['id'] for r in existing), default=0)+1
            new_count = 0
            for row in changes:
                manual = json.loads(self._decision(conn, row['id'])['manual_json'])
                if manual.get('duplicateAction') == 'link':
                    linked += 1
                    continue
                after_rows.append(dict(id=next_id, date=row['date'], client=row['clientName'], amount=row['amount'], rate=row['rate'], cancelled=0))
                next_id += 1
                new_count += 1
            before = calculate(existing,terms)
            after = calculate(after_rows,terms)
            if len(existing)+new_count > 10000 or after['salesTotal'] > MAX_MONTH_TOTAL:
                raise ValueError('Превышен лимит количества или суммы продаж месяца.')
            effects.append(dict(managerId=manager_id,managerName=changes[0]['managerName'],month=month,
                before={k:before[k] for k in ('salesTotal','commission','fixed','income')},
                after={k:after[k] for k in ('salesTotal','commission','fixed','income')}))
        company_new = [row for row in rows if not row['companyAccounted']
                       and json.loads(self._decision(conn, row['id'])['manual_json']).get('duplicateAction') != 'link']
        company_collapsed = [row for row in rows if row['companyAccounted']
                             and json.loads(self._decision(conn, row['id'])['manual_json']).get('duplicateAction') == 'link']
        manager_count = sum(row['status'] == 'ready' for row in rows)
        return dict(count=len(rows),amount=sum(row['amount'] for row in rows),linkedCount=linked,effects=effects,
            companyCount=len(company_new)-len(company_collapsed),
            companyAmount=sum(row['amount'] for row in company_new)-sum(row['amount'] for row in company_collapsed),
            managerCount=manager_count, pendingManagerCount=len(rows)-manager_count)

    def preview(self, actor, items):
        items = self._items(items)
        with self.db.transaction(immediate=True) as conn:
            self._actor(conn, actor, True)
            return self._effects(conn, self._selected(conn, items))

    def commit(self, actor, items, idempotency_key):
        items = self._items(items)
        key = text(idempotency_key, 'Ключ подтверждения', 200)
        if not re.fullmatch(r'[A-Za-z0-9_-]{8,200}', key):
            raise ValueError('Некорректный ключ подтверждения.')
        request_hash = digest(dict(actorId=actor.get('id'), items=items))
        try:
            with self.db.transaction(immediate=True) as conn:
                actor = self._actor(conn, actor, True)
                previous = conn.execute('SELECT * FROM bank_commits WHERE idempotency_key=?', (key,)).fetchone()
                if previous:
                    if previous['actor_id'] != actor['id'] or previous['request_hash'] != request_hash:
                        raise ManagerConflict('Ключ подтверждения уже использован с другим содержимым.')
                    return json.loads(previous['response_json'])
                rows = self._selected(conn, items)  # Validate the entire set before any write.
                result = self._effects(conn, rows)
                sale_ids, created = [], 0
                for row in rows:
                    decision = self._decision(conn, row['id'])
                    manual = json.loads(decision['manual_json'])
                    reason = decision['reason'] or 'Подтверждение оплаты банковской выписки с НДС'
                    if not conn.execute('SELECT 1 FROM bank_company_sales WHERE operation_id=?', (row['id'],)).fetchone():
                        conn.execute('''INSERT INTO bank_company_sales(operation_id,client_id,client_name,classification,
                            decision_json,confirmed_by,confirmed_at,reason) VALUES(?,?,?,?,?,?,?,?)''',
                            (row['id'],row['clientId'],row['clientName'],row['classification'],dump(row),actor['id'],now(),reason))
                        conn.execute('INSERT INTO bank_decision_audit(operation_id,actor_id,at,reason,before_json,after_json) VALUES(?,?,?,?,?,?)',
                            (row['id'],actor['id'],now(),reason,dump(dict(companySale=None)),
                             dump(dict(companySale=dict(conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?',(row['id'],)).fetchone())))))
                    if row['status'] != 'ready':
                        self._refresh(conn, row['id'], actor['id'])
                        continue
                    month = row['date'][:7]
                    version = self.managers._period(conn, row['managerId'], month)['version']
                    if manual.get('duplicateAction') == 'link':
                        sale_id = manual['linkSaleId']
                        self.managers.record_bank_link_in_transaction(conn, actor, row['managerId'], month, version, sale_id, reason, row['id'])
                        kind = 'existing'
                    else:
                        saved = self.managers._mutate_in_transaction(conn, actor, row['managerId'], month,
                            dict(kind='sale',version=version,reason=reason,date=row['date'],client=row['clientName'],
                                 amount=row['amount'],rate=row['rate'],invoiceNumber=row['invoiceNumber'],invoiceDate=row['invoiceDate']),
                            bank_operation_id=row['id'], crm_client_id=row['clientId'])
                        sale_id = saved['changedSaleId']
                        kind = 'created'
                        created += 1
                    conn.execute('''INSERT INTO bank_sale_links(operation_id,sale_id,client_id,manager_id,amount,
                        kind,linked_by,linked_at,reason) VALUES(?,?,?,?,?,?,?,?,?)''',
                        (row['id'],sale_id,row['clientId'],row['managerId'],row['amount'],kind,actor['id'],now(),reason))
                    sale_ids.append(sale_id)
                    self._refresh(conn, row['id'], actor['id'])
                result.update(createdCount=created,saleIds=sale_ids)
                conn.execute('INSERT INTO bank_commits(idempotency_key,actor_id,request_hash,response_json,created_at) VALUES(?,?,?,?,?)',
                             (key,actor['id'],request_hash,dump(result),now()))
                return result
        except sqlite3.IntegrityError as exc:
            raise ManagerConflict('Оплата или продажа уже связана другим подтверждением. Обновите результат.') from exc

    def cancel_company_sale(self, actor, operation_id, payload):
        with self.db.transaction(immediate=True) as conn:
            actor = self._actor(conn, actor, True)
            integer(operation_id, 'Операция', 2**53-1)
            current = self._decision(conn, operation_id)
            if set(payload) != {'version', 'reason'}:
                raise ValueError('Нужны версия и причина отмены.')
            version = integer(payload.get('version'), 'Версия решения', 2**31-1)
            if version != current['version']:
                raise ManagerConflict('Решение изменилось. Обновите результат.')
            reason = text(payload.get('reason'), 'Причина отмены', 500)
            if conn.execute('SELECT 1 FROM bank_sale_links WHERE operation_id=?', (operation_id,)).fetchone():
                raise ManagerConflict('Связанную продажу отменяйте штатным действием в кабинете менеджера.')
            before = conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?', (operation_id,)).fetchone()
            if not before or before['cancelled_at']:
                raise ManagerConflict('Нет действующего отдельного подтверждения общих продаж.')
            conn.execute('UPDATE bank_company_sales SET cancelled_at=?,cancelled_by=?,cancellation_reason=? WHERE operation_id=?',
                         (now(),actor['id'],reason,operation_id))
            result = self._refresh(conn, operation_id, actor['id'])
            after = conn.execute('SELECT * FROM bank_company_sales WHERE operation_id=?', (operation_id,)).fetchone()
            conn.execute('INSERT INTO bank_decision_audit(operation_id,actor_id,at,reason,before_json,after_json) VALUES(?,?,?,?,?,?)',
                         (operation_id,actor['id'],now(),reason,dump(dict(companySale=dict(before))),dump(dict(companySale=dict(after)))))
            return result

    def search_clients(self, actor, query):
        query = text(query, 'Поиск клиента', 200)
        with self.db.transaction() as conn:
            self._actor(conn, actor, True)
            found = []
            for row in conn.execute('SELECT id,document_name,full_name,name,inn,kpp FROM crm_clients WHERE crm_archived_at IS NULL AND is_inactive=0 ORDER BY id DESC'):
                if normalized_text(query) in normalized_text(document_name(row)) or query in str(row['inn'] or ''):
                    found.append(dict(id=row['id'],name=document_name(row),inn=row['inn'],kpp=row['kpp']))
                    if len(found) == 100:
                        break
            return dict(items=found)

    def _client(self, conn, actor, client_id):
        integer(client_id,'Клиент',2**53-1)
        # Preserve the same public/shared vs personal CRM boundary. Sales
        # attribution does not grant access to somebody else's private CRM.
        CrmRepository(self.db)._require_client_access(conn, actor['id'], client_id)
        dto = self.assignments._client_assignment(conn, client_id)
        admin = actor['role']=='admin'
        if not admin:
            dto.update(history=[],pending=dict(count=0,amount=0,periodStart=None,periodEnd=None))
        sql = '''SELECT o.id,o.date,o.amount,d.decision_json,d.client_id,c.operation_id AS company_id,c.cancelled_at AS company_cancelled_at,
            l.sale_id,l.manager_id AS frozen_manager_id,s.cancelled,m.display_name AS frozen_manager_name,
            m.user_id AS manager_user_id FROM bank_operations o JOIN bank_decisions d ON d.operation_id=o.id
            LEFT JOIN bank_sale_links l ON l.operation_id=o.id LEFT JOIN manager_sales s ON s.id=l.sale_id
            LEFT JOIN bank_company_sales c ON c.operation_id=o.id
            LEFT JOIN manager_accounts m ON m.id=l.manager_id WHERE d.client_id=? ORDER BY o.date DESC,o.id DESC'''
        payments = []
        for row in conn.execute(sql,(client_id,)):
            if not admin and (row['sale_id'] is None or row['manager_user_id'] != actor['id']):
                continue
            details = json.loads(row['decision_json'])
            payments.append(dict(id=row['id'],date=row['date'],amount=row['amount'],
                invoiceNumber=details.get('invoiceNumber'),invoiceDate=details.get('invoiceDate'),
                managerId=row['frozen_manager_id'] if row['sale_id'] else details.get('managerId'),
                managerName=row['frozen_manager_name'] if row['sale_id'] else details.get('managerName'),
                status='accounted' if row['sale_id'] else details.get('status','purpose_review'),
                saleId=row['sale_id'],cancelled=bool(row['cancelled']),
                companyAccounted=bool((row['company_id'] or row['sale_id']) and not row['company_cancelled_at'] and not row['cancelled']),
                companyCancelled=bool(row['company_cancelled_at'] or row['cancelled'])))
        dto['payments'] = payments
        return dto

    def client(self, actor, client_id):
        with self.db.transaction() as conn:
            actor = self._actor(conn, actor)
            return self._client(conn,actor,client_id)

    def _refresh_pending(self, conn, client_id, actor_id):
        client = self._row(conn,'crm_clients',client_id)
        inn = normalize_inn(client['inn'])
        ids = conn.execute('''SELECT o.id,o.inn,d.client_id FROM bank_operations o JOIN bank_decisions d ON d.operation_id=o.id
            WHERE NOT EXISTS(SELECT 1 FROM bank_sale_links l WHERE l.operation_id=o.id)''').fetchall()
        for row in ids:
            if row['client_id']==client_id or valid_inn(inn) and row['inn']==inn:
                self._refresh(conn,row['id'],actor_id)

    def set_assignment(self, actor, client_id, manager_id, start_date, reason, version):
        with self.db.transaction(immediate=True) as conn:
            actor = self._actor(conn,actor,True)
            self.assignments._set_assignment_in_transaction(conn,actor,client_id,manager_id,start_date,reason,version,
                refresh_pending=lambda connection,cid:self._refresh_pending(connection,cid,actor['id']))
            return self._client(conn,actor,client_id)
