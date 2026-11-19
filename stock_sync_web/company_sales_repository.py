"""Read-only company sales projection shared by the dashboard and sale details."""
from __future__ import annotations

import json

from stock_sync_web.manager_repository import ManagerNotFound

PAGE_SIZE = 25
MAX_PAGE = 1_000_000


def _validate(start_date, end_date, query, page):
    if not isinstance(start_date, str) or not isinstance(end_date, str) or start_date > end_date:
        raise ValueError('Некорректный период.')
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError('Слишком длинный поисковый запрос.')
    if isinstance(page, bool) or not isinstance(page, int) or not 1 <= page <= MAX_PAGE:
        raise ValueError('Некорректный номер страницы.')


def _select_sql():
    return '''
        SELECT * FROM (
          SELECT CASE WHEN l.operation_id IS NOT NULL OR s.bank_operation_id IS NOT NULL THEN 'bank' ELSE 'manager' END AS kind,
            COALESCE(l.operation_id,s.bank_operation_id,s.id) AS id,s.date,s.client AS client_name,s.amount,s.source,
            COALESCE(l.client_id,s.crm_client_id) AS client_id,s.manager_id,m.display_name AS manager_name,s.rate,
            s.invoice_number,s.invoice_date,o.purpose,o.document_number,
            CASE WHEN c.is_inactive=1 OR c.crm_archived_at IS NOT NULL THEN 1 ELSE 0 END AS is_inactive,
            CASE WHEN l.operation_id IS NOT NULL OR s.bank_operation_id IS NOT NULL THEN COALESCE(o.inn,'') ELSE '' END AS search_inn,
            0 AS cancelled
          FROM manager_sales s
          LEFT JOIN bank_sale_links l ON l.sale_id=s.id
          LEFT JOIN bank_operations o ON o.id=COALESCE(l.operation_id,s.bank_operation_id)
          LEFT JOIN crm_clients c ON c.id=COALESCE(l.client_id,s.crm_client_id)
          LEFT JOIN manager_accounts m ON m.id=s.manager_id
          WHERE s.cancelled=0 AND s.date BETWEEN ? AND ?
          UNION ALL
          SELECT 'bank',o.id,o.date,c.client_name,o.amount,'bank_statement',c.client_id,NULL,NULL,NULL,
            json_extract(c.decision_json,'$.invoiceNumber'),json_extract(c.decision_json,'$.invoiceDate'),
            o.purpose,o.document_number,
            CASE WHEN cl.is_inactive=1 OR cl.crm_archived_at IS NOT NULL THEN 1 ELSE 0 END,o.inn,0
          FROM bank_company_sales c JOIN bank_operations o ON o.id=c.operation_id
          LEFT JOIN crm_clients cl ON cl.id=c.client_id
          WHERE c.cancelled_at IS NULL AND o.date BETWEEN ? AND ?
            AND NOT EXISTS(SELECT 1 FROM bank_sale_links link WHERE link.operation_id=c.operation_id)
            AND NOT EXISTS(SELECT 1 FROM manager_sales ms WHERE ms.bank_operation_id=c.operation_id AND ms.cancelled=0)
        ) sales
    '''


def _row_dto(row):
    issue = None
    can_assign = True
    if row['client_id'] is None:
        issue = 'Выберите карточку клиента CRM, чтобы закрепить его за менеджером этой продажи.'
    elif row['is_inactive']:
        can_assign = False
        issue = 'Клиент архивирован.'
    return dict(kind=row['kind'], id=row['id'], date=row['date'], clientName=row['client_name'],
        amount=row['amount'], source=row['source'], crmClientId=row['client_id'], managerId=row['manager_id'],
        managerName=row['manager_name'], rate=row['rate'], invoiceNumber=row['invoice_number'],
        invoiceDate=row['invoice_date'], canAssignManager=bool(can_assign), purpose=row['purpose'],
        documentNumber=row['document_number'], issue=issue)


def list_company_sales(conn, startDate, endDate, query='', page=1, unassigned=False):
    _validate(startDate, endDate, query, page)
    conn.create_function('unicode_casefold_contains', 2,
        lambda haystack, needle: int(needle.casefold() in (haystack or '').casefold()), deterministic=True)
    base = _select_sql()
    params = [startDate, endDate, startDate, endDate]
    where = []
    if unassigned:
        where.append("sales.manager_id IS NULL AND sales.kind='bank'")
    if query:
        where.append('''(unicode_casefold_contains(sales.client_name,?) OR
            unicode_casefold_contains(COALESCE(sales.document_number,''),?) OR
            unicode_casefold_contains(COALESCE(sales.invoice_number,''),?) OR
            unicode_casefold_contains(COALESCE(sales.search_inn,''),?))''')
        params.extend([query] * 4)
    filtered = base + (' WHERE ' + ' AND '.join(where) if where else '')
    total = conn.execute('SELECT COUNT(*) FROM (' + filtered + ')', params).fetchone()[0]
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    effective_page = min(page, max(pages, 1))
    rows = conn.execute(filtered + ' ORDER BY sales.date DESC,sales.id DESC,sales.kind LIMIT ? OFFSET ?',
        (*params, PAGE_SIZE, (effective_page - 1) * PAGE_SIZE)).fetchall()
    return dict(items=[{k: v for k, v in _row_dto(row).items() if k not in ('purpose','documentNumber','issue')}
                       for row in rows], page=effective_page, pages=pages, total=total)


def get_company_sale(conn, kind, id):
    if kind not in ('bank', 'manager') or isinstance(id, bool) or not isinstance(id, int) or id < 1:
        raise ManagerNotFound('Продажа не найдена.')
    conn.create_function('unicode_casefold_contains', 2, lambda haystack, needle: int(needle.casefold() in (haystack or '').casefold()), deterministic=True)
    sql = _select_sql() + ' WHERE sales.kind=? AND sales.id=?'
    row = conn.execute(sql, ['0001-01-01','9999-12-31','0001-01-01','9999-12-31',kind,id]).fetchone()
    if not row:
        raise ManagerNotFound('Продажа не найдена.')
    dto = _row_dto(row)
    return {key: value for key, value in dto.items() if key in (
        'kind','id','date','clientName','amount','source','crmClientId','managerId','managerName','rate',
        'invoiceNumber','invoiceDate','canAssignManager','purpose','documentNumber','issue')}
