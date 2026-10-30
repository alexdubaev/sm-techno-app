"""Additive persistence for private client documents; SQL stays behind this boundary."""
from __future__ import annotations

import json
import hashlib
import re
import sqlite3
import uuid
from typing import Any

from stock_sync_desktop.database import utc_now


class DocumentConflict(ValueError):
    """An optimistic version, reference, or idempotency conflict (HTTP 409)."""


class DocumentPermissionError(PermissionError):
    """Public document ACL denial, distinct from filesystem PermissionError."""


class DocumentNotFound(ValueError):
    pass


DOCUMENT_COLUMNS = {
    'contract_document_id': 'INTEGER REFERENCES documents(id)',
    'contract_version_asset_id': 'INTEGER REFERENCES client_document_assets(id)',
    'invoice_asset_id': 'INTEGER REFERENCES client_document_assets(id)',
    'origin': "TEXT DEFAULT 'legacy' CHECK(origin IN ('legacy','generated','imported'))",
    'spec_sequence': 'INTEGER CHECK(spec_sequence IS NULL OR spec_sequence > 0)',
    'legal_snapshot_json': 'TEXT',
}


def migrate(conn):
    # execute, rather than executescript, preserves the caller's migration transaction.
    statements = [
        """CREATE TABLE IF NOT EXISTS client_document_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT, crm_client_id INTEGER REFERENCES crm_clients(id),
            document_id INTEGER REFERENCES documents(id), role TEXT NOT NULL CHECK(role IN
            ('requisites','source_invoice','attachment','generated','final','archive','contract_version')),
            original_filename TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size > 0),
            sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0))""",
        """CREATE TABLE IF NOT EXISTS client_document_state (
            crm_client_id INTEGER PRIMARY KEY REFERENCES crm_clients(id), contract_document_id INTEGER REFERENCES documents(id),
            contract_version_asset_id INTEGER REFERENCES client_document_assets(id), next_spec_number INTEGER NOT NULL DEFAULT 1 CHECK(next_spec_number > 0),
            version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0))""",
        """CREATE TABLE IF NOT EXISTS document_assistant_jobs (
            id TEXT PRIMARY KEY, actor_user_id INTEGER NOT NULL REFERENCES users(id), crm_client_id INTEGER REFERENCES crm_clients(id),
            kind TEXT NOT NULL CHECK(kind IN ('requisites','contract','invoice','articles')), input_asset_ids TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('queued','running','review','failed','confirmed')), result_json TEXT,
            error_code TEXT, error_text TEXT, version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS document_assistant_operations (
            operation_key TEXT PRIMARY KEY, actor_user_id INTEGER NOT NULL REFERENCES users(id),
            job_id TEXT REFERENCES document_assistant_jobs(id), action TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending','completed','unknown','failed')),
            result_type TEXT, result_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        'CREATE INDEX IF NOT EXISTS idx_client_assets_client_time ON client_document_assets(crm_client_id,created_at)',
        'CREATE INDEX IF NOT EXISTS idx_client_assets_document_version ON client_document_assets(document_id,version)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_client_assets_unique_version ON client_document_assets(document_id,version) WHERE document_id IS NOT NULL',
    ]
    for statement in statements:
        conn.execute(statement)
    columns = {row['name'] for row in conn.execute('PRAGMA table_info(documents)')}
    for column, sql_type in DOCUMENT_COLUMNS.items():
        if column not in columns:
            conn.execute(f'ALTER TABLE documents ADD COLUMN {column} {sql_type}')
    conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_contract_sequence ON documents(contract_document_id,spec_sequence) WHERE spec_sequence IS NOT NULL')


def migration_present(conn):
    columns = {row['name'] for row in conn.execute('PRAGMA table_info(documents)')}
    tables = {row['name'] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return set(DOCUMENT_COLUMNS).issubset(columns) and {'client_document_assets','client_document_state','document_assistant_jobs','document_assistant_operations'}.issubset(tables)


class AssistantRepository:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def _row(row, message='Документ не найден.'):
        if row is None:
            raise DocumentNotFound(message)
        return dict(row)

    def get_client_display(self, client_id):
        with self.db.connect() as conn:
            row = conn.execute("SELECT id,document_name,full_name,name,linked_counterparty_id FROM crm_clients WHERE id=?", (client_id,)).fetchone()
        client = self._row(row, 'Клиент не найден.')
        if client['linked_counterparty_id'] is not None:
            with self.db.connect() as conn:
                if conn.execute('SELECT COUNT(*) FROM crm_clients WHERE linked_counterparty_id=?',(client['linked_counterparty_id'],)).fetchone()[0]>1:
                    raise DocumentConflict('Контрагент связан с несколькими карточками; требуется согласование привязки.')
        return client

    def get_counterparty_identity(self, counterparty_id):
        with self.db.connect() as conn:
            return self._row(conn.execute('SELECT * FROM counterparties WHERE id=?',(counterparty_id,)).fetchone(),'Контрагент не найден.')

    def has_counterparty_contract(self, counterparty_id):
        with self.db.connect() as conn:
            return conn.execute("SELECT 1 FROM documents WHERE document_type='contract' AND counterparty_id=? LIMIT 1",(counterparty_id,)).fetchone() is not None

    def list_client_documents(self, client_id):
        with self.db.connect() as conn:
            return [{**dict(row),'crm_client_id':client_id} for row in conn.execute('''SELECT d.*,COALESCE(NULLIF(u.full_name,''),u.username) AS created_by_name,
                COALESCE((SELECT MAX(version) FROM client_document_assets a WHERE a.document_id=d.id),1) AS version
                FROM documents d LEFT JOIN users u ON u.id=d.created_by_user_id
                WHERE d.crm_client_id=? OR (d.crm_client_id IS NULL AND d.client_source='onec' AND d.counterparty_id=(SELECT linked_counterparty_id FROM crm_clients WHERE id=?)) ORDER BY d.created_at DESC,d.id DESC''', (client_id,client_id))]

    def resolve_document_client_id(self, document):
        if document.get('crm_client_id') is not None:
            return document['crm_client_id']
        if document.get('client_source') != 'onec' or document.get('counterparty_id') is None:
            return None
        with self.db.connect() as conn:
            rows = conn.execute('SELECT id FROM crm_clients WHERE linked_counterparty_id=?',(document['counterparty_id'],)).fetchall()
        if len(rows)>1:
            raise DocumentConflict('Контрагент связан с несколькими карточками; требуется согласование привязки.')
        return rows[0]['id'] if rows else None

    @staticmethod
    def _belongs_to_client(conn, document, client_id):
        if document['crm_client_id'] == client_id: return True
        if document['crm_client_id'] is not None or document['client_source']!='onec': return False
        row=conn.execute('SELECT linked_counterparty_id FROM crm_clients WHERE id=?',(client_id,)).fetchone()
        return row is not None and row[0] is not None and row[0]==document['counterparty_id']

    def get_document(self, document_id, client_id=None):
        with self.db.connect() as conn:
            row = conn.execute('''SELECT d.*,COALESCE((SELECT MAX(version) FROM client_document_assets a WHERE a.document_id=d.id),1) AS version
                FROM documents d WHERE d.id=?''', (document_id,)).fetchone()
        record = self._row(row)
        record['crm_client_id']=self.resolve_document_client_id(record)
        if client_id is not None and record['crm_client_id'] != client_id:
            raise DocumentNotFound('Документ не найден.')
        return record

    def list_client_assets(self, client_id, document_id=None):
        query = '''SELECT a.*,COALESCE(NULLIF(u.full_name,''),u.username) AS created_by_name
            FROM client_document_assets a LEFT JOIN users u ON u.id=a.created_by_user_id WHERE a.crm_client_id=?'''
        args = [client_id]
        if document_id is not None:
            query += ' AND a.document_id=?'; args.append(document_id)
        with self.db.connect() as conn:
            return [dict(row) for row in conn.execute(query+' ORDER BY a.created_at,a.id',args)]

    def get_asset(self, asset_id):
        with self.db.connect() as conn:
            return self._row(conn.execute('SELECT * FROM client_document_assets WHERE id=?',(asset_id,)).fetchone(), 'Файл не найден.')

    def create_asset(self, client_id, role, stored, actor_user_id):
        if client_id is not None: self.get_client_display(client_id)
        with self.db.transaction(immediate=True) as conn:
            cursor = conn.execute('''INSERT INTO client_document_assets(crm_client_id,role,original_filename,media_type,byte_size,sha256,storage_key,created_by_user_id,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)''',(client_id,role,stored.original_filename,stored.media_type,stored.byte_size,stored.sha256,stored.storage_key,actor_user_id,utc_now()))
            asset_id = cursor.lastrowid
            # Materialize before commit: callers can safely compensate any error
            # raised here without deleting bytes referenced by committed metadata.
            return self._row(conn.execute('SELECT * FROM client_document_assets WHERE id=?',(asset_id,)).fetchone())

    @staticmethod
    def _state(conn, client_id):
        conn.execute('INSERT OR IGNORE INTO client_document_state(crm_client_id) VALUES(?)',(client_id,))
        return dict(conn.execute('SELECT * FROM client_document_state WHERE crm_client_id=?',(client_id,)).fetchone())

    def get_client_document_state(self, client_id):
        self.get_client_display(client_id)
        with self.db.transaction(immediate=True) as conn:
            state = self._state(conn,client_id)
            contracts = conn.execute("SELECT id FROM documents WHERE (crm_client_id=? OR (crm_client_id IS NULL AND client_source='onec' AND counterparty_id=(SELECT linked_counterparty_id FROM crm_clients WHERE id=?))) AND document_type='contract' ORDER BY id",(client_id,client_id)).fetchall()
            if len(contracts) > 1:
                raise DocumentConflict('У клиента несколько прежних договоров. Администратору необходимо согласовать единственный договор.')
            if contracts and state['contract_document_id'] is None:
                # One existing legacy contract is unambiguous; its file is versioned on the first replacement.
                conn.execute('UPDATE client_document_state SET contract_document_id=?,next_spec_number=1 WHERE crm_client_id=?',(contracts[0]['id'],client_id))
                state['contract_document_id'] = contracts[0]['id']
                state['next_spec_number'] = 1
            return state

    def set_contract_version(self, client_id, document_id, asset_id, expected_version):
        with self.db.transaction(immediate=True) as conn:
            state = self._state(conn,client_id)
            asset = conn.execute('SELECT * FROM client_document_assets WHERE id=? AND crm_client_id=? AND document_id=?',(asset_id,client_id,document_id)).fetchone()
            document = conn.execute("SELECT id FROM documents WHERE id=? AND crm_client_id=? AND document_type='contract'",(document_id,client_id)).fetchone()
            if not asset or not document: raise DocumentNotFound('Версия договора не найдена.')
            if state['version'] != expected_version or state['contract_document_id'] not in (None,document_id):
                raise DocumentConflict('Конфликт версии договора. Обновите список документов.')
            conn.execute('UPDATE client_document_state SET contract_document_id=?,contract_version_asset_id=?,version=version+1 WHERE crm_client_id=?',(document_id,asset_id,client_id))
        return self.get_client_document_state(client_id)

    def import_document(self, client_id, document_type, asset_id, number, document_date, actor_user_id, contract_id=None, expected_version=None, output_path=''):
        client = self.get_client_display(client_id)
        with self.db.transaction(immediate=True) as conn:
            state = self._state(conn,client_id)
            if expected_version is not None and state['version'] != expected_version:
                raise DocumentConflict('Конфликт версии карточки документов. Обновите список.')
            asset = conn.execute('SELECT * FROM client_document_assets WHERE id=? AND crm_client_id=?',(asset_id,client_id)).fetchone()
            if not asset: raise DocumentNotFound('Файл не найден.')
            if asset['document_id'] is not None:
                existing = conn.execute('SELECT * FROM documents WHERE id=?',(asset['document_id'],)).fetchone()
                if existing and existing['document_type']==document_type and existing['number']==number and existing['document_date']==document_date:
                    return self.get_document(existing['id'])
                raise DocumentConflict('Файл уже связан с документом.')
            contracts = conn.execute("SELECT id FROM documents WHERE (crm_client_id=? OR (crm_client_id IS NULL AND client_source='onec' AND counterparty_id=(SELECT linked_counterparty_id FROM crm_clients WHERE id=?))) AND document_type='contract'",(client_id,client_id)).fetchall()
            sequence = None
            if document_type == 'contract':
                if contracts: raise DocumentConflict('У клиента уже есть договор. Загрузите новую версию этого договора.')
                contract_id = None
            else:
                if len(contracts) != 1 or state['contract_document_id'] not in (None,contracts[0]['id']):
                    raise DocumentConflict('Сначала укажите единственный договор клиента.')
                canonical = contracts[0]['id']
                if contract_id is not None and contract_id != canonical:
                    raise DocumentConflict('Спецификация должна относиться к договору этого клиента.')
                contract_id = canonical
                if not re.fullmatch(r'[1-9][0-9]{0,8}',number):
                    raise ValueError('Подтвердите целый положительный номер архивной спецификации (без префикса).')
                sequence = int(number)
            now = utc_now()
            try:
                cursor = conn.execute('''INSERT INTO documents(document_type,number,client_source,counterparty_id,crm_client_id,client_name_snapshot,
                    document_date,output_path,created_by_user_id,created_at,updated_at,origin,contract_document_id,contract_version_asset_id,spec_sequence)
                    VALUES(?,?,'local',?,?,?,?,?,?,?,?, 'imported',?,?,?)''',
                    (document_type,number,client['linked_counterparty_id'],client_id,client['document_name'] or client['full_name'] or client['name'],document_date,output_path,actor_user_id,now,now,contract_id,state['contract_version_asset_id'] if contract_id else None,sequence))
            except sqlite3.IntegrityError as exc:
                raise DocumentConflict('Спецификация с таким номером уже существует.') from exc
            did = int(cursor.lastrowid)
            conn.execute("UPDATE client_document_assets SET document_id=?,version=1,role='archive' WHERE id=?",(did,asset_id))
            if document_type == 'contract':
                conn.execute('UPDATE client_document_state SET contract_document_id=?,contract_version_asset_id=?,next_spec_number=1,version=version+1 WHERE crm_client_id=?',(did,asset_id,client_id))
            else:
                conn.execute('UPDATE client_document_state SET next_spec_number=MAX(next_spec_number,?),version=version+1 WHERE crm_client_id=?',(sequence+1,client_id))
        return self.get_document(did)

    def add_version(self, client_id, document_id, role, stored, actor_user_id, expected_version, output_path, legacy_original=None, legal_snapshot=None, missing_fields=None):
        with self.db.transaction(immediate=True) as conn:
            document = conn.execute('SELECT * FROM documents WHERE id=?',(document_id,)).fetchone()
            if not document or not self._belongs_to_client(conn,document,client_id): raise DocumentNotFound('Документ не найден.')
            current = conn.execute('SELECT MAX(version) FROM client_document_assets WHERE document_id=?',(document_id,)).fetchone()[0]
            if (current or 1) != expected_version: raise DocumentConflict('Конфликт версии документа. Обновите список.')
            if current is None:
                if legacy_original is None: raise DocumentConflict('Исходный файл документа недоступен; замена запрещена.')
                conn.execute('''INSERT INTO client_document_assets(crm_client_id,document_id,role,original_filename,media_type,byte_size,sha256,storage_key,created_by_user_id,created_at,version)
                    VALUES(?,?,'generated',?,?,?,?,?,?,?,1)''',(client_id,document_id,legacy_original.original_filename,legacy_original.media_type,legacy_original.byte_size,legacy_original.sha256,legacy_original.storage_key,actor_user_id,utc_now()))
                current=1
            version=current+1
            cursor=conn.execute('''INSERT INTO client_document_assets(crm_client_id,document_id,role,original_filename,media_type,byte_size,sha256,storage_key,created_by_user_id,created_at,version)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)''',(client_id,document_id,role,stored.original_filename,stored.media_type,stored.byte_size,stored.sha256,stored.storage_key,actor_user_id,utc_now(),version))
            conn.execute('UPDATE documents SET output_path=?,updated_at=?,crm_client_id=COALESCE(crm_client_id,?) WHERE id=?',(output_path,utc_now(),client_id,document_id))
            if legal_snapshot is not None:
                conn.execute('UPDATE documents SET legal_snapshot_json=?,missing_fields=? WHERE id=?',(json.dumps(legal_snapshot,ensure_ascii=False),json.dumps(missing_fields or [],ensure_ascii=False),document_id))
            if document['document_type']=='contract':
                state=self._state(conn,client_id)
                if state['contract_document_id'] not in (None,document_id): raise DocumentConflict('Конфликт единственного договора клиента.')
                conn.execute('UPDATE client_document_state SET contract_document_id=?,contract_version_asset_id=?,version=version+1 WHERE crm_client_id=?',(document_id,cursor.lastrowid,client_id))
            aid=cursor.lastrowid
            return self._row(conn.execute('SELECT * FROM client_document_assets WHERE id=?',(aid,)).fetchone())

    @staticmethod
    def _assert_asset_unreferenced(conn, asset_id):
        if conn.execute('SELECT 1 FROM documents WHERE contract_version_asset_id=? OR invoice_asset_id=?',(asset_id,asset_id)).fetchone():
            raise DocumentConflict('Файл используется документом и не может быть удалён.')
        if conn.execute('SELECT 1 FROM client_document_state WHERE contract_version_asset_id=?',(asset_id,)).fetchone():
            raise DocumentConflict('Это действующая версия договора. Удалите договор после его зависимостей.')
        for row in conn.execute("SELECT input_asset_ids FROM document_assistant_jobs WHERE status IN ('queued','running','review')"):
            if asset_id in json.loads(row[0]): raise DocumentConflict('Файл используется заданием помощника.')

    def delete_asset(self, asset_id):
        with self.db.transaction(immediate=True) as conn:
            row=self._row(conn.execute('SELECT * FROM client_document_assets WHERE id=?',(asset_id,)).fetchone(),'Файл не найден.')
            self._assert_asset_unreferenced(conn,asset_id)
            if row['document_id'] is not None: raise DocumentConflict('Версии хранятся вместе с документом. Удалите документ целиком.')
            conn.execute('DELETE FROM client_document_assets WHERE id=?',(asset_id,))

    def delete_document(self, document_id):
        with self.db.transaction(immediate=True) as conn:
            if conn.execute('SELECT 1 FROM documents WHERE contract_document_id=?',(document_id,)).fetchone():
                raise DocumentConflict('Договор используется спецификациями. Сначала удалите зависимые спецификации.')
            assets=conn.execute('SELECT id FROM client_document_assets WHERE document_id=?',(document_id,)).fetchall()
            conn.execute('UPDATE client_document_state SET contract_document_id=NULL,contract_version_asset_id=NULL,version=version+1 WHERE contract_document_id=?',(document_id,))
            for asset in assets: self._assert_asset_unreferenced(conn,asset['id'])
            conn.execute('DELETE FROM client_document_assets WHERE document_id=?',(document_id,))
            conn.execute('DELETE FROM documents WHERE id=?',(document_id,))

    def create_job(self, actor_user_id, kind, client_id, asset_ids):
        if kind not in {'requisites','contract','invoice','articles'} or not asset_ids: raise ValueError('Выберите тип и исходные файлы задания.')
        with self.db.transaction(immediate=True) as conn:
            for aid in asset_ids:
                row=conn.execute('SELECT crm_client_id,created_by_user_id FROM client_document_assets WHERE id=?',(aid,)).fetchone()
                if not row or row[0] != client_id or (client_id is None and row[1] != actor_user_id): raise DocumentNotFound('Исходный файл не найден у клиента.')
            jid=uuid.uuid4().hex; now=utc_now()
            conn.execute("INSERT INTO document_assistant_jobs(id,actor_user_id,crm_client_id,kind,input_asset_ids,status,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?)",(jid,actor_user_id,client_id,kind,json.dumps(asset_ids),now,now))
        return self.get_job(jid)

    def get_job(self, job_id):
        with self.db.connect() as conn:
            row=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
        row['input_asset_ids']=json.loads(row['input_asset_ids']); row['result']=json.loads(row['result_json']) if row['result_json'] else None
        return row

    def transition_job(self, job_id, expected_version, status, result=None, error=None):
        allowed={'queued':{'running','failed'},'running':{'review','failed'},'review':{'confirmed','failed'},'failed':{'queued'},'confirmed':set()}
        with self.db.transaction(immediate=True) as conn:
            row=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
            if row['version']!=expected_version or status not in allowed[row['status']]: raise DocumentConflict('Конфликт версии или состояния задания.')
            # Callers supply public, fixed messages. Never persist raw converter/CLI exceptions.
            error_code=(error or {}).get('code') if isinstance(error,dict) else None
            error_text=(error or {}).get('message') if isinstance(error,dict) else None
            conn.execute('UPDATE document_assistant_jobs SET status=?,result_json=?,error_code=?,error_text=?,version=version+1,updated_at=? WHERE id=?',(status,json.dumps(result,ensure_ascii=False) if result is not None else row['result_json'],error_code,error_text,utc_now(),job_id))
        return self.get_job(job_id)

    def get_operation(self,operation_key):
        if not isinstance(operation_key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',operation_key):raise ValueError('Некорректный ключ операции.')
        with self.db.connect() as conn:
            row=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone()
            return dict(row) if row else None

    def begin_operation(self, operation_key, actor_user_id, job_id, action):
        if not isinstance(operation_key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',operation_key): raise ValueError('Некорректный ключ операции.')
        with self.db.transaction(immediate=True) as conn:
            row=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone()
            if row:
                if (row['actor_user_id'],row['job_id'],row['action']) != (actor_user_id,job_id,action): raise DocumentConflict('Ключ операции уже используется другим действием.')
                return dict(row)
            now=utc_now()
            conn.execute("INSERT INTO document_assistant_operations(operation_key,actor_user_id,job_id,action,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)",(operation_key,actor_user_id,job_id,action,now,now))
            return dict(conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone())

    def finish_operation(self, operation_key, result_type, result_id):
        with self.db.transaction(immediate=True) as conn:
            row=self._row(conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone(),'Операция не найдена.')
            if row['status']=='completed':
                if (row['result_type'],row['result_id']) != (result_type,str(result_id)): raise DocumentConflict('Операция уже завершена другим результатом.')
                return dict(row)
            if row['status']!='pending': raise DocumentConflict('Результат операции требует согласования; повтор запрещён.')
            conn.execute("UPDATE document_assistant_operations SET status='completed',result_type=?,result_id=?,updated_at=? WHERE operation_key=?",(result_type,str(result_id),utc_now(),operation_key))
            return dict(conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone())

    def mark_operation_unknown(self, operation_key):
        with self.db.transaction(immediate=True) as conn:
            conn.execute("UPDATE document_assistant_operations SET status='unknown',updated_at=? WHERE operation_key=? AND status='pending'",(utc_now(),operation_key))

    def list_jobs(self, actor_user_id, client_id=None):
        with self.db.connect() as conn:
            if client_id is None:
                rows=conn.execute('SELECT id FROM document_assistant_jobs WHERE actor_user_id=? AND crm_client_id IS NULL ORDER BY created_at DESC LIMIT 30',(actor_user_id,)).fetchall()
            else:
                rows=conn.execute('SELECT id FROM document_assistant_jobs WHERE crm_client_id=? ORDER BY created_at DESC LIMIT 30',(client_id,)).fetchall()
        return [self.get_job(row['id']) for row in rows]

    def confirm_review(self, job_id, actor_user_id, expected_version, result, operation_key):
        """Corrections, confirmed state and replay result are committed together."""
        with self.db.transaction(immediate=True) as conn:
            job=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
            if job['crm_client_id'] is None and job['actor_user_id']!=actor_user_id:
                raise DocumentPermissionError('Задание доступно только его автору до привязки к клиенту.')
            if not isinstance(operation_key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',operation_key): raise ValueError('Некорректный ключ операции.')
            operation=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone()
            if operation:
                if (operation['job_id'],operation['actor_user_id'],operation['action'],operation['status'])!=(job_id,actor_user_id,'review','completed'):
                    raise DocumentConflict('Ключ операции уже используется другим действием.')
                # Replays cannot mutate an already confirmed review with different corrections.
                previous=json.loads(job['result_json'])
                if previous.get('payload')!=result.get('payload'): raise DocumentConflict('Операция уже завершена с другими полями.')
                return self.get_job(job_id)
            if job['version']!=expected_version or job['status']!='review': raise DocumentConflict('Конфликт версии задания. Обновите результат проверки.')
            now=utc_now()
            conn.execute("UPDATE document_assistant_jobs SET status='confirmed',result_json=?,version=version+1,updated_at=? WHERE id=?",(json.dumps(result,ensure_ascii=False),now,job_id))
            conn.execute("INSERT INTO document_assistant_operations(operation_key,actor_user_id,job_id,action,status,result_type,result_id,created_at,updated_at) VALUES(?,?,?,'review','completed','job',?,?,?)",(operation_key,actor_user_id,job_id,job_id,now,now))
        return self.get_job(job_id)

    def preview_document_candidates(self, inn, kpp):
        with self.db.connect() as conn:
            rows=conn.execute("""SELECT c.id,c.document_name,c.full_name,c.name,
                COALESCE(NULLIF(c.inn,''),p.inn,'') AS inn,COALESCE(NULLIF(c.kpp,''),p.kpp,'') AS kpp
                FROM crm_clients c LEFT JOIN counterparties p ON p.id=c.linked_counterparty_id
                WHERE c.crm_archived_at IS NULL AND COALESCE(NULLIF(c.inn,''),p.inn,'')=?
                AND (?='' OR COALESCE(NULLIF(c.kpp,''),p.kpp,'')=?) ORDER BY c.id""",(inn,kpp,kpp)).fetchall()
            candidates=[]
            for row in rows:
                docs=conn.execute("""SELECT d.id,d.number,s.contract_version_asset_id FROM documents d
                    LEFT JOIN client_document_state s ON s.crm_client_id=? AND s.contract_document_id=d.id
                    WHERE d.document_type='contract' AND (d.crm_client_id=? OR
                      (d.crm_client_id IS NULL AND d.client_source='onec' AND d.counterparty_id=(SELECT linked_counterparty_id FROM crm_clients WHERE id=?)))""",(row['id'],row['id'],row['id'])).fetchall()
                if len(docs)>1: raise DocumentConflict('У клиента несколько договоров; требуется согласование.')
                contract={'documentId':docs[0]['id'],'number':docs[0]['number'],'versionId':docs[0]['contract_version_asset_id']} if docs else None
                candidates.append({'clientId':row['id'],'documentName':row['document_name'] or row['full_name'] or row['name'] or '', 'inn':row['inn'],'kpp':row['kpp'],'contract':contract})
            return candidates

    def bind_document_job(self, job_id, actor_user_id, client_id, expected_version, operation_key):
        if not isinstance(operation_key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',operation_key): raise ValueError('Некорректный ключ операции.')
        with self.db.transaction(immediate=True) as conn:
            job=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
            if job['actor_user_id']!=actor_user_id: raise DocumentPermissionError('Привязать задание может только автор.')
            op=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone()
            if op:
                if (op['actor_user_id'],op['job_id'],op['action'],op['status'],op['result_id'])!=(actor_user_id,job_id,'bind_client','completed',str(client_id)) or job['crm_client_id']!=client_id:
                    raise DocumentConflict('Ключ операции уже использован.')
                if expected_version!=job['version']-1: raise DocumentConflict('Конфликт версии задания.')
                return self.get_job(job_id)
            if job['kind'] not in {'requisites','invoice'} or job['status']!='confirmed' or job['crm_client_id'] is not None or job['version']!=expected_version:
                raise DocumentConflict('Сначала подтвердите актуальный результат проверки.')
            fields=json.loads(job['result_json'] or '{}').get('payload',{})
            inn=str(fields.get('inn' if job['kind']=='requisites' else 'buyer_inn') or '').strip()
            kpp=str(fields.get('kpp' if job['kind']=='requisites' else 'buyer_kpp') or '').strip()
            client=conn.execute("""SELECT c.crm_archived_at,COALESCE(NULLIF(c.inn,''),p.inn,'') AS inn,COALESCE(NULLIF(c.kpp,''),p.kpp,'') AS kpp
                FROM crm_clients c LEFT JOIN counterparties p ON p.id=c.linked_counterparty_id WHERE c.id=?""",(client_id,)).fetchone()
            if not client: raise DocumentNotFound('Клиент не найден.')
            if client['crm_archived_at'] or not inn or inn!=client['inn'] or (kpp and kpp!=client['kpp']): raise DocumentConflict('ИНН/КПП документа не совпадают с клиентом.')
            for aid in json.loads(job['input_asset_ids']):
                asset=conn.execute('SELECT * FROM client_document_assets WHERE id=?',(aid,)).fetchone()
                if not asset or asset['created_by_user_id']!=actor_user_id or asset['crm_client_id'] is not None: raise DocumentConflict('Исходный файл уже привязан.')
                conn.execute('UPDATE client_document_assets SET crm_client_id=? WHERE id=?',(client_id,aid))
            now=utc_now()
            conn.execute('UPDATE document_assistant_jobs SET crm_client_id=?,version=version+1,updated_at=? WHERE id=?',(client_id,now,job_id))
            conn.execute("INSERT INTO document_assistant_operations(operation_key,actor_user_id,job_id,action,status,result_type,result_id,created_at,updated_at) VALUES(?,?,?,'bind_client','completed','client',?,?,?)",(operation_key,actor_user_id,job_id,str(client_id),now,now))
        return self.get_job(job_id)

    def bind_reviewed_job(self, job_id, actor_user_id, client_id, expected_version):
        """Explicit post-review binding; atomically moves only this actor's unbound inputs."""
        self.get_client_display(client_id)
        with self.db.transaction(immediate=True) as conn:
            job=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
            if job['actor_user_id']!=actor_user_id: raise DocumentPermissionError('Привязать исходные файлы может только автор задания.')
            if job['version']!=expected_version or job['status']!='confirmed' or job['crm_client_id'] not in (None,client_id): raise DocumentConflict('Сначала подтвердите актуальные реквизиты.')
            ids=json.loads(job['input_asset_ids'])
            for aid in ids:
                row=conn.execute('SELECT * FROM client_document_assets WHERE id=?',(aid,)).fetchone()
                if not row or row['created_by_user_id']!=actor_user_id or row['crm_client_id'] not in (None,client_id): raise DocumentConflict('Исходный файл уже привязан к другому клиенту.')
            for aid in ids: conn.execute('UPDATE client_document_assets SET crm_client_id=? WHERE id=?',(client_id,aid))
            conn.execute('UPDATE document_assistant_jobs SET crm_client_id=?,version=version+1,updated_at=? WHERE id=?',(client_id,utc_now(),job_id))
        return self.get_job(job_id)

    def claim_requisites_action(self, job_id, actor_user_id, expected_version, result, operation_key, action, request):
        """Durable claim before an external side effect; pending is never a retry grant."""
        if not isinstance(operation_key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',operation_key):
            raise ValueError('Некорректный ключ операции.')
        digest=hashlib.sha256(json.dumps(request,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        with self.db.transaction(immediate=True) as conn:
            job=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone(),'Задание не найдено.')
            if job['crm_client_id'] is None and job['actor_user_id']!=actor_user_id:
                raise DocumentPermissionError('Непривязанное задание доступно только автору.')
            previous=json.loads(job['result_json'] or '{}')
            op=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone()
            if op:
                receipt=previous.get('actions',{}).get(operation_key,{})
                if (op['job_id'],op['actor_user_id'],op['action'])!=(job_id,actor_user_id,action) or receipt.get('request')!=digest:
                    raise DocumentConflict('Ключ операции уже использован с другим действием или полями.')
                if op['status']!='completed': raise DocumentConflict('Результат предыдущего действия требует проверки. Повторная отправка запрещена.')
                return self.get_job(job_id),receipt,False
            if conn.execute('SELECT 1 FROM document_assistant_operations WHERE job_id=? AND action=?',(job_id,action)).fetchone():
                raise DocumentConflict('Это действие уже выполнялось для задания. Обновите состояние; повторная отправка запрещена.')
            if job['version']!=expected_version or job['status'] not in {'review','confirmed'}:
                raise DocumentConflict('Конфликт версии задания. Обновите результат проверки.')
            result['actions']={**previous.get('actions',{}),operation_key:{'request':digest}}
            now=utc_now()
            conn.execute("UPDATE document_assistant_jobs SET status='confirmed',result_json=?,version=version+1,updated_at=? WHERE id=?",(json.dumps(result,ensure_ascii=False),now,job_id))
            conn.execute("INSERT INTO document_assistant_operations(operation_key,actor_user_id,job_id,action,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)",(operation_key,actor_user_id,job_id,action,now,now))
        return self.get_job(job_id),None,True

    def complete_requisites_action(self, job_id, operation_key, receipt):
        with self.db.transaction(immediate=True) as conn:
            op=self._row(conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=? AND job_id=?',(operation_key,job_id)).fetchone())
            if op['status']!='pending': raise DocumentConflict('Операция уже завершена или требует проверки.')
            job=self._row(conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(job_id,)).fetchone())
            result=json.loads(job['result_json']); result['actions'][operation_key].update(receipt)
            now=utc_now()
            conn.execute('UPDATE document_assistant_jobs SET result_json=?,updated_at=? WHERE id=?',(json.dumps(result,ensure_ascii=False),now,job_id))
            conn.execute("UPDATE document_assistant_operations SET status='completed',result_type=?,result_id=?,updated_at=? WHERE operation_key=?",(receipt['resultType'],str(receipt['resultId']),now,operation_key))
        return self.get_job(job_id)

    @staticmethod
    def identity_operation_key(card):
        identity=card['inn']+':'+(card['kpp'] if card['legal_type']=='legal_entity' else '')
        return 'client-identity-'+hashlib.sha256(identity.encode()).hexdigest()

    def claim_client_identity(self, card, actor_user_id, job_id):
        key=self.identity_operation_key(card)
        with self.db.transaction(immediate=True) as conn:
            existing=conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(key,)).fetchone()
            if existing:
                raise DocumentConflict('Создание клиента с этим ИНН/КПП уже выполнялось. Проверьте существующую карточку и результат обмена.')
            now=utc_now()
            conn.execute("INSERT INTO document_assistant_operations(operation_key,actor_user_id,job_id,action,status,created_at,updated_at) VALUES(?,?,?,'create_client_identity','pending',?,?)",(key,actor_user_id,job_id,now,now))
        return key

    def record_identity_outcome(self, key, client_id, status):
        if status not in {'pending','completed','unknown','failed'}: raise ValueError('Некорректный результат обмена.')
        with self.db.transaction(immediate=True) as conn:
            conn.execute("UPDATE document_assistant_operations SET status=?,result_type='client',result_id=?,updated_at=? WHERE operation_key=?",(status,str(client_id),utc_now(),key))

    def require_safe_client_retry(self, client_id, *, allow_known_reference=False):
        with self.db.connect() as conn:
            guard=conn.execute("SELECT * FROM document_assistant_operations WHERE action='create_client_identity' AND result_id=?",(str(client_id),)).fetchone()
        if guard and guard['status'] in {'pending','unknown'} and not allow_known_reference:
            raise DocumentConflict('Результат отправки клиента в 1С неизвестен или неполон. Сначала проверьте созданного контрагента; повторная отправка запрещена.')
        return dict(guard) if guard else None

    def match_document_identity(self, card):
        """Exact identity only; ambiguity and archived identities are never auto-merged."""
        clause='inn=? AND COALESCE(kpp,\'\')=?' if card['legal_type']=='legal_entity' else 'inn=?'
        args=(card['inn'],card['kpp']) if card['legal_type']=='legal_entity' else (card['inn'],)
        with self.db.connect() as conn:
            clients=[dict(r) for r in conn.execute('SELECT id,linked_counterparty_id,crm_archived_at FROM crm_clients WHERE '+clause,args)]
            cached=[dict(r) for r in conn.execute('SELECT * FROM counterparties WHERE '+clause,args)]
        if len(clients)>1 or len(cached)>1: raise DocumentConflict('Найдено несколько клиентов с этими ИНН/КПП. Требуется согласовать карточки.')
        if clients:
            if clients[0]['crm_archived_at']: raise DocumentConflict('Клиент находится в архиве; автоматическое создание дубликата запрещено.')
            if cached and clients[0]['linked_counterparty_id'] not in (None,cached[0]['id']): raise DocumentConflict('ИНН/КПП расходятся с существующей связью клиента.')
            return clients[0]['id'],cached[0] if cached else None
        return None,cached[0] if cached else None

    def document_client_for_counterparty(self, counterparty):
        """Create only a minimal catalogue-linked card; never update a private card."""
        with self.db.transaction(immediate=True) as conn:
            rows=conn.execute('SELECT id FROM crm_clients WHERE linked_counterparty_id=?',(counterparty['id'],)).fetchall()
            if len(rows)>1: raise DocumentConflict('Контрагент связан с несколькими карточками.')
            if rows: return rows[0]['id']
            now=utc_now(); name=counterparty.get('full_name') or ''
            if not name: raise DocumentConflict('В справочнике отсутствует наименование для документов.')
            cursor=conn.execute("""INSERT INTO crm_clients(name,document_name,full_name,legal_type,inn,kpp,is_buyer,
                linked_counterparty_id,sync_status,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,'synced',?,?)""",
                (name,name,name,'individual_entrepreneur' if len(counterparty.get('inn') or '')==12 else 'legal_entity',counterparty.get('inn'),counterparty.get('kpp'),counterparty['id'],now,now))
            return cursor.lastrowid

    def save_generated_contract(self, client_id, stored, actor_user_id, number, document_date, output_path, snapshot, missing_fields, state_version):
        client=self.get_client_display(client_id)
        with self.db.transaction(immediate=True) as conn:
            state=self._state(conn,client_id)
            if state['version']!=state_version or state['contract_document_id'] is not None:
                raise DocumentConflict('Договор клиента уже изменён. Обновите документы.')
            if conn.execute("SELECT 1 FROM documents WHERE document_type='contract' AND (crm_client_id=? OR (crm_client_id IS NULL AND counterparty_id=?))",(client_id,client['linked_counterparty_id'])).fetchone():
                raise DocumentConflict('У клиента уже есть договор. Используйте новую версию.')
            now=utc_now()
            document=conn.execute("""INSERT INTO documents(document_type,number,client_source,counterparty_id,crm_client_id,
                client_name_snapshot,document_date,output_path,created_by_user_id,created_at,updated_at,origin,legal_snapshot_json,missing_fields)
                VALUES('contract',?,'local',?,?,?,?,?,?,?,?,'generated',?,?)""",
                (number,client['linked_counterparty_id'],client_id,snapshot['document_name'],document_date,output_path,actor_user_id,now,now,json.dumps(snapshot,ensure_ascii=False),json.dumps(missing_fields,ensure_ascii=False)))
            did=document.lastrowid
            asset=conn.execute("""INSERT INTO client_document_assets(crm_client_id,document_id,role,original_filename,media_type,
                byte_size,sha256,storage_key,created_by_user_id,created_at,version) VALUES(?,?,'generated',?,?,?,?,?,?,?,1)""",
                (client_id,did,stored.original_filename,stored.media_type,stored.byte_size,stored.sha256,stored.storage_key,actor_user_id,now))
            conn.execute('UPDATE client_document_state SET contract_document_id=?,contract_version_asset_id=?,next_spec_number=1,version=version+1 WHERE crm_client_id=?',(did,asset.lastrowid,client_id))
            return self._row(conn.execute('SELECT d.*,1 AS version FROM documents d WHERE id=?',(did,)).fetchone())

    def _specification_sequence_state(self,conn,client_id,contract_id):
        state=self._state(conn,client_id)
        if not contract_id or state['contract_document_id']!=contract_id:raise DocumentConflict('Изменился договор клиента.')
        rows=conn.execute("SELECT * FROM documents WHERE document_type='specification' AND contract_document_id=?",(contract_id,)).fetchall()
        numbers=set()
        for row in rows:
            if not self._belongs_to_client(conn,row,client_id):raise DocumentConflict('Прежняя спецификация связана с другим клиентом.')
            number=str(row['number'] or '')
            if not re.fullmatch(r'[1-9][0-9]{0,8}',number) or int(number) in numbers:
                raise DocumentConflict('Подтвердите однозначные номера прежних спецификаций этого договора перед новой генерацией.')
            numbers.add(int(number))
        next_number=max(state['next_spec_number'],max(numbers,default=0)+1)
        if next_number!=state['next_spec_number']:
            conn.execute('UPDATE client_document_state SET next_spec_number=?,version=version+1 WHERE crm_client_id=?',(next_number,client_id))
            state.update(next_spec_number=next_number,version=state['version']+1)
        return state

    def reconcile_specification_sequence(self,client_id,contract_id):
        # Only explicit contract links count. No inferred reassignment or edits to legacy document rows.
        with self.db.transaction(immediate=True) as conn:
            return self._specification_sequence_state(conn,client_id,contract_id)

    def allocate_specification(self, client_id, contract_document_id, contract_version_asset_id, invoice_asset_id, operation_key, validated_payload, stored=None):
        with self.db.transaction(immediate=True) as conn:
            op=self._row(conn.execute('SELECT * FROM document_assistant_operations WHERE operation_key=?',(operation_key,)).fetchone(),'Операция не найдена.')
            if op['status']=='completed':
                row=self._row(conn.execute('SELECT * FROM documents WHERE id=? AND crm_client_id=?',(op['result_id'],client_id)).fetchone())
                if op['result_type']!='document' or row['contract_document_id']!=contract_document_id or row['contract_version_asset_id']!=contract_version_asset_id or row['invoice_asset_id']!=invoice_asset_id: raise DocumentConflict('Результат операции не соответствует запросу.')
                return row
            if op['status']!='pending': raise DocumentConflict('Результат операции неизвестен; повтор запрещён.')
            job = conn.execute('SELECT * FROM document_assistant_jobs WHERE id=?',(op['job_id'],)).fetchone()
            if op['action']!='generate_specification' or not job or job['kind']!='invoice' or job['crm_client_id']!=client_id or invoice_asset_id not in json.loads(job['input_asset_ids']) or job['status']!='confirmed':
                raise DocumentConflict('Операция не соответствует проверенному исходному счёту клиента.')
            state=self._specification_sequence_state(conn,client_id,contract_document_id)
            if (state['contract_document_id'],state['contract_version_asset_id']) != (contract_document_id,contract_version_asset_id): raise DocumentConflict('Версия договора изменилась. Повторите проверку.')
            for aid in (contract_version_asset_id,invoice_asset_id):
                if not conn.execute('SELECT 1 FROM client_document_assets WHERE id=? AND crm_client_id=?',(aid,client_id)).fetchone(): raise DocumentNotFound('Исходный файл не найден у клиента.')
            sequence=state['next_spec_number']; now=utc_now(); payload=validated_payload
            if payload.get('expected_sequence',sequence)!=sequence:raise DocumentConflict('Номер спецификации изменился. Повторите генерацию.')
            if not payload.get('output_path'): raise ValueError('Не подготовлен файл спецификации.')
            cursor=conn.execute('''INSERT INTO documents(document_type,number,client_source,crm_client_id,client_name_snapshot,document_date,output_path,
                created_by_user_id,created_at,updated_at,contract_document_id,contract_version_asset_id,invoice_asset_id,origin,spec_sequence,legal_snapshot_json)
                VALUES('specification',?,'local',?,?,?,?,?,?,?,?,?,?,'generated',?,?)''',(str(sequence),client_id,payload['client_name'],payload['document_date'],payload['output_path'],op['actor_user_id'],now,now,contract_document_id,contract_version_asset_id,invoice_asset_id,sequence,json.dumps(payload.get('legal_snapshot',{}),ensure_ascii=False)))
            did=cursor.lastrowid
            if stored is not None:
                conn.execute('''INSERT INTO client_document_assets(crm_client_id,document_id,role,original_filename,media_type,
                    byte_size,sha256,storage_key,created_by_user_id,created_at,version) VALUES(?,?,'generated',?,?,?,?,?,?,?,1)''',
                    (client_id,did,stored.original_filename,stored.media_type,stored.byte_size,stored.sha256,stored.storage_key,op['actor_user_id'],now))
            conn.execute('UPDATE client_document_state SET next_spec_number=?,version=version+1 WHERE crm_client_id=?',(sequence+1,client_id))
            conn.execute("UPDATE document_assistant_operations SET status='completed',result_type='document',result_id=?,updated_at=? WHERE operation_key=?",(str(did),now,operation_key))
            return dict(conn.execute('SELECT * FROM documents WHERE id=?',(did,)).fetchone())
