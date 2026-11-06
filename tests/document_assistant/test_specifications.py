from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from zipfile import ZipFile

from docx import Document
import pytest

from tests.document_assistant.test_storage_flow import api, upload, docx_bytes
from tests.document_assistant.test_clients_contracts import FIELDS, requisites, confirm


INVOICE = {'invoice_number':'254','date':'2026-10-30','buyer_inn':FIELDS['inn'],'buyer_kpp':FIELDS['kpp'],
    'buyer_document_name':FIELDS['document_name'],'currency':'RUB','total_amount':'310000.00','vat_amount':'55901.64',
    'amount_in_words':'Триста десять тысяч рублей 00 копеек','lines':[{'row_no':1,'article':'SYN-795','name':'SYN-795 Тестовая шестерня',
    'qty':'1','unit':'шт','unit_price_incl_vat':'310000.00','unit_price_excl_vat':'254098.36','vat_amount':'55901.64','total_amount':'310000.00'}]}


def invoice_bytes(payload=None, extra_rows=False):
    p=payload or INVOICE; d=Document()
    d.add_paragraph('Счет на оплату № '+p['invoice_number']+' от 30.10.2026')
    d.add_paragraph('Поставщик: ООО Продавец, ИНН 7804702073, КПП 780401001')
    d.add_paragraph('Покупатель: '+p['buyer_document_name']+', ИНН '+p['buyer_inn']+', КПП '+(p.get('buyer_kpp') or ''))
    d.add_paragraph('Основной договор: НЕ ИСПОЛЬЗОВАТЬ 999')
    t=d.add_table(rows=0,cols=9)
    for values in [['']*9,['','№','Товар (Услуга)','Кол-во','Ед.','Цена с НДС','Цена без ндс','Сумма НДС','Сумма'],['']+list(map(str,range(1,9)))]:
        for c,v in zip(t.add_row().cells,values):c.text=v
    for line in p['lines']:
        for c,v in zip(t.add_row().cells,['',str(line['row_no']),line['name'],line['qty'],line['unit'],line['unit_price_incl_vat'],line['unit_price_excl_vat'],line['vat_amount'],line['total_amount']]):c.text=v
    if extra_rows:
        from decimal import Decimal
        r=t.add_row();r.cells[2].merge(r.cells[4]).text=str(sum(Decimal(x['qty']) for x in p['lines']))
        r.cells[5].merge(r.cells[8]).text=p['total_amount']
        t.add_row()
    d.add_paragraph('Итого: '+p['total_amount'])
    d.add_paragraph('В том числе НДС: '+p['vat_amount'])
    d.add_paragraph('Всего к оплате: '+p['total_amount'])
    d.add_paragraph('Всего наименований '+str(len(p['lines']))+', на сумму '+p['total_amount']+' руб.')
    d.add_paragraph(p['amount_in_words'])
    b=BytesIO();d.save(b);return b.getvalue()


def setup_invoice(api,monkeypatch,payload=None,source=None,review_only=False):
    http,service,users,cid=api
    with service.db.transaction(immediate=True) as c:c.execute('UPDATE crm_clients SET inn=?,kpp=? WHERE id=?',(FIELDS['inn'],FIELDS['kpp'],cid))
    j,_=requisites(http,users,monkeypatch,cid=cid)
    r=confirm(http,users,j,'generate_contract',{**FIELDS,'contract_number':'Д-37','contract_date':'2026-10-30'})
    assert r.status_code==200,r.text
    from stock_sync_web.assistant_extraction import ExtractionResult
    p=payload or INVOICE
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult('invoice',json.loads(json.dumps(p))))
    a=upload(http,users,cid,source or invoice_bytes(),role='source_invoice',name='invoice.docx').json()
    j=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'invoice','clientId':cid,'assetIds':[a['id']]}).json()
    j=http.get('/api/document-assistant/jobs/'+j['id'],headers=users['alice']['headers']).json()
    assert j['status']=='review',j.get('error')
    if not review_only:
        response=confirm(http,users,j,'review',key='review-invoice-setup')
        assert response.status_code==200,response.text
        j=response.json()['job']
    return j,a


def generate(api,job,key='generate-specification-0001',cid=None,**extra):
    http,_,users,client=api
    return http.post(f'/api/crm/clients/{cid or client}/specifications',headers=users['boris']['headers'],json={'invoiceJobId':job['id'],'operationKey':key,**extra})


def another_invoice(api,payload=None,key='review-another-invoice',monkeypatch=None):
    """A second reviewed invoice of the same client; by default the extractor double set by setup_invoice is reused."""
    http,_,users,cid=api
    if monkeypatch:
        from stock_sync_web.assistant_extraction import ExtractionResult
        monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult('invoice',json.loads(json.dumps(payload or INVOICE))))
    a=upload(http,users,cid,invoice_bytes(payload),role='source_invoice',name='invoice-2.docx').json()
    j=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'invoice','clientId':cid,'assetIds':[a['id']]}).json()
    j=http.get('/api/document-assistant/jobs/'+j['id'],headers=users['alice']['headers']).json()
    response=confirm(http,users,j,'review',key=key);assert response.status_code==200,response.text
    return response.json()['job']


def test_invoice_to_specification_final_retains_original_and_exact_sources(api,monkeypatch):
    http,service,users,cid=api;j,a=setup_invoice(api,monkeypatch)
    r=generate(api,j);assert r.status_code==200,r.text
    spec=r.json();assert spec['number']=='1' and spec['invoiceAssetId']==a['id'] and spec['contractVersionId']
    body=http.get(f"/api/documents/{spec['id']}/download",headers=users['alice']['headers']).content
    d=Document(BytesIO(body));assert len(d.tables[1].columns)==8
    assert [c.text for c in d.tables[1].rows[1].cells]==['1','SYN-795 Тестовая шестерня','1','шт','310 000,00','254 098,36','55 901,64','310 000,00']
    text='\n'.join(p.text for p in d.paragraphs)
    assert 'Д-37' in text and '999' not in text and INVOICE['amount_in_words'] in text
    assert FIELDS['document_name'] in text
    assert generate(api,j).json()['id']==spec['id']
    final=docx_bytes('Менеджер дописал условия')
    r=http.post(f"/api/crm/clients/{cid}/documents/{spec['id']}/versions",headers=users['alice']['headers'],data={'role':'final','expectedVersion':1},files={'file':('final.docx',final)})
    assert r.status_code==200,r.text
    assert http.get(f"/api/document-assets/{spec['assets'][0]['id']}/download",headers=users['boris']['headers']).content==body
    assert http.get(f"/api/documents/{spec['id']}/download",headers=users['boris']['headers']).content==final
    again=generate(api,j).json();assert again['id']==spec['id'] and again['version']==2
    from stock_sync_web.assistant_repository import AssistantRepository
    saved=AssistantRepository(service.db).get_document(spec['id']);snapshot=json.loads(saved['legal_snapshot_json'])
    assert snapshot['source_sha256'] and snapshot['legal_fields']['signer_name']==FIELDS['signer_name']


@pytest.mark.parametrize('change',[{'total_amount':'310001.00'},{'vat_amount':'1.00'},{'buyer_inn':'7712345678'},{'lines':[]}])
def test_untrusted_model_cannot_publish_changed_invoice(api,monkeypatch,change):
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,**change})
    r=generate(api,j);assert r.status_code in (409,422),r.text
    http,_,users,cid=api
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    assert len(summary['documents'])==1 and summary['nextSpecNumber']==1


def test_archive_sequence_parallel_and_replay_are_atomic(api,monkeypatch):
    http,_,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    a=upload(http,users,cid,docx_bytes('Архивная спецификация №5')).json()
    r=http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'specification','assetId':a['id'],'number':'5','date':'2026-10-29'})
    assert r.status_code==200,r.text
    second=another_invoice(api)
    with ThreadPoolExecutor(max_workers=2) as w:results=list(w.map(lambda pair:generate(api,pair[0],pair[1]),[(j,'parallel-spec-0001'),(second,'parallel-spec-0002')]))
    assert [r.status_code for r in results]==[200,200],[r.text for r in results]
    assert {r.json()['number'] for r in results}=={'6','7'}
    assert generate(api,j,'parallel-spec-0001').json()['id']==results[0].json()['id']


def test_changed_canonical_file_is_read_and_foreign_job_rejected(api,monkeypatch):
    http,service,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    first=generate(api,j).json()
    other=service.db.create_crm_client_card({'document_name':'Чужой клиент'})['id']
    assert generate(api,j,'foreign-client-001',other).status_code==404
    replacement=docx_bytes('Нечитаемый договор без юридических данных')
    r=http.post(f"/api/crm/clients/{cid}/documents/{first['contractId']}/versions",headers=users['alice']['headers'],data={'role':'contract_version','expectedVersion':1},files={'file':('changed.docx',replacement)})
    assert r.status_code==200,r.text
    failed=generate(api,another_invoice(api),'changed-contract-001');assert failed.status_code in (409,422),failed.text
    assert 'уже создана' not in failed.text
    assert generate(api,j).json()['contractVersionId']==first['contractVersionId']


def test_rounding_service_rows_and_missing_image_relationship_do_not_lose_goods(api,monkeypatch):
    source=invoice_bytes(extra_rows=True)
    # A missing nontext logo target must not prevent safe body XML extraction.
    original=ZipFile(BytesIO(source));b=BytesIO()
    with ZipFile(b,'w') as z:
        for n in original.namelist():
            data=original.read(n)
            if n=='word/_rels/document.xml.rels':data=data.replace(b'</Relationships>',b'<Relationship Id="rLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/missing.png"/></Relationships>')
            z.writestr(n,data)
    j,_=setup_invoice(api,monkeypatch,source=b.getvalue())
    assert generate(api,j).status_code==200


def test_invoice_number_and_date_of_the_review_do_not_block(api,monkeypatch):
    # D3: the specification does not print the invoice number or date; the manager reviewed them on screen.
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,'date':'2025-10-30','invoice_number':'НЕТ-В-ФАЙЛЕ'})
    r=generate(api,j);assert r.status_code==200,r.text


def test_source_rounding_multiple_goods_and_new_contract_version_keep_old_snapshot(api,monkeypatch):
    from stock_sync_web.assistant_repository import AssistantRepository
    http,service,users,cid=api
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(qty='3',unit_price_incl_vat='100.00',unit_price_excl_vat='81.97',vat_amount='54.10',total_amount='300.00')
    p['lines'].append({**p['lines'][0],'row_no':2,'name':'SYN-001 Тестовый товар','article':'SYN-001','qty':'1','unit_price_incl_vat':'10.00','unit_price_excl_vat':'10.00','vat_amount':'0.00','total_amount':'10.00'})
    p.update(total_amount='310.00',vat_amount='54.10',amount_in_words='Триста десять рублей 00 копеек')
    j,_=setup_invoice(api,monkeypatch,p,invoice_bytes(p,True))
    first=generate(api,j);assert first.status_code==200,first.text
    first=first.json();repo=AssistantRepository(service.db)
    snapshot=repo.get_document(first['id'])['legal_snapshot_json']
    d=Document(BytesIO(http.get(f"/api/documents/{first['id']}/download",headers=users['alice']['headers']).content))
    assert len(d.tables[1].rows)==3 and d.tables[1].rows[1].cells[6].text=='54,10'
    q,_=requisites(http,users,monkeypatch,{**FIELDS,'signer_name':'Петров Пётр Петрович'},cid)
    updated=confirm(http,users,q,'generate_contract',{**FIELDS,'signer_name':'Петров Пётр Петрович','contract_number':'Д-37','contract_date':'2026-10-30'},key='new-signer-contract')
    assert updated.status_code==200,updated.text
    second=generate(api,another_invoice(api,p,monkeypatch=monkeypatch),'second-spec-new-version');assert second.status_code==200,second.text
    assert second.json()['contractVersionId']!=first['contractVersionId']
    new=json.loads(repo.get_document(second.json()['id'])['legal_snapshot_json'])
    assert new['legal_fields']['signer_name']=='Петров Пётр Петрович'
    assert repo.get_document(first['id'])['legal_snapshot_json']==snapshot


def test_extractor_separate_article_and_printed_date_preserve_complete_source_name(api,monkeypatch):
    p=json.loads(json.dumps(INVOICE));p['lines'][0]['name']='Тестовая шестерня';p['date']='30.10.2026'
    j,_=setup_invoice(api,monkeypatch,p)
    r=generate(api,j);assert r.status_code==200,r.text
    http,_,users,_=api
    d=Document(BytesIO(http.get(f"/api/documents/{r.json()['id']}/download",headers=users['alice']['headers']).content))
    assert d.tables[1].rows[1].cells[1].text=='SYN-795 Тестовая шестерня'


def test_response_failure_after_commit_preserves_published_file_and_replay(api,monkeypatch):
    from stock_sync_web.assistant_repository import AssistantRepository
    from stock_sync_web.assistant_service import DocumentAssistantService
    http,service,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    original=AssistantRepository.get_document;failed=[]
    def once(self,*args,**kwargs):
        row=original(self,*args,**kwargs)
        if row['document_type']=='specification' and not failed:
            failed.append(True);raise OSError('Synthetic response read failure after commit')
        return row
    monkeypatch.setattr(AssistantRepository,'get_document',once)
    assert generate(api,j).status_code==503
    replay=generate(api,j);assert replay.status_code==200,replay.text
    assert http.get(f"/api/documents/{replay.json()['id']}/download",headers=users['alice']['headers']).status_code==200
    assets=AssistantRepository(service.db).list_client_assets(cid,replay.json()['id'])
    assert DocumentAssistantService(service).store.exists(assets[0]['storage_key'])


@pytest.mark.parametrize('number,expected',[('5','6'),('неизвестен',None)])
def test_preexisting_legacy_archive_numbers_are_reconciled_before_allocation(api,monkeypatch,number,expected):
    http,service,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    output=service.document_exports_dir/'legacy-spec.docx';output.write_bytes(docx_bytes('Прежняя спецификация'))
    legacy_id=service.db.create_document(document_type='specification',number=number,client_source='local',counterparty_id=None,crm_client_id=cid,
        commercial_offer_id=None,client_name=FIELDS['document_name'],document_date='2026-10-01',output_path=service._store_path(output),notes='',missing_fields='[]',created_by_user_id=users['alice']['id'])
    from stock_sync_web.assistant_repository import AssistantRepository
    canonical=AssistantRepository(service.db).get_client_document_state(cid)['contract_document_id']
    with service.db.transaction(immediate=True) as conn:conn.execute('UPDATE documents SET contract_document_id=? WHERE id=?',(canonical,legacy_id))
    r=generate(api,j)
    if expected:assert r.status_code==200 and r.json()['number']==expected,r.text
    else:assert r.status_code==409,r.text


def test_imported_ready_contract_is_extracted_from_saved_bytes_and_keeps_original(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    old=summary['contract'];content=http.get(f"/api/documents/{old['id']}/download",headers=users['alice']['headers']).content
    assert http.delete(f"/api/documents/{old['id']}",headers=users['admin']['headers']).status_code==200
    asset=upload(http,users,cid,content).json()
    imported=http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'})
    assert imported.status_code==200,imported.text
    seen=[]
    def extract(self,request):
        seen.extend(request.texts)
        assert request.kind=='contract' and request.source_asset_ids==[asset['id']]
        return ExtractionResult('contract',{'number':'Д-37','date':'30.10.2026','legal_fields':dict(FIELDS)})
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',extract)
    spec=generate(api,j);assert spec.status_code==200,spec.text
    assert any(FIELDS['document_name'] in text for text in seen)
    assert spec.json()['contractId']==imported.json()['id'] and spec.json()['contractVersionId']==asset['id']
    assert http.get(f"/api/document-assets/{asset['id']}/download",headers=users['boris']['headers']).content==content


def test_review_invoice_requires_confirmation_before_generation_and_replays(api,monkeypatch):
    http,service,users,cid=api; job,_=setup_invoice(api,monkeypatch,review_only=True)
    with service.db.connect() as conn:
        before=[conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ('documents','client_document_assets','document_assistant_operations')]
    files_before={p.relative_to(service.document_storage_dir) for p in service.document_storage_dir.rglob('*') if p.is_file()}
    response=generate(api,job,key='confirm-required-test')
    assert files_before=={p.relative_to(service.document_storage_dir) for p in service.document_storage_dir.rglob('*') if p.is_file()}
    assert response.status_code in (409,422) and 'проверьте' in response.text.lower()
    with service.db.connect() as conn:
        assert before==[conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ('documents','client_document_assets','document_assistant_operations')]
    confirmed=confirm(http,users,job,'review',key='review-invoice-test')
    assert confirmed.status_code==200,confirmed.text
    job=confirmed.json()['job']
    first=generate(api,job,key='confirm-required-test'); assert first.status_code==200,first.text
    assert generate(api,job,key='confirm-required-test').json()['id']==first.json()['id']


def _with_written_date(content):
    import zipfile
    source=ZipFile(BytesIO(content));out=BytesIO()
    with ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            data=source.read(item.filename)
            if item.filename=='word/document.xml':
                xml=data.decode('utf-8');assert '30.10.2026' in xml
                data=xml.replace('30.10.2026','«30»  октября  2026 г.').encode('utf-8')
            target.writestr(item,data)
    return out.getvalue()


def test_imported_contract_with_date_written_in_words_is_accepted(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    old=summary['contract'];content=_with_written_date(http.get(f"/api/documents/{old['id']}/download",headers=users['alice']['headers']).content)
    assert http.delete(f"/api/documents/{old['id']}",headers=users['admin']['headers']).status_code==200
    asset=upload(http,users,cid,content).json()
    imported=http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'})
    assert imported.status_code==200,imported.text
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',
        lambda self,request:ExtractionResult('contract',{'number':'Д-37','date':'2026-10-30','legal_fields':dict(FIELDS)}))
    spec=generate(api,j);assert spec.status_code==200,spec.text
    assert spec.json()['contractId']==imported.json()['id']


def test_invoice_and_contract_names_match_across_quote_styles():
    from stock_sync_web.documents import _normal_text
    names={'ООО “ВОЛГАГЛОБАЛСЕРВИС”','ООО «ВОЛГАГЛОБАЛСЕРВИС»','ООО "ВОЛГАГЛОБАЛСЕРВИС"','ООО „ВОЛГАГЛОБАЛСЕРВИС“'}
    assert len({_normal_text(name) for name in names})==1
    assert _normal_text('ООО «Ёлка»')==_normal_text('ООО "елка"')


def test_formal_fields_do_not_block_the_specification(api,monkeypatch):
    # Currency left empty and a wrong amount in words from the model: the money is verified, the words are derived from it.
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,'currency':None,'amount_in_words':'Один рубль 00 копеек','buyer_document_name':'ООО “Другое написание”'})
    r=generate(api,j);assert r.status_code==200,r.text


def test_reread_contract_number_and_date_do_not_have_to_repeat_the_card(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    old=summary['contract'];content=http.get(f"/api/documents/{old['id']}/download",headers=users['alice']['headers']).content
    assert http.delete(f"/api/documents/{old['id']}",headers=users['admin']['headers']).status_code==200
    asset=upload(http,users,cid,content).json()
    imported=http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'})
    assert imported.status_code==200,imported.text
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',
        lambda self,request:ExtractionResult('contract',{'number':'37','date':None,'legal_fields':dict(FIELDS)}))
    spec=generate(api,j);assert spec.status_code==200,spec.text


def test_reread_contract_title_never_becomes_the_buyer_name(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,service,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    old=summary['contract'];content=http.get(f"/api/documents/{old['id']}/download",headers=users['alice']['headers']).content
    assert http.delete(f"/api/documents/{old['id']}",headers=users['admin']['headers']).status_code==200
    asset=upload(http,users,cid,content).json()
    assert http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'}).status_code==200
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',
        lambda self,request:ExtractionResult('contract',{'number':'Д-37','date':'2026-10-30','legal_fields':{**FIELDS,'document_name':'ДОГОВОР ПОСТАВКИ № Д-37','full_name':'ДОГОВОР ПОСТАВКИ № Д-37'}}))
    spec=generate(api,j);assert spec.status_code==200,spec.text
    card=service.db.connect().execute('SELECT document_name,full_name FROM crm_clients WHERE id=?',(cid,)).fetchone()
    expected=card[0] or card[1]
    assert expected and spec.json()['clientName']==expected
    text='\n'.join(p.text for p in Document(BytesIO(http.get(f"/api/documents/{spec.json()['id']}/download",headers=users['alice']['headers']).content)).paragraphs)
    assert 'ДОГОВОР ПОСТАВКИ № Д-37' not in text.split('Покупатель',1)[-1].split('\n')[0]


def _import_saved_contract(api,monkeypatch):
    http,_,users,cid=api;j,_=setup_invoice(api,monkeypatch)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    old=summary['contract'];content=http.get(f"/api/documents/{old['id']}/download",headers=users['alice']['headers']).content
    assert http.delete(f"/api/documents/{old['id']}",headers=users['admin']['headers']).status_code==200
    asset=upload(http,users,cid,content).json()
    return j,asset


def test_signer_given_only_in_genitive_and_initials_is_enough(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api;j,asset=_import_saved_contract(api,monkeypatch)
    assert http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'}).status_code==200
    legal={**FIELDS,'signer_name':None,'signer_name_genitive':'Алексеева Александра Владимировича','signer_short_name':'Алексеев А.В.','signer_position':'Директор'}
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult('contract',{'number':'Д-37','date':'2026-10-30','legal_fields':legal}))
    spec=generate(api,j);assert spec.status_code==200,spec.text
    content=http.get(f"/api/documents/{spec.json()['id']}/download",headers=users['alice']['headers']).content
    assert 'Алексеев А.В.' in ZipFile(BytesIO(content)).read('word/document.xml').decode('utf-8')


def test_specification_reuses_the_contract_recognition_seen_when_saving(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api;j,asset=_import_saved_contract(api,monkeypatch)
    seen={**FIELDS,'signer_short_name':'Алексеев А.В.'}
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult('contract',{'number':'Д-37','date':'2026-10-30','legal_fields':seen}))
    job=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'contract','clientId':cid,'assetIds':[asset['id']]}).json()
    assert http.get('/api/document-assistant/jobs/'+job['id'],headers=users['alice']['headers']).json()['status']=='review'
    assert http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'}).status_code==200
    def must_not_reread(self,request): raise AssertionError('contract must not be re-read when its recognition is saved')
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',must_not_reread)
    spec=generate(api,j);assert spec.status_code==200,spec.text



def _spec_xml(api,spec):
    http,_,users,_=api
    return ZipFile(BytesIO(http.get(f"/api/documents/{spec['id']}/download",headers=users['alice']['headers']).content)).read('word/document.xml').decode('utf-8')


def _invoice_with_rows(rows,paragraphs=()):
    """A 1С-like invoice table: header, numbering row and the given raw rows (8 cells after the leading blank)."""
    d=Document()
    for text in paragraphs:d.add_paragraph(text)
    t=d.add_table(rows=0,cols=9)
    for values in [['','№','Товар (Услуга)','Кол-во','Ед.','Цена с НДС','Цена без ндс','Сумма НДС','Сумма'],['']+list(map(str,range(1,9))),*rows]:
        for c,v in zip(t.add_row().cells,values):c.text=v
    b=BytesIO();d.save(b);return b.getvalue()


SOURCE_ROW=['','1','SYN-795 Тестовая шестерня','1','шт','310000.00','254098.36','55901.64','310000.00']


def test_source_name_and_unit_are_printed_even_when_the_review_spells_them_differently(api,monkeypatch):
    # D1 + D2: the specification prints the source cell; the reviewed spelling and a stray article never block.
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(name='Шестерня тестовая (исправлено)',unit='шт.',article='НЕТ-ТАКОГО')
    j,_=setup_invoice(api,monkeypatch,p,invoice_bytes(INVOICE))
    r=generate(api,j);assert r.status_code==200,r.text
    http,_,users,_=api
    d=Document(BytesIO(http.get(f"/api/documents/{r.json()['id']}/download",headers=users['alice']['headers']).content))
    assert [c.text for c in d.tables[1].rows[1].cells][1:4]==['SYN-795 Тестовая шестерня','1','шт']


def test_buyer_block_and_printed_totals_are_not_searched(api,monkeypatch):
    # D4 + D5 + D6: no buyer block, no «Итого» labels, a wrong «Всего наименований» and a wrong service total row.
    rows=[SOURCE_ROW,['','','Всего наименований 7','','','','','',''],['','','Итого:','','','','','','999.00']]
    source=_invoice_with_rows(rows,['Счет № 254','Всего наименований 7, на сумму 1,00 руб.'])
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,'buyer_kpp':'000000000'},source)
    r=generate(api,j);assert r.status_code==200,r.text


def test_unnumbered_incomplete_and_label_rows_are_skipped_not_raised(api,monkeypatch):
    # D7: service rows of any shape are skipped; the goods row is still found and reconciled.
    rows=[['','','Скидка по акции','','','','','',''],['','Раздел: шестерни','','','','','','',''],SOURCE_ROW,['','','','','','','','','Без НДС'],['','Всего:','310000.00']]
    j,_=setup_invoice(api,monkeypatch,source=_invoice_with_rows(rows))
    r=generate(api,j);assert r.status_code==200,r.text
    assert 'SYN-795 Тестовая шестерня' in _spec_xml(api,r.json())


def test_line_numbers_must_still_match_the_source_table(api,monkeypatch):
    # K1: a consistent but different quantity and sum is rejected; every number is compared with the DOCX cell.
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(qty='2',vat_amount='111803.28',unit_price_excl_vat='254098.36',total_amount='620000.00')
    p.update(total_amount='620000.00',vat_amount='111803.28')
    j,_=setup_invoice(api,monkeypatch,p,invoice_bytes(INVOICE))
    r=generate(api,j);assert r.status_code==422 and 'не совпадают с исходным счётом' in r.json()['detail'],r.text


def test_branch_kpp_of_invoice_and_card_does_not_block(api,monkeypatch):
    # R1: only the INN identifies the buyer; a branch KPP differs between documents.
    http,service,users,cid=api
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,'buyer_kpp':'770145001'})
    with service.db.transaction(immediate=True) as c:c.execute('UPDATE crm_clients SET kpp=? WHERE id=?',('770199001',cid))
    r=generate(api,j);assert r.status_code==200,r.text


def test_specification_date_is_chosen_and_validated(api,monkeypatch):
    # R3: optional documentDate, today by default, never before the contract date (30.10.2026).
    from datetime import date
    j,_=setup_invoice(api,monkeypatch)
    assert generate(api,j,'spec-date-bad-0001',documentDate='30.11.2026').status_code==422
    early=generate(api,j,'spec-date-early-01',documentDate='2026-10-29')
    assert early.status_code==422 and '30.10.2026' in early.json()['detail'],early.text
    chosen=generate(api,j,'spec-date-chosen-1',documentDate='2026-11-03');assert chosen.status_code==200,chosen.text
    assert chosen.json()['documentDate']=='2026-11-03' and '03.11.2026' in _spec_xml(api,chosen.json())
    today=generate(api,another_invoice(api),'spec-date-today-01');assert today.status_code==200,today.text
    assert today.json()['documentDate']==date.today().isoformat()


def test_second_specification_for_the_same_invoice_is_refused_but_replay_returns_it(api,monkeypatch):
    # R5: the server guards duplicates; the same operation key still replays the original.
    j,_=setup_invoice(api,monkeypatch)
    first=generate(api,j,'first-spec-key-01',documentDate='2026-11-02');assert first.status_code==200,first.text
    second=generate(api,j,'second-spec-key-1')
    assert second.status_code==409 and second.json()['detail']=='По этому счёту уже создана спецификация № 1 от 02.11.2026',second.text
    assert generate(api,j,'first-spec-key-01').json()['id']==first.json()['id']


def test_signer_prompt_allows_nominative_from_a_printed_genitive_without_inventing():
    # S1
    from stock_sync_web.assistant_extraction import ExtractionRequest,extraction_prompt
    prompt=extraction_prompt(ExtractionRequest('contract',['текст'],[],[1]))
    assert 'в лице генерального директора Иванова Ивана Ивановича' in prompt
    assert 'Генеральный директор' in prompt and 'Иванов Иван Иванович' in prompt and 'Иванов И.И.' in prompt
    assert 'Алексеев' not in prompt
    assert 'Never invent a person' in prompt


IP_INN='770123456789'
IP_INVOICE={**INVOICE,'buyer_inn':IP_INN,'buyer_kpp':None,'buyer_document_name':'ИП Петров Пётр Петрович'}


def setup_imported_contract(api,monkeypatch,*,card,legal,invoice,invoice_source=None,invoice_name='invoice.docx',media=None):
    """Client whose contract was uploaded as a ready file; the extractor answers each kind with the given double."""
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,service,users,cid=api
    with service.db.transaction(immediate=True) as c:
        c.execute('UPDATE crm_clients SET inn=?,kpp=?,document_name=?,full_name=?,legal_type=? WHERE id=?',(card['inn'],card.get('kpp') or '',card['document_name'],card['document_name'],card.get('legal_type') or 'legal_entity',cid))
    answers={'contract':{'number':'Д-50','date':'2026-10-30','legal_fields':legal},'invoice':invoice}
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult(request.kind,json.loads(json.dumps(answers[request.kind]))))
    contract=upload(http,users,cid,docx_bytes('Договор поставки № Д-50')).json()
    assert http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':contract['id'],'number':'Д-50','date':'2026-10-30'}).status_code==200
    media=media or ('image/png' if invoice_name.endswith('.png') else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    a=http.post(f'/api/crm/clients/{cid}/document-assets',headers=users['alice']['headers'],data={'role':'source_invoice'},files={'file':(invoice_name,invoice_source or invoice_bytes(invoice),media)})
    assert a.status_code==200,a.text
    j=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'invoice','clientId':cid,'assetIds':[a.json()['id']]})
    assert j.status_code==200,j.text
    j=http.get('/api/document-assistant/jobs/'+j.json()['id'],headers=users['alice']['headers']).json()
    assert j['status']=='review',j.get('error')
    response=confirm(http,users,j,'review',key='review-imported-invoice');assert response.status_code==200,response.text
    return response.json()['job']


def test_individual_entrepreneur_signer_comes_from_the_name(api,monkeypatch):
    # R4: ИП has no KPP and no «в лице»; the signer is the entrepreneur named in the card.
    card={'inn':IP_INN,'document_name':'ИП Петров Пётр Петрович','legal_type':'individual_entrepreneur'}
    legal={'document_name':'ИП Петров Пётр Петрович','inn':IP_INN,'kpp':None,'signer_position':None,'signer_name':None,'signer_short_name':None}
    j=setup_imported_contract(api,monkeypatch,card=card,legal=legal,invoice=IP_INVOICE)
    r=generate(api,j);assert r.status_code==200,r.text
    xml=_spec_xml(api,r.json())
    assert 'Индивидуальный предприниматель' in xml and 'Петров П.П.' in xml


def _png_bytes():
    from PIL import Image
    b=BytesIO();Image.new('RGB',(40,20),'white').save(b,format='PNG');return b.getvalue()


def test_scanned_invoice_builds_the_specification_from_the_reviewed_lines(api,monkeypatch):
    # R6: a photo/PDF has no DOCX table; reviewed lines, K2 arithmetic and K3 identity are enforced.
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(name='Шестерня по фото',unit='компл')
    p['amount_in_words']='Неверная пропись'
    j=setup_imported_contract(api,monkeypatch,card=FIELDS,legal=dict(FIELDS),invoice=p,invoice_source=_png_bytes(),invoice_name='invoice.png')
    r=generate(api,j);assert r.status_code==200,r.text
    http,_,users,_=api
    d=Document(BytesIO(http.get(f"/api/documents/{r.json()['id']}/download",headers=users['alice']['headers']).content))
    assert [c.text for c in d.tables[1].rows[1].cells]==['1','Шестерня по фото','1','компл','310 000,00','254 098,36','55 901,64','310 000,00']
    assert 'Триста десять тысяч рублей 00 копеек' in '\n'.join(x.text for x in d.paragraphs)


@pytest.mark.parametrize('change',[{'qty':'2'},{'vat_amount':'1.00'}])
def test_scanned_invoice_arithmetic_still_blocks(api,monkeypatch,change):
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(change)
    j=setup_imported_contract(api,monkeypatch,card=FIELDS,legal=dict(FIELDS),invoice=p,invoice_source=_png_bytes(),invoice_name='invoice.png')
    assert generate(api,j).status_code==422


def test_scanned_invoice_buyer_inn_must_match(api,monkeypatch):
    j=setup_imported_contract(api,monkeypatch,card=FIELDS,legal=dict(FIELDS),invoice={**INVOICE,'buyer_inn':'7712345678'},invoice_source=_png_bytes(),invoice_name='invoice.png')
    assert generate(api,j).status_code==409


def test_invoice_intake_accepts_photos_and_pdf(api):
    http,_,users,_=api
    r=http.post('/api/document-assistant/intake',headers=users['alice']['headers'],data={'kind':'invoice'},files={'file':('invoice.png',_png_bytes(),'image/png')})
    assert r.status_code==200,r.text


def _legacy_onec_contract(api,with_file=True):
    http,service,users,cid=api
    with service.db.transaction(immediate=True) as conn:
        conn.execute("INSERT INTO counterparties(id,onec_key,name,full_name,inn,kpp,updated_at) VALUES(901,'synthetic-901','Program name',?,?,?,'2026-10-30')",(FIELDS['document_name'],FIELDS['inn'],FIELDS['kpp']))
        conn.execute('UPDATE crm_clients SET linked_counterparty_id=901,inn=?,kpp=? WHERE id=?',(FIELDS['inn'],FIELDS['kpp'],cid))
    output=service.document_exports_dir/'legacy-contract.docx'
    if with_file:output.write_bytes(docx_bytes('Договор поставки № 42 от 01.10.2026'))
    return service.db.create_document(document_type='contract',number='42',client_source='onec',counterparty_id=901,crm_client_id=None,commercial_offer_id=None,
        client_name=FIELDS['document_name'],document_date='2026-10-01',output_path=service._store_path(output),notes='',missing_fields='[]',created_by_user_id=users['alice']['id'])


def _reviewed_invoice_for_existing_contract(api,monkeypatch):
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,_,users,cid=api
    answers={'contract':{'number':'42','date':'2026-10-01','legal_fields':dict(FIELDS)},'invoice':INVOICE}
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',lambda self,request:ExtractionResult(request.kind,json.loads(json.dumps(answers[request.kind]))))
    a=upload(http,users,cid,invoice_bytes(),role='source_invoice',name='invoice.docx').json()
    j=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'invoice','clientId':cid,'assetIds':[a['id']]}).json()
    j=http.get('/api/document-assistant/jobs/'+j['id'],headers=users['alice']['headers']).json()
    return confirm(http,users,j,'review',key='review-legacy-invoice').json()['job']


def test_contract_from_1c_with_a_file_is_used_for_the_specification(api,monkeypatch):
    # R2: the earlier program's contract of a 1С counterparty is the client's contract; its file becomes version 1.
    http,service,users,cid=api;did=_legacy_onec_contract(api)
    original=service.document_exports_dir/'legacy-contract.docx';content=original.read_bytes()
    def stored_assets():
        with service.db.connect() as conn:return conn.execute('SELECT COUNT(*) FROM client_document_assets').fetchone()[0]
    before=stored_assets()
    # Listing is read-only: it reports the contract as usable without copying or moving its file.
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    assert summary['contract']['id']==did and summary['contract']['assets']==[] and summary['contract']['fileAvailable'] is True
    assert stored_assets()==before and original.read_bytes()==content
    j=_reviewed_invoice_for_existing_contract(api,monkeypatch)
    r=generate(api,j);assert r.status_code==200,r.text
    # Generation copies the old file in as version 1; the original stays where it was.
    assert original.read_bytes()==content
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    assert r.json()['contractId']==did and r.json()['contractVersionId']==summary['contract']['assets'][0]['id']
    assert http.get(f"/api/document-assets/{summary['contract']['assets'][0]['id']}/download",headers=users['alice']['headers']).content==content
    assert http.get(f'/api/documents/{did}/download',headers=users['alice']['headers']).content==content


def test_contract_from_1c_without_a_file_explains_what_to_do(api,monkeypatch):
    http,service,users,cid=api;did=_legacy_onec_contract(api,with_file=False)
    summary=http.get(f'/api/crm/clients/{cid}/documents',headers=users['alice']['headers']).json()
    assert summary['contract']['id']==did and summary['contract']['assets']==[] and summary['contract']['fileAvailable'] is False
    j=_reviewed_invoice_for_existing_contract(api,monkeypatch)
    r=generate(api,j);assert r.status_code==409,r.text
    assert 'Файл договора № 42 от 01.10.2026 не найден' in r.json()['detail']


def test_position_given_only_in_genitive_is_turned_into_the_signature_title():
    from stock_sync_web.documents import position_nominative
    assert position_nominative('генерального директора')=='Генеральный директор'
    assert position_nominative(' Директора ')=='Директор'
    assert position_nominative('главного бухгалтера по особым поручениям') is None


def test_twelve_digit_inn_without_an_entrepreneur_card_gets_no_invented_signer(api,monkeypatch):
    # Review R2: a physical person (card is not an ИП) must not become «Индивидуальный предприниматель».
    card={'inn':IP_INN,'document_name':'Петров Пётр Петрович','legal_type':'legal_entity'}
    legal={'document_name':'Петров Пётр Петрович','inn':IP_INN,'kpp':None,'signer_position':None,'signer_name':None,'signer_short_name':None}
    j=setup_imported_contract(api,monkeypatch,card=card,legal=legal,invoice={**IP_INVOICE,'buyer_document_name':'Петров Пётр Петрович'})
    r=generate(api,j);assert r.status_code==422 and 'должность подписанта' in r.json()['detail'],r.text


@pytest.mark.parametrize('name,media',[('invoice.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),('invoice.txt','text/plain'),('invoice.csv','text/csv')])
def test_invoice_sources_are_only_docx_pdf_or_photo(api,name,media):
    # Review F1: a table or text file would skip the DOCX reconciliation, so it is not an invoice source.
    http,_,users,cid=api
    content=b'1;2;3\n' if name!='invoice.xlsx' else _xlsx_bytes()
    for response in (http.post('/api/document-assistant/intake',headers=users['alice']['headers'],data={'kind':'invoice'},files={'file':(name,content,media)}),
                     http.post(f'/api/crm/clients/{cid}/document-assets',headers=users['alice']['headers'],data={'role':'source_invoice'},files={'file':(name,content,media)})):
        assert response.status_code==422 and 'Счёт принимается в DOCX, PDF или фото' in response.json()['detail'],response.text
    attachment=http.post(f'/api/crm/clients/{cid}/document-assets',headers=users['alice']['headers'],data={'role':'attachment'},files={'file':(name,content,media)})
    assert attachment.status_code==200,attachment.text
    job=http.post('/api/document-assistant/jobs',headers=users['alice']['headers'],json={'kind':'invoice','clientId':cid,'assetIds':[attachment.json()['id']]})
    assert job.status_code==422 and 'Счёт принимается в DOCX, PDF или фото' in job.json()['detail'],job.text


def _xlsx_bytes():
    from openpyxl import Workbook
    b=BytesIO();book=Workbook();book.active['A1']='Счёт';book.save(b);return b.getvalue()


@pytest.mark.parametrize('missing',['total_amount','vat_amount'])
def test_reviewed_totals_are_required(api,monkeypatch,missing):
    # Review F2: the reviewed totals must be given and equal the sum of the lines (VAT when the lines carry VAT).
    j,_=setup_invoice(api,monkeypatch,{**INVOICE,missing:None})
    r=generate(api,j);assert r.status_code==422,r.text


def test_scanned_invoice_without_vat_needs_no_vat_total(api,monkeypatch):
    p=json.loads(json.dumps(INVOICE));p['lines'][0].update(unit_price_excl_vat='310000.00',vat_amount='0.00')
    p.update(vat_amount=None)
    j=setup_imported_contract(api,monkeypatch,card=FIELDS,legal=dict(FIELDS),invoice=p,invoice_source=_png_bytes(),invoice_name='invoice.png')
    r=generate(api,j);assert r.status_code==200,r.text


def _invoice_with_merged_goods_row():
    d=Document();t=d.add_table(rows=0,cols=9)
    for values in [['','№','Товар (Услуга)','Кол-во','Ед.','Цена с НДС','Цена без ндс','Сумма НДС','Сумма'],['']+list(map(str,range(1,9))),SOURCE_ROW]:
        for c,v in zip(t.add_row().cells,values):c.text=v
    r=t.add_row();r.cells[1].text='2';r.cells[2].merge(r.cells[3]).text='Деталь в объединённых ячейках'
    for index,value in zip(range(4,9),['шт','10.00','8.33','1.67','10.00']):r.cells[index].text=value
    b=BytesIO();d.save(b);return b.getvalue()


@pytest.mark.parametrize('source',['unnumbered','merged'])
def test_unparsed_row_with_money_under_the_goods_header_blocks(api,monkeypatch,source):
    # Review F2: a row with amounts that is neither a goods row nor a summary is not dropped silently.
    content=_invoice_with_rows([SOURCE_ROW,['','','Доставка','1','усл','500.00','416.67','83.33','500.00']]) if source=='unnumbered' else _invoice_with_merged_goods_row()
    j,_=setup_invoice(api,monkeypatch,source=content)
    r=generate(api,j);assert r.status_code==422 and 'Строка счёта с суммами не разобрана' in r.json()['detail'],r.text


@pytest.mark.parametrize('status,payload',[('failed',{'number':'Д-37','legal_fields':{**FIELDS,'signer_short_name':'Сохранён И.И.'}}),
    ('review',{'number':'Д-37','legal_fields':{**FIELDS,'signer_short_name':'Сохранён И.И.'},'unexpected':'field'})])
def test_saved_recognition_is_reused_only_when_it_is_a_valid_review(api,monkeypatch,status,payload):
    # Review R1: failed jobs and invalid stored payloads are not reused; the contract is read again.
    from stock_sync_web.assistant_extraction import ExtractionResult
    http,service,users,cid=api;j,asset=_import_saved_contract(api,monkeypatch)
    assert http.post(f'/api/crm/clients/{cid}/documents/import',headers=users['alice']['headers'],json={'type':'contract','assetId':asset['id'],'number':'Д-37','date':'2026-10-30'}).status_code==200
    with service.db.transaction(immediate=True) as conn:
        conn.execute("INSERT INTO document_assistant_jobs(id,actor_user_id,crm_client_id,kind,input_asset_ids,status,result_json,created_at,updated_at) VALUES('stored-contract-job',?,?,'contract',?,?,?,'2026-11-06','2099-01-01')",
            (users['alice']['id'],cid,json.dumps([asset['id']]),status,json.dumps({'payload':payload})))
    read=[]
    def extract(self,request):
        read.append(request.kind);return ExtractionResult('contract',{'number':'Д-37','date':'2026-10-30','legal_fields':{**FIELDS,'signer_short_name':'Перечитан И.И.'}})
    monkeypatch.setattr('stock_sync_web.assistant_extraction.CodexDocumentExtractor.extract',extract)
    spec=generate(api,j);assert spec.status_code==200,spec.text
    xml=_spec_xml(api,spec.json())
    assert read==['contract'] and 'Перечитан И.И.' in xml and 'Сохранён И.И.' not in xml
