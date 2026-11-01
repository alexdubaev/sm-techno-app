"""Numeric application-only DeepSeek request accounting."""
from datetime import datetime, timezone, timedelta
import threading

_lock = threading.Lock()
_failures = set()
VERSION = '2026-11-01-deepseek-usage-v1'


def migrate(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS deepseek_usage (
        id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL, model TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('success','failed')),
        prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER)''')
    conn.execute('CREATE INDEX IF NOT EXISTS deepseek_usage_occurred ON deepseek_usage(occurred_at)')


def migration_present(conn):
    found = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE name IN ('deepseek_usage','deepseek_usage_occurred')")}
    return len(found) == 2


def sink_for(db):
    def sink(model, outcome, usage):
        usage = usage if isinstance(usage, dict) else {}
        def counter(key):
            value = usage.get(key)
            return value if type(value) is int and 0 <= value <= 2**53-1 else None
        try:
            with db.transaction(immediate=True) as conn:
                conn.execute('INSERT INTO deepseek_usage(occurred_at,model,outcome,prompt_tokens,completion_tokens,total_tokens) VALUES(?,?,?,?,?,?)',
                    (datetime.now(timezone.utc).isoformat(), model, outcome, counter('prompt_tokens'), counter('completion_tokens'), counter('total_tokens')))
        except Exception:
            with _lock: _failures.add(str(db.db_path))
    return sink


def overview(db, kind, anchor):
    from stock_sync_web.admin_dashboard import period_bounds
    day, start, end = period_bounds(kind, anchor)
    # UTC+3 has no DST during supported operational history.
    start_utc = datetime.combine(start, datetime.min.time(), timezone(timedelta(hours=3))).astimezone(timezone.utc).isoformat()
    end_utc = datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone(timedelta(hours=3))).astimezone(timezone.utc).isoformat()
    with db.transaction() as conn:
        tracking = conn.execute('SELECT applied_at FROM web_schema_migrations WHERE version=?', (VERSION,)).fetchone()
        rows = list(conn.execute('SELECT * FROM deepseek_usage WHERE occurred_at>=? AND occurred_at<?', (start_utc, end_utc)))
    points = {}
    cursor = start
    while cursor <= end:
        key = cursor.isoformat() if kind != 'year' else cursor.strftime('%Y-%m')
        points.setdefault(key, dict(date=key, requests=0, totalTokens=None, unknownUsageRequests=0))
        cursor += timedelta(days=1)
    totals = dict(requests=len(rows), failedRequests=0, promptTokens=None, completionTokens=None, totalTokens=None, unknownUsageRequests=0)
    for row in rows:
        local = datetime.fromisoformat(row['occurred_at']).astimezone(timezone(timedelta(hours=3)))
        key = local.date().isoformat() if kind != 'year' else local.strftime('%Y-%m')
        point = points[key]; point['requests'] += 1
        totals['failedRequests'] += row['outcome'] != 'success'
        unknown = any(row[k] is None for k in ('prompt_tokens','completion_tokens','total_tokens'))
        totals['unknownUsageRequests'] += unknown; point['unknownUsageRequests'] += unknown
        for column, field in [('prompt_tokens','promptTokens'),('completion_tokens','completionTokens'),('total_tokens','totalTokens')]:
            if row[column] is not None: totals[field] = (totals[field] or 0) + row[column]
        if row['total_tokens'] is not None: point['totalTokens'] = (point['totalTokens'] or 0) + row['total_tokens']
    with _lock: degraded = str(db.db_path) in _failures
    return dict(period=dict(kind=kind,start=start.isoformat(),end=end.isoformat(),anchorDate=day.isoformat()), trackingStartedAt=tracking['applied_at'] if tracking else None, totals=totals, series=list(points.values()), recordingDegraded=degraded)
