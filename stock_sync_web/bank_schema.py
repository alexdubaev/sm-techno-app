"""Additive bank-import schema, registered by WebDatabase, never a second ledger."""
from __future__ import annotations

import re
import sqlite3


MIGRATION = '2026-11-07-bank-statements-v1'

BASE_SCHEMA = (
    '''CREATE TABLE IF NOT EXISTS bank_import_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        organization_name TEXT NOT NULL, owner_inn TEXT NOT NULL,
        account TEXT NOT NULL, bik TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'RUB',
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        version INTEGER NOT NULL DEFAULT 1, created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL, reason TEXT NOT NULL,
        UNIQUE(organization_id,account))''',
    '''CREATE TABLE IF NOT EXISTS bank_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES bank_import_accounts(id),
        sha256 TEXT NOT NULL, original_filename TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
        byte_size INTEGER NOT NULL CHECK(byte_size>=0), parser_version TEXT NOT NULL,
        metadata_json TEXT NOT NULL, errors_json TEXT NOT NULL DEFAULT '[]',
        reconciliation_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'parsed', created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(account_id,sha256))''',
    '''CREATE TABLE IF NOT EXISTS bank_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES bank_import_accounts(id),
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        our_account TEXT NOT NULL, currency TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('credit','debit')),
        date TEXT NOT NULL, document_number TEXT NOT NULL,
        payer_name TEXT NOT NULL, inn TEXT NOT NULL DEFAULT '', kpp TEXT NOT NULL DEFAULT '',
        account TEXT NOT NULL DEFAULT '', bik TEXT NOT NULL DEFAULT '', bank_name TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0),
        debit INTEGER NOT NULL DEFAULT 0 CHECK(typeof(debit)='integer' AND debit>=0),
        credit INTEGER NOT NULL DEFAULT 0 CHECK(typeof(credit)='integer' AND credit>=0),
        purpose TEXT NOT NULL, debtor_code TEXT NOT NULL DEFAULT '', document_type TEXT NOT NULL DEFAULT '',
        bank_id TEXT, strict_key TEXT NOT NULL, probable_key TEXT NOT NULL,
        invoice_references_json TEXT NOT NULL DEFAULT '[]', normalized_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        CHECK((direction='credit' AND amount=credit AND debit=0) OR
              (direction='debit' AND amount=debit AND credit=0)))''',
    'CREATE INDEX IF NOT EXISTS bank_operations_strict ON bank_operations(account_id,strict_key)',
    'CREATE INDEX IF NOT EXISTS bank_operations_probable ON bank_operations(account_id,probable_key)',
    '''CREATE UNIQUE INDEX IF NOT EXISTS bank_operations_bank_id
        ON bank_operations(account_id,bank_id) WHERE bank_id IS NOT NULL''',
    '''CREATE TRIGGER IF NOT EXISTS bank_operations_immutable BEFORE UPDATE ON bank_operations
        BEGIN SELECT RAISE(ABORT,'Bank operation is immutable'); END''',
    '''CREATE TABLE IF NOT EXISTS bank_source_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id INTEGER NOT NULL REFERENCES bank_uploads(id),
        sheet TEXT NOT NULL, row_number INTEGER NOT NULL,
        raw_json TEXT NOT NULL, normalized_json TEXT NOT NULL,
        errors_json TEXT NOT NULL DEFAULT '[]', warnings_json TEXT NOT NULL DEFAULT '[]',
        operation_id INTEGER REFERENCES bank_operations(id),
        UNIQUE(upload_id,sheet,row_number))''',
    'CREATE INDEX IF NOT EXISTS bank_source_rows_operation ON bank_source_rows(operation_id,upload_id)',
    '''CREATE TABLE IF NOT EXISTS bank_decisions (
        operation_id INTEGER PRIMARY KEY REFERENCES bank_operations(id),
        version INTEGER NOT NULL DEFAULT 1, classification TEXT NOT NULL DEFAULT 'review',
        explanation TEXT NOT NULL DEFAULT '', client_id INTEGER REFERENCES crm_clients(id),
        manager_id INTEGER REFERENCES manager_accounts(id), rate INTEGER CHECK(rate BETWEEN 0 AND 10000),
        status TEXT NOT NULL DEFAULT 'review', warnings_json TEXT NOT NULL DEFAULT '[]',
        manual_json TEXT NOT NULL DEFAULT '{}', decision_json TEXT NOT NULL DEFAULT '{}',
        fingerprint TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
        updated_by INTEGER, updated_at TEXT NOT NULL)''',
    'CREATE INDEX IF NOT EXISTS bank_decisions_client ON bank_decisions(client_id,status)',
    '''CREATE TABLE IF NOT EXISTS bank_decision_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id INTEGER NOT NULL REFERENCES bank_operations(id),
        actor_id INTEGER NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS bank_commits (
        idempotency_key TEXT PRIMARY KEY, actor_id INTEGER NOT NULL,
        request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS crm_sales_assignment_versions (
        client_id INTEGER PRIMARY KEY REFERENCES crm_clients(id), version INTEGER NOT NULL DEFAULT 0)''',
    '''CREATE TABLE IF NOT EXISTS crm_sales_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL REFERENCES crm_clients(id),
        manager_id INTEGER REFERENCES manager_accounts(id), start_date TEXT NOT NULL,
        end_date TEXT, created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
        updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL, reason TEXT NOT NULL,
        CHECK(end_date IS NULL OR end_date>start_date), UNIQUE(client_id,start_date))''',
    'CREATE INDEX IF NOT EXISTS crm_sales_assignments_lookup ON crm_sales_assignments(client_id,start_date,end_date)',
    '''CREATE TRIGGER IF NOT EXISTS crm_sales_assignments_no_overlap_insert
        BEFORE INSERT ON crm_sales_assignments
        WHEN EXISTS(SELECT 1 FROM crm_sales_assignments a WHERE a.client_id=NEW.client_id
          AND a.start_date<COALESCE(NEW.end_date,'9999-12-31')
          AND NEW.start_date<COALESCE(a.end_date,'9999-12-31'))
        BEGIN SELECT RAISE(ABORT,'Sales assignment intervals overlap'); END''',
    '''CREATE TRIGGER IF NOT EXISTS crm_sales_assignments_no_overlap_update
        BEFORE UPDATE ON crm_sales_assignments
        WHEN EXISTS(SELECT 1 FROM crm_sales_assignments a WHERE a.client_id=NEW.client_id
          AND a.id<>NEW.id AND a.start_date<COALESCE(NEW.end_date,'9999-12-31')
          AND NEW.start_date<COALESCE(a.end_date,'9999-12-31'))
        BEGIN SELECT RAISE(ABORT,'Sales assignment intervals overlap'); END''',
    '''CREATE TABLE IF NOT EXISTS crm_sales_assignment_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL REFERENCES crm_clients(id),
        version INTEGER NOT NULL, actor_id INTEGER NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL)''',
)

LINK_SCHEMA = (
    '''CREATE TABLE IF NOT EXISTS bank_sale_links (
        operation_id INTEGER PRIMARY KEY REFERENCES bank_operations(id),
        sale_id INTEGER NOT NULL UNIQUE REFERENCES manager_sales(id),
        client_id INTEGER NOT NULL REFERENCES crm_clients(id),
        manager_id INTEGER NOT NULL REFERENCES manager_accounts(id),
        amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0),
        kind TEXT NOT NULL CHECK(kind IN ('created','existing')),
        linked_by INTEGER NOT NULL, linked_at TEXT NOT NULL, reason TEXT NOT NULL)''',
    'CREATE INDEX IF NOT EXISTS bank_sale_links_client ON bank_sale_links(client_id,operation_id)',
)


def _upgrade_sales(conn: sqlite3.Connection) -> None:
    columns = {r['name'] for r in conn.execute('PRAGMA table_info(manager_sales)')}
    if 'crm_client_id' not in columns:
        conn.execute('ALTER TABLE manager_sales ADD COLUMN crm_client_id INTEGER REFERENCES crm_clients(id)')
    if 'bank_operation_id' not in columns:
        conn.execute('ALTER TABLE manager_sales ADD COLUMN bank_operation_id INTEGER REFERENCES bank_operations(id)')
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='manager_sales'").fetchone()[0]
    if "'bank_statement'" not in sql:
        # Copy the actual DDL/columns rather than silently discarding an earlier additive migration.
        replaced, count = re.subn(r"CHECK\s*\(\s*source\s+IN\s*\(\s*'manual'\s*,\s*'onec'\s*\)\s*\)",
                                  "CHECK(source IN ('manual', 'onec', 'bank_statement'))", sql, flags=re.IGNORECASE)
        if count != 1:
            raise RuntimeError('Unrecognized manager_sales source constraint; migration aborted safely.')
        create_sql = re.sub(r'^(CREATE\s+TABLE\s+)(?:"manager_sales"|manager_sales)',
                            r'\1manager_sales_bank_new', replaced, count=1, flags=re.IGNORECASE)
        indexes = [r[0] for r in conn.execute("SELECT sql FROM sqlite_master WHERE tbl_name='manager_sales' AND type IN ('index','trigger') AND sql IS NOT NULL")]
        sequence_row = conn.execute("SELECT seq FROM sqlite_sequence WHERE name='manager_sales'").fetchone()
        sequence = sequence_row[0] if sequence_row else 0
        conn.execute(create_sql)
        names = [r['name'] for r in conn.execute('PRAGMA table_info(manager_sales)')]
        quoted = ','.join('"' + name.replace('"', '""') + '"' for name in names)
        conn.execute(f'INSERT INTO manager_sales_bank_new({quoted}) SELECT {quoted} FROM manager_sales')
        conn.execute('DROP TABLE manager_sales')
        conn.execute('ALTER TABLE manager_sales_bank_new RENAME TO manager_sales')
        for statement in indexes:
            conn.execute(statement)
        conn.execute("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='manager_sales'", (sequence,))
    conn.execute('''CREATE UNIQUE INDEX IF NOT EXISTS manager_sales_bank_operation
                    ON manager_sales(bank_operation_id) WHERE bank_operation_id IS NOT NULL''')
    conn.execute('CREATE INDEX IF NOT EXISTS manager_sales_crm_client ON manager_sales(crm_client_id,date)')


def migrate(conn: sqlite3.Connection) -> None:
    for statement in BASE_SCHEMA:
        conn.execute(statement)
    _upgrade_sales(conn)
    for statement in LINK_SCHEMA:
        conn.execute(statement)


def migration_present(conn: sqlite3.Connection) -> bool:
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE name LIKE 'bank_%' OR name LIKE 'crm_sales_%' OR name LIKE 'manager_sales_%'")}
    expected = {'bank_import_accounts', 'bank_uploads', 'bank_source_rows', 'bank_operations', 'bank_decisions',
                'bank_decision_audit', 'bank_commits', 'bank_sale_links', 'crm_sales_assignment_versions',
                'crm_sales_assignments', 'crm_sales_assignment_audit', 'crm_sales_assignments_no_overlap_insert',
                'crm_sales_assignments_no_overlap_update', 'bank_operations_immutable', 'manager_sales_bank_operation',
                'manager_sales_crm_client', 'bank_operations_strict', 'bank_operations_probable',
                'bank_operations_bank_id', 'bank_source_rows_operation', 'bank_decisions_client',
                'crm_sales_assignments_lookup', 'bank_sale_links_client'}
    columns = {r['name'] for r in conn.execute('PRAGMA table_info(manager_sales)')}
    row = conn.execute("SELECT sql FROM sqlite_master WHERE name='manager_sales'").fetchone()
    return expected <= names and {'crm_client_id', 'bank_operation_id'} <= columns and bool(row and "'bank_statement'" in row[0])
