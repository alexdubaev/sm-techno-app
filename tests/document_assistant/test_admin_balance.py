import json

from stock_sync_web import deepseek_balance


class Socket:
    def shutdown(self, how): pass
class Response:
    status = 200
    def __init__(self, body): self.body = body
    def read(self, n): return self.body[:n]
class Connection:
    def __init__(self, body): self.sock = Socket(); self.body = body; self.path = None
    def connect(self): pass
    def request(self, method, path, headers): self.path = path
    def getresponse(self): return Response(self.body)
    def close(self): pass


def test_balance_validates_and_never_returns_secret(monkeypatch):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'synthetic-test-key')
    monkeypatch.setattr(deepseek_balance, '_cache', None)
    conn = Connection(json.dumps({'is_available': True, 'balance_infos':[{'currency':'USD','total_balance':'0.00','granted_balance':'0','topped_up_balance':'0'}]}).encode())
    result = deepseek_balance.balance(lambda timeout: conn)
    assert conn.path == '/user/balance'
    assert result['status'] == 'available' and result['balances'][0]['totalBalance'] == '0.00'
    assert 'synthetic-test-key' not in str(result)
    monkeypatch.setattr(deepseek_balance, '_cache', None)
    conn.body = b'{"is_available":true,"balance_infos":[{"currency":"USD","total_balance":"NaN"}]}'
    assert deepseek_balance.balance(lambda timeout: conn)['status'] == 'unavailable'
    conn.body = b'x' * 65537
    assert deepseek_balance.balance(lambda timeout: conn)['status'] == 'unavailable'


def test_balance_rejects_non_object_and_honors_whole_request_deadline(monkeypatch):
    import threading
    import time

    monkeypatch.setenv('DEEPSEEK_API_KEY', 'synthetic-deadline-key')
    monkeypatch.setattr(deepseek_balance, '_cache', None)
    assert deepseek_balance.balance(lambda timeout: Connection(b'[]'))['status'] == 'unavailable'

    interrupted = threading.Event()
    class SlowConnection(Connection):
        def connect(self):
            time.sleep(0.3)
            self.sock = type('InterruptibleSocket', (), {'shutdown': lambda self, how: interrupted.set()})()
        def getresponse(self):
            assert interrupted.wait(1), 'response was not interrupted at deadline'
            raise OSError('synthetic slow response')

    started = time.monotonic()
    assert deepseek_balance.balance(lambda timeout: SlowConnection(b''), timeout=0.4)['status'] == 'unavailable'
    assert time.monotonic() - started < 0.6
