import http.client
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from stock_sync_web.assistant_deepseek import DeepSeekDocumentExtractor, MAX_OUTPUT_BYTES
from stock_sync_web.assistant_extraction import ExtractionError, ExtractionRequest


@pytest.fixture
def stub(monkeypatch):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-key')
    state = {'status': 200, 'body': b'', 'requests': []}
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            state['requests'].append((self.path, dict(self.headers), self.rfile.read(int(self.headers['Content-Length']))))
            if state.get('delay'): time.sleep(state['delay'])
            try:
                if state.get('header_trickle'):
                    for byte in b'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n':
                        self.wfile.write(bytes([byte])); self.wfile.flush(); time.sleep(state['header_trickle'])
                    return
                self.send_response(state['status']); self.end_headers()
                if state.get('trickle'):
                    for byte in state['body']:
                        self.wfile.write(bytes([byte])); self.wfile.flush(); time.sleep(state['trickle'])
                else: self.wfile.write(state['body'])
            except (BrokenPipeError, ConnectionResetError): pass
        def log_message(self, *args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    yield state, lambda timeout: http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=timeout)
    server.shutdown(); server.server_close(); thread.join()


def response(result, *, reason='stop', **message):
    return json.dumps({'choices': [{'finish_reason': reason, 'message': {'role': 'assistant', 'content': json.dumps(result), **message}}]}).encode()


def good():
    return {'payload': {'rows': [{'article': '00123', 'requested_qty': '2', 'source_row': 1}]}, 'missing_fields': [], 'warnings': []}


def test_real_http_stub_sends_inline_images_and_validates(stub, tmp_path):
    state, factory = stub; state['body'] = response(good())
    image = tmp_path/'page.png'; image.write_bytes(b'fake-png')
    result = DeepSeekDocumentExtractor(connection_factory=factory).extract(ExtractionRequest('articles', ['00123'], [image], [5]))
    path, headers, body = state['requests'][0]; payload = json.loads(body)
    assert path == '/chat/completions' and headers['Authorization'] == 'Bearer test-key'
    assert payload['response_format'] == {'type': 'json_object'} and payload['model'] == 'deepseek-flash'
    assert payload['messages'][0]['content'][1]['image_url']['url'] == 'data:image/png;base64,ZmFrZS1wbmc='
    assert result.payload['rows'][0]['article'] == '00123'
    assert result.provenance == [{'assetId': 5, 'method': 'deepseek-flash', 'reviewed': False}]


@pytest.mark.parametrize('status,code', [(401,'provider_auth'),(403,'provider_auth'),(429,'provider_rate_limit'),(302,'provider_http'),(500,'provider_http')])
def test_http_errors_are_safe_and_not_redirected(stub, status, code):
    state, factory = stub; state.update(status=status, body=b'secret document server diagnostics')
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == code and 'secret' not in str(error.value) and len(state['requests']) == 1


@pytest.mark.parametrize('body', [b'', b'{', response(good(), reason='length'), response(good(), tool_calls=[{'id':'x'}]), response({'payload': {'rows': [{'article': 123, 'requested_qty': '2', 'source_row': 1}]}, 'missing_fields': [], 'warnings': []}), response({'payload': {'rows': []}, 'warnings': []})])
def test_invalid_output_is_rejected(stub, body):
    state, factory = stub; state['body'] = body
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == 'invalid_output'


def test_timeout_and_output_limit(stub):
    state, factory = stub; state.update(delay=.2, body=response(good()))
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory, timeout=.05).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == 'runtime_timeout'
    state.update(delay=0, body=b'x' * (MAX_OUTPUT_BYTES + 1))
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == 'runtime_output_limit'


def test_both_consumers_select_deepseek_without_key(monkeypatch, tmp_path):
    from stock_sync_web.assistant_service import DocumentAssistantService
    from stock_sync_web.assistant_deepseek import DeepSeekDocumentExtractor
    from stock_sync_web import stock_valuation
    monkeypatch.setenv('DOCUMENT_ASSISTANT_PROVIDER', 'deepseek')
    monkeypatch.delenv('DEEPSEEK_API_KEY', raising=False)
    service = DocumentAssistantService(object(), repository=object(), store=object())
    assert isinstance(service.extractor, DeepSeekDocumentExtractor)
    assert isinstance(stock_valuation.create_document_extractor(codex_factory=stock_valuation.CodexDocumentExtractor), DeepSeekDocumentExtractor)


def test_large_image_is_rejected_before_network(stub, tmp_path):
    from stock_sync_web.assistant_deepseek import MAX_INPUT_BYTES
    state, factory = stub
    image = tmp_path/'large.png'
    with image.open('wb') as stream: stream.truncate(MAX_INPUT_BYTES + 1)
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory).extract(ExtractionRequest('articles', [], [image], []))
    assert error.value.code == 'input_limit' and state['requests'] == []


def test_overall_deadline_cannot_be_extended_by_trickling_response(stub):
    state, factory = stub; state.update(body=response(good()), trickle=.02)
    started = time.monotonic()
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory, timeout=.12).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == 'runtime_timeout' and time.monotonic() - started < 1


def test_overall_deadline_cannot_be_extended_by_trickling_headers(stub):
    state, factory = stub; state['header_trickle'] = .04
    started = time.monotonic()
    with pytest.raises(ExtractionError) as error:
        DeepSeekDocumentExtractor(connection_factory=factory, timeout=.12).extract(ExtractionRequest('articles', [], [], []))
    assert error.value.code == 'runtime_timeout' and time.monotonic() - started < .8
