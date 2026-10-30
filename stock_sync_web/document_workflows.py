from fastapi import APIRouter, Depends
from stock_sync_web.assistant_service import DocumentAssistantService


def create_document_workflows_router(current_user, get_service) -> APIRouter:
    router = APIRouter()

    @router.post('/api/document-assistant/jobs/{job_id}/client-match')
    def match(job_id: str, payload: dict, actor: dict = Depends(current_user)):
        try:
            return DocumentAssistantService(get_service()).preview_client_match(actor, job_id, payload.get('version'), payload.get('fields'))
        except Exception as exc:
            from stock_sync_api import _document_error
            _document_error(exc)

    @router.post('/api/document-assistant/jobs/{job_id}/bind-client')
    def bind(job_id: str, payload: dict, actor: dict = Depends(current_user)):
        try:
            return DocumentAssistantService(get_service()).bind_client(actor, job_id, payload.get('version'), payload.get('clientId'), payload.get('operationKey'))
        except Exception as exc:
            from stock_sync_api import _document_error
            _document_error(exc)

    return router
