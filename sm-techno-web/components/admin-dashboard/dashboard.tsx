'use client';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog, DialogBackdrop, DialogClose, DialogPopup, DialogPortal, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart3, CalendarDays, Expand, Upload, UserRound, X } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useUiTheme } from '@/hooks/use-ui-theme';
import { fetchAdminBalance, fetchAdminSales, fetchAdminUsage, getApiCacheGeneration, subscribeApiCacheInvalidation } from '@/lib/api';
import type { Balance, PeriodKind, SalesOverview, UsageOverview } from '@/lib/admin-dashboard-types';
import { claimSalesChartAnimation, clearSalesSnapshot, isSalesSnapshotUsable, readDashboardSelection, readSalesSnapshot, writeDashboardSelection, writeSalesSnapshot } from '@/lib/sales-memory';
import { BankImport } from '@/components/manager/bank-import';
import { CompanySales } from './company-sales';
import { GlassySalesArea, GlassySalesBreakdown } from './glassy-sales-charts';
import styles from './dashboard.module.css';

const periods: [PeriodKind, string][] = [['week','Неделя'],['month','Месяц'],['quarter','Квартал'],['year','Год']];
const money = (value: number) => `${(value / 100).toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽`;
const number = (value: number | null) => value === null ? 'Нет данных' : value.toLocaleString('ru-RU');
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
function shift(value: string, kind: PeriodKind, direction: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, kind === 'week' ? day + direction * 7 : 1));
  if (kind !== 'week') date.setUTCMonth(date.getUTCMonth() + direction * ({month:1, quarter:3, year:12}[kind]));
  return date.toISOString().slice(0,10);
}

type Load<T> = {data: T | null; error: boolean; key: string; savedAt: number | null};
export function Dashboard() {
  const { isAdmin, user } = useAuth();
  const glassy = useUiTheme() === 'glassy';
  const scope = `${user.id}:${isAdmin ? 'admin' : 'user'}`;
  const [initialSelection] = useState(() => readDashboardSelection(scope));
  const [period, setPeriod] = useState<PeriodKind>((initialSelection?.period as PeriodKind | undefined) ?? 'month');
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [date, setDate] = useState(initialSelection?.date ?? today);
  const salesKey = `${scope}:sales:${period}:${date}`;
  const usageKey = `${scope}:usage:${period}:${date}`;
  const balanceKey = `${scope}:balance`;
  const [sales, setSales] = useState<Load<SalesOverview>>(() => {const snapshot=readSalesSnapshot<SalesOverview>(salesKey); return {data:snapshot?.data ?? null,error:false,key:salesKey,savedAt:snapshot?.savedAt ?? null};});
  const [usage, setUsage] = useState<Load<UsageOverview>>(() => {const snapshot=readSalesSnapshot<UsageOverview>(usageKey); return {data:snapshot?.data ?? null,error:false,key:usageKey,savedAt:snapshot?.savedAt ?? null};});
  const [balance, setBalance] = useState<Load<Balance>>(() => {const snapshot=readSalesSnapshot<Balance>(balanceKey); return {data:snapshot?.data ?? null,error:false,key:balanceKey,savedAt:snapshot?.savedAt ?? null};});
  const [salesRetry, retrySales] = useState(0); const [usageRetry, retryUsage] = useState(0); const [balanceRetry, retryBalance] = useState(0);
  const selectDateAndPeriod = (nextPeriod: PeriodKind, nextDate: string) => {
    writeDashboardSelection(scope, {period:nextPeriod,date:nextDate});
    setPeriod(nextPeriod); setDate(nextDate);
  };
  useEffect(() => { const refresh = () => retrySales(value => value + 1); window.addEventListener('smtechno-bank-changed', refresh); return () => window.removeEventListener('smtechno-bank-changed', refresh); }, []);
  useEffect(() => subscribeApiCacheInvalidation(reason => {
    if (reason === 'session') {
      const nextDate = today();
      setPeriod('month'); setDate(nextDate);
      setSales({data:null,error:false,key:'',savedAt:null}); setUsage({data:null,error:false,key:'',savedAt:null}); setBalance({data:null,error:false,key:'',savedAt:null});
      retrySales(value => value + 1); retryUsage(value => value + 1); retryBalance(value => value + 1);
      return;
    }
    retrySales(value => value + 1); retryUsage(value => value + 1); retryBalance(value => value + 1);
  }), []);
  useEffect(() => { if (!isAdmin) return; let active = true;
    const generation = getApiCacheGeneration();
    const refreshTimer = window.setTimeout(() => retrySales(value => value + 1), 30_000);
    fetchAdminSales(period,date).then(data => { if(active && generation === getApiCacheGeneration()) { writeSalesSnapshot(salesKey,data,generation); setSales({data,error:false,key:salesKey,savedAt:Date.now()}); } }).catch(error => { if(active) { const denied = error?.status === 401 || error?.status === 403; if (denied) { clearSalesSnapshot(salesKey); setSales({data:null,error:true,key:salesKey,savedAt:null}); } else setSales(current => current.key === salesKey && current.data && current.savedAt !== null && isSalesSnapshotUsable(current.savedAt) ? current : {data:null,error:true,key:salesKey,savedAt:null}); } });
    return () => {active=false; window.clearTimeout(refreshTimer);};
  }, [isAdmin,user.id,period,date,salesRetry,salesKey]);
  useEffect(() => { if (!isAdmin) return; let active = true;
    const generation = getApiCacheGeneration();
    const refreshTimer = window.setTimeout(() => retryUsage(value => value + 1), 30_000);
    fetchAdminUsage(period,date).then(data => { if(active && generation === getApiCacheGeneration()) { writeSalesSnapshot(usageKey,data,generation); setUsage({data,error:false,key:usageKey,savedAt:Date.now()}); } }).catch(error => { if(active) { const denied = error?.status === 401 || error?.status === 403; if (denied) { clearSalesSnapshot(usageKey); setUsage({data:null,error:true,key:usageKey,savedAt:null}); } else setUsage(current => current.key === usageKey && current.data && current.savedAt !== null && isSalesSnapshotUsable(current.savedAt) ? current : {data:null,error:true,key:usageKey,savedAt:null}); } });
    return () => {active=false; window.clearTimeout(refreshTimer);};
  }, [isAdmin,user.id,period,date,usageRetry,usageKey]);
  useEffect(() => { if (!isAdmin) return; let active = true;
    const generation = getApiCacheGeneration();
    const refreshTimer = window.setTimeout(() => retryBalance(value => value + 1), 30_000);
    fetchAdminBalance().then(data => { if(active && generation === getApiCacheGeneration()) { writeSalesSnapshot(balanceKey,data,generation); setBalance({data,error:false,key:balanceKey,savedAt:Date.now()}); } }).catch(error => { if(active) { const denied = error?.status === 401 || error?.status === 403; if (denied) { clearSalesSnapshot(balanceKey); setBalance({data:null,error:true,key:balanceKey,savedAt:null}); } else setBalance(current => current.key === balanceKey && current.data && current.savedAt !== null && isSalesSnapshotUsable(current.savedAt) ? current : {data:null,error:true,key:balanceKey,savedAt:null}); } });
    return () => {active=false; window.clearTimeout(refreshTimer);};
  }, [isAdmin,user.id,balanceRetry,balanceKey]);
  if (!isAdmin) return <div className={styles.root}><h1>Нет доступа</h1><Link href="/manager">Открыть мой кабинет</Link></div>;
  const cachedSales = readSalesSnapshot<SalesOverview>(salesKey)?.data;
  const cachedUsage = readSalesSnapshot<UsageOverview>(usageKey)?.data;
  const cachedBalance = readSalesSnapshot<Balance>(balanceKey)?.data;
  const currentSalesValue = sales.key === salesKey && sales.savedAt !== null && isSalesSnapshotUsable(sales.savedAt) ? sales.data : cachedSales ?? null;
  const currentUsageValue = usage.key === usageKey && usage.savedAt !== null && isSalesSnapshotUsable(usage.savedAt) ? usage.data : cachedUsage ?? null;
  const currentSales = currentSalesValue?.period.kind === period && currentSalesValue.period.anchorDate === date ? currentSalesValue : null;
  const currentUsage = currentUsageValue?.period.kind === period && currentUsageValue.period.anchorDate === date ? currentUsageValue : null;
  const currentBalance = balance.key === balanceKey && balance.savedAt !== null && isSalesSnapshotUsable(balance.savedAt) ? balance.data : cachedBalance ?? null;
  const salesChartTitle = glassy && period === 'year' ? 'Продажи по месяцам' : 'Продажи по дням';
  const chartAnimationKey = `${salesKey}:${salesRetry}`;
  return <div className={styles.root}>
    <header className={`app-feature-heading app-glassy-only ${styles.pageHeading}`}>
      <h1>Обзор</h1>
      <p>Ключевые показатели продаж и выполнение планов</p>
    </header>
    <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}><div className={styles.toolbar}>
      <div className={styles.bankActions} aria-label="Действия"><div className={styles.dates}><button data-app-action="secondary" aria-label="Предыдущий период" onClick={() => selectDateAndPeriod(period,shift(date,period,-1))}>←</button><strong title={currentSales ? formatPeriod(currentSales.period.start, period) : formatDate(date)}><span className={styles.desktopOnly}>{currentSales ? formatPeriod(currentSales.period.start, period) : formatDate(date)}</span><span className={styles.mobileOnly}>{currentSales ? formatPeriod(currentSales.period.start, period, true) : formatDate(date)}</span></strong><button data-app-action="secondary" aria-label="Следующий период" onClick={() => selectDateAndPeriod(period,shift(date,period,1))}>→</button></div><button data-app-action="primary" className={styles.uploadButton} onClick={() => setBankImportOpen(true)} aria-label="Загрузить выписку"><Upload size={18}/><span className={styles.uploadLabel}>Загрузить выписку</span></button><Link data-app-action="secondary" className={styles.link} href="/manager" aria-label="Мои продажи →"><BarChart3 size={18}/><span className={styles.desktopOnly}>Мои продажи</span></Link></div>
      <section className={styles.controls} aria-label="Период"><div className={styles.tabs}>{periods.map(([key,label]) => <button key={key} aria-pressed={period===key} onClick={() => selectDateAndPeriod(key,date)}>{label}</button>)}</div><div className={styles.dates}><DialogTrigger data-app-action="secondary" aria-label="Выбрать дату"><CalendarDays size={18}/></DialogTrigger><button data-app-action="secondary" className={styles.todayButton} onClick={() => selectDateAndPeriod(period,today())}>Сегодня</button></div><p className={styles.periodInfo}>{currentSales ? `${formatDate(currentSales.period.start)} — ${formatDate(currentSales.period.end)}` : formatDate(date)} · Сегодня: {formatDate(today())}</p></section>
    </div>
    <DialogPortal><DialogBackdrop className={styles.dialogBackdrop}/><DialogPopup className={styles.calendarDialog}><DialogTitle>Выбрать дату отчёта</DialogTitle><input aria-label="Дата отчёта" type="date" min="1900-01-01" max="2199-12-31" value={date} onChange={event => {if(event.target.value && event.target.validity.valid) {selectDateAndPeriod(period,event.target.value); setCalendarOpen(false);}}}/><DialogClose data-app-action="secondary" className={styles.closeButton}>Закрыть</DialogClose></DialogPopup></DialogPortal></Dialog>
    {bankImportOpen && <BankImport userId={user.id} onClose={() => setBankImportOpen(false)} onChanged={() => retrySales(value => value + 1)} />}
    <Dialog>
      <section className={`${styles.panel} app-surface`}>
        <h2>Продажи компании</h2>
        {sales.key === salesKey && sales.error ? <ErrorState retry={() => retrySales(value => value + 1)} /> : !currentSales ? <p>Загрузка…</p> : (
          <>
            <div className={styles.summary}>
              <strong>{money(currentSales.totals.salesTotal)}</strong>
              <span>{currentSales.totals.count} продаж за период · с НДС</span>
            </div>
            {currentSales.totals.count === 0 && <p>За этот период продаж нет. Добавить продажу можно в личном кабинете.</p>}
            {!glassy && <>
              <div className={styles.salesLayout}>
                <SalesTrend key={chartAnimationKey} animationKey={chartAnimationKey} sales={currentSales} title={salesChartTitle} />
                <section className={styles.managerColumn}>
                  <div className={styles.managerHeading}><h3>Менеджеры</h3><p className={styles.muted}>Планы за {currentSales.monthlyPlans.month}</p></div>
                  <div className={styles.rows}><ManagerPlans sales={currentSales} /></div>
                </section>
              </div>
              <SalesSources sales={currentSales} />
            </>}
          </>
        )}
      </section>
      {glassy && currentSales && <>
        {currentSales.totals.count > 0 && (
          <div className={styles.glassySalesLayout}>
            <SalesTrend key={chartAnimationKey} animationKey={chartAnimationKey} sales={currentSales} title={salesChartTitle} glassy />
            <GlassySalesBreakdown sales={currentSales} money={money} animationKey={chartAnimationKey} />
          </div>
        )}
        {currentSales.managers.length > 0 && (
          <section className={`app-surface ${styles.plans}`}>
            <div className={styles.managerHeading}>
              <h2>Выполнение плана продаж по менеджерам</h2>
              <p className={styles.muted}>{formatPeriod(currentSales.monthlyPlans.month, 'month')}</p>
            </div>
            <div className={styles.planLabels} aria-hidden="true"><span>Менеджер</span><span>Продажи за месяц</span><span>План на месяц</span><span>Выполнение плана</span></div>
            <div className={styles.rows}><ManagerPlans sales={currentSales} glassy /></div>
          </section>
        )}
        <section className={`app-surface ${styles.sources}`} aria-label="Данные продаж"><SalesSources sales={currentSales} /></section>
      </>}
      <DialogPortal>
        <DialogBackdrop className={styles.dialogBackdrop} />
        <DialogPopup finalFocus={true} className={styles.chartDialog}>
          <DialogTitle>{salesChartTitle}</DialogTitle>
          <p>{currentSales ? `${formatDate(currentSales.period.start)} — ${formatDate(currentSales.period.end)} · ${money(currentSales.totals.salesTotal)}` : ''}</p>
          <DialogClose data-app-action="secondary" aria-label="Закрыть график" className={styles.closeButton}><X size={18} /> Закрыть</DialogClose>
          {currentSales && (glassy
            ? <GlassySalesArea data={currentSales.series} label="Развернутый график продаж" money={money} large animate={false} />
            : <Chart data={currentSales.series} field="amount" label="Развернутый график продаж" large animate={false} />)}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
    <CompanySales period={period} date={date}/>
    <section className={`${styles.panel} app-surface`}><h2>DeepSeek</h2><p className={styles.muted}>Измеренные запросы этого приложения, не вся история аккаунта.</p>{usage.key === usageKey && usage.error ? <ErrorState retry={() => retryUsage(x=>x+1)} /> : !currentUsage ? <p>Загрузка…</p> : <><p>Учёт ведётся с {currentUsage.trackingStartedAt ? new Date(currentUsage.trackingStartedAt).toLocaleString('ru-RU') : 'неизвестной даты'}. Предыдущая история недоступна.</p>{currentUsage.recordingDegraded && <p role="alert">Часть записей могла не сохраниться.</p>}<div className={styles.metrics}><span>Запросы <strong>{number(currentUsage.totals.requests)}</strong></span><span>Ошибки <strong>{number(currentUsage.totals.failedRequests)}</strong></span><span>Вход <strong>{number(currentUsage.totals.promptTokens)}</strong></span><span>Выход <strong>{number(currentUsage.totals.completionTokens)}</strong></span><span>Всего токенов <strong>{number(currentUsage.totals.totalTokens)}</strong></span><span>Неизвестный расход <strong>{number(currentUsage.totals.unknownUsageRequests)}</strong></span></div>{currentUsage.totals.requests ? <><h3>Запросы</h3><Chart data={currentUsage.series} field="requests" label="Запросы DeepSeek" /><h3>Токены</h3><Chart data={currentUsage.series} field="totalTokens" label="Токены DeepSeek" /><details><summary>Данные графика запросов и токенов</summary>{currentUsage.series.map(row=><div key={row.date}>{row.date}: {row.requests} запросов, {number(row.totalTokens)} токенов; неизвестно: {row.unknownUsageRequests}</div>)}</details></> : <p>За этот период нет наблюдений.</p>}</>}
      <div className={styles.balance}><h3>Баланс аккаунта</h3>{balance.key === balanceKey && balance.error ? <ErrorState retry={() => retryBalance(x=>x+1)} /> : !currentBalance ? <p>Загрузка…</p> : currentBalance.status !== 'available' ? <><p>{currentBalance.status === 'unconfigured' ? 'Ключ не настроен' : 'Баланс временно недоступен'}</p><button onClick={() => retryBalance(x=>x+1)}>Повторить</button></> : <><p>{currentBalance.isAvailable ? 'Доступен' : 'Недоступен для запросов'} · обновлён {new Date(currentBalance.checkedAt).toLocaleString('ru-RU')}</p>{currentBalance.balances.map(b=><p key={b.currency}><strong>{b.totalBalance} {b.currency}</strong> (бонусный {b.grantedBalance}, пополненный {b.toppedUpBalance})</p>)}</>}</div>
    </section>
  </div>;
}

function SalesTrend({ sales, title, glassy = false, animationKey }: { sales: SalesOverview; title: string; glassy?: boolean; animationKey: string }) {
  const [animate] = useState(() => claimSalesChartAnimation(animationKey));
  return (
    <section className={glassy ? `app-surface ${styles.trend}` : styles.chartColumn}>
      <div className={styles.chartHeading}>
        <h3>{glassy ? title : 'По дням'}</h3>
        <span className={styles.chartHint}>Нажмите, чтобы развернуть</span>
        <DialogTrigger data-app-action="secondary" aria-label="Развернуть график продаж"><Expand size={18} /></DialogTrigger>
      </div>
      <DialogTrigger className={styles.chartPreview} aria-label="Открыть подробный график продаж">
        {glassy ? <GlassySalesArea data={sales.series} label={title} money={money} animate={animate} /> : <Chart data={sales.series} field="amount" label={title} animate={animate} />}
      </DialogTrigger>
    </section>
  );
}

function SalesSources({ sales }: { sales: SalesOverview }) {
  return <>
    <details>
      <summary>Данные графика и источники</summary>
      {sales.series.map(row => <div key={row.date}>{row.date}: {money(row.amount)} · {row.count}</div>)}
      <p>Ручной учёт: {sales.sources.manualCount}; банковские поступления: {sales.sources.bankCount ?? 0}; записей 1С: {sales.sources.onecCount}. Подключение 1С пока не включено.</p>
    </details>
    <p className={styles.muted}>Не распределено: {money(sales.totals.unallocatedSalesTotal ?? 0)} · {sales.totals.unallocatedCount ?? 0} оплат</p>
  </>;
}

function ManagerPlans({ sales, glassy = false }: { sales: SalesOverview; glassy?: boolean }) {
  const id = useId();
  return sales.managers.map(manager => {
    const plan = sales.monthlyPlans.managers.find(entry => entry.id === manager.id);
    const share = sales.totals.salesTotal ? manager.salesTotal / sales.totals.salesTotal * 100 : 0;
    const progress = plan?.progress;
    const status = manager.archived ? 'Архив' : !manager.active ? 'Неактивен' : '';
    const href = `/manager?managerId=${manager.id}&month=${sales.monthlyPlans.month}`;
    const label = `Открыть кабинет: ${manager.name}`;
    const planDescription = !plan || plan.status === 'unset' ? 'Условия не заданы' : 'Без плана';

    if (glassy) {
      const salesId = `${id}-${manager.id}-sales`;
      const planId = `${id}-${manager.id}-plan`;
      const progressId = `${id}-${manager.id}-progress`;
      return <Link className={`${styles.planRow} ${styles.managerLink}`} key={manager.id} href={href} aria-label={label} aria-describedby={`${salesId} ${planId} ${progressId}`}>
        <span className={styles.planName}>
          <UserRound size={18} aria-hidden="true" />
          <span><strong>{manager.name}</strong>{status && <small>{status}</small>}<small>За период: {money(manager.salesTotal)} · {manager.count} продаж</small></span>
        </span>
        <span id={salesId}><small className={styles.planMobileLabel}>Продажи за месяц</small><strong>{plan ? money(plan.salesTotal) : '—'}</strong></span>
        <span id={planId}><small className={styles.planMobileLabel}>План на месяц</small>{plan?.status === 'planned' && plan.plan !== null ? money(plan.plan) : planDescription}</span>
        <span id={progressId} className={styles.planProgress}>
          <span className="sr-only">Выполнение плана</span>
          {progress != null ? <>
            <span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span>
            <span>{progress.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</span>
          </> : <><span aria-hidden="true">—</span><span className="sr-only">Нет данных</span></>}
        </span>
      </Link>;
    }

    return <Link className={`${styles.row} ${styles.managerLink}`} key={manager.id} href={href} aria-label={label}>
      <div><strong>{manager.name}</strong> <small>{status}</small><div className={styles.bar}><span style={{ width: `${Math.min(100, share)}%` }} /></div></div>
      <div><strong>{money(manager.salesTotal)}</strong><small>{manager.count} продаж</small></div>
      <div><small>Месячный план: </small>{plan?.status === 'planned' ? <>{money(plan.salesTotal)} / {money(plan.plan!)} · {progress?.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</> : planDescription}</div>
    </Link>;
  });
}

function ErrorState({retry}:{retry:()=>void}) { return <p role="alert">Не удалось загрузить данные. <button onClick={retry}>Повторить</button></p>; }
function Chart<T extends object>({data,field,label,large=false,animate=false}:{data:T[];field:string;label:string;large?:boolean;animate?:boolean}) {return <div className={`${styles.chart} ${large ? styles.largeChart : ''}`} aria-label={label}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} accessibilityLayer={large || field !== 'amount'}><CartesianGrid stroke="#e3e8f0" vertical={false}/><XAxis dataKey="date" minTickGap={28} tick={{fontSize:11}} tickFormatter={formatDate}/><YAxis tick={{fontSize:11}} width={65} allowDecimals={field !== 'requests'} tickFormatter={(value: number) => field === 'amount' ? `${(value / 100).toLocaleString('ru-RU', {notation:'compact', maximumFractionDigits:1})} ₽` : String(value)}/>{(large || field !== 'amount') && <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => field === 'amount' && typeof value === 'number' ? money(value) : value}/>}<Bar maxBarSize={44} isAnimationActive={animate} animationDuration={420} name={field === 'amount' ? 'Продажи' : field === 'requests' ? 'Запросы' : 'Токены'} dataKey={field} fill="#ffc400" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>;}


function formatDate(value: string) { const parts = value.split('-'); return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : parts.length === 2 ? `${parts[1]}.${parts[0]}` : value; }
function formatPeriod(value: string, kind: PeriodKind, compact = false) { const [year, month] = value.split('-').map(Number); return kind === 'week' ? formatDate(value) : kind === 'year' ? String(year) : kind === 'quarter' ? `${Math.ceil(month / 3)} ${compact ? 'кв.' : 'квартал'} ${year}` : `${new Intl.DateTimeFormat('ru-RU', {month:compact ? 'short' : 'long'}).format(new Date(Date.UTC(year,month-1,1)))} ${year}`; }
