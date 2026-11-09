"""Native-client idle timeout and private upload lifecycle over real HTTP."""
import json
import socket
import threading
import time
from types import SimpleNamespace

import httpx2 as httpx
import pytest
import uvicorn

from .conftest import INITIAL_ADMIN_PASSWORD
from stock_sync_web.assistant_extraction import ExtractionError, ExtractionResult


@pytest.fixture
def slow_intake(auth_api, monkeypatch, tmp_path):
    from stock_sync_web import shortcut_routes, stock_valuation

    root = tmp_path / 'recognition-workspaces'
    root.mkdir(mode=0o700)
    state = SimpleNamespace(fail=False, finished=threading.Event(), workspace=None)

    class Extractor:
        def extract(self, request, *, temp_root=None):
            state.workspace = temp_root
            try:
                time.sleep(.6)
                if state.fail:
                    raise ExtractionError('invalid_output', 'PRIVATE_PROVIDER_DIAGNOSTIC')
                return ExtractionResult('articles', {'rows': [
                    {'article': f'{i:08d}', 'requested_qty': '2', 'source_row': i + 1}
                    for i in range(1000)
                ]})
            finally:
                state.finished.set()

    monkeypatch.setattr(stock_valuation, 'CodexDocumentExtractor', Extractor)
    monkeypatch.setattr(stock_valuation, '_workspace_root', lambda: root)
    monkeypatch.setattr(shortcut_routes, 'INTAKE_HEARTBEAT_SECONDS', .05, raising=False)
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    device = auth_api.client.post('/api/stock/shortcut-devices', headers=headers,
                                  json={'label': 'Synthetic idle client'}).json()
    state.headers = {'Authorization': 'Shortcut ' + device['credential']}
    state.root = root
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        state.url = f'http://127.0.0.1:{listener.getsockname()[1]}/api/shortcuts/stock/intake'
        server = uvicorn.Server(uvicorn.Config(auth_api.api.app, lifespan='off', log_level='critical', access_log=False))
        thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
        thread.start()
        deadline = time.monotonic() + 5
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(.01)
        assert server.started
        try:
            yield state
        finally:
            server.should_exit = True
            thread.join(5)
            assert not thread.is_alive()


def test_slow_intake_keeps_idle_client_alive_and_returns_all_rows(slow_intake):
    state = slow_intake
    with httpx.Client(trust_env=False, timeout=httpx.Timeout(5, read=.35)) as client:
        with client.stream('POST', state.url, headers=state.headers,
                           files={'file': ('synthetic.txt', b'00000001', 'text/plain')}) as response:
            assert response.status_code == 200
            assert response.headers['cache-control'] == 'no-store'
            assert response.headers['content-encoding'] == 'identity'
            chunks = response.iter_raw()
            first = next(chunks)
            assert not first.strip() and not state.finished.is_set()
            result = json.loads(first + b''.join(chunks))
    assert len(result['rows']) == 1000
    assert result['rows'][0] == {'article': '00000000', 'requestedQty': '2', 'sourceRow': 1}
    assert result['rows'][-1]['article'] == '00000999'
    assert '1000. 00000999' in result['previewText']
    assert not list(state.root.iterdir())


def test_slow_failure_returns_existing_detail_and_never_partial_rows(slow_intake, caplog):
    state = slow_intake
    state.fail = True
    with httpx.Client(trust_env=False, timeout=httpx.Timeout(5, read=.35)) as client:
        response = client.post(state.url, headers=state.headers,
                               files={'file': ('synthetic.txt', b'00000001', 'text/plain')})
    assert response.status_code == 200  # Headers already sent; installed shortcut checks detail.
    result = response.json()
    assert set(result) == {'detail'} and result['detail']
    assert 'PRIVATE_PROVIDER_DIAGNOSTIC' not in response.text + caplog.text
    assert not list(state.root.iterdir())


def test_native_disconnect_does_not_remove_live_extractor_workspace(slow_intake):
    state = slow_intake
    with httpx.Client(trust_env=False, timeout=httpx.Timeout(5, read=.35)) as client:
        with client.stream('POST', state.url, headers=state.headers,
                           files={'file': ('synthetic.txt', b'00000001', 'text/plain')}) as response:
            assert not next(response.iter_raw()).strip()
            assert state.workspace.is_dir() and not state.finished.is_set()
        assert state.finished.wait(2)
        deadline = time.monotonic() + 2
        while list(state.root.iterdir()) and time.monotonic() < deadline:
            time.sleep(.01)
        assert not list(state.root.iterdir())


def test_codex_keeps_its_runtime_budget_separate_from_source_preparation(auth_api, monkeypatch):
    from stock_sync_web import stock_valuation

    class Extractor:
        def extract(self, request, *, temp_root=None):
            return ExtractionResult('articles', {'rows': [
                {'article': '00001234', 'requested_qty': None, 'source_row': 1},
            ]})

    ticks = iter((0, 16))
    monkeypatch.setenv('DOCUMENT_ASSISTANT_PROVIDER', 'codex')
    monkeypatch.setenv('DOCUMENT_ASSISTANT_TIMEOUT_SECONDS', '15')
    monkeypatch.setattr(stock_valuation, 'CodexDocumentExtractor', Extractor)
    monkeypatch.setattr(stock_valuation, 'time', SimpleNamespace(time=time.time, monotonic=lambda: next(ticks)))
    headers = auth_api.bearer(auth_api.login('admin', INITIAL_ADMIN_PASSWORD))
    response = auth_api.client.post('/api/stock/valuation/intake', headers=headers,
                                    files={'file': ('synthetic.txt', b'00001234', 'text/plain')})
    assert response.status_code == 200
    assert response.json()['rows'][0]['article'] == '00001234'
