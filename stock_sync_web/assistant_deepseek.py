"""Bounded backend-only DeepSeek adapter for untrusted document data."""
import base64
import http.client
import json
import os
import socket
import ssl
import time

from stock_sync_web.assistant_extraction import (
    KINDS, ExtractionError, ExtractionResult, _validate_shape,
    extraction_prompt, extraction_schema, validate_payload,
)

MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_OUTPUT_BYTES = 2 * 1024 * 1024


class DeepSeekDocumentExtractor:
    def __init__(self, *, connection_factory=None, timeout=None):
        self.timeout = timeout or min(300, max(15, int(os.getenv('DOCUMENT_ASSISTANT_TIMEOUT_SECONDS') or '120')))
        self._connection_factory = connection_factory or self._connection

    @staticmethod
    def _connection(timeout):
        return http.client.HTTPSConnection('api.deepseek.com', timeout=timeout, context=ssl.create_default_context())

    def extract(self, request, *, temp_root=None):
        if request.kind not in KINDS:
            raise ValueError('Неизвестный тип распознавания.')
        key = (os.getenv('DEEPSEEK_API_KEY') or '').strip()
        model = (os.getenv('DOCUMENT_ASSISTANT_DEEPSEEK_MODEL') or 'deepseek-flash').strip()
        if not key or not model or len(key) > 4096 or any(c in key for c in '\r\n') or len(model) > 200:
            raise ExtractionError('provider_configuration', 'Проверьте настройки DeepSeek на сервере.')
        if len(request.texts) > 100 or sum(map(len, request.texts)) > 200000 or len(request.image_paths) > 100:
            raise ExtractionError('input_limit', 'Превышен предел материалов задания.')
        started = time.monotonic()
        def remaining():
            value = self.timeout - (time.monotonic() - started)
            if value <= 0:
                raise ExtractionError('runtime_timeout', 'DeepSeek не ответил за допустимое время.')
            return value
        try:
            content = [{'type': 'text', 'text': extraction_prompt(request) + '\nJSON schema: ' + json.dumps(extraction_schema(request.kind), ensure_ascii=False)}]
            size = sum(len(text.encode('utf-8')) for text in request.texts)
            for path in request.image_paths:
                remaining()
                with path.open('rb') as image:
                    data = image.read(MAX_INPUT_BYTES - size + 1)
                size += len(data)
                if size > MAX_INPUT_BYTES:
                    raise ExtractionError('input_limit', 'Превышен предел материалов задания.')
                content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')}})
            body = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': content}], 'response_format': {'type': 'json_object'}, 'stream': False}, ensure_ascii=False).encode('utf-8')
            if len(body) > 28 * 1024 * 1024:
                raise ExtractionError('input_limit', 'Превышен предел материалов задания.')
            connection = self._connection_factory(remaining())
            try:
                connection.request('POST', '/chat/completions', body=body, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
                sock = connection.sock
                sock.settimeout(remaining())
                response = connection.getresponse()
                if response.status != 200:
                    if response.status in (401, 403): code, message = 'provider_auth', 'DeepSeek отклонил авторизацию. Проверьте настройки сервера.'
                    elif response.status == 429: code, message = 'provider_rate_limit', 'Достигнут лимит DeepSeek. Повторите распознавание позже.'
                    else: code, message = 'provider_http', 'DeepSeek временно недоступен. Повторите распознавание позже.'
                    raise ExtractionError(code, message)
                data = bytearray()
                while True:
                    remaining_timeout = remaining()
                    sock.settimeout(remaining_timeout)
                    chunk = response.read1(min(65536, MAX_OUTPUT_BYTES + 1 - len(data)))
                    if not chunk: break
                    data.extend(chunk)
                    if len(data) > MAX_OUTPUT_BYTES:
                        raise ExtractionError('runtime_output_limit', 'Ответ DeepSeek превысил допустимый размер.')
            finally:
                connection.close()
            envelope = json.loads(data)
            choices = envelope['choices']
            if not isinstance(choices, list) or len(choices) != 1: raise ValueError()
            choice = choices[0]
            message = choice['message']
            if choice.get('finish_reason') != 'stop' or message.get('tool_calls') or message.get('function_call') or message.get('role') != 'assistant': raise ValueError()
            result = json.loads(message['content'])
            _validate_shape(result, extraction_schema(request.kind), 'result')
            validate_payload(request.kind, result['payload'])
            if request.kind == 'contract':
                for field in ('document_id', 'asset_id', 'client_id', 'source_sha256'): result['payload'][field] = None
            provenance = [{'assetId': aid, 'method': model, 'reviewed': False} for aid in request.source_asset_ids]
            return ExtractionResult(request.kind, result['payload'], provenance, result['missing_fields'], result['warnings'])
        except ExtractionError:
            raise
        except (TimeoutError, socket.timeout):
            raise ExtractionError('runtime_timeout', 'DeepSeek не ответил за допустимое время.') from None
        except (OSError, http.client.HTTPException):
            raise ExtractionError('provider_connection', 'Не удалось подключиться к DeepSeek. Повторите распознавание позже.') from None
        except Exception:
            raise ExtractionError('invalid_output', 'DeepSeek не вернул корректную структуру. Повторите распознавание.') from None
