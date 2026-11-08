'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog, DialogBackdrop, DialogClose, DialogPopup, DialogPortal, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart3, CalendarDays, Expand, History, Upload, X } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { fetchAdminBalance, fetchAdminSales, fetchAdminUsage } from '@/lib/api';
import type { Balance, PeriodKind, SalesOverview, UsageOverview } from '@/lib/admin-dashboard-types';
import { BankImport } from '@/components/manager/bank-import';
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

type Load<T> = {data: T | null; error: boolean};
export function Dashboard() {
  const { isAdmin, user } = useAuth();
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState<Load<SalesOverview>>({data:null,error:false});
  const [usage, setUsage] = useState<Load<UsageOverview>>({data:null,error:false});
  const [balance, setBalance] = useState<Load<Balance>>({data:null,error:false});
  const [salesRetry, retrySales] = useState(0); const [usageRetry, retryUsage] = useState(0); const [balanceRetry, retryBalance] = useState(0);
  useEffect(() => { const refresh = () => retrySales(value => value + 1); window.addEventListener('smtechno-bank-changed', refresh); return () => window.removeEventListener('smtechno-bank-changed', refresh); }, []);
  useEffect(() => { if (!isAdmin) return; let active = true;
    fetchAdminSales(period,date).then(data => { if(active) setSales({data,error:false}); }).catch(() => { if(active) setSales({data:null,error:true}); });
    return () => {active=false;};
  }, [isAdmin,user.id,period,date,salesRetry]);
  useEffect(() => { if (!isAdmin) return; let active = true;
    fetchAdminUsage(period,date).then(data => { if(active) setUsage({data,error:false}); }).catch(() => { if(active) setUsage({data:null,error:true}); });
    return () => {active=false;};
  }, [isAdmin,user.id,period,date,usageRetry]);
  useEffect(() => { if (!isAdmin) return; let active = true;
    fetchAdminBalance().then(data => { if(active) setBalance({data,error:false}); }).catch(() => { if(active) setBalance({data:null,error:true}); });
    return () => {active=false;};
  }, [isAdmin,user.id,balanceRetry]);
  if (!isAdmin) return <div className={styles.root}><h1>Нет доступа</h1><Link href="/manager">Открыть мой кабинет</Link></div>;
  const currentSales = sales.data?.period.kind === period && sales.data?.period.anchorDate === date ? sales.data : null;
  const currentUsage = usage.data?.period.kind === period && usage.data?.period.anchorDate === date ? usage.data : null;
  return <div className={styles.root}>
    <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}><div className={styles.toolbar}>
      <div className={styles.bankActions} aria-label="Действия"><div className={styles.dates}><button aria-label="Предыдущий период" onClick={() => setDate(shift(date,period,-1))}>←</button><strong title={currentSales ? formatPeriod(currentSales.period.start, period) : formatDate(date)}><span className={styles.desktopOnly}>{currentSales ? formatPeriod(currentSales.period.start, period) : formatDate(date)}</span><span className={styles.mobileOnly}>{currentSales ? formatPeriod(currentSales.period.start, period, true) : formatDate(date)}</span></strong><button aria-label="Следующий период" onClick={() => setDate(shift(date,period,1))}>→</button></div><button className={styles.uploadButton} onClick={() => setBankImportOpen(true)} aria-label="Загрузить выписку"><Upload size={18}/><span className={styles.uploadLabel}>Загрузить выписку</span></button><button onClick={() => setBankImportOpen(true)} aria-label="История выписок"><History size={18}/><span className={styles.desktopOnly}>История выписок</span></button><Link className={styles.link} href="/manager" aria-label="Мои продажи →"><BarChart3 size={18}/><span className={styles.desktopOnly}>Мои продажи</span></Link></div>
      <section className={styles.controls} aria-label="Период"><div className={styles.tabs}>{periods.map(([key,label]) => <button key={key} aria-pressed={period===key} onClick={() => setPeriod(key)}>{label}</button>)}</div><div className={styles.dates}><DialogTrigger aria-label="Выбрать дату"><CalendarDays size={18}/></DialogTrigger><button className={styles.todayButton} onClick={() => setDate(today())}>Сегодня</button></div><p className={styles.periodInfo}>{currentSales ? `${formatDate(currentSales.period.start)} — ${formatDate(currentSales.period.end)}` : formatDate(date)} · Сегодня: {formatDate(today())}</p></section>
    </div>
    <DialogPortal><DialogBackdrop className={styles.dialogBackdrop}/><DialogPopup className={styles.calendarDialog}><DialogTitle>Выбрать дату отчёта</DialogTitle><input aria-label="Дата отчёта" type="date" min="1900-01-01" max="2199-12-31" value={date} onChange={event => {if(event.target.value && event.target.validity.valid) {setDate(event.target.value); setCalendarOpen(false);}}}/><DialogClose className={styles.closeButton}>Закрыть</DialogClose></DialogPopup></DialogPortal></Dialog>
    {bankImportOpen && <BankImport userId={user.id} onClose={() => setBankImportOpen(false)} onChanged={() => retrySales(value => value + 1)} />}
    <Dialog><section className={styles.panel}><h2>Продажи компании</h2>{sales.error ? <ErrorState retry={() => retrySales(x=>x+1)} /> : !currentSales ? <p>Загрузка…</p> : <div><div className={styles.summary}><strong>{money(currentSales.totals.salesTotal)}</strong><span>{currentSales.totals.count} продаж за период · с НДС</span></div>{currentSales.totals.count === 0 && <p>За этот период продаж нет. Добавить продажу можно в личном кабинете.</p>}<div className={styles.salesLayout}><section className={styles.chartColumn}><div className={styles.chartHeading}><h3>По дням</h3><span className={styles.chartHint}>Нажмите, чтобы развернуть</span><DialogTrigger aria-label="Развернуть график продаж"><Expand size={18}/></DialogTrigger></div><DialogTrigger className={styles.chartPreview} aria-label="Открыть подробный график продаж"><Chart data={currentSales.series} field="amount" label="Продажи по дням"/></DialogTrigger></section><section className={styles.managerColumn}><div className={styles.managerHeading}><h3>Менеджеры</h3><p className={styles.muted}>Планы за {currentSales.monthlyPlans.month}</p></div><div className={styles.rows}>{currentSales.managers.map(manager => {const plan = currentSales.monthlyPlans.managers.find(p=>p.id===manager.id); const share = currentSales.totals.salesTotal ? manager.salesTotal/currentSales.totals.salesTotal*100 : 0; return <Link className={`${styles.row} ${styles.managerLink}`} key={manager.id} href={`/manager?managerId=${manager.id}&month=${currentSales.monthlyPlans.month}`} aria-label={`Открыть кабинет: ${manager.name}`}><div><strong>{manager.name}</strong> <small>{manager.archived ? 'Архив' : !manager.active ? 'Неактивен' : ''}</small><div className={styles.bar}><span style={{width:`${Math.min(100,share)}%`}} /></div></div><div><strong>{money(manager.salesTotal)}</strong><small>{manager.count} продаж</small></div><div><small>Месячный план: </small>{!plan || plan.status === 'unset' ? 'Условия не заданы' : plan.status === 'no_plan' ? 'Без плана' : <>{money(plan.salesTotal)} / {money(plan.plan!)} · {plan.progress?.toLocaleString('ru-RU', {maximumFractionDigits:1})}%</>}</div></Link>;})}</div></section></div><details><summary>Данные графика и источники</summary>{currentSales.series.map(row => <div key={row.date}>{row.date}: {money(row.amount)} · {row.count}</div>)}<p>Ручной учёт: {currentSales.sources.manualCount}; банковские поступления: {currentSales.sources.bankCount ?? 0}; записей 1С: {currentSales.sources.onecCount}. Подключение 1С пока не включено.</p></details><p className={styles.muted}>Не распределено: {money(currentSales.totals.unallocatedSalesTotal ?? 0)} · {currentSales.totals.unallocatedCount ?? 0} оплат</p></div>}</section>
    <DialogPortal><DialogBackdrop className={styles.dialogBackdrop}/><DialogPopup finalFocus={true} className={styles.chartDialog}><DialogTitle>Продажи по дням</DialogTitle><p>{currentSales ? `${formatDate(currentSales.period.start)} — ${formatDate(currentSales.period.end)} · ${money(currentSales.totals.salesTotal)}` : ''}</p><DialogClose aria-label="Закрыть график" className={styles.closeButton}><X size={18}/> Закрыть</DialogClose>{currentSales && <Chart data={currentSales.series} field="amount" label="Развернутый график продаж" large/>}</DialogPopup></DialogPortal></Dialog>
    <section className={styles.panel}><h2>DeepSeek</h2><p className={styles.muted}>Измеренные запросы этого приложения, не вся история аккаунта.</p>{usage.error ? <ErrorState retry={() => retryUsage(x=>x+1)} /> : !currentUsage ? <p>Загрузка…</p> : <><p>Учёт ведётся с {currentUsage.trackingStartedAt ? new Date(currentUsage.trackingStartedAt).toLocaleString('ru-RU') : 'неизвестной даты'}. Предыдущая история недоступна.</p>{currentUsage.recordingDegraded && <p role="alert">Часть записей могла не сохраниться.</p>}<div className={styles.metrics}><span>Запросы <strong>{number(currentUsage.totals.requests)}</strong></span><span>Ошибки <strong>{number(currentUsage.totals.failedRequests)}</strong></span><span>Вход <strong>{number(currentUsage.totals.promptTokens)}</strong></span><span>Выход <strong>{number(currentUsage.totals.completionTokens)}</strong></span><span>Всего токенов <strong>{number(currentUsage.totals.totalTokens)}</strong></span><span>Неизвестный расход <strong>{number(currentUsage.totals.unknownUsageRequests)}</strong></span></div>{currentUsage.totals.requests ? <><h3>Запросы</h3><Chart data={currentUsage.series} field="requests" label="Запросы DeepSeek" /><h3>Токены</h3><Chart data={currentUsage.series} field="totalTokens" label="Токены DeepSeek" /><details><summary>Данные графика запросов и токенов</summary>{currentUsage.series.map(row=><div key={row.date}>{row.date}: {row.requests} запросов, {number(row.totalTokens)} токенов; неизвестно: {row.unknownUsageRequests}</div>)}</details></> : <p>За этот период нет наблюдений.</p>}</>}
      <div className={styles.balance}><h3>Баланс аккаунта</h3>{balance.error ? <ErrorState retry={() => retryBalance(x=>x+1)} /> : !balance.data ? <p>Загрузка…</p> : balance.data.status !== 'available' ? <><p>{balance.data.status === 'unconfigured' ? 'Ключ не настроен' : 'Баланс временно недоступен'}</p><button onClick={() => retryBalance(x=>x+1)}>Повторить</button></> : <><p>{balance.data.isAvailable ? 'Доступен' : 'Недоступен для запросов'} · обновлён {new Date(balance.data.checkedAt).toLocaleString('ru-RU')}</p>{balance.data.balances.map(b=><p key={b.currency}><strong>{b.totalBalance} {b.currency}</strong> (бонусный {b.grantedBalance}, пополненный {b.toppedUpBalance})</p>)}</>}</div>
    </section>
  </div>;
}
function ErrorState({retry}:{retry:()=>void}) { return <p role="alert">Не удалось загрузить данные. <button onClick={retry}>Повторить</button></p>; }
function Chart<T extends object>({data,field,label,large=false}:{data:T[];field:string;label:string;large?:boolean}) {return <div className={`${styles.chart} ${large ? styles.largeChart : ''}`} aria-label={label}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} accessibilityLayer={large || field !== 'amount'}><CartesianGrid stroke="#e3e8f0" vertical={false}/><XAxis dataKey="date" minTickGap={28} tick={{fontSize:11}} tickFormatter={formatDate}/><YAxis tick={{fontSize:11}} width={65} allowDecimals={field !== 'requests'} tickFormatter={(value: number) => field === 'amount' ? `${(value / 100).toLocaleString('ru-RU', {notation:'compact', maximumFractionDigits:1})} ₽` : String(value)}/>{large && <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => field === 'amount' && typeof value === 'number' ? money(value) : value}/>}<Bar maxBarSize={44} isAnimationActive={false} name={field === 'amount' ? 'Продажи' : field === 'requests' ? 'Запросы' : 'Токены'} dataKey={field} fill="#ffc400" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>;}


function formatDate(value: string) { const parts = value.split('-'); return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : parts.length === 2 ? `${parts[1]}.${parts[0]}` : value; }
function formatPeriod(value: string, kind: PeriodKind, compact = false) { const [year, month] = value.split('-').map(Number); return kind === 'week' ? formatDate(value) : kind === 'year' ? String(year) : kind === 'quarter' ? `${Math.ceil(month / 3)} ${compact ? 'кв.' : 'квартал'} ${year}` : `${new Intl.DateTimeFormat('ru-RU', {month:compact ? 'short' : 'long'}).format(new Date(Date.UTC(year,month-1,1)))} ${year}`; }
