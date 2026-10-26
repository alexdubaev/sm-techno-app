"""Authenticated manager endpoints; no 1C calls or operational order mutations."""
import io
import warnings

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository, integer

MAX_AVATAR_BYTES = 5 * 1024 * 1024


def normalize_avatar(raw: bytes) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP') or source.width * source.height > 16_000_000:
                    raise ValueError('Фото должно быть PNG, JPEG или WebP, не более 16 мегапикселей.')
                source.load()
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((512, 512))
                output = io.BytesIO()
                image.save(output, format='WEBP', quality=85)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Не удалось прочитать фото. Используйте PNG, JPEG или WebP.') from exc


def create_manager_router(get_current_user, get_db):
    def no_cache(response: Response):
        response.headers['Cache-Control'] = 'no-store'

    router = APIRouter(prefix='/api/manager', tags=['manager'], dependencies=[Depends(no_cache)])

    def invoke(method, *args, **kwargs):
        try:
            return method(*args, **kwargs)
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc
        except ManagerConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    def repository():
        return ManagerRepository(get_db())

    @router.get('/managers')
    def managers(actor=Depends(get_current_user)):
        return invoke(repository().managers, actor)

    @router.get('/dashboard')
    def dashboard(month: str, managerId: int | None = None, query: str = Query('', max_length=300),
                  page: int = Query(1, ge=1, le=100000), actor=Depends(get_current_user)):
        return invoke(repository().dashboard, actor, managerId, month, query, page)

    def change(payload, actor, preview):
        manager_id = payload.get('managerId')
        if manager_id is not None:
            invoke(integer, manager_id, 'Менеджер', 2**53-1)
        return invoke(repository().mutate, actor, manager_id, payload.get('month'), payload, preview=preview)

    @router.post('/preview')
    def preview(payload: dict, actor=Depends(get_current_user)):
        return change(payload, actor, True)

    @router.post('/changes')
    def changes(payload: dict, actor=Depends(get_current_user)):
        return change(payload, actor, False)

    @router.get('/history')
    def history(month: str, managerId: int, page: int = Query(1, ge=1, le=100000), actor=Depends(get_current_user)):
        return invoke(repository().history, actor, managerId, month, page)

    @router.get('/snapshots')
    def snapshots(month: str, managerId: int, actor=Depends(get_current_user)):
        return invoke(repository().snapshots, actor, managerId, month)

    @router.get('/avatar/{manager_id}')
    def avatar(manager_id: int, actor=Depends(get_current_user)):
        image = invoke(repository().avatar, actor, manager_id)
        if image is None:
            raise HTTPException(404, 'Фото не задано.')
        return Response(image, media_type='image/webp', headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    @router.post('/avatar/{manager_id}')
    async def upload_avatar(manager_id: int, version: int = Form(...), file: UploadFile = File(...), actor=Depends(get_current_user)):
        try:
            invoke(repository()._admin, actor)
            raw = await file.read(MAX_AVATAR_BYTES + 1)
            if len(raw) > MAX_AVATAR_BYTES:
                raise HTTPException(413, 'Фото должно быть не больше 5 МБ.')
            normalized = await run_in_threadpool(invoke, normalize_avatar, raw)
            return await run_in_threadpool(invoke, repository().set_avatar, actor, manager_id, normalized, version)
        finally:
            await file.close()

    return router
