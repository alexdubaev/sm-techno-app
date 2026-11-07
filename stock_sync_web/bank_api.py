"""Bank import API. Global bank facts/files stay administrator-only."""
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from stock_sync_web.bank_parser import MAX_FILE_BYTES
from stock_sync_web.bank_repository import BankRepository
from stock_sync_web.manager_repository import ManagerConflict, ManagerNotFound


class _BankRequestTooLarge(HTTPException):
    def __init__(self):
        super().__init__(413, 'Выписка должна быть не больше 10 МБ.', headers={'Cache-Control':'no-store'})


class BankUploadLimitMiddleware:
    """Bound multipart bytes before the framework spools an uploaded file."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (scope['type'] != 'http' or scope.get('method') != 'POST'
                or scope.get('path', '').rstrip('/') != '/api/bank-statements/uploads'):
            return await self.app(scope, receive, send)
        maximum = MAX_FILE_BYTES + 64 * 1024  # Bounded multipart/header overhead.
        response = JSONResponse({'detail':'Выписка должна быть не больше 10 МБ.'}, status_code=413,
                                headers={'Cache-Control':'no-store'})
        headers = dict(scope.get('headers', ()))
        length = headers.get(b'content-length')
        if length:
            try:
                if int(length) > maximum:
                    return await response(scope, receive, send)
            except ValueError:
                return await JSONResponse({'detail':'Некорректный размер запроса.'},status_code=400)(scope,receive,send)
        consumed = 0
        async def bounded_receive():
            nonlocal consumed
            message = await receive()
            if message['type'] == 'http.request':
                consumed += len(message.get('body', b''))
                if consumed > maximum:
                    raise _BankRequestTooLarge()
            return message
        try:
            await self.app(scope, bounded_receive, send)
        except _BankRequestTooLarge:
            await response(scope, receive, send)


def create_bank_router(get_current_user, get_db, get_storage_root):
    def no_cache(response: Response):
        response.headers['Cache-Control'] = 'no-store'

    router = APIRouter(prefix='/api/bank-statements', tags=['bank-statements'], dependencies=[Depends(no_cache)])

    def repository():
        return BankRepository(get_db(), get_storage_root())

    def invoke(method, *args, **kwargs):
        try:
            return method(*args, **kwargs)
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc
        except ManagerNotFound as exc:
            raise HTTPException(404, str(exc)) from exc
        except ManagerConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    def administrator(actor=Depends(get_current_user)):
        return invoke(repository()._admin, actor)

    @router.get('/accounts')
    def accounts(actor=Depends(administrator)):
        return invoke(repository().assignments.accounts, actor)

    @router.post('/accounts')
    def confirm_account(payload: dict, actor=Depends(administrator)):
        return invoke(repository().assignments.confirm_account, actor, payload.get('organizationId'),
                      payload.get('ownerInn'), payload.get('account'), payload.get('bik'), payload.get('reason'))

    @router.get('/uploads')
    def uploads(actor=Depends(administrator)):
        return invoke(repository().uploads, actor)

    @router.post('/uploads')
    async def upload(accountId: int = Form(...), file: UploadFile = File(...), actor=Depends(administrator)):
        try:
            raw = await file.read(MAX_FILE_BYTES + 1)
            if len(raw) > MAX_FILE_BYTES:
                raise HTTPException(413, 'Выписка должна быть не больше 10 МБ.')
            return await run_in_threadpool(invoke, repository().upload, actor, accountId, file.filename, raw)
        finally:
            await file.close()

    @router.get('/uploads/{upload_id}')
    def upload_detail(upload_id: int, actor=Depends(administrator)):
        return invoke(repository().get_upload, actor, upload_id)

    @router.post('/uploads/{upload_id}/refresh')
    def refresh_upload(upload_id: int, actor=Depends(administrator)):
        return invoke(repository().refresh_upload, actor, upload_id)

    @router.get('/uploads/{upload_id}/file')
    def download(upload_id: int, actor=Depends(administrator)):
        raw, filename = invoke(repository().download, actor, upload_id)
        return Response(raw, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': "attachment; filename=bank-statement.xlsx; filename*=UTF-8''" + quote(filename, safe=''),
                     'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    @router.patch('/operations/{operation_id}')
    def update_operation(operation_id: int, payload: dict, actor=Depends(administrator)):
        return invoke(repository().update_operation, actor, operation_id, payload)

    @router.post('/preview')
    def preview(payload: dict, actor=Depends(administrator)):
        return invoke(repository().preview, actor, payload.get('items'))

    @router.post('/operations/{operation_id}/company-cancel')
    def cancel_company(operation_id: int, payload: dict, actor=Depends(administrator)):
        return invoke(repository().cancel_company_sale, actor, operation_id, payload)

    @router.post('/commit')
    def commit(payload: dict, actor=Depends(administrator)):
        return invoke(repository().commit, actor, payload.get('items'), payload.get('idempotencyKey'))

    @router.get('/clients/search')
    def search_clients(query: str = Query(..., min_length=1, max_length=200), actor=Depends(administrator)):
        return invoke(repository().search_clients, actor, query)

    @router.get('/clients/{client_id}')
    def client(client_id: int, actor=Depends(get_current_user)):
        return invoke(repository().client, actor, client_id)

    @router.put('/clients/{client_id}/assignment')
    def assign(client_id: int, payload: dict, actor=Depends(administrator)):
        return invoke(repository().set_assignment, actor, client_id, payload.get('managerId'),
                      payload.get('startDate'), payload.get('reason'), payload.get('version'))

    return router
