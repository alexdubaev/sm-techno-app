import { requestJsonWithInit } from '@/lib/api';
import type { DocumentAssistantJob, DocumentAssistantPayload } from '@/lib/types';

export type ClientMatch = {status: 'matched'|'ambiguous'|'not_found'; candidates: {clientId:number;documentName:string;inn:string;kpp:string;contract:{documentId:number;number:string;versionId:number|null}|null}[]};
export function matchDocumentClient(id:string, version:number, fields:DocumentAssistantPayload) {
  return requestJsonWithInit<ClientMatch>(`/api/document-assistant/jobs/${id}/client-match`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,fields})},'Не удалось найти клиента.');
}
export function bindDocumentClient(id:string, version:number, clientId:number, operationKey:string) {
  return requestJsonWithInit<DocumentAssistantJob>(`/api/document-assistant/jobs/${id}/bind-client`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,clientId,operationKey})},'Не удалось привязать клиента.');
}
