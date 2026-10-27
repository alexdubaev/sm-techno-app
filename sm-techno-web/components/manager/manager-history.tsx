'use client';
import { useEffect, useState } from 'react';
import {
  fetchManagerHistory,
  fetchManagerSnapshots,
  fetchManagerSnapshot,
} from '@/lib/api';
import type {
  ManagerAuditState,
  ManagerDashboard,
  ManagerHistory as History,
  ManagerSnapshot,
  ManagerSnapshotSummary,
} from '@/lib/manager-types';
import { dateLabel, errorMessage, money, percent, timestamp } from './format';
import { ManagerModal } from './manager-modal';
import { ManagerSales } from './manager-sales';
import styles from './manager.module.css';
const labels = {
  terms: 'Условия месяца',
  sale: 'Продажа',
  cancel: 'Отмена продажи',
  close: 'Закрытие месяца',
  reopen: 'Повторное открытие',
};
function AuditState({ state }: { state: ManagerAuditState }) {
  return (
    <div className={styles.auditState}>
      <p>
        Продажи: {money(state.summary.salesTotal)} · Комиссия:{' '}
        {money(state.summary.commission)} · Итого: {money(state.summary.income)}
      </p>
      {state.terms && (
        <p>
          {state.terms.mode === 'minimum'
            ? `Гарантированный минимум: ${money(state.terms.fixed)} · начисляется большая сумма: минимум или комиссия`
            : state.terms.plan > 0
              ? `План: ${money(state.terms.plan)} · Фикс: ${money(state.terms.fixed)} (${state.terms.mode === 'plan' ? 'при выполнении плана' : 'без условия'})`
              : `Процент без плана${state.terms.fixed > 0 ? ` · фикс: ${money(state.terms.fixed)}` : ''}`}
          {' '}· Ставка новых продаж: {percent(state.terms.rate)}
        </p>
      )}
      {state.sale && (
        <p>
          Продажа № {state.sale.id}: {state.sale.client} · {state.sale.date} ·{' '}
          {money(state.sale.amount)} · {percent(state.sale.rate)}
          {(state.sale.invoiceNumber || state.sale.invoiceDate) && (
            <>
              {' '}· Счёт
              {state.sale.invoiceNumber ? ` № ${state.sale.invoiceNumber}` : ''}
              {state.sale.invoiceDate ? ` от ${dateLabel(state.sale.invoiceDate)}` : ''}
            </>
          )}
          {state.sale.cancelled ? ' · Отменена' : ''}
        </p>
      )}
    </div>
  );
}
export function ManagerHistory({
  data,
  onClose,
}: {
  data: ManagerDashboard;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  return (
    <ManagerModal
      title="История изменений"
      description="Автор, причина и сохранённые начисления"
      onClose={onClose}
    >
      <HistoryPage key={page} data={data} page={page} setPage={setPage} />
    </ManagerModal>
  );
}
function HistoryPage({
  data,
  page,
  setPage,
}: {
  data: ManagerDashboard;
  page: number;
  setPage: (p: number) => void;
}) {
  const [result, setResult] = useState<{
    history: History;
    snapshots: ManagerSnapshotSummary[];
  } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchManagerHistory(data.account.id, data.month, page),
      fetchManagerSnapshots(data.account.id, data.month),
    ])
      .then(([history, snapshots]) => {
        if (active) setResult({ history, snapshots });
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [data.account.id, data.month, page, retry]);
  if (error)
    return (
      <p role="alert" className={styles.error}>
        {error}
        <button
          className={styles.secondary}
          onClick={() => {
            setError('');
            setRetry((r) => r + 1);
          }}
        >
          Повторить загрузку
        </button>
      </p>
    );
  if (!result) return <output>Загрузка истории…</output>;
  return (
    <div className={styles.history}>
      {result.history.items.length === 0 && <p>Изменений пока нет.</p>}
      {result.history.items.map((item) => (
        <details key={item.id}>
          <summary>
            {labels[item.kind]} · {timestamp(item.at)}
            <small>
              {item.actor_name} · {item.reason}
            </small>
          </summary>
          <h3>До изменения</h3>
          <AuditState state={item.before} />
          <h3>После изменения</h3>
          <AuditState state={item.after} />
        </details>
      ))}
      <div className={styles.pagination}>
        <button
          className={styles.secondary}
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Назад
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(result.history.total / 20))}
        </span>
        <button
          className={styles.secondary}
          disabled={page * 20 >= result.history.total}
          onClick={() => setPage(page + 1)}
        >
          Далее
        </button>
      </div>
      <h3>Снимки закрытия (последние 30)</h3>
      {!result.snapshots.length && (
        <p className={styles.hint}>Месяц ещё не закрывали.</p>
      )}
      {result.snapshots.map((snapshot) => (
        <Snapshot key={snapshot.id} snapshot={snapshot} />
      ))}
    </div>
  );
}

function Snapshot({ snapshot }: { snapshot: ManagerSnapshotSummary }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {timestamp(snapshot.at)}
        <small>
          {snapshot.actor} · версия {snapshot.version}
        </small>
      </summary>
      {open && (
        <SnapshotPage
          key={page}
          id={snapshot.id}
          page={page}
          setPage={setPage}
        />
      )}
    </details>
  );
}
function SnapshotPage({
  id,
  page,
  setPage,
}: {
  id: number;
  page: number;
  setPage: (page: number) => void;
}) {
  const [result, setResult] = useState<ManagerSnapshot | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    fetchManagerSnapshot(id, page)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, page, retry]);
  if (error)
    return (
      <p role="alert" className={styles.error}>
        {error}
        <button
          className={styles.secondary}
          onClick={() => {
            setError('');
            setRetry((r) => r + 1);
          }}
        >
          Повторить загрузку снимка
        </button>
      </p>
    );
  if (!result) return <output>Загрузка снимка…</output>;
  const data = result.data;
  return (
    <>
      <p>
        План {money(data.terms?.plan ?? null)} · Фикс{' '}
        {money(data.summary.fixed)} · Комиссия {money(data.summary.commission)}{' '}
        · Итого {money(data.summary.income)}
      </p>
      <ManagerSales sales={data.sales} />
      <div className={styles.pagination}>
        <button
          className={styles.secondary}
          disabled={data.page === 1}
          onClick={() => setPage(data.page - 1)}
        >
          Предыдущие продажи
        </button>
        <span>
          {data.page} / {data.pages}
        </span>
        <button
          className={styles.secondary}
          disabled={data.page === data.pages}
          onClick={() => setPage(data.page + 1)}
        >
          Следующие продажи
        </button>
      </div>
    </>
  );
}
