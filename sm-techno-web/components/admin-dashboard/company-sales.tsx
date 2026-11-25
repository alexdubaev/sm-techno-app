'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogBackdrop, DialogClose, DialogPopup, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { assignCompanySaleManager, fetchCachedManagers, fetchCompanySale, fetchCompanySales, getApiCacheGeneration, previewCompanySaleManager, searchBankClients, subscribeApiCacheInvalidation } from '@/lib/api';
import { clearSalesSnapshot, isSalesSnapshotUsable, readSalesSnapshot, writeSalesSnapshot } from '@/lib/sales-memory';
import type { BankClientChoice } from '@/lib/bank-types';
import type { CompanySaleDetail, CompanySaleManagerPreview, CompanySaleSummary } from '@/lib/company-sales-types';
import type { PeriodKind } from '@/lib/admin-dashboard-types';
import type { ManagerChoice } from '@/lib/manager-types';
import { dateLabel, errorMessage, money, percent } from '@/components/manager/format';
import { useAuth } from '@/components/auth-provider';
import styles from './company-sales.module.css';

type Props = { period: PeriodKind; date: string };

export function CompanySales({ period, date }: Props) {
  const { user, isAdmin } = useAuth();
  const scope = `${user.id}:${isAdmin ? 'admin' : 'user'}`;
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [listError, setListError] = useState('');
  const [listErrorKey, setListErrorKey] = useState('');
  const [selected, setSelected] = useState<CompanySaleDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [managers, setManagers] = useState<ManagerChoice[]>([]);
  const [managerId, setManagerId] = useState('');
  const [crmQuery, setCrmQuery] = useState('');
  const [crmChoices, setCrmChoices] = useState<BankClientChoice[]>([]);
  const [crmClientId, setCrmClientId] = useState('');
  const [crmSearchError, setCrmSearchError] = useState('');
  const [proposal, setProposal] = useState<CompanySaleManagerPreview | null>(null);
  const [proposalError, setProposalError] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [managerReload, setManagerReload] = useState(0);
  const saveKey = useRef('');
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const listSequence = useRef(0);
  const listKey = companySalesKey(scope, period, date, query, page, unassigned);
  const initialList = readSalesSnapshot<CompanySalesPage>(listKey)?.data;
  const [items, setItems] = useState<CompanySaleSummary[]>(initialList?.items ?? []);
  const [itemsKey, setItemsKey] = useState(initialList ? listKey : '');
  const [itemsSavedAt,setItemsSavedAt] = useState(() => readSalesSnapshot<CompanySalesPage>(listKey)?.savedAt ?? null);
  const visibleCachedList = readSalesSnapshot<CompanySalesPage>(listKey)?.data;
  const liveItemsUsable = itemsKey === listKey && itemsSavedAt !== null && (listErrorKey !== listKey || isSalesSnapshotUsable(itemsSavedAt));
  const visibleItems = liveItemsUsable ? items : visibleCachedList?.items ?? [];
  const visiblePages = liveItemsUsable ? pages : visibleCachedList?.pages ?? 1;
  const visibleTotal = liveItemsUsable ? total : visibleCachedList?.total ?? 0;
  const isLoadingList = !liveItemsUsable && !visibleCachedList && listErrorKey !== listKey;
  useEffect(() => subscribeApiCacheInvalidation(reason => {
    if (reason === 'session') {
      setItems([]); setItemsKey(''); setItemsSavedAt(null); setPages(1); setTotal(0); setListError(''); setListErrorKey('');
      setManagers([]); setManagerReload(value => value + 1); setVersion(value => value + 1);
      return;
    }
  }), []);

  useEffect(() => {
    let active = true;
    const current = ++listSequence.current;
    const generation = getApiCacheGeneration();
    fetchCompanySales({ period, date, query, page, unassigned })
      .then(result => {
        if (active && current === listSequence.current) {
          if (generation !== getApiCacheGeneration()) { setVersion(value => value + 1); return; }
          writeSalesSnapshot(listKey,result,generation); setItems(result.items); setItemsKey(listKey); setItemsSavedAt(Date.now()); setPages(Math.max(1, result.pages)); setTotal(result.total); setListError(''); setListErrorKey('');
        }
      })
      .catch(error => { if (active && current === listSequence.current) { if (error?.status === 401 || error?.status === 403) { clearSalesSnapshot(listKey); setItems([]); setItemsKey(listKey); setItemsSavedAt(null); setPages(1); setTotal(0); } setListError(errorMessage(error)); setListErrorKey(listKey); } });
    return () => { active = false; listSequence.current += 1; };
  }, [period, date, query, page, unassigned, version, listKey]);
  useEffect(() => { fetchCachedManagers().then(setManagers).catch(() => setManagers([])); }, [scope,managerReload]);
  useEffect(() => {
    const changed = () => setVersion(value => value + 1);
    window.addEventListener('smtechno-bank-changed', changed);
    return () => window.removeEventListener('smtechno-bank-changed', changed);
  }, []);

  const invalidateProposal = () => {
    sequence.current += 1;
    setProposal(null); setProposalLoading(false); setProposalError(''); saveKey.current = '';
  };
  const close = () => { detailSequence.current += 1; invalidateProposal(); setSelected(null); setManagerId(''); setCrmClientId(''); setSaveError(''); setDetailError(''); };
  const open = async (row: CompanySaleSummary) => {
    detailSequence.current += 1;
    const current = detailSequence.current;
    invalidateProposal(); setSelected(null); setManagerId(''); setCrmClientId(''); setCrmQuery(''); setCrmChoices([]); setSaveError(''); setMessage(''); setDetailError('');
    try {
      const result = await fetchCompanySale(row.kind, row.id);
      if (current === detailSequence.current) { setSelected(result); setCrmQuery(result.clientName); }
    } catch (error) {
      if (current === detailSequence.current) { setDetailError(errorMessage(error)); setSelected({ ...row, purpose: null, documentNumber: null, issue: null, canAssignManager: false }); setCrmQuery(row.clientName); }
    }
  };
  const reloadDetail = async () => {
    if (!selected) return;
    const current = ++detailSequence.current;
    setDetailError('');
    try {
      const result = await fetchCompanySale(selected.kind, selected.id);
      if (current === detailSequence.current) { setSelected(result); setCrmQuery(result.clientName); }
    } catch (error) { if (current === detailSequence.current) setDetailError(errorMessage(error)); }
  };

  const makeProposal = async (id: number, sale: CompanySaleDetail, selectedClientId?: number) => {
    const current = ++sequence.current;
    setProposal(null); setProposalError(''); setSaveError(''); setProposalLoading(true); saveKey.current = '';
    try {
      const result = await previewCompanySaleManager(sale.kind, sale.id, { managerId: id, ...(selectedClientId ? { clientId: selectedClientId } : {}) });
      if (current === sequence.current) { setProposal(result); saveKey.current = crypto.randomUUID(); }
    } catch (error) {
      if (current === sequence.current) setProposalError((error as { status?: number })?.status === 409 ? 'Данные изменились: обновите детали и расчёт, затем выберите менеджера снова.' : errorMessage(error));
    } finally { if (current === sequence.current) setProposalLoading(false); }
  };
  const chooseManager = (value: string) => {
    setMessage('');
    invalidateProposal(); setManagerId(value); setSaveError('');
    if (value && selected && (selected.crmClientId !== null || selected.kind === 'bank' || crmClientId)) void makeProposal(Number(value), selected, crmClientId ? Number(crmClientId) : undefined);
  };
  const findCrmClient = async () => {
    setCrmSearchError(''); setCrmChoices([]);
    try { const result = await searchBankClients(crmQuery); setCrmChoices(result.items); }
    catch (error) { setCrmSearchError(errorMessage(error)); }
  };
  const chooseCrmClient = (value: string) => {
    setMessage('');
    invalidateProposal(); setCrmClientId(value);
    if (value && managerId && selected) void makeProposal(Number(managerId), selected, Number(value));
  };
  const refreshProposal = async () => {
    if (!selected) return;
    try { setSelected(await fetchCompanySale(selected.kind, selected.id)); setProposalError(''); setManagerId(''); setProposal(null); }
    catch (error) { setProposalError(errorMessage(error)); }
  };
  const save = async () => {
    if (!selected || !proposal?.canSave || !saveKey.current) return;
    setSaving(true); setSaveError('');
    try {
      const updated = await assignCompanySaleManager(selected.kind, selected.id, { managerId: proposal.managerId, ...(crmClientId ? { clientId: Number(crmClientId) } : {}), proposalToken: proposal.token, idempotencyKey: saveKey.current });
      setSelected(updated); setMessage('Менеджер назначен, клиент закреплён.'); setProposal(null); setManagerId(''); saveKey.current = '';
      window.dispatchEvent(new CustomEvent('smtechno-bank-changed'));
      setVersion(value => value + 1);
    } catch (error) {
      setSaveError((error as { status?: number })?.status === 409 ? 'Данные изменились: обновите детали и расчёт перед сохранением.' : errorMessage(error));
    } finally { setSaving(false); }
  };

  const activeManagers = managers.filter(manager => manager.active && !manager.archived);
  return <section className={`${styles.panel} app-surface`} aria-labelledby="company-sales-title">
    <header className={styles.heading}><div><h2 id="company-sales-title">Продажи</h2><p>Все оплаты компании. Назначьте или смените менеджера в карточке продажи.</p></div><strong>{visibleTotal.toLocaleString('ru-RU')}</strong></header>
    <div className={styles.filters}>
      <label className={styles.search}>Поиск продаж<input aria-label="Поиск продаж" value={query} placeholder="Клиент, счёт или платёж" onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
      <button type="button" data-app-action="secondary" aria-pressed={unassigned} onClick={() => { setUnassigned(value => !value); setPage(1); }}>Без менеджера</button>
    </div>
    {listErrorKey === listKey && listError && <p className={styles.error} role="alert"><AlertCircle size={18}/>{listError} <button type="button" onClick={() => setVersion(value => value + 1)}>Повторить</button></p>}
    {isLoadingList ? <p className={styles.muted}>Загружаем продажи…</p> : visibleItems.length ? <div className={styles.list}>
      {visibleItems.map(row => <button type="button" className={styles.sale} key={`${row.kind}-${row.id}`} onClick={() => void open(row)} aria-label={`${dateLabel(row.date)} · ${row.clientName} · ${money(row.amount)}`}>
        <span><strong>{row.clientName}</strong><small>{dateLabel(row.date)}{row.invoiceNumber ? ` · счёт № ${row.invoiceNumber}` : ''}</small></span>
        <span className={styles.amount}>{money(row.amount)}<small>{row.managerName ?? 'Менеджер не назначен'}</small></span>
      </button>)}
    </div> : <p className={styles.muted}>Продаж за этот период не найдено.</p>}
    <nav className={styles.pagination} aria-label="Страницы продаж"><button type="button" aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18}/></button><span>Страница {page} из {visiblePages}</span><button type="button" aria-label="Следующая страница" disabled={page >= visiblePages || isLoadingList} onClick={() => setPage(value => value + 1)}><ChevronRight size={18}/></button></nav>

    <Dialog open={selected !== null} onOpenChange={openState => { if (!openState) close(); }}>
      {selected && <DialogPortal><DialogBackdrop className={styles.backdrop}/><DialogPopup className={styles.popup}>
        <div className={styles.dialogHeading}><DialogTitle>Продажа</DialogTitle><DialogClose className={styles.close}>Закрыть</DialogClose></div>
        {message && <output className={styles.success}>{message}</output>}
        {detailError && <p className={styles.error} role="alert">Не удалось загрузить карточку продажи: {detailError} <button type="button" onClick={() => void reloadDetail()}>Повторить</button></p>}
        <dl className={styles.details}><div><dt>Клиент</dt><dd>{selected.clientName}</dd></div><div><dt>Дата оплаты</dt><dd>{dateLabel(selected.date)}</dd></div><div><dt>Сумма с НДС</dt><dd>{money(selected.amount)}</dd></div><div><dt>Счёт</dt><dd>{selected.invoiceNumber ? `№ ${selected.invoiceNumber}${selected.invoiceDate ? ` от ${dateLabel(selected.invoiceDate)}` : ''}` : 'Не указан'}</dd></div><div><dt>Менеджер</dt><dd>{selected.managerName ?? 'Не назначен'}</dd></div></dl>
        {selected.rate !== null && selected.managerId !== null && <p className={styles.muted}>Зафиксированная ставка этой продажи: {percent(selected.rate)}</p>}
        {selected.documentNumber && <p className={styles.muted}>Платёжный документ № {selected.documentNumber}</p>}
        {selected.purpose && <details className={styles.purpose}><summary>Назначение платежа</summary><p>{selected.purpose}</p></details>}
        {selected.issue && <p className={styles.warning}>{selected.issue}</p>}
        {selected.managerId && <p className={styles.current}>Продажа уже зачислена сотруднику. Смена менеджера изменит распределение начисления.</p>}
        {selected.crmClientId === null && <p className={styles.warning}>Карточка CRM не связана с этой продажей. Выберите клиента, чтобы закрепить его за назначенным менеджером.</p>}
        {selected.canAssignManager && <div className={styles.assignment}>
          {selected.crmClientId === null && <>
            <label htmlFor="company-sale-crm-query">Клиент CRM</label>
            <div className={styles.clientSearch}><input id="company-sale-crm-query" value={crmQuery} onChange={event => setCrmQuery(event.target.value)} placeholder="Название или ИНН"/><button type="button" onClick={() => void findCrmClient()}>Найти</button></div>
            {crmSearchError && <p className={styles.error} role="alert">{crmSearchError}</p>}
            {crmChoices.length > 0 && <select aria-label="Клиент CRM" value={crmClientId} onChange={event => chooseCrmClient(event.target.value)}><option value="">Выберите клиента</option>{crmChoices.map(client => <option key={client.id} value={client.id}>{client.name}{client.inn ? ` · ${client.inn}` : ''}</option>)}</select>}
          </>}
          <label htmlFor="company-sale-manager">Менеджер</label>
          <select id="company-sale-manager" value={managerId} disabled={saving} onChange={event => chooseManager(event.target.value)}><option value="">Выберите менеджера</option>{activeManagers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select>
          {proposalLoading && <p className={styles.muted}>Рассчитываем изменения…</p>}
          {proposalError && <p className={styles.error} role="alert">{proposalError} <button type="button" onClick={() => void refreshProposal()}>Обновить расчёт</button></p>}
          {proposal && <div className={styles.proposal}>
            <p>Период начисления: <strong>{proposal.month}</strong>{proposal.rate !== null ? <> · ставка <strong>{percent(proposal.rate)}</strong></> : ''}</p>
            {proposal.assignment && (selected.crmClientId !== null || crmClientId) && <p>Клиент закрепится за {proposal.assignment.managerName} с {dateLabel(proposal.assignment.startDate)}.</p>}
            {proposal.effects.map(effect => <div key={`${effect.managerId}-${effect.month}`} className={styles.effect}><strong>{effect.managerName} · {effect.month}</strong><span>Продажи: {money(effect.before.salesTotal)} → {money(effect.after.salesTotal)}</span><span>Начислено: {money(effect.before.income)} → {money(effect.after.income)}</span></div>)}
            {proposal.problem && <p className={styles.warning}>{proposal.problem}</p>}
          </div>}
          {saveError && <p className={styles.error} role="alert">{saveError} <button type="button" onClick={() => void refreshProposal()}>Обновить расчёт</button></p>}
          <button type="button" className={styles.save} onClick={() => void save()} disabled={!proposal?.canSave || saving}>{saving ? 'Сохраняем…' : selected.managerId ? 'Сменить менеджера' : 'Зачислить и закрепить клиента'}</button>
        </div>}
        {selected.managerId && selected.kind === 'manager' && <Link className={styles.cabinet} href={`/manager?managerId=${selected.managerId}&month=${selected.date.slice(0, 7)}`}>Открыть кабинет менеджера</Link>}
      </DialogPopup></DialogPortal>}
    </Dialog>
  </section>;
}

type CompanySalesPage = {items: CompanySaleSummary[]; pages: number; total: number; page: number};
function companySalesKey(scope: string, period: PeriodKind, date: string, query: string, page: number, unassigned: boolean) {
  return `${scope}:company-sales:${period}:${date}:${query}:${page}:${unassigned ? 'unassigned' : 'all'}`;
}
