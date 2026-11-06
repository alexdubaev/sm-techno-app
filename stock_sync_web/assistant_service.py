"""Document-only coordinator. It never invokes the private CRM detail serializer."""
from __future__ import annotations

import dataclasses
from datetime import date
from datetime import datetime, timezone
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
import tempfile
import threading
import uuid

from stock_sync_web.assistant_repository import AssistantRepository, DocumentConflict, DocumentNotFound, DocumentPermissionError
from stock_sync_web.assistant_storage import LocalPrivateDocumentStore, UploadLimits
from stock_sync_web.vps_integrity import storage_operation_lock

_extraction_slots=threading.BoundedSemaphore(2)


def _entrepreneur_name(name):
    """«ИП Петров Пётр Петрович» or «Индивидуальный предприниматель Петров Пётр Петрович» → «Петров Пётр Петрович»."""
    import re
    return re.sub(r'^\s*(?:ип|индивидуальный предприниматель)\s+','',' '.join(str(name or '').split()),flags=re.I).strip() or None


def require_document_reader(actor):
    # The existing application's `user` role is its manager role.
    if not actor or not actor.get('id') or actor.get('role') not in {'user','manager','admin'} or not bool(actor.get('is_active',True)):
        raise DocumentPermissionError('Документы доступны только менеджерам и администраторам.')


def require_document_admin(actor):
    require_document_reader(actor)
    if actor.get('role')!='admin': raise DocumentPermissionError('Удалять документы и вложения может только администратор.')


# DOCX is reconciled cell by cell with its goods table; a PDF or a photo is printed from the manager-reviewed lines.
# Spreadsheets and text files are not invoice sources: they would skip the table reconciliation.
INVOICE_FORMATS={'.docx','.pdf','.png','.jpg','.jpeg','.webp','.tif','.tiff','.heic','.heif'}


def _require_invoice_format(filename):
    if Path(filename or '').suffix.lower() not in INVOICE_FORMATS:
        raise ValueError('Счёт принимается в DOCX, PDF или фото.')


def _digits(value):
    return ''.join(ch for ch in str(value or '') if ch.isdigit())


def serialize_asset(row):
    return {
        'id':row['id'],'clientId':row['crm_client_id'],'documentId':row['document_id'],'role':row['role'],
        'originalFilename':row['original_filename'],'mediaType':row['media_type'],'byteSize':row['byte_size'],
        'sha256':row['sha256'],'createdByUserId':row['created_by_user_id'],'createdByName':row.get('created_by_name') or '',
        'createdAt':row['created_at'],'version':row['version'],
    }


def serialize_document(row,assets=()):
    try: missing=json.loads(row.get('missing_fields') or '[]')
    except (TypeError,ValueError): missing=[]
    return {
        'id':row['id'],'documentType':row['document_type'],'number':row['number'],'clientId':row['crm_client_id'],
        'clientName':row['client_name_snapshot'],'documentDate':row['document_date'],'status':row['status'],
        'origin':row.get('origin') or 'legacy','version':row.get('version',1),
        'contractId':row.get('contract_document_id'),'contractVersionId':row.get('contract_version_asset_id'),
        'invoiceAssetId':row.get('invoice_asset_id'),'specSequence':row.get('spec_sequence'),
        'createdAt':row['created_at'],'updatedAt':row['updated_at'],
        'createdByUserId':row['created_by_user_id'],'createdByName':row.get('created_by_name') or '',
        'missingFields':missing if isinstance(missing,list) else [],
        'assets':[serialize_asset(a) for a in assets],
    }


class DocumentAssistantService:
    def __init__(self, service, repository=None, store=None, extractor=None, source_reader=None, limits=None):
        self.service=service
        self.repository=repository or AssistantRepository(service.db)
        self.store=store or LocalPrivateDocumentStore(service.document_storage_dir/'client_assets',service._storage_operation_root())
        self.limits=limits or UploadLimits()
        from stock_sync_web.assistant_extraction import create_document_extractor, DocumentSourceReader
        from stock_sync_web.deepseek_usage import sink_for
        self.extractor=extractor or create_document_extractor(usage_sink=sink_for(service.db) if hasattr(service, "db") else None)
        self.source_reader=source_reader or DocumentSourceReader(self.limits)

    def intake(self,actor,kind,file):
        from stock_sync_web.assistant_extraction import KINDS
        require_document_reader(actor)
        if kind not in KINDS: raise ValueError('Выберите тип распознавания.')
        if kind=='invoice': _require_invoice_format(file.filename)
        staged=self.store.stage_upload(file.file,file.filename or '',file.content_type or '',self.limits)
        key=self.store.new_key(); published=False; metadata_committed=False
        try:
            with storage_operation_lock(self.service._storage_operation_root()):
                stored=self.store.publish(staged,key); published=True
                row=self.repository.create_asset(None,'source_invoice' if kind=='invoice' else 'requisites' if kind=='requisites' else 'attachment',stored,int(actor['id']))
                metadata_committed=True
            return serialize_asset(row)
        except Exception:
            if published and not metadata_committed: self.store.delete(key)
            raise
        finally: staged.path.unlink(missing_ok=True)

    def start_extraction(self,actor,kind,client_id,asset_ids):
        from stock_sync_web.assistant_extraction import KINDS
        require_document_reader(actor)
        if not isinstance(kind,str) or kind not in KINDS or type(asset_ids) is not list or not 1<=len(asset_ids)<=10 or any(type(a) is not int or a<1 for a in asset_ids) or len(set(asset_ids))!=len(asset_ids):
            raise ValueError('Выберите от 1 до 10 исходных файлов задания.')
        if client_id is not None:
            if type(client_id) is not int or client_id<1: raise ValueError('Некорректный клиент.')
            self.repository.get_client_display(client_id)
        for aid in asset_ids:
            asset=self.repository.get_asset(aid)
            if asset['crm_client_id']!=client_id: raise DocumentNotFound('Исходный файл не найден у клиента.')
            self.read_asset(actor,aid)
            if kind=='invoice': _require_invoice_format(asset['original_filename'])
        return self.serialize_job(self.repository.create_job(int(actor['id']),kind,client_id,asset_ids))

    @staticmethod
    def serialize_job(row):
        result=row.get('result')
        if row['kind']=='requisites' and row['status']=='review' and result:
            from stock_sync_web.assistant_requisites import complete_requisites_review
            result=complete_requisites_review(result)
        return {'id':row['id'],'kind':row['kind'],'clientId':row['crm_client_id'],'assetIds':row['input_asset_ids'],
            'status':row['status'],'version':row['version'],'result':result,
            'missingFields':(result or {}).get('missing_fields',[]),'warnings':(result or {}).get('warnings',[]),
            'error':{'code':row['error_code'],'message':row['error_text']} if row['error_code'] else None,
            'createdAt':row['created_at'],'updatedAt':row['updated_at']}

    def get_extraction(self,actor,job_id):
        require_document_reader(actor)
        row=self.repository.get_job(job_id)
        if row['crm_client_id'] is None and row['actor_user_id']!=int(actor['id']):
            raise DocumentPermissionError('Задание доступно только его автору до привязки к клиенту.')
        # A process interruption is visible after its bounded execution deadline; never silently retry running jobs.
        if row['status']=='running':
            updated=datetime.fromisoformat(row['updated_at'].replace('Z','+00:00'))
            if updated.tzinfo is None: updated=updated.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc)-updated).total_seconds()>self.extractor.timeout+180:
                try: row=self.repository.transition_job(job_id,row['version'],'failed',error={'code':'runtime_interrupted','message':'Распознавание было прервано. Создайте новое задание из сохранённого источника.'})
                except DocumentConflict: row=self.repository.get_job(job_id)
        return self.serialize_job(row)

    def list_extractions(self,actor,client_id=None):
        require_document_reader(actor)
        if client_id is not None: self.repository.get_client_display(client_id)
        return [self.get_extraction(actor,row['id']) for row in self.repository.list_jobs(int(actor['id']),client_id)]

    def run_extraction(self,job_id):
        if not _extraction_slots.acquire(blocking=False): return
        try: self._run_extraction(job_id)
        finally: _extraction_slots.release()

    def _run_extraction(self,job_id):
        from stock_sync_web.assistant_extraction import ExtractionError, ExtractionRequest
        row=self.repository.get_job(job_id)
        try: row=self.repository.transition_job(job_id,row['version'],'running')
        except DocumentConflict: return  # another request/worker already claimed this persisted job
        try:
            actor={'id':row['actor_user_id'],'role':'manager','is_active':True}
            with tempfile.TemporaryDirectory(prefix='sm-techno-inputs-') as directory:
                workspace=Path(directory); texts=[]; images=[]
                for aid in row['input_asset_ids']:
                    content,asset=self.read_asset(actor,aid)
                    source=workspace/(str(aid)+Path(asset['originalFilename']).suffix.lower()); source.write_bytes(content)
                    part_texts,part_images=self.source_reader.read(source,workspace)
                    texts.extend(f'Источник #{aid}:\n{text}' for text in part_texts)
                    if part_images: texts.append(f'Источник #{aid}: изображения страниц в приложениях с {len(images)+1} по {len(images)+len(part_images)}.')
                    images.extend(part_images)
                result=self.extractor.extract(ExtractionRequest(row['kind'],texts,images,row['input_asset_ids']))
            # Even injected adapters must pass the same untrusted-output validation.
            from stock_sync_web.assistant_extraction import validate_payload
            validate_payload(row['kind'],result.payload,partial=True)
            if row['kind']=='invoice' and not result.payload.get('currency') and any('руб' in str(text).casefold() for text in texts):
                # 1С invoices state amounts in рублях without a separate currency field; that is not a missing fact.
                result.payload['currency']='RUB'
                result=dataclasses.replace(result,missing_fields=[field for field in result.missing_fields if field.rsplit('.',1)[-1]!='currency'])
            if row['kind']=='contract' and len(row['input_asset_ids'])==1:
                source=self.repository.get_asset(row['input_asset_ids'][0])
                result.payload.update(document_id=source['document_id'],asset_id=source['id'],client_id=source['crm_client_id'],source_sha256=source['sha256'])
            self.repository.transition_job(job_id,row['version'],'review',result=result.as_dict())
        except Exception as exc:
            error={'code':exc.code,'message':exc.public_message} if isinstance(exc,ExtractionError) else {'code':'extraction_failed','message':'Не удалось распознать файл. Исходник сохранён; проверьте формат или повторите распознавание.'}
            try: self.repository.transition_job(job_id,row['version'],'failed',error=error)
            except DocumentConflict: pass

    def confirm_extraction(self,actor,job_id,expected_version,fields,operation_key,action='review'):
        from stock_sync_web.assistant_extraction import validate_payload
        job=self.get_extraction(actor,job_id)
        if action in {'create_client','generate_contract'}:
            return self.confirm_requisites(actor,job,expected_version,fields,operation_key,action)
        if action!='review': raise ValueError('Выберите доступное действие подтверждения результата.')
        if type(expected_version) is not int or expected_version<1 or type(fields) is not dict: raise ValueError('Укажите версию и исправленные поля задания.')
        validate_payload(job['kind'],fields,partial=True)
        if job['kind']=='requisites':
            from stock_sync_web.assistant_requisites import complete_requisites_submission
            fields=complete_requisites_submission(fields,job['result'] or {})
        article_warnings=[]
        if job['kind']=='articles':
            grouped={};has_duplicates=False
            conflicts=[]
            for row in fields.get('rows',[]):
                key=self.service.db._normalize_stock_sku(row['article'])
                quantity=Decimal(row['requested_qty']) if row.get('requested_qty') not in (None,'') else None
                if key in grouped and grouped[key][0]!=quantity:
                    conflicts.append((grouped[key][1],row['source_row']))
                else:
                    if key in grouped:has_duplicates=True
                    else:grouped[key]=(quantity,row['source_row'])
            if conflicts:
                pairs=', '.join(f'{first} и {second}' for first,second in conflicts)
                raise ValueError(f'Артикул повторяется с разным количеством в строках {pairs}. Исправьте запрос в этой проверке перед подтверждением.')
            if has_duplicates:
                article_warnings.append('Повторные одинаковые артикулы объединяются в одну позицию КП.')
        if job['kind']=='contract':
            for key in ('document_id','asset_id','client_id','source_sha256'): fields[key]=(job['result'] or {}).get('payload',{}).get(key)
        result=dict(job['result'] or {})
        result.setdefault('extracted_payload',result.get('payload',{}))
        result['payload']=fields
        if article_warnings:
            result['warnings']=list(dict.fromkeys([*result.get('warnings',[]),*article_warnings]))
        result['review']={'actorUserId':int(actor['id']),'sourceVersion':expected_version,
            'changes':{key:value for key,value in fields.items() if value!=result['extracted_payload'].get(key)}}
        result['provenance']=[{**item,'reviewed':True,'reviewedByUserId':int(actor['id'])} for item in result.get('provenance',[])]
        required=['document_name','inn'] if job['kind']=='requisites' else []
        missing_required=[key for key in required if not fields.get(key)]
        if missing_required: raise ValueError('Заполните обязательные поля: '+', '.join(missing_required))
        result['missing_fields']=[key for key in (job['result'] or {}).get('missing_fields',[]) if not fields.get(key)]
        row=self.repository.confirm_review(job_id,int(actor['id']),expected_version,result,operation_key)
        return {'job':self.serialize_job(row),'resultType':'job','resultId':job_id,'clientId':row['crm_client_id']}

    def preview_client_match(self, actor, job_id, version, fields):
        from stock_sync_web.assistant_extraction import validate_payload
        require_document_reader(actor)
        raw=self.repository.get_job(job_id)
        if raw['actor_user_id']!=int(actor['id']): raise DocumentPermissionError('Задание доступно только автору.')
        job=self.serialize_job(raw)
        if job['clientId'] is not None or job['kind'] not in {'requisites','invoice'} or job['status'] not in {'review','confirmed'} or type(version) is not int or version!=job['version']:
            raise DocumentConflict('Обновите актуальное непривязанное задание.')
        if type(fields) is not dict: raise ValueError('Проверьте поля документа.')
        validate_payload(job['kind'],fields,partial=True)
        inn=str(fields.get('inn' if job['kind']=='requisites' else 'buyer_inn') or '').strip()
        kpp=str(fields.get('kpp' if job['kind']=='requisites' else 'buyer_kpp') or '').strip()
        if not inn: return {'status':'not_found','candidates':[]}
        candidates=self.repository.preview_document_candidates(inn,kpp)
        return {'status':'matched' if len(candidates)==1 else 'ambiguous' if candidates else 'not_found','candidates':candidates}

    def bind_client(self, actor, job_id, version, client_id, operation_key):
        require_document_reader(actor)
        if type(version) is not int or type(client_id) is not int or client_id<1: raise ValueError('Проверьте клиента и версию задания.')
        return self.serialize_job(self.repository.bind_document_job(job_id,int(actor['id']),client_id,version,operation_key))

    def confirm_requisites(self,actor,job,expected_version,fields,operation_key,action):
        from stock_sync_web.assistant_extraction import validate_payload
        if job['kind']!='requisites': raise ValueError('Для этого действия подтвердите реквизиты клиента.')
        if type(expected_version) is not int or expected_version<1 or type(fields) is not dict:
            raise ValueError('Укажите версию и исправленные реквизиты.')
        allowed_controls=('legal_type','is_buyer','is_supplier','contract_number','contract_date')
        if action=='create_client': allowed_controls+=('is_inactive','bank_name_or_bik','email_note','phone_note','notes')
        controls={key:fields[key] for key in allowed_controls if key in fields}
        legal={key:value for key,value in fields.items() if key not in controls}
        validate_payload('requisites',legal,partial=True)
        from stock_sync_web.assistant_requisites import complete_requisites_submission
        legal=complete_requisites_submission(legal,job['result'] or {})
        for key in ('is_buyer','is_supplier','is_inactive'):
            if key in controls and type(controls[key]) is not bool: raise ValueError('Проверьте роль контрагента.')
        if 'legal_type' in controls and (type(controls['legal_type']) is not str or controls['legal_type'] not in {'legal_entity','individual_entrepreneur'}):
            raise ValueError('Выберите вид контрагента: юридическое лицо или ИП.')
        for key in ('contract_number','contract_date'):
            if key in controls and type(controls[key]) is not str: raise ValueError('Проверьте номер и дату договора.')
        for key in ('bank_name_or_bik','email_note','phone_note','notes'):
            if key in controls and (type(controls[key]) is not str or len(controls[key])>5000):
                raise ValueError('Проверьте дополнительные поля карточки клиента (до 5000 символов).')
        card=self.service._normalize_client_card_payload({**legal,**controls,
            'legal_type':controls.get('legal_type') or ('individual_entrepreneur' if len(str(legal.get('inn') or ''))==12 else 'legal_entity')})
        legal.update({key:card[key] for key in ('document_name','full_name','inn','kpp')})
        number=controls.get('contract_number'); document_date=controls.get('contract_date')
        if action=='generate_contract':
            if type(number) is not str or not number.strip() or len(number.strip())>100:
                raise ValueError('Укажите подтверждённый номер договора (до 100 символов).')
            try: document_date=date.fromisoformat(document_date).isoformat()
            except (ValueError,TypeError): raise ValueError('Укажите дату договора в формате YYYY-MM-DD.') from None
            number=number.strip()
        result=dict(job['result'] or {})
        result.setdefault('extracted_payload',result.get('payload',{}))
        result['payload']=legal
        result['review']={'actorUserId':int(actor['id']),'sourceVersion':expected_version,
            'changes':{key:value for key,value in legal.items() if value!=result['extracted_payload'].get(key)}}
        result['provenance']=[{**item,'reviewed':True,'reviewedByUserId':int(actor['id'])} for item in result.get('provenance',[])]
        result['missing_fields']=[key for key in result.get('missing_fields',[]) if not legal.get(key)]
        # Filesystem lock is also cross-process. The DB claim survives a process dying while a POST is in flight.
        with storage_operation_lock(self.service._storage_operation_root()):
            existing_id,_=self.repository.match_document_identity(card)
            if job['clientId'] is not None:
                self._validate_document_client_identity(job['clientId'],card)
                if existing_id is not None and existing_id!=job['clientId']: raise DocumentConflict('Реквизиты относятся к другой карточке клиента.')
            target_id=job['clientId'] or existing_id
            if action=='generate_contract' and target_id:
                state=self.repository.get_client_document_state(target_id)
                if state['contract_document_id']:
                    canonical=self.repository.get_document(state['contract_document_id'],target_id)
                    if (canonical['number'],canonical['document_date'])!=(number,document_date):
                        raise DocumentConflict('У клиента уже есть договор с другим номером или датой. Новая версия сохраняет его номер и дату.')
            row,receipt,claimed=self.repository.claim_requisites_action(job['id'],int(actor['id']),expected_version,result,operation_key,action,
                {'fields':fields,'action':action})
            if not claimed: return {'job':self.serialize_job(row),**{k:v for k,v in receipt.items() if k!='request'}}
            try:
                client_id,sync=self._resolve_reviewed_client(actor,row,card)
                row=self.repository.get_job(job['id'])
                if row['crm_client_id'] is None:
                    row=self.repository.bind_reviewed_job(job['id'],int(actor['id']),client_id,row['version'])
                receipt={'resultType':'client','resultId':client_id,'clientId':client_id,'syncStatus':sync['status']}
                if action=='generate_contract':
                    document=self._generate_reviewed_contract(actor,client_id,legal,number,document_date)
                    receipt.update(resultType='document',resultId=document['id'])
                row=self.repository.complete_requisites_action(job['id'],operation_key,receipt)
                return {'job':self.serialize_job(row),**receipt}
            except Exception:
                self.repository.mark_operation_unknown(operation_key)
                raise

    def _validate_document_client_identity(self,client_id,card,check_kpp=True):
        # Only immutable identity is consulted; no private contact/activity serializer is exposed.
        # Specifications identify the buyer by INN only: a branch KPP may differ between invoice, contract and card.
        row=self.service.db.get_crm_client(client_id)
        if not row: raise DocumentNotFound('Клиент не найден.')
        if row.get('crm_archived_at'): raise DocumentConflict('Клиент находится в архиве.')
        inn=str(row.get('inn') or '').strip(); kpp=str(row.get('kpp') or '').strip()
        if row.get('linked_counterparty_id'):
            remote=self.repository.get_counterparty_identity(row['linked_counterparty_id'])
            if remote:
                inn=inn or str(remote.get('inn') or '').strip(); kpp=kpp or str(remote.get('kpp') or '').strip()
        if not check_kpp:
            if inn and inn!=card['inn']: raise DocumentConflict(f"ИНН покупателя ({card['inn']}) не совпадает с ИНН клиента ({inn}). Выберите правильную карточку.")
            return
        if inn and inn!=card['inn'] or card['legal_type']=='legal_entity' and kpp and kpp!=card['kpp']:
            raise DocumentConflict('ИНН/КПП реквизитов не совпадают с клиентом. Выберите правильную карточку.')

    def _resolve_reviewed_client(self,actor,job,card):
        from stock_sync_desktop.onec_api import OneCIdentityConflictError
        if job['crm_client_id'] is not None:
            return job['crm_client_id'],{'status':'existing'}
        client_id,cached=self.repository.match_document_identity(card)
        if client_id is not None: return client_id,{'status':'existing'}
        if cached: return self.repository.document_client_for_counterparty(cached),{'status':'existing'}
        # Same credential/rights and exact remote lookup as the existing /clients flow.
        # Failure here is handled by create_client, which retains a retryable local card.
        try:
            remote=self.service._find_counterparty_by_identity(self.service.build_user_client(user_id=int(actor['id'])),card,strict_identity=True)
        except OneCIdentityConflictError as exc:
            raise DocumentConflict(str(exc)) from exc
        except Exception:
            remote=None
        if remote:
            counterparty_id=self.service._upsert_synced_counterparty(remote,card)
            return self.repository.document_client_for_counterparty(self.repository.get_counterparty_identity(counterparty_id)),{'status':'existing'}
        key=self.repository.claim_client_identity(card,int(actor['id']),job['id'])
        def created(client_id):
            self.repository.record_identity_outcome(key,client_id,'pending')
            self.repository.bind_reviewed_job(job['id'],int(actor['id']),client_id,self.repository.get_job(job['id'])['version'])
        try:
            client,sync=self.service.create_client(actor_user_id=int(actor['id']),payload=card,on_local_created=created,strict_identity=True)
        except Exception:
            self.repository.mark_operation_unknown(key)
            raise
        state='completed' if sync['status']=='synced' else 'failed' if sync.get('outcome')=='not_sent' else 'unknown'
        self.repository.record_identity_outcome(key,int(client['crm_client_id']),state)
        return int(client['crm_client_id']),sync

    def _generate_reviewed_contract(self,actor,client_id,legal,number,document_date):
        from stock_sync_web.documents import build_document_context,find_missing_client_fields,generate_document_docx
        from starlette.datastructures import UploadFile
        state=self.repository.get_client_document_state(client_id)
        canonical=self.repository.get_document(state['contract_document_id'],client_id) if state['contract_document_id'] else None
        if canonical and (canonical['number'],canonical['document_date'])!=(number,document_date):
            raise DocumentConflict('Новая версия сохраняет номер и дату действующего договора.')
        context=build_document_context(client=legal,document_number=number,document_date=document_date)
        missing=find_missing_client_fields(context,self.service._required_document_fields('contract'))
        if len(legal['inn'])==12: missing=[field for field in missing if field!='kpp']
        template=self.service.document_template_paths.get('contract')
        if not template or not template.is_file(): raise ValueError('Шаблон договора не найден.')
        filename=self.service._build_document_filename(document_type='contract',client_name=legal['document_name'],document_number=number)
        with tempfile.TemporaryDirectory(prefix='sm-techno-contract-') as directory:
            output=Path(directory)/'contract.docx'
            generate_document_docx(template_path=template,output_path=output,context=context)
            if canonical:
                with output.open('rb') as content:
                    self.upload_version(actor,client_id,canonical['id'],'contract_version',UploadFile(content,filename=filename),canonical['version'],
                        legal_snapshot=context['client'],missing_fields=missing)
                return self.repository.get_document(canonical['id'],client_id)
            with output.open('rb') as content: staged=self.store.stage_upload(content,filename,'',self.limits)
            key=self.store.new_key(); published=False
            try:
                stored=self.store.publish(staged,key); published=True
                return self.repository.save_generated_contract(client_id,stored,int(actor['id']),number,document_date,
                    self.service._store_path(self.store.path_for_key(key)),context['client'],missing,state['version'])
            except Exception:
                if published: self.store.delete(key)
                raise
            finally: staged.path.unlink(missing_ok=True)

    def _read_specification_contract(self,actor,client_id,state):
        from stock_sync_web.assistant_extraction import ExtractionRequest,validate_payload
        from stock_sync_web.documents import format_document_date,format_person_short_name,generated_contract_fields_match,position_nominative
        if not state['contract_document_id']:
            raise DocumentConflict('Сначала сохраните договор клиента.')
        document=self.repository.get_document(state['contract_document_id'],client_id)
        if not state['contract_version_asset_id']:
            raise DocumentConflict(f"Файл договора № {document['number']} от {format_document_date(document['document_date'])} не найден или не читается, "
                'поэтому спецификацию к нему создать нельзя. Попросите администратора удалить эту запись договора в разделе «Загрузить готовый» '
                'и загрузите подписанный договор с теми же номером и датой.')
        content,asset=self.read_asset(actor,state['contract_version_asset_id'])
        if asset['documentId']!=document['id']: raise DocumentConflict('Версия не относится к действующему договору.')
        with tempfile.TemporaryDirectory(prefix='sm-techno-contract-read-') as directory:
            workspace=Path(directory);source=workspace/('contract'+Path(asset['originalFilename']).suffix.lower());source.write_bytes(content)
            texts,images=self.source_reader.read(source,workspace)
            try:stored=json.loads(document.get('legal_snapshot_json') or '{}')
            except (TypeError,ValueError):stored={}
            required=('document_name','inn','signer_position','signer_short_name')
            trusted=(Path(asset['originalFilename']).suffix.lower()=='.docx' and bool(stored) and generated_contract_fields_match(content,document,stored))
            if trusted:
                snapshot={'number':document['number'],'date':document['document_date'],'legal_fields':stored}
            elif (recognised:=self.repository.latest_contract_recognition(asset['id'])):
                # Reuse the recognition shown to the manager when the contract was saved; re-reading may differ run to run.
                snapshot={'legal_fields':recognised}
            else:
                result=self.extractor.extract(ExtractionRequest('contract',texts,images,[asset['id']]))
                validate_payload('contract',result.payload,partial=True)
                snapshot=result.payload
            legal=snapshot.get('legal_fields') or {}
            if not trusted:
                # A re-read contract may return its own title («ДОГОВОР ПОСТАВКИ № …») as the party name.
                # Client documents use the card's document_name / full_name; the contract supplies INN/KPP and the signer.
                client=self.repository.get_client_display(client_id)
                card_name=client.get('document_name') or client.get('full_name')
                if card_name:
                    legal['document_name']=card_name
                    legal['full_name']=client.get('full_name') or card_name
            if not legal.get('document_name') and legal.get('full_name'):legal['document_name']=legal['full_name']
            legal['inn']=_digits(legal.get('inn'))
            # The card decides: an individual entrepreneur signs personally (no KPP, usually no «в лице»), the name gives the signer.
            # A 12-digit INN alone may be a physical person, who is never turned into «Индивидуальный предприниматель».
            card=self.service.db.get_crm_client(client_id) or {}
            if card.get('legal_type')=='individual_entrepreneur':
                legal['kpp']=None
                if not legal.get('signer_position'):legal['signer_position']='Индивидуальный предприниматель'
                if not legal.get('signer_name') and not legal.get('signer_short_name'):legal['signer_name']=_entrepreneur_name(legal.get('document_name') or legal.get('full_name'))
            # The contract supplies the party and signer for the specification. Number and date come from the saved card,
            # which the manager confirmed; the file is not re-searched for them or for literal field spellings.
            # The specification prints the position and «Иванов И.И.»; contracts often give the full name only in the genitive.
            if not legal.get('signer_short_name') and legal.get('signer_name'):legal['signer_short_name']=format_person_short_name(legal['signer_name'])
            if not legal.get('signer_position') and (nominative:=position_nominative(legal.get('signer_position_genitive'))):legal['signer_position']=nominative
            labels={'document_name':'наименование покупателя','inn':'ИНН покупателя','signer_position':'должность подписанта','signer_short_name':'подписант (Фамилия И.О.)'}
            for key in required:
                if not legal.get(key):raise ValueError('В договоре не найдено: '+labels[key]+'. Проверьте файл договора.')
            self._validate_document_client_identity(client_id,{'inn':legal['inn'],'kpp':'','legal_type':'individual_entrepreneur' if len(legal['inn'])==12 else 'legal_entity'},check_kpp=False)
            return {'document_id':document['id'],'asset_id':asset['id'],'client_id':client_id,'number':document['number'],
                'date':document['document_date'],'legal_fields':legal,'source_sha256':asset['sha256']}

    def _legacy_contract_file(self,client_id,document):
        """Readable file of a contract made by the earlier program (often for a 1С counterparty), kept only at output_path."""
        if not document.get('output_path') or self.repository.list_client_assets(client_id,document['id']): return None
        try: legacy=self.service._resolve_document_stored_path(document['output_path'])
        except Exception: return None
        return legacy if legacy.is_file() else None

    def _adopt_legacy_contract_file(self,actor,client_id):
        """Only for specification generation: a COPY of the old file becomes contract version 1.
        The original at output_path is neither moved nor deleted; without a readable file the state is left as is."""
        with storage_operation_lock(self.service._storage_operation_root()):
            state=self.repository.get_client_document_state(client_id)
            if not state['contract_document_id'] or state['contract_version_asset_id']: return state
            document=self.repository.get_document(state['contract_document_id'],client_id)
            legacy=self._legacy_contract_file(client_id,document)
            if legacy is None: return state
            filename=self.service._build_document_filename(document_type='contract',client_name=document['client_name_snapshot'],document_number=document['number'])
            if legacy.suffix.lower()!=Path(filename).suffix: filename=Path(filename).stem+legacy.suffix.lower()
            staged=None; key=self.store.new_key(); published=False; committed=False
            try:
                with legacy.open('rb') as source: staged=self.store.stage_upload(source,filename,'',self.limits)
                stored=self.store.publish(staged,key); published=True
                self.repository.adopt_legacy_contract_file(client_id,document['id'],stored,int(actor['id']))
                committed=True
            except Exception:
                # An unreadable or invalid old file is reported by the specification request as a missing contract file.
                if published and not committed: self.store.delete(key)
                return self.repository.get_client_document_state(client_id)
            finally:
                if staged: staged.path.unlink(missing_ok=True)
            return self.repository.get_client_document_state(client_id)

    def generate_specification(self,actor,client_id,invoice_job_id,operation_key,document_date=None):
        import re
        from stock_sync_web.documents import format_document_date,validate_invoice_lines,validate_invoice_source,generate_invoice_specification
        from stock_sync_web.assistant_extraction import validate_payload
        from stock_sync_web.assistant_repository import duplicate_specification_message
        require_document_reader(actor)
        if type(invoice_job_id) is not str or not invoice_job_id: raise ValueError('Выберите проверенное задание исходного счёта.')
        if document_date is not None:
            if type(document_date) is not str or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',document_date): raise ValueError('Дата спецификации должна быть в формате YYYY-MM-DD.')
            try: document_date=date.fromisoformat(document_date)
            except ValueError: raise ValueError('Проверьте дату спецификации.') from None
        self.repository.get_client_display(client_id)
        job=self.get_extraction(actor,invoice_job_id)
        if job['clientId']!=client_id:raise DocumentNotFound('Счёт не найден у клиента.')
        if job['kind']!='invoice' or job['status']!='confirmed' or len(job['assetIds'])!=1:
            raise ValueError('Сначала распознайте и проверьте один исходный счёт.')
        with storage_operation_lock(self.service._storage_operation_root()):
            # Existing receipt binds the server-owned job/actor/action. Replay survives later contract revisions.
            operation=self.repository.get_operation(operation_key)
            if operation:
                operation=self.repository.begin_operation(operation_key,int(actor['id']),invoice_job_id,'generate_specification')
                if operation['status']=='completed':
                    row=self.repository.get_document(int(operation['result_id']),client_id)
                    return serialize_document(row,self.repository.list_client_assets(client_id,row['id']))
                if operation['status']!='pending':raise DocumentConflict('Операция требует проверки; создайте новое задание.')
            content,asset=self.read_asset(actor,job['assetIds'][0])
            suffix=Path(asset['originalFilename']).suffix.lower()
            if asset['clientId']!=client_id:raise DocumentNotFound('Счёт не найден у клиента.')
            _require_invoice_format(asset['originalFilename'])
            if (duplicate:=self.repository.specification_for_invoice(asset['id'])):raise DocumentConflict(duplicate_specification_message(duplicate))
            payload=(job['result'] or {}).get('payload') or {};validate_payload('invoice',payload,partial=True)
            # A Word invoice is reconciled with its goods table; a PDF or photo has no table, so the reviewed lines are printed.
            invoice=validate_invoice_source(content,payload) if suffix=='.docx' else validate_invoice_lines(payload)
            buyer_inn=_digits(payload.get('buyer_inn'))
            if not buyer_inn:raise ValueError('Укажите ИНН покупателя в проверке счёта.')
            state=self._adopt_legacy_contract_file(actor,client_id)
            if not state['contract_document_id']:raise DocumentConflict('Сначала сохраните договор клиента.')
            state=self.repository.reconcile_specification_sequence(client_id,state['contract_document_id'])
            canonical=self.repository.get_document(state['contract_document_id'],client_id)
            spec_date=document_date or date.today()
            try:contract_date=date.fromisoformat(str(canonical['document_date'])[:10])
            except ValueError:contract_date=None
            if contract_date and spec_date<contract_date:
                raise ValueError(f"Дата спецификации не может быть раньше даты договора ({format_document_date(contract_date)}).")
            contract=self._read_specification_contract(actor,client_id,state)
            legal=contract['legal_fields']
            # The buyer is identified by INN only; a branch KPP may differ between the invoice, the contract and the card.
            if buyer_inn!=legal['inn']:
                raise DocumentConflict(f"ИНН покупателя в счёте ({buyer_inn}) не совпадает с ИНН в договоре ({legal['inn']}).")
            self._validate_document_client_identity(client_id,{'inn':buyer_inn,'kpp':'','legal_type':'individual_entrepreneur' if len(buyer_inn)==12 else 'legal_entity'},check_kpp=False)
            template=Path(__file__).resolve().parent.parent/'assets/templates/specification_invoice_template.docx'
            number=state['next_spec_number'];document_date=spec_date.isoformat()
            filename=self.service._build_document_filename(document_type='specification',client_name=legal['document_name'],document_number=str(number))
            with tempfile.TemporaryDirectory(prefix='sm-techno-specification-') as directory:
                output=Path(directory)/'specification.docx'
                generate_invoice_specification(template_path=template,output_path=output,number=number,document_date=document_date,contract=contract,invoice=invoice)
                with output.open('rb') as source:staged=self.store.stage_upload(source,filename,'',self.limits)
                key=self.store.new_key();published=False;metadata_committed=False
                try:
                    stored=self.store.publish(staged,key);published=True
                    self.repository.begin_operation(operation_key,int(actor['id']),invoice_job_id,'generate_specification')
                    row=self.repository.allocate_specification(client_id,contract['document_id'],contract['asset_id'],asset['id'],operation_key,
                        {'client_name':legal['document_name'],'document_date':document_date,'output_path':self.service._store_path(self.store.path_for_key(key)),
                        'legal_snapshot':contract,'expected_sequence':number},stored=stored)
                    metadata_committed=True
                    return serialize_document(self.repository.get_document(row['id']),self.repository.list_client_assets(client_id,row['id']))
                except Exception:
                    if published and not metadata_committed:self.store.delete(key)
                    raise
                finally:staged.path.unlink(missing_ok=True)

    def generate_article_offer(self,actor,client_id,articles_job_id,operation_key):
        """Resolve a reviewed article request against a fresh read-only stock snapshot."""
        from stock_sync_web.assistant_extraction import validate_payload
        require_document_reader(actor)
        if type(articles_job_id) is not str or not articles_job_id:
            raise ValueError('Выберите проверенное задание с артикулами.')
        client=self.repository.get_client_display(client_id)
        job=self.get_extraction(actor,articles_job_id)
        if job['clientId']!=client_id:
            raise DocumentNotFound('Исходный файл не найден у клиента.')
        if job['kind']!='articles' or job['status']!='confirmed' or len(job['assetIds'])!=1:
            raise ValueError('Сначала распознайте и подтвердите файл с артикулами.')
        source=self.repository.get_asset(job['assetIds'][0])
        if source['crm_client_id']!=client_id:
            raise DocumentNotFound('Исходный файл не найден у клиента.')
        payload=(job['result'] or {}).get('payload') or {}
        validate_payload('articles',payload,partial=True)
        rows=payload.get('rows') or []
        if not rows:
            raise ValueError('В проверенном файле не найдено артикулов.')
        self.repository.get_operation(operation_key)  # validates the caller-provided idempotency key
        from stock_sync_web.assistant_repository import DocumentConflict
        from stock_sync_web.vps_integrity import storage_operation_lock
        from decimal import Decimal

        # This shared storage lock serializes retries across processes. A crashed
        # pending operation remains blocked instead of risking duplicate КП records.
        with storage_operation_lock(self.service._storage_operation_root()):
            existing=self.repository.get_operation(operation_key)
            if existing:
                existing=self.repository.begin_operation(operation_key,int(actor['id']),articles_job_id,'generate_article_offer')
                if existing['status']=='completed':
                    receipt=json.loads(existing['result_id'])
                    bundle=self.service.get_commercial_offer_for_user(offer_id=int(receipt['offerId']),user_id=int(actor['id']),is_admin=actor.get('role')=='admin')
                    return {'offer':bundle['offer'],'lines':bundle['lines'],'articleResolution':receipt['articleResolution'],'replayed':True}
                raise DocumentConflict('Операция уже запущена или требует проверки; повтор запрещён.')

            request_articles=[str(row['article']) for row in rows]
            request_quantities={};conflicting=set()
            for row in rows:
                key=self.service.db._normalize_stock_sku(row['article'])
                quantity=Decimal(row['requested_qty']) if row.get('requested_qty') not in (None,'') else None
                if key in request_quantities and request_quantities[key][0]!=quantity:conflicting.add(key)
                else:request_quantities.setdefault(key,(quantity,row['source_row']))
            if conflicting:
                return {'offer':None,'lines':[],'articleResolution':[{'sourceRow':row['source_row'],'article':row['article'],
                    'status':'ambiguous' if self.service.db._normalize_stock_sku(row['article']) in conflicting else 'not_evaluated','variants':[]} for row in rows],'replayed':False}
            catalog=self.service.db.lookup_stock_articles(request_articles)
            resolution=[]; lines=[]; seen=set()
            for source_row in rows:
                article=str(source_row['article'])
                normalized=self.service.db._normalize_stock_sku(article)
                if normalized in seen:
                    resolution.append({'sourceRow':source_row['source_row'],'article':article,'status':'duplicate','variants':[]})
                    continue
                seen.add(normalized)
                matches=catalog.get(normalized,[])
                item_ids=sorted({int(item['item_id']) for item in matches})
                if not matches:
                    resolution.append({'sourceRow':source_row['source_row'],'article':article,'status':'not_found','variants':[]})
                    continue
                if len(item_ids)!=1:
                    resolution.append({'sourceRow':source_row['source_row'],'article':article,'status':'ambiguous','variants':[]})
                    continue
                item_rows=[row for row in matches if int(row['item_id'])==item_ids[0]]
                variants=[row for row in item_rows if row['warehouse_id'] is not None and row['quantity']>0]
                if not variants:
                    resolution.append({'sourceRow':source_row['source_row'],'article':article,'status':'zero_stock','variants':[]})
                    continue
                requested=Decimal(source_row['requested_qty']) if source_row.get('requested_qty') not in (None,'') else None
                line_variants=[]
                for variant in variants:
                    quantity=min(requested,Decimal(str(variant['quantity']))) if requested is not None else Decimal(str(variant['quantity']))
                    if quantity<=0:
                        continue
                    price=Decimal(str(variant['price']))
                    note=f"{variant['warehouse_name']} · наличие: {variant['quantity']:g}"
                    lines.append({'itemId':variant['item_id'],'article':article,'name':variant['name'],'brand':variant['category_name'],
                        'qty':float(quantity),'priceVat':float(price),'warehouseId':variant['warehouse_id'],'warehouseName':variant['warehouse_name'],'note':note})
                    line_variants.append({'warehouseId':variant['warehouse_id'],'warehouseName':variant['warehouse_name'],'physicalStock':variant['quantity'],'price':float(price),'offerQty':float(quantity)})
                resolution.append({'sourceRow':source_row['source_row'],'article':article,'status':'matched','variants':line_variants})
            if not lines:
                return {'offer':None,'lines':[],'articleResolution':resolution,'replayed':False}

            operation=self.repository.begin_operation(operation_key,int(actor['id']),articles_job_id,'generate_article_offer')
            if operation['status']!='pending':
                raise DocumentConflict('Операция уже запущена или требует проверки; повтор запрещён.')
            try:
                bundle=self.service.create_commercial_offer_from_draft(client_source='local',client_id=client_id,
                    client_name=client.get('document_name') or client.get('full_name') or '',
                    notes=f"Сформировано по файлу {source['original_filename']}",lines=lines,created_by_user_id=int(actor['id']))
                receipt={'offerId':bundle['offer']['id'],'articleResolution':resolution}
                self.repository.finish_operation(operation_key,'commercial_offer',json.dumps(receipt,ensure_ascii=False,separators=(',',':')))
                return {'offer':bundle['offer'],'lines':bundle['lines'],'articleResolution':resolution,'replayed':False}
            except Exception:
                self.repository.mark_operation_unknown(operation_key)
                raise

    def list_documents(self,actor,client_id):
        require_document_reader(actor)
        client=self.repository.get_client_display(client_id)
        state=self.repository.get_client_document_state(client_id)
        assets=self.repository.list_client_assets(client_id)
        documents=[serialize_document(d,[a for a in assets if a['document_id']==d['id']]) for d in self.repository.list_client_documents(client_id)]
        contract=next((d for d in documents if d['id']==state['contract_document_id']),None)
        if contract:
            # Read-only: an old contract without versions is usable when its original file is readable.
            contract={**contract,'fileAvailable':bool(contract['assets']) or self._legacy_contract_file(client_id,self.repository.get_document(contract['id'],client_id)) is not None}
        return {'clientId':client_id,'documentDisplayName':client['document_name'] or client['full_name'] or client['name'],
            'contract':contract,
            'documents':documents,'attachments':[serialize_asset(a) for a in assets if a['document_id'] is None],
            'stateVersion':state['version'],'nextSpecNumber':state['next_spec_number']}

    def upload_asset(self,actor,client_id,role,file,document_id=None,expected_version=None):
        require_document_reader(actor)
        self.repository.get_client_display(client_id)
        if document_id is not None:
            return self.upload_version(actor,client_id,document_id,role,file,expected_version)
        if role not in {'requisites','source_invoice','attachment','archive'}: raise ValueError('Выберите назначение исходного файла или вложение.')
        if role=='source_invoice': _require_invoice_format(file.filename)
        staged=self.store.stage_upload(file.file,file.filename or '',file.content_type or '',self.limits)
        key=self.store.new_key(); published=False; metadata_committed=False
        try:
            with storage_operation_lock(self.service._storage_operation_root()):
                stored=self.store.publish(staged,key); published=True
                result=self.repository.create_asset(client_id,role,stored,int(actor['id']))
                metadata_committed=True
            return serialize_asset(result)
        except Exception:
            if published and not metadata_committed: self.store.delete(key)
            raise
        finally:
            staged.path.unlink(missing_ok=True)

    def import_document(self,actor,client_id,document_type,asset_id,number,document_date,contract_id=None,expected_version=None):
        require_document_reader(actor)
        if document_type not in {'contract','specification'}: raise ValueError('Выберите договор или спецификацию.')
        if not isinstance(number,str) or not number.strip() or len(number.strip())>100: raise ValueError('Укажите подтверждённый номер документа (до 100 символов).')
        try: parsed=date.fromisoformat(document_date)
        except (ValueError,TypeError): raise ValueError('Дата документа должна быть указана в формате YYYY-MM-DD.') from None
        with storage_operation_lock(self.service._storage_operation_root()):
            self.repository.get_client_document_state(client_id)
            asset=self.repository.get_asset(asset_id)
            if asset['crm_client_id']!=client_id: raise DocumentNotFound('Файл не найден у клиента.')
            if asset['role'] not in {'archive','generated','final','contract_version'}: raise ValueError('Для импорта загрузите готовый документ.')
            self.read_asset(actor,asset_id)
            path=self.store.path_for_key(asset['storage_key'])
            doc=self.repository.import_document(client_id,document_type,asset_id,number.strip(),parsed.isoformat(),int(actor['id']),contract_id,expected_version,self.service._store_path(path))
            return serialize_document(doc,self.repository.list_client_assets(client_id,doc['id']))

    def read_asset(self,actor,asset_id):
        require_document_reader(actor)
        with storage_operation_lock(self.service._storage_operation_root()):
            asset=self.repository.get_asset(asset_id)
            if asset['crm_client_id'] is None and asset['created_by_user_id'] != int(actor['id']):
                raise DocumentPermissionError('Исходный файл доступен только автору задания до привязки к клиенту.')
            try:
                with self.store.open(asset['storage_key']) as source: content=source.read(self.limits.max_bytes+1)
            except FileNotFoundError: raise DocumentNotFound('Файл не найден в хранилище.') from None
            if len(content)!=asset['byte_size'] or hashlib.sha256(content).hexdigest()!=asset['sha256']:
                raise DocumentConflict('Контрольная сумма файла не совпала. Обратитесь к администратору.')
            return content,serialize_asset(asset)

    def upload_version(self,actor,client_id,document_id,role,file,expected_version,*,legal_snapshot=None,missing_fields=None):
        require_document_reader(actor)
        if expected_version is None or expected_version<1: raise ValueError('Укажите текущую версию документа.')
        with storage_operation_lock(self.service._storage_operation_root()):
            document=self.repository.get_document(document_id,client_id)
            if role not in {'final','contract_version'} or (role=='contract_version' and document['document_type']!='contract'):
                raise ValueError('Выберите финальный файл или версию договора.')
            self.repository.get_client_document_state(client_id)
            if document['version']!=expected_version: raise DocumentConflict('Конфликт версии документа. Обновите список.')
            staged=self.store.stage_upload(file.file,file.filename or '',file.content_type or '',self.limits)
            key=self.store.new_key(); published=[]; legacy_staged=None; legacy_original=None; metadata_committed=False
            try:
                # Legacy output is copied immutably before its default pointer is replaced.
                if not self.repository.list_client_assets(client_id,document_id):
                    legacy=self.service._resolve_document_stored_path(document['output_path'])
                    if not legacy.is_file(): raise DocumentConflict('Исходный файл документа недоступен; замена запрещена.')
                    with legacy.open('rb') as source:
                        legacy_staged=self.store.stage_upload(source,self.service._build_document_filename(document_type=document['document_type'],client_name=document['client_name_snapshot'],document_number=document['number']),'',self.limits)
                    legacy_key=self.store.new_key(); legacy_original=self.store.publish(legacy_staged,legacy_key); published.append(legacy_key)
                stored=self.store.publish(staged,key); published.append(key)
                def commit_version():
                    nonlocal metadata_committed
                    row=self.repository.add_version(client_id,document_id,role,stored,int(actor['id']),expected_version,
                        self.service._store_path(self.store.path_for_key(key)),legacy_original,legal_snapshot,missing_fields)
                    metadata_committed=True
                    return row
                row=self._delete_with_rollback([legacy],commit_version) if legacy_original else commit_version()
                return serialize_asset(row)
            except Exception:
                if not metadata_committed:
                    for published_key in published: self.store.delete(published_key)
                raise
            finally:
                staged.path.unlink(missing_ok=True)
                if legacy_staged: legacy_staged.path.unlink(missing_ok=True)

    def _delete_with_rollback(self,paths,delete_metadata):
        moved=[]
        with storage_operation_lock(self.service._storage_operation_root()):
            try:
                for path in dict.fromkeys(paths):
                    if not path.is_file(): continue
                    staged=self.store.staging/(uuid.uuid4().hex+'.deleted')
                    path.replace(staged); moved.append((path,staged))
                result=delete_metadata()
            except Exception:
                for path,staged in reversed(moved): staged.replace(path)
                raise
            # A post-commit unlink failure leaves a quarantined, unreferenced file in excluded staging;
            # never restore content whose metadata has already been deleted.
            for _,staged in moved: staged.unlink(missing_ok=True)
            for path,_ in moved:
                if path.parent.is_relative_to(self.store.root) and path.parent.is_dir() and not any(path.parent.iterdir()): path.parent.rmdir()
            return result

    def delete_asset(self,actor,asset_id):
        require_document_admin(actor)
        with storage_operation_lock(self.service._storage_operation_root()):
            asset=self.repository.get_asset(asset_id)
            self._delete_with_rollback([self.store.path_for_key(asset['storage_key'])],lambda:self.repository.delete_asset(asset_id))

    def delete_document(self,actor,document_id):
        require_document_admin(actor)
        with storage_operation_lock(self.service._storage_operation_root()):
            document=self.repository.get_document(document_id)
            assets=self.repository.list_client_assets(document['crm_client_id'],document_id) if document['crm_client_id'] else []
            paths=[self.store.path_for_key(a['storage_key']) for a in assets]
            paths.append(self.service._resolve_document_stored_path(document['output_path']))
            self._delete_with_rollback(paths,lambda:self.repository.delete_document(document_id))
