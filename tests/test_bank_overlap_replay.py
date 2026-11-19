"""Overlapping exports retain exact payments and all synthetic source rows."""
import pytest

from stock_sync_web.manager_repository import ManagerConflict
from tests.test_bank_repository import bank, selected
from tests.support.bank_statement_fixture import make_statement


def selection(op):
    return dict(operationId=op['id'], version=op['version'], fingerprint=op['fingerprint'])


def statement(*, monthly=False, extra=False):
    def edit(sheet):
        sheet['G13'] = ''  # A bank may omit payer KPP while every other identifier is intact.
        if monthly:
            sheet['B5'] = '01.11.2026 — 30.11.2026'
        if extra:
            row = [cell.value for cell in sheet[13]]
            row[1], row[3] = 'NEW-1001', 123
            sheet.append(row)
            sheet['D7'] = '1 989 186,00'
    return make_statement(edit=edit)


def legacy_pair(bank, monkeypatch, *, accounted=False, cancelled=False):
    db, repo, admin, seller, managers, mid, account, clients = bank
    identity = repo._complete_identity
    with monkeypatch.context() as old_code:
        old_code.setattr(repo, '_complete_identity', lambda norm: bool(norm.get('kpp')) and identity(norm))
        first = repo.upload(admin, account, 'legacy-week.xlsx', statement())
        if accounted:
            with db.transaction() as conn:
                conn.execute('DELETE FROM crm_sales_assignments WHERE client_id=?', (clients[0],))
            op = repo.refresh_upload(admin, first['id'])['operations'][0]
            repo.commit(admin, [selection(op)], 'legacy-company-before-overlap')
            if cancelled:
                op = repo.refresh_upload(admin, first['id'])['operations'][0]
                repo.cancel_company_sale(admin, op['id'], dict(version=op['version'], reason='Synthetic cancellation'))
        second = repo.upload(admin, account, 'legacy-month.xlsx', statement(monthly=True))
    assert first['operations'][0]['id'] != second['operations'][0]['id']
    return first, second


def test_blank_kpp_overlap_reuses_six_payments_and_only_adds_one_new_sale(bank):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first = repo.upload(admin, account, 'week.xlsx', statement())
    repo.commit(admin, selected(first), 'six-before-overlap')
    second_raw = statement(monthly=True, extra=True)
    second = repo.upload(admin, account, 'month-plus-new.xlsx', second_raw)
    assert [o['id'] for o in second['operations'][:6]] == [o['id'] for o in first['operations']]
    assert second['summary']['accountedCount'] == 6
    assert len(selected(second)) == 1
    assert repo.commit(admin, selected(second), 'only-new-payment')['createdCount'] == 1
    assert repo.upload(admin, account, 'renamed.xlsx', second_raw)['summary']['accountedCount'] == 7
    assert managers.dashboard(admin, mid, '2026-11')['summary']['salesTotal'] == 198918600
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_operations').fetchone()[0] == 7
        assert conn.execute('SELECT COUNT(*) FROM bank_source_rows').fetchone()[0] == 13


def test_refresh_repairs_legacy_exact_overlap_preserving_manual_choice_and_sources(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first, second = legacy_pair(bank, monkeypatch)
    original_id, alias_id = first['operations'][0]['id'], second['operations'][0]['id']
    op = repo.get_upload(admin, first['id'])['operations'][0]
    repo.update_operation(admin, original_id, dict(version=op['version'], classification='sale',
        clientId=clients[0], invoiceNumber='MANUAL-INVOICE', reason='Synthetic manual choice'))
    with db.transaction() as conn:
        originals = [tuple(r) for r in conn.execute('SELECT id,raw_json,normalized_json FROM bank_source_rows ORDER BY id')]
    repaired = repo.refresh_upload(admin, second['id'])['operations'][0]
    assert repaired['id'] == original_id and repaired['status'] == 'ready'
    assert repaired['invoiceNumber'] == 'MANUAL-INVOICE'
    assert repo.client(admin, clients[0])['pending']['count'] == 1
    assert len(repo.client(admin, clients[0])['payments']) == 1
    with db.transaction() as conn:
        assert [tuple(r) for r in conn.execute('SELECT id,raw_json,normalized_json FROM bank_source_rows ORDER BY id')] == originals
        assert conn.execute('SELECT COUNT(*) FROM bank_operations').fetchone()[0] == 7
        assert conn.execute('SELECT COUNT(*) FROM bank_source_rows WHERE operation_id=?', (alias_id,)).fetchone()[0] == 0
        assert conn.execute('SELECT COUNT(*) FROM bank_decision_audit WHERE operation_id=?', (alias_id,)).fetchone()[0] == 1
    alias = repo.update_operation(admin, alias_id, dict(version=_version(db, alias_id),
        classification='sale', clientId=clients[0], reason='Stale direct alias request'))
    assert alias['status'] == 'data_error' and not alias['companyCanConfirm']
    with pytest.raises(ManagerConflict):
        repo.commit(admin, [selection(alias)], 'alias-cannot-post')
    assert repo.commit(admin, [selection(repaired)], 'repaired-payment-once')['createdCount'] == 1
    again = repo.refresh_upload(admin, second['id'])['operations'][0]
    assert again['id'] == original_id and again['status'] == 'accounted'


def _version(db, operation_id):
    with db.transaction() as conn:
        return conn.execute('SELECT version FROM bank_decisions WHERE operation_id=?', (operation_id,)).fetchone()[0]


@pytest.mark.parametrize('cancelled', [False, True])
def test_legacy_overlap_keeps_the_accounted_or_cancelled_operation(bank, monkeypatch, cancelled):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first, second = legacy_pair(bank, monkeypatch, accounted=True, cancelled=cancelled)
    repaired = repo.refresh_upload(admin, second['id'])['operations'][0]
    assert repaired['id'] == first['operations'][0]['id']
    assert repaired['companyAccounted'] is not cancelled
    assert repaired['companyCancelled'] is cancelled
    assert not repaired['companyCanConfirm']
    with pytest.raises(ManagerConflict):
        repo.commit(admin, [selection(repaired)], 'old-payment-new-key')
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM bank_company_sales').fetchone()[0] == 1
        assert conn.execute('SELECT COUNT(*) FROM manager_sales').fetchone()[0] == 0


@pytest.mark.parametrize('decision', ['conflicting-clients', 'explicit-distinct'])
def test_legacy_overlap_with_incompatible_manual_decisions_remains_for_review(bank, monkeypatch, decision):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first, second = legacy_pair(bank, monkeypatch)
    for index, upload in enumerate((first, second)):
        op = repo.get_upload(admin, upload['id'])['operations'][0]
        payload = dict(version=op['version'], reason='Synthetic manual decision')
        if decision == 'conflicting-clients':
            payload['clientId'] = clients[index]
        else:
            payload['duplicateAction'] = 'new'
        repo.update_operation(admin, op['id'], payload)
    repaired = repo.refresh_upload(admin, second['id'])['operations'][0]
    assert repaired['id'] == second['operations'][0]['id']
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(DISTINCT operation_id) FROM bank_source_rows WHERE row_number=13').fetchone()[0] == 2


def test_legacy_overlap_repair_rolls_back_all_source_links_on_failure(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first, second = legacy_pair(bank, monkeypatch)
    with db.transaction() as conn:
        before = [tuple(r) for r in conn.execute('SELECT id,operation_id FROM bank_source_rows ORDER BY id')]
    with monkeypatch.context() as failure:
        failure.setattr(repo, '_refresh', lambda *args: (_ for _ in ()).throw(RuntimeError('Synthetic refresh failure')))
        with pytest.raises(RuntimeError, match='Synthetic refresh failure'):
            repo.refresh_upload(admin, second['id'])
    with db.transaction() as conn:
        assert [tuple(r) for r in conn.execute('SELECT id,operation_id FROM bank_source_rows ORDER BY id')] == before
        assert conn.execute('SELECT COUNT(*) FROM bank_decision_audit').fetchone()[0] == 0
    assert repo.refresh_upload(admin, second['id'])['operations'][0]['id'] == first['operations'][0]['id']


def test_legacy_manager_sale_without_completed_bank_link_is_not_reidentified(bank, monkeypatch):
    db, repo, admin, seller, managers, mid, account, clients = bank
    first, second = legacy_pair(bank, monkeypatch)
    alias = second['operations'][0]
    with db.transaction() as conn:
        conn.execute('''INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,source,
            external_id,bank_operation_id,crm_client_id,created_by,updated_at)
            VALUES(?,'2026-11',?,'Synthetic legacy bank sale',?,500,'bank_statement',?,?,?,?,'synthetic')''',
            (mid, alias['date'], alias['amount'], f"bank-{alias['id']}", alias['id'], clients[0], admin['id']))
    refreshed = repo.refresh_upload(admin, second['id'])['operations'][0]
    assert refreshed['id'] == alias['id'] and refreshed['status'] == 'possible_duplicate'
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(DISTINCT operation_id) FROM bank_source_rows WHERE row_number=13').fetchone()[0] == 2
        assert conn.execute('SELECT bank_operation_id FROM manager_sales').fetchone()[0] == alias['id']
