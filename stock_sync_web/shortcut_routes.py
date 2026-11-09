import asyncio
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.requests import Request as StarletteRequest
from starlette.datastructures import UploadFile
from starlette.responses import StreamingResponse

from stock_sync_web import shortcut_devices as devices
from stock_sync_web.stock_valuation import PrivateRoute, Row, _authorize, build_valuation_result, extract_valuation_upload


INTAKE_HEARTBEAT_SECONDS = 10
_running_intakes: set[asyncio.Task] = set()


async def _native_intake_result(operation):
    # The operation owns the form/files until extraction finishes, even if the
    # phone disconnects. Cancelling a running extraction thread would close its
    # workspace while the extractor still uses it.
    task = asyncio.create_task(operation)
    _running_intakes.add(task)

    def finished(completed):
        _running_intakes.discard(completed)
        if not completed.cancelled():
            completed.exception()  # Consume abandoned errors without logging private data.

    task.add_done_callback(finished)
    done, _ = await asyncio.wait({task}, timeout=INTAKE_HEARTBEAT_SECONDS)
    if done:
        return task.result()

    async def body():
        while not task.done():
            # Legal JSON whitespace keeps the native client's idle timer alive.
            # Padding also avoids small-buffer delays in HTTP intermediaries.
            yield b' ' * 4096 + b'\n'
            await asyncio.wait({task}, timeout=INTAKE_HEARTBEAT_SECONDS)
        try:
            result = task.result()
        except HTTPException as exc:
            result = {'detail': exc.detail}
        except Exception:
            result = {'detail': 'Не удалось выполнить запрос. Повторите попытку.'}
        yield json.dumps(result, ensure_ascii=False).encode('utf-8')

    # Once headers are sent, late errors use the existing detail envelope that
    # the installed shortcut checks before reading rows. Never emit partial rows.
    return StreamingResponse(body(), media_type='application/json', headers={
        'Cache-Control': 'no-store', 'Content-Encoding': 'identity', 'X-Accel-Buffering': 'no',
    })


class CreateDevice(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    label: str = Field(min_length=1, max_length=100)


class Resolve(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rows: list[Row] = Field(min_length=1, max_length=1000)
    format: Literal['valuation', 'offer']


async def bounded_body(request, maximum):
    length = request.headers.get('content-length')
    if length:
        try: size = int(length)
        except ValueError: raise HTTPException(400, 'Проверьте размер запроса.') from None
        if size < 0 or size > maximum: raise HTTPException(413, 'Превышен допустимый размер запроса.')
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > maximum: raise HTTPException(413, 'Превышен допустимый размер запроса.')
    return bytes(data)


def create_shortcut_router(current_user, get_service):
    router = APIRouter(route_class=PrivateRoute)

    @router.get('/api/stock/shortcut-devices')
    def listing(actor=Depends(current_user)):
        _authorize(actor)
        return {'devices': devices.list_devices(get_service().db, actor['id'])}

    @router.post('/api/stock/shortcut-devices')
    def create(body: CreateDevice, actor=Depends(current_user)):
        _authorize(actor)
        return devices.create(get_service().db, actor['id'], body.label)

    @router.delete('/api/stock/shortcut-devices/{device_id}')
    def revoke(device_id: int, actor=Depends(current_user)):
        _authorize(actor); devices.revoke(get_service().db, actor['id'], device_id)
        return {'ok': True}

    @router.post('/api/shortcuts/stock/intake')
    async def intake(request: Request):
        devices.authenticate(get_service().db, request.headers.get('authorization'), 'intake')
        if not request.headers.get('content-type', '').lower().startswith('multipart/form-data;'):
            raise HTTPException(400, 'Нужен файл.')
        raw = await bounded_body(request, 25*1024*1024 + 65536)
        sent = False
        async def receive():
            nonlocal sent
            if sent: return {'type': 'http.request', 'body': b'', 'more_body': False}
            sent = True
            return {'type': 'http.request', 'body': raw, 'more_body': False}
        clone = StarletteRequest(request.scope, receive)
        async def recognize():
            async with clone.form(max_files=1, max_fields=0) as form:
                file = form.get('file')
                if len(form) != 1 or not isinstance(file, UploadFile): raise HTTPException(400, 'Нужен один файл.')
                from stock_sync_web.deepseek_usage import sink_for
                result = await extract_valuation_upload(file, usage_sink=sink_for(get_service().db))
            result['warnings'] = [str(w)[:1000] for w in result['warnings'][:20]]
            preview = '\n'.join(f"{r['sourceRow']}. {r['article']}" + (f" — {r['requestedQty']}" if r['requestedQty'] else '') for r in result['rows'])
            if len(preview) > 100_000: raise HTTPException(413, 'Список слишком велик для просмотра на телефоне.')
            return {**result, 'previewText': preview}

        return await _native_intake_result(recognize())

    @router.post('/api/shortcuts/stock/resolve')
    async def resolve(request: Request):
        devices.authenticate(get_service().db, request.headers.get('authorization'), 'resolve')
        if not request.headers.get('content-type', '').lower().startswith('application/json'):
            raise HTTPException(400, 'Нужен JSON.')
        raw = await bounded_body(request, 1024*1024)
        try: body = Resolve.model_validate_json(raw)
        except (ValidationError, ValueError): raise HTTPException(422, 'Проверьте данные запроса.') from None
        try: result = build_valuation_result(get_service(), body.rows)
        except ValueError: raise HTTPException(400, 'Проверьте артикулы и количество.') from None
        workbook = result['workbook'] if body.format == 'valuation' else result['offerWorkbook']
        if workbook is None: raise HTTPException(422, 'Нет позиций с остатком и положительной ценой.')
        if len(workbook['base64']) > 16 * 1024 * 1024: raise HTTPException(413, 'Получившийся файл слишком велик.')
        return {'workbook': workbook, 'warnings': result['offerExport']['warnings'] if body.format == 'offer' else []}
    return router
