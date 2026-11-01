"""HTTP smoke ONLY for isolated loopback candidate with synthetic credentials."""
import json
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:19030'

def request(path, token=None, payload=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, headers=headers,
        data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as response:
        return response.code, response.headers, response.read()

assert request('/api/health')[0] == 200
for path in ('/api/admin/dashboard/sales', '/api/admin/dashboard/deepseek', '/api/admin/dashboard/deepseek/balance'):
    assert request(path)[0] == 401
status, _, body = request('/api/auth/login', payload={'username':'admin', 'password':'admin-dashboard-candidate-only'})
assert status == 200
token = json.loads(body)['token']
for kind in ('week', 'month', 'quarter', 'year'):
    status, headers, body = request('/api/admin/dashboard/sales?period=' + kind + '&date=2026-11-01', token)
    assert status == 200 and headers.get('Cache-Control') == 'no-store'
    data = json.loads(body)
    assert data['totals']['salesTotal'] == 0
    assert data['period']['kind'] == kind and data['series']
status, _, body = request('/api/admin/dashboard/deepseek?period=month&date=2026-11-01', token)
assert status == 200
usage = json.loads(body)
assert usage['trackingStartedAt'] and usage['totals']['requests'] == 0
status, _, body = request('/api/admin/dashboard/deepseek/balance', token)
assert status == 200 and json.loads(body)['status'] == 'unconfigured'
assert request('/dashboard')[0] == 200
assert request('/manager')[0] == 200
print('CANDIDATE_HTTP_PASS: proxy/auth/admin-only/4periods/usage/balance/home/personal-sales')
