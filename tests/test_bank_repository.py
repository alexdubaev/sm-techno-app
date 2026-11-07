"""Real SQLite/storage tests of the public bank import workflow; synthetic data only."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
from threading import Barrier

import pytest

from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerConflict, ManagerRepository
from stock_sync_web.bank_assignment_repository import BankAssignmentRepository
from stock_sync_web.bank_repository import BankRepository
from stock_sync_web.vps_integrity import validate_database_storage_pair
from tests.support.bank_statement_fixture import (
    make_statement, SYNTHETIC_OWNER_INN, SYNTHETIC_ACCOUNT, SYNTHETIC_BIK,
    SYNTHETIC_PAYER_INNS, synthetic_inn,
)


@pytest.fixture
def bank(tmp_path):
    db = WebDatabase(tmp_path / 'bank.db')
    aid = db.create_user(username='bank-admin', password='synthetic-password', role='admin')
    uid = db.create_user(username='bank-seller', password='synthetic-password', role='user')
    admin, seller = db.get_user_by_id(aid), db.get_user_by_id(uid)
    with db.transaction() as conn:
        conn.execute("INSERT INTO manager_accounts(id,display_name) VALUES(100,'Archived synthetic')")
        org = conn.execute("INSERT INTO organizations(onec_key,name,inn,updated_at) VALUES('synthetic-bank-org','Synthetic organization',?,'test')", (SYNTHETIC_OWNER_INN,)).lastrowid
    manager = ManagerRepository(db)
    mid = manager.dashboard(seller, None, '2026-11')['account']['id']
    assert mid != uid
    manager.mutate(admin, mid, '2026-11', dict(kind='terms', version=0, plan=0, fixed=0, rate=500, mode='always', reason='Synthetic November terms'))
    assignment = BankAssignmentRepository(db)
    account = assignment.confirm_account(admin, org, SYNTHETIC_OWNER_INN, SYNTHETIC_ACCOUNT, SYNTHETIC_BIK, 'Synthetic account approval')
    clients = []
    for i, inn in enumerate(SYNTHETIC_PAYER_INNS):
        client = db.create_crm_client_card(dict(document_name=f'Synthetic document client {i}', full_name=f'Full client {i}', inn=inn, kpp='000001001'), owner_user_id=uid)
        clients.append(client['id'])
        assignment.set_assignment(admin, client['id'], mid, '2026-11-01', 'Synthetic initial attribution', 0)
    root = tmp_path / 'storage'
    root.mkdir()
    repo = BankRepository(db, root)
    return db, repo, admin, seller, manager, mid, account['id'], clients


def selected(detail):
    return [dict(operationId=o['id'], version=o['version'], fingerprint=o['fingerprint']) for o in detail['operations'] if o['status'] == 'ready']


def test_concurrent_file_only_owners_cannot_register_the_same_bank_account(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    other_inn = synthetic_inn(567)
    with db.transaction() as conn:
        conn.execute('DELETE FROM bank_import_accounts')
        conn.execute("INSERT INTO organizations(onec_key,name,inn,updated_at) VALUES('competing-bank-owner','Other owner',?,'test')", (other_inn,))
    databases = [WebDatabase(db.db_path), WebDatabase(db.db_path)]
    start, unprotected_scans = Barrier(2), Barrier(2)
    for connection_db in databases:
        original_transaction = connection_db.transaction
        @contextmanager
        def scheduled_transaction(*args, _original=original_transaction, **kwargs):
            scanned = False
            class Connection:
                def execute(self, sql, *parameters):
                    nonlocal scanned
                    if 'SELECT * FROM bank_import_accounts WHERE account=' in sql:
                        scanned = True
                    return connection.execute(sql, *parameters)
                def __getattr__(self, name):
                    return getattr(connection, name)
            with _original(*args, **kwargs) as connection:
                yield Connection()
            # Force both competing preflight reads to finish before registration
            # if those reads are outside the account's write transaction.
            if scanned and not kwargs.get('immediate', False):
                unprotected_scans.wait(timeout=10)
        monkeypatch.setattr(connection_db, 'transaction', scheduled_transaction)
    raw_files = [make_statement(), make_statement(edit=lambda sheet: sheet.__setitem__('B2', other_inn))]
    def upload(index):
        bank_repo = BankRepository(databases[index], repo.storage_root)
        start.wait(timeout=10)
        try:
            return bank_repo.upload(admin, None, f'owner-{index}.xlsx', raw_files[index])
        except ManagerConflict as exc:
            return exc
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(upload, range(2)))
    assert sum(isinstance(result, ManagerConflict) for result in results) == 1
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_import_accounts').fetchone()[0] == 1
        assert conn.execute('SELECT COUNT(*) FROM bank_uploads').fetchone()[0] == 1
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0
        assert conn.execute('SELECT COUNT(*) FROM bank_company_sales').fetchone()[0] == 0


def test_control_six_gross_payments_preview_and_durable_idempotency(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    raw = make_statement()
    upload = repo.upload(admin, account, 'synthetic.xlsx', raw)
    assert upload['summary'] == dict(readyCount=6, readyAmount=198906300, companyReadyCount=6,
        companyReadyAmount=198906300, accountedCount=0, reviewCount=0, excludedCount=0)
    assert managers.dashboard(admin, mid, '2026-11')['summary']['salesTotal'] == 0
    items = selected(upload)
    effect = repo.preview(admin, items)
    assert effect['effects'][0]['after']['salesTotal'] == 198906300
    assert effect['effects'][0]['after']['commission'] == 9945315
    assert managers.dashboard(admin, mid, '2026-11')['summary']['count'] == 0
    result = repo.commit(admin, items, 'synthetic-control-key')
    assert result['createdCount'] == 6
    assert repo.commit(admin, items, 'synthetic-control-key') == result
    restarted = BankRepository(WebDatabase(db.db_path), repo.storage_root)
    assert restarted.commit(admin, items, 'synthetic-control-key') == result
    assert restarted.upload(admin, account, 'renamed.xlsx', raw)['id'] == upload['id']
    ledger = managers.dashboard(seller, None, '2026-11')
    assert ledger['summary']['salesTotal'] == 198906300
    assert ledger['summary']['commission'] == ledger['summary']['income'] == 9945315
    assert len(ledger['sales']) == 6 and all(s['source'] == 'bank_statement' for s in ledger['sales'])
    september = next(s for s in ledger['sales'] if s['invoiceNumber'] == '216')
    assert september['date'] == '2026-11-03' and september['invoiceDate'] == '2026-09-09'
    ambiguous = next(s for s in ledger['sales'] if s['invoiceNumber'] == '255')
    assert ambiguous['invoiceDate'] is None
    with pytest.raises(ManagerConflict):
        repo.commit(admin, items, 'new-key-cannot-duplicate')
    with pytest.raises(ManagerConflict):
        repo.commit(admin, items[:-1], 'synthetic-control-key')
    assert len(repo.client(seller, clients[4])['payments']) == 2


def test_partial_commit_and_assignment_refresh_do_not_lose_unknowns(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    with db.transaction() as conn:
        conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (clients[0],))
    upload = repo.upload(admin, account, 'pending.xlsx', make_statement())
    assert upload['operations'][0]['status'] == 'manager_missing'
    assert len(selected(upload)) == 5
    repo.commit(admin, selected(upload), 'partial-key')
    current = repo.set_assignment(admin, clients[0], mid, '2026-11-01', 'Resolve pending payment', 1)
    assert current['pending']['count'] == 1 and current['pending']['amount'] == 36000000
    refreshed = repo.get_upload(admin, upload['id'])
    assert len(refreshed['operations']) == 6 and len(selected(refreshed)) == 1
    assert sum(o['status'] == 'accounted' for o in refreshed['operations']) == 5
    repo.commit(admin, selected(refreshed), 'resolved-key')
    assert managers.dashboard(admin, mid, '2026-11')['summary']['salesTotal'] == 198906300


def test_changed_terms_conflict_and_selected_batch_is_atomic(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    upload = repo.upload(admin, account, 'stale.xlsx', make_statement())
    items = selected(upload)
    managers.mutate(admin, mid, '2026-11', dict(kind='terms', version=1, plan=0, fixed=0, rate=0, mode='always', reason='Explicit zero rate'))
    with pytest.raises(ManagerConflict):
        repo.commit(admin, items, 'stale-key')
    updated = repo.refresh_upload(admin, upload['id'])
    assert all(o['rate'] == 0 for o in updated['operations'])
    broken = selected(updated)
    broken[-1]['version'] += 1
    with pytest.raises(ManagerConflict):
        repo.commit(admin, broken, 'atomic-key')
    assert managers.dashboard(admin, mid, '2026-11')['summary']['count'] == 0
    repo.commit(admin, selected(updated), 'zero-key')
    assert managers.dashboard(admin, mid, '2026-11')['summary']['commission'] == 0


def test_private_bank_file_participates_in_backup_integrity(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    detail=repo.upload(admin,account,'backup.xlsx',make_statement())
    validate_database_storage_pair(db.db_path,repo.storage_root)
    with db.transaction() as conn:
        key=conn.execute('SELECT storage_key FROM bank_uploads WHERE id=?',(detail['id'],)).fetchone()[0]
    path=repo.storage_root/'bank_statements'/key
    path.write_bytes(b'corrupted synthetic file')
    with pytest.raises(RuntimeError,match='bank_uploads'):
        validate_database_storage_pair(db.db_path,repo.storage_root)


def test_overlapping_exports_different_documents_and_ambiguous_occurrences(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first=repo.upload(admin,account,'week.xlsx',make_statement())
    # Period and filename are provenance, not operation identity.
    monthly=repo.upload(admin,account,'month.xlsx',make_statement(edit=lambda s:s.__setitem__('B5','01.11.2026 — 30.11.2026')))
    assert [o['id'] for o in monthly['operations']]==[o['id'] for o in first['operations']]
    changed=repo.upload(admin,account,'purpose-corrected.xlsx',make_statement(edit=lambda s:s.__setitem__('K13',s['K13'].value+' Дополнение.')))
    assert changed['operations'][0]['id']!=first['operations'][0]['id']
    assert changed['operations'][0]['status']=='possible_duplicate'
    # Two genuine, complete payment documents of identical client/date/amount
    # are different bank operations, with no false duplicate by those three fields.
    def equal_amounts(sheet):
        sheet['A14']=sheet['A13'].value
        sheet['D14']=sheet['D13'].value
        sheet['F14']=sheet['F13'].value
        sheet['G7']='unused'
        sheet['D7']='1 669 063,00'
    distinct=repo.upload(admin,account,'distinct-documents.xlsx',make_statement(edit=equal_amounts))
    assert distinct['operations'][1]['documentNumber']=='577'
    assert not any(p['documentNumber']=='2810' for p in distinct['operations'][1]['probableDuplicates'])
    def doubled(sheet):
        for col in range(1,14):
            sheet.cell(14,col,sheet.cell(13,col).value)
        sheet['D7']='1 669 063,00'
    duplicate=repo.upload(admin,account,'indistinguishable.xlsx',make_statement(edit=doubled))
    assert len(duplicate['operations'])==6
    assert duplicate['operations'][0]['id']!=duplicate['operations'][1]['id']
    assert duplicate['operations'][0]['status']==duplicate['operations'][1]['status']=='possible_duplicate'
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_source_rows WHERE upload_id=?',(duplicate['id'],)).fetchone()[0]==6


def test_missing_terms_closed_period_and_manual_classification(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    with db.transaction() as conn:
        conn.execute('UPDATE manager_periods SET plan=NULL,fixed=NULL,rate=NULL,mode=NULL WHERE manager_id=?',(mid,))
    detail=repo.upload(admin,account,'missing-terms.xlsx',make_statement())
    assert all(o['status']=='terms_missing' for o in detail['operations'])
    managers.mutate(admin,mid,'2026-11',dict(kind='terms',version=1,reason='Explicit zero',plan=0,fixed=0,rate=0,mode='always'))
    opened=repo.refresh_upload(admin,detail['id'])
    assert len(selected(opened))==6
    managers.mutate(admin,mid,'2026-11',dict(kind='close',version=2,reason='Synthetic close'))
    with pytest.raises(ManagerConflict):
        repo.commit(admin,selected(opened),'closed-stale-key')
    closed=repo.refresh_upload(admin,detail['id'])
    assert all(o['status']=='month_closed' for o in closed['operations'])
    managers.mutate(admin,mid,'2026-11',dict(kind='reopen',version=3,reason='Synthetic reopen'))
    assert len(selected(repo.refresh_upload(admin,detail['id'])))==6


@pytest.mark.parametrize('purpose,expected',[
    ('Перевод собственных средств','excluded'),
    ('Получение займа по договору','excluded'),
    ('Кредит по договору','excluded'),
    ('Возврат от поставщика за товар','excluded'),
    ('Внесение средств на счёт','excluded'),
    ('Непонятное поступление','purpose_review'),
    ('Оплата за третье лицо по счету за товары','purpose_review'),
    ('Оплата за товары по договору займа','purpose_review'),
])
def test_purpose_rules_never_turn_every_credit_into_a_sale(bank,purpose,expected):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'purpose.xlsx',make_statement(edit=lambda s:s.__setitem__('K13',purpose)))
    operation=detail['operations'][0]
    assert operation['status']==expected
    with pytest.raises(ValueError):
        repo.update_operation(admin,operation['id'],dict(version=operation['version'],classification='sale',reason=''))
    changed=repo.update_operation(admin,operation['id'],dict(version=operation['version'],classification='sale',reason='Проверена оплата покупателя вручную'))
    assert changed['status']=='ready' and changed['purpose']==purpose
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_decision_audit WHERE operation_id=?',(operation['id'],)).fetchone()[0]==1


def test_old_manual_sale_one_to_one_link_preserves_source_fields_and_total(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    saved=managers.mutate(admin,mid,'2026-11',dict(kind='sale',version=1,date='2026-11-06',client='Synthetic document client 0',amount=36000000,rate=750,invoiceNumber='256',reason='Existing payment sale'))
    sale_id=saved['sales'][0]['id']
    with db.transaction() as conn:
        original=dict(conn.execute('SELECT * FROM manager_sales WHERE id=?',(sale_id,)).fetchone())
    detail=repo.upload(admin,account,'old-sale.xlsx',make_statement())
    operation=detail['operations'][0]
    assert operation['status']=='possible_duplicate'
    linked=repo.update_operation(admin,operation['id'],dict(version=operation['version'],duplicateAction='link',linkSaleId=sale_id,reason='Сверено с существующей продажей'))
    assert linked['status']=='ready'
    item=dict(operationId=linked['id'],version=linked['version'],fingerprint=linked['fingerprint'])
    effect=repo.preview(admin,[item])
    assert effect['linkedCount']==1 and effect['effects'][0]['after']==effect['effects'][0]['before']
    result=repo.commit(admin,[item],'legacy-link-key')
    assert result['createdCount']==0 and result['linkedCount']==1
    with db.transaction() as conn:
        assert dict(conn.execute('SELECT * FROM manager_sales WHERE id=?',(sale_id,)).fetchone())==original
        assert conn.execute("SELECT COUNT(*) FROM manager_audit WHERE kind='bank_link'").fetchone()[0]==1
    ledger=managers.dashboard(admin,mid,'2026-11')
    assert ledger['summary']['salesTotal']==36000000 and ledger['sales'][0]['source']=='manual'
    managers.mutate(admin,mid,'2026-11',dict(kind='cancel',saleId=sale_id,version=ledger['version'],reason='Synthetic cancellation'))
    refreshed=repo.refresh_upload(admin,detail['id'])
    assert refreshed['operations'][0]['status']=='accounted' and refreshed['operations'][0]['cancelled']
    with pytest.raises(ManagerConflict):
        repo.commit(admin,[dict(operationId=refreshed['operations'][0]['id'],version=refreshed['operations'][0]['version'],fingerprint=refreshed['operations'][0]['fingerprint'])],'cannot-resurrect-key')


def test_two_administrators_compete_and_same_operation_is_posted_once(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    admin2id=db.create_user(username='second-bank-admin',password='synthetic-password',role='admin')
    admin2=db.get_user_by_id(admin2id)
    detail=repo.upload(admin,account,'race.xlsx',make_statement())
    items=selected(detail)
    def commit(actor,key):
        try:
            return repo.commit(actor,items,key)['createdCount']
        except ManagerConflict:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda pair:commit(*pair),[(admin,'race-first-key'),(admin2,'race-second-key')]))
    assert sorted(map(str,outcomes))==['6','conflict']
    assert managers.dashboard(admin,mid,'2026-11')['summary']['count']==6


def test_mid_batch_domain_failure_rolls_back_sales_links_audit_and_key(bank,monkeypatch):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'rollback.xlsx',make_statement())
    items=selected(detail)
    original=ManagerRepository._mutate_in_transaction
    calls=0
    def fail_last(self,*args,**kwargs):
        nonlocal calls
        calls+=1
        if calls==6:
            raise ValueError('Injected storage/domain failure on last selected payment')
        return original(self,*args,**kwargs)
    with monkeypatch.context() as patch:
        patch.setattr(ManagerRepository,'_mutate_in_transaction',fail_last)
        with pytest.raises(ValueError,match='Injected'):
            repo.commit(admin,items,'atomic-failure-key')
    assert calls==6
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0]==0
        assert conn.execute('SELECT COUNT(*) FROM bank_sale_links').fetchone()[0]==0
        assert conn.execute('SELECT COUNT(*) FROM bank_commits').fetchone()[0]==0
        assert conn.execute("SELECT COUNT(*) FROM manager_audit WHERE kind='sale'").fetchone()[0]==0
        assert conn.execute('SELECT version FROM manager_periods WHERE manager_id=?',(mid,)).fetchone()[0]==1
    assert repo.commit(admin,items,'atomic-failure-key')['createdCount']==6


def test_incomplete_payer_identity_is_reviewed_across_exports_without_guessing(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    original=repo.upload(admin,account,'complete.xlsx',make_statement())
    incomplete=repo.upload(admin,account,'missing-inn.xlsx',make_statement(edit=lambda s:s.__setitem__('F13','')))
    operation=incomplete['operations'][0]
    assert operation['id']!=original['operations'][0]['id'] and operation['inn']==''
    matched=repo.update_operation(admin,operation['id'],dict(version=operation['version'],clientId=clients[0],reason='Реквизиты плательщика сверены вручную'))
    assert matched['status']=='possible_duplicate'
    assert matched['probableDuplicates'][0]['id']==original['operations'][0]['id']
    same_incomplete=repo.upload(admin,account,'missing-inn-again.xlsx',make_statement(edit=lambda s:(s.__setitem__('F13',''),s.__setitem__('B5','01.11.2026 — 30.11.2026'))))
    assert same_incomplete['operations'][0]['id']!=operation['id']
    assert len(same_incomplete['operations'])==6


def test_unexplained_credit_refund_is_not_automatically_a_new_sale(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'refund.xlsx',make_statement(edit=lambda s:s.__setitem__('K13','Возврат оплаты за товары по счёту №256')))
    assert detail['operations'][0]['status']=='purpose_review'


def test_our_own_inn_never_becomes_a_buyer_sale_by_purpose_alone(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    client=db.create_crm_client_card(dict(document_name='Our synthetic organization',inn=SYNTHETIC_OWNER_INN,kpp='000001001'),owner_user_id=seller['id'])
    repo.set_assignment(admin,client['id'],mid,'2026-11-01','Synthetic self transfer check',0)
    detail=repo.upload(admin,account,'self.xlsx',make_statement(edit=lambda s:s.__setitem__('F13',SYNTHETIC_OWNER_INN)))
    assert detail['operations'][0]['status']=='excluded'


def test_buyer_refund_is_persisted_but_cannot_be_a_negative_sale(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    def refund(sheet):
        sheet['C13']=360000
        sheet['D13']=0
        sheet['B7']='360 000,00'
        sheet['D7']='1 629 063,00'
        sheet['K13']='Возврат покупателю оплаты за товары'
    detail=repo.upload(admin,account,'debit.xlsx',make_statement(edit=refund))
    operation=detail['operations'][0]
    assert detail['reconciliation']['valid']
    assert operation['direction']=='debit' and operation['classification']=='return' and operation['status']=='purpose_review'
    override=repo.update_operation(admin,operation['id'],dict(version=operation['version'],classification='sale',reason='Manual review cannot create negative sale'))
    assert override['status']=='purpose_review'
    repo.commit(admin,selected(detail),'five-incoming-key')
    assert managers.dashboard(admin,mid,'2026-11')['summary']['salesTotal']==162906300


@pytest.mark.parametrize('change', ['archive','inactive','assignment','closed','client_name'])
def test_state_changed_after_preview_requires_conflict(bank,change):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'state-drift.xlsx',make_statement())
    items=selected(detail)
    if change=='assignment':
        repo.set_assignment(admin,clients[0],None,'2026-11-01','Remove attribution after preview',1)
    elif change=='closed':
        managers.mutate(admin,mid,'2026-11',dict(kind='close',version=1,reason='Close after preview'))
    else:
        with db.transaction() as conn:
            if change=='archive':
                conn.execute("UPDATE crm_clients SET crm_archived_at='synthetic-archive' WHERE id=?",(clients[0],))
            elif change=='inactive':
                conn.execute('UPDATE users SET is_active=0 WHERE id=?',(seller['id'],))
            elif change=='client_name':
                conn.execute("UPDATE crm_clients SET document_name='New synthetic document name' WHERE id=?",(clients[0],))
    with pytest.raises(ManagerConflict):
        repo.commit(admin,items,'changed-state-key')
    assert managers.dashboard(admin,mid,'2026-11')['summary']['count']==0


def test_invalid_raw_source_is_retained_but_turnover_errors_block_entire_file(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'bad-row.xlsx',make_statement(edit=lambda s:s.__setitem__('A13','=TODAY()')))
    assert len(detail['operations'])==6 and detail['status']=='parsed'
    assert detail['operations'][0]['id']<0 and detail['operations'][0]['status']=='data_error'
    assert detail['operations'][0]['errors']
    assert len(selected(detail))==5
    assert repo.commit(admin,selected(detail),'five-valid-source-rows')['createdCount']==5
    after=repo.get_upload(admin,detail['id'])
    assert len(after['operations'])==6 and after['operations'][0]['id']<0
    assert after['summary']['accountedCount']==5 and after['summary']['reviewCount']==1
    raw_total=repo.upload(admin,account,'bad-total.xlsx',make_statement(edit=lambda s:s.__setitem__('D7','1 000,00')))
    assert raw_total['reconciliation']['credit']['difference']==198806300
    assert raw_total['status']=='blocked' and not selected(raw_total)


def test_bad_export_never_offers_shared_valid_prior_operations_for_posting(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    original=repo.upload(admin,account,'valid.xlsx',make_statement())
    bad=repo.upload(admin,account,'bad-turnover.xlsx',make_statement(edit=lambda s:s.__setitem__('D7','1 000,00')))
    assert bad['status']=='blocked' and not selected(bad)
    assert all(o['status']=='data_error' for o in bad['operations'])
    # A bad later export must not revoke an independently validated original.
    prior=repo.refresh_upload(admin,original['id'])
    assert len(selected(prior))==6
    assert repo.commit(admin,selected(prior),'valid-provenance-key')['createdCount']==6


@pytest.mark.parametrize('identity',['','1234567890','0000000000'])
def test_unknown_invalid_inn_requires_explicit_admin_mapping_with_reason(bank,identity):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'invalid-inn.xlsx',make_statement(edit=lambda s:s.__setitem__('F13',identity)))
    operation=detail['operations'][0]
    assert operation['status']=='client_not_found'
    with pytest.raises(PermissionError):
        repo.update_operation(seller,operation['id'],dict(version=operation['version'],clientId=clients[0],reason='Forbidden'))
    with pytest.raises(ValueError):
        repo.update_operation(admin,operation['id'],dict(version=operation['version'],clientId=clients[0],reason=''))
    corrected=repo.update_operation(admin,operation['id'],dict(version=operation['version'],clientId=clients[0],reason='Payer and actual customer verified by administrator'))
    assert corrected['status']=='ready' and corrected['inn']==identity
    assert corrected['clientId']==clients[0] and corrected['warnings']


def test_kpp_disambiguation_and_same_identity_multiple_cards_never_choose_first(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    other=db.create_crm_client_card(dict(document_name='Other synthetic branch',inn=SYNTHETIC_PAYER_INNS[0],kpp='000002001'),owner_user_id=seller['id'])
    detail=repo.upload(admin,account,'branches.xlsx',make_statement())
    assert detail['operations'][0]['clientId']==clients[0]
    with db.transaction() as conn:
        conn.execute("UPDATE crm_clients SET kpp='000001001' WHERE id=?",(other['id'],))
    refreshed=repo.refresh_upload(admin,detail['id'])
    assert refreshed['operations'][0]['status']=='multiple_clients'
    chosen=repo.update_operation(admin,refreshed['operations'][0]['id'],dict(version=refreshed['operations'][0]['version'],clientId=clients[0],reason='Specific CRM card verified'))
    assert chosen['status']=='ready' and chosen['clientId']==clients[0]


def test_backdated_transfer_never_moves_already_posted_sales(bank):
    db,repo,admin,seller,managers,mid,account,clients=bank
    detail=repo.upload(admin,account,'before-transfer.xlsx',make_statement())
    repo.commit(admin,selected(detail),'before-transfer-key')
    uid=db.create_user(username='replacement-bank-seller',password='synthetic-password')
    second=managers.dashboard(db.get_user_by_id(uid),None,'2026-11')['account']['id']
    managers.mutate(admin,second,'2026-11',dict(kind='terms',version=0,plan=0,fixed=0,rate=500,mode='always',reason='Synthetic replacement terms'))
    repo.set_assignment(admin,clients[0],second,'2026-11-05','Backdated transfer after original posting',1)
    after=repo.refresh_upload(admin,detail['id'])
    assert after['operations'][0]['status']=='accounted' and after['operations'][0]['managerId']==mid
    future=repo.upload(admin,account,'after-transfer.xlsx',make_statement(edit=lambda s:s.__setitem__('B13','new-document-after-transfer')))
    assert future['operations'][0]['managerId']==second and future['operations'][0]['status']=='ready'
    repo.commit(admin,selected(future),'after-transfer-key')
    assert managers.dashboard(admin,mid,'2026-11')['summary']['salesTotal']==198906300
    assert managers.dashboard(admin,second,'2026-11')['summary']['salesTotal']==36000000
