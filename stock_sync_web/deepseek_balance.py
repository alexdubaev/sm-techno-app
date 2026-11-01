"""Bounded, server-only DeepSeek account balance lookup."""
import hashlib
import http.client
import json
import os
import re
import socket
import ssl
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

_lock = threading.Lock()
_cache = None


def balance(connection_factory=None, timeout=5):
    global _cache
    key = (os.getenv('DEEPSEEK_API_KEY') or '').strip()
    checked = datetime.now(timezone.utc).isoformat()
    if not key or len(key) > 4096 or '\n' in key or '\r' in key:
        return dict(status='unconfigured', checkedAt=checked, isAvailable=None, balances=[])
    fingerprint = hashlib.sha256(key.encode()).digest()
    with _lock:
        if _cache and _cache[0] == fingerprint and time.monotonic() - _cache[1] < 60:
            return _cache[2].copy()
    result = dict(status='unavailable', checkedAt=checked, isAvailable=None, balances=[])
    conn = None; timer = None
    try:
        conn = (connection_factory or (lambda t: http.client.HTTPSConnection('api.deepseek.com', timeout=t, context=ssl.create_default_context())))(timeout)
        conn.connect()
        sock = conn.sock
        def abort():
            try: sock.shutdown(socket.SHUT_RDWR)
            except OSError: pass
        timer = threading.Timer(timeout, abort); timer.daemon = True; timer.start()
        conn.request('GET', '/user/balance', headers={'Authorization': 'Bearer ' + key, 'Accept': 'application/json'})
        response = conn.getresponse()
        if response.status != 200: raise ValueError()
        raw = response.read(65537)
        if len(raw) > 65536: raise ValueError()
        payload = json.loads(raw)
        if type(payload.get('is_available')) is not bool or not isinstance(payload.get('balance_infos'), list) or len(payload['balance_infos']) > 20: raise ValueError()
        balances = []
        for item in payload['balance_infos']:
            currency = item['currency']
            if currency not in ('CNY', 'USD'): raise ValueError()
            values = []
            for field in ('total_balance','granted_balance','topped_up_balance'):
                value = item[field]
                if not isinstance(value, str) or not re.fullmatch(r'\d{1,20}(?:\.\d{1,12})?', value): raise ValueError()
                amount = Decimal(value)
                if not amount.is_finite() or amount < 0: raise ValueError()
                values.append(value)
            balances.append(dict(currency=currency,totalBalance=values[0],grantedBalance=values[1],toppedUpBalance=values[2]))
        result = dict(status='available', checkedAt=checked, isAvailable=payload['is_available'], balances=balances)
    except (OSError, ValueError, KeyError, TypeError, InvalidOperation, http.client.HTTPException):
        pass
    finally:
        if timer: timer.cancel(); timer.join()
        if conn: conn.close()
    if result['status'] == 'available':
        with _lock: _cache = (fingerprint, time.monotonic(), result)
    return result.copy()
