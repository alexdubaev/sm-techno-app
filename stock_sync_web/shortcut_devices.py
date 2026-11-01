from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
import time

from fastapi import HTTPException


def now():
    return datetime.now(timezone.utc)


def stamp(value):
    return value.isoformat(timespec='seconds').replace('+00:00', 'Z')


def metadata(row):
    return {'id': row['id'], 'label': row['label'], 'createdAt': row['created_at'],
            'lastUsedAt': row['last_used_at'], 'idleExpiresAt': row['idle_expires_at'],
            'absoluteExpiresAt': row['absolute_expires_at'], 'revokedAt': row['revoked_at']}


def create(db, user_id, label):
    code = secrets.token_urlsafe(32)
    current = now()
    with db.transaction() as conn:
        conn.execute('BEGIN IMMEDIATE')
        owner = conn.execute('SELECT role, is_active FROM users WHERE id=?', (user_id,)).fetchone()
        if not owner or not owner['is_active'] or owner['role'] not in ('user', 'manager', 'admin'):
            raise HTTPException(403, 'Доступ запрещён.')
        recent = conn.execute('SELECT count(*) FROM app_shortcut_devices WHERE user_id=? AND created_at>?', (user_id, stamp(current-timedelta(minutes=1)))).fetchone()[0]
        if recent >= 5:
            raise HTTPException(429, 'Слишком много подключений. Повторите позже.', headers={'Retry-After': '60'})
        active = conn.execute('SELECT count(*) FROM app_shortcut_devices WHERE user_id=? AND revoked_at IS NULL AND idle_expires_at>? AND absolute_expires_at>?', (user_id, stamp(current), stamp(current))).fetchone()[0]
        if active >= 20:
            raise HTTPException(400, 'Достигнут предел подключений.')
        cursor = conn.execute('INSERT INTO app_shortcut_devices(user_id,label,token_hash,created_at,idle_expires_at,absolute_expires_at) VALUES (?,?,?,?,?,?)',
            (user_id,label,hashlib.sha256(code.encode()).hexdigest(),stamp(current),stamp(current+timedelta(days=180)),stamp(current+timedelta(days=365))))
        row = conn.execute('SELECT * FROM app_shortcut_devices WHERE id=?', (cursor.lastrowid,)).fetchone()
    return {'credential': code, 'device': metadata(row)}


def list_devices(db, user_id):
    with db.connect() as conn:
        return [metadata(row) for row in conn.execute('SELECT * FROM app_shortcut_devices WHERE user_id=? ORDER BY id DESC', (user_id,))]


def revoke(db, user_id, device_id):
    with db.transaction() as conn:
        changed = conn.execute('UPDATE app_shortcut_devices SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=?', (stamp(now()),device_id,user_id)).rowcount
        if not changed:
            raise HTTPException(404, 'Подключение не найдено.')


def authenticate(db, authorization, operation):
    if not authorization or not authorization.startswith('Shortcut '):
        raise HTTPException(401, 'Подключение недействительно.')
    code = authorization[9:]
    if len(code) != 43 or not code.isascii():
        raise HTTPException(401, 'Подключение недействительно.')
    digest = hashlib.sha256(code.encode()).hexdigest()
    current = now(); current_stamp = stamp(current)
    epoch = time.time()
    limit = 6 if operation == 'intake' else 30
    with db.transaction() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT d.*, u.role, u.is_active FROM app_shortcut_devices d JOIN users u ON u.id=d.user_id WHERE d.token_hash=?', (digest,)).fetchone()
        if not row or row['revoked_at'] or row['idle_expires_at'] <= current_stamp or row['absolute_expires_at'] <= current_stamp or not row['is_active']:
            raise HTTPException(401, 'Подключение недействительно.')
        if row['role'] not in ('user','manager','admin'):
            raise HTTPException(403, 'Доступ запрещён.')
        column = operation + '_times'
        times = [value for value in json.loads(row[column]) if value > epoch - 60]
        if len(times) >= limit:
            raise HTTPException(429, 'Слишком много запросов. Повторите позже.', headers={'Retry-After': str(max(1, int(times[0] + 60 - epoch) + 1))})
        times.append(epoch)
        conn.execute(f'UPDATE app_shortcut_devices SET {column}=?, last_used_at=?, idle_expires_at=? WHERE id=?',
            (json.dumps(times),current_stamp,min(stamp(current+timedelta(days=180)),row['absolute_expires_at']),row['id']))
