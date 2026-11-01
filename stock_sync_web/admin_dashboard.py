"""Company-wide read-only aggregates of the manager ledger."""
import calendar
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from stock_sync_web.manager_repository import ManagerRepository


def period_bounds(kind, anchor):
    if kind not in ('week', 'month', 'quarter', 'year'):
        raise ValueError('Неизвестный период.')
    if anchor is None:
        day = datetime.now(ZoneInfo('Europe/Moscow')).date()
    else:
        if not re.fullmatch(r'(19|20|21)\d{2}-\d{2}-\d{2}', anchor):
            raise ValueError('Некорректная дата.')
        day = date.fromisoformat(anchor)
    if kind == 'week':
        start = day - timedelta(days=day.weekday())
        end = start + timedelta(days=6)
    elif kind == 'year':
        start, end = date(day.year, 1, 1), date(day.year, 12, 31)
    else:
        month = day.month if kind == 'month' else ((day.month - 1) // 3) * 3 + 1
        last_month = month if kind == 'month' else month + 2
        start = date(day.year, month, 1)
        end = date(day.year, last_month, calendar.monthrange(day.year, last_month)[1])
    return day, start, end


def sales_overview(db, kind, anchor):
    day, start, end = period_bounds(kind, anchor)
    month = day.strftime('%Y-%m')
    repo = ManagerRepository(db)
    with repo._read() as conn:
        accounts = list(conn.execute('''SELECT a.id,a.user_id,a.display_name,u.is_active FROM manager_accounts a
            LEFT JOIN users u ON u.id=a.user_id ORDER BY a.display_name COLLATE NOCASE'''))
        rows = list(conn.execute('''SELECT manager_id,date,amount,source FROM manager_sales
            WHERE cancelled=0 AND date>=? AND date<=?''', (start.isoformat(), end.isoformat())))
        monthly = list(conn.execute('''SELECT manager_id, SUM(amount) total FROM manager_sales
            WHERE cancelled=0 AND month=? GROUP BY manager_id''', (month,)))
        plans = {r['manager_id']: r['plan'] for r in conn.execute('SELECT manager_id,plan FROM manager_periods WHERE month=?', (month,))}
    monthly_totals = {r['manager_id']: r['total'] for r in monthly}
    series_map = {}
    cursor = start
    while cursor <= end:
        key = cursor.isoformat() if kind != 'year' else cursor.strftime('%Y-%m')
        series_map.setdefault(key, {'date': key, 'amount': 0, 'count': 0})
        cursor += timedelta(days=1)
    by_manager = {}
    sources = {'manualCount': 0, 'onecCount': 0, 'odataConnected': False}
    for row in rows:
        key = row['date'] if kind != 'year' else row['date'][:7]
        series_map[key]['amount'] += row['amount']
        series_map[key]['count'] += 1
        total = by_manager.setdefault(row['manager_id'], [0, 0])
        total[0] += row['amount']; total[1] += 1
        sources['onecCount' if row['source'] == 'onec' else 'manualCount'] += 1
    managers, monthly_plans = [], []
    for a in accounts:
        amount, count = by_manager.get(a['id'], (0, 0))
        managers.append(dict(id=a['id'], userId=a['user_id'], name=a['display_name'], active=bool(a['is_active']), archived=a['user_id'] is None, salesTotal=amount, count=count))
        plan = plans.get(a['id']); fact = monthly_totals.get(a['id'], 0)
        monthly_plans.append(dict(id=a['id'], name=a['display_name'], plan=plan, salesTotal=fact,
            progress=(fact * 100 / plan if plan else None), status=('unset' if plan is None else 'no_plan' if plan == 0 else 'planned')))
    return dict(period=dict(kind=kind, start=start.isoformat(), end=end.isoformat(), anchorDate=day.isoformat()),
        totals=dict(salesTotal=sum(r['amount'] for r in rows), count=len(rows)), series=list(series_map.values()), managers=managers,
        monthlyPlans=dict(month=month, managers=monthly_plans), sources=sources)


def create_admin_dashboard_router(get_admin, get_db):
    router = APIRouter(prefix='/api/admin/dashboard')
    @router.get('/sales')
    def sales(response: Response, period: str = 'month', date: str | None = None, actor=Depends(get_admin)):
        response.headers['Cache-Control'] = 'no-store'
        try:
            return sales_overview(get_db(), period, date)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    @router.get('/deepseek')
    def usage(response: Response, period: str = 'month', date: str | None = None, actor=Depends(get_admin)):
        from stock_sync_web.deepseek_usage import overview
        response.headers['Cache-Control'] = 'no-store'
        try:
            return overview(get_db(), period, date)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    @router.get('/deepseek/balance')
    def balance(response: Response, actor=Depends(get_admin)):
        from stock_sync_web.deepseek_balance import balance as get_balance
        response.headers['Cache-Control'] = 'no-store'
        return get_balance()
    return router
