'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import {
  fetchBankClient,
  fetchManagers,
  saveClientSalesManager,
} from '@/lib/api';
import type { BankClientSummary } from '@/lib/bank-types';
import type { ManagerChoice } from '@/lib/manager-types';
import {
  bankStatusLabel,
  calendarToday,
} from '@/components/manager/bank-format';
import {
  dateLabel,
  money,
  timestamp,
  errorMessage,
} from '@/components/manager/format';
import styles from '@/components/manager/bank.module.css';

export function ClientSalesPanel({
  clientId,
  isAdmin,
  readOnly = false,
}: {
  clientId: number;
  isAdmin: boolean;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<BankClientSummary | null>(null);
  const [managers, setManagers] = useState<ManagerChoice[]>([]);
  const [managerId, setManagerId] = useState('');
  const [startDate, setStartDate] = useState(calendarToday);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('smtechno-bank-changed', refresh);
    return () => window.removeEventListener('smtechno-bank-changed', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchBankClient(clientId),
      isAdmin ? fetchManagers() : Promise.resolve([]),
    ])
      .then(([result, choices]) => {
        if (active) {
          setData(result);
          setManagers(choices);
          setManagerId(
            result.assignment?.managerId
              ? String(result.assignment.managerId)
              : '',
          );
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [clientId, isAdmin, revision]);
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!data || !reason.trim() || !startDate) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await saveClientSalesManager(clientId, {
        version: data.version,
        managerId: managerId ? Number(managerId) : null,
        startDate,
        reason: reason.trim(),
      });
      setData(result);
      setReason('');
      setNotice(
        'Закрепление сохранено. Предложения по ожидающим оплатам обновлены. Старые продажи не перенесены.',
      );
      window.dispatchEvent(new Event('smtechno-bank-changed'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`${styles.body} ${styles.panel} ${styles.clientPanel}`}
      aria-label="Продажи и поступления клиента"
    >
      <div>
        <h3>Менеджер по продажам</h3>
        <p className={styles.muted}>
          Оплаты клиента засчитываются этому сотруднику
        </p>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <div>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              Обновить сведения об оплатах
            </button>
          </div>
        </div>
      )}
      {notice && <output className={styles.notice}>{notice}</output>}
      {!data && !error && <output>Загрузка закрепления и поступлений…</output>}
      {data && (
        <>
          <p>
            <b>{data.assignment?.managerName || 'Не назначен'}</b>
            {data.assignment && (
              <span className={styles.muted}>
                {' '}
                · с {dateLabel(data.assignment.startDate)}
                {data.assignment.endDate
                  ? ` до ${dateLabel(data.assignment.endDate)}`
                  : ''}
              </span>
            )}
          </p>
          {isAdmin && !readOnly && (
            <details className={styles.details}>
              <summary>Назначить или изменить менеджера</summary>
              <p className={styles.muted}>
                Закрепление действует с выбранной даты. Оно определит менеджера
                для ожидающих оплат и не перенесёт ранее проведённые продажи.
              </p>
              <form className={styles.form} onSubmit={(e) => void save(e)}>
                <label className={styles.field}>
                  Менеджер по продажам
                  <select
                    value={managerId}
                    disabled={busy}
                    onChange={(e) => setManagerId(e.target.value)}
                  >
                    <option value="">Снять закрепление</option>
                    {data.assignment?.managerId &&
                      !managers.some(
                        (m) =>
                          m.active &&
                          !m.archived &&
                          m.id === data.assignment?.managerId,
                      ) && (
                        <option value={data.assignment.managerId} disabled>
                          {data.assignment.managerName} · неактивен
                        </option>
                      )}
                    {managers
                      .filter(
                        (m) => m.active && !m.archived && m.userId !== null,
                      )
                      .map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Дата начала закрепления
                  <input
                    required
                    type="date"
                    value={startDate}
                    min="1900-01-01"
                    max="2199-12-31"
                    disabled={busy}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className={`${styles.field} ${styles.full}`}>
                  Причина изменения закрепления
                  <input
                    required
                    maxLength={500}
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className={styles.full}>
                  <button
                    className={styles.button}
                    type="submit"
                    disabled={busy || !startDate || !reason.trim()}
                  >
                    {busy ? 'Сохраняем…' : 'Сохранить закрепление'}
                  </button>
                </div>
              </form>
            </details>
          )}
          {isAdmin && data.pending && (
            <div className={styles.warning}>
              Ожидающие оплаты: {data.pending.count} ·{' '}
              {money(data.pending.amount)} с НДС
              {data.pending.periodStart && data.pending.periodEnd
                ? ` · ${dateLabel(data.pending.periodStart)} — ${dateLabel(data.pending.periodEnd)}`
                : ''}
              . Проведение — после подтверждения в банковской выписке.
            </div>
          )}
          {isAdmin && (
            <details className={styles.details}>
              <summary>История закреплений</summary>
              <div className={styles.list}>
                {data.history.length ? (
                  data.history.map((entry) => (
                    <article key={entry.id} className={styles.operation}>
                      <b>{entry.managerName || 'Закрепление снято'}</b>
                      <span>
                        {dateLabel(entry.startDate)} —{' '}
                        {entry.endDate
                          ? dateLabel(entry.endDate)
                          : 'без даты окончания'}
                      </span>
                      <span className={styles.muted}>
                        {entry.actorName} · {timestamp(entry.changedAt)}
                      </span>
                      <span>{entry.reason}</span>
                    </article>
                  ))
                ) : (
                  <p className={styles.muted}>Закреплений пока не было.</p>
                )}
              </div>
            </details>
          )}
          <details className={styles.details} open>
            <summary>Поступления клиента</summary>
            <div className={styles.list}>
              {data.payments.length ? (
                data.payments.map((payment) => (
                  <article className={styles.operation} key={payment.id}>
                    <div className={styles.heading}>
                      <b>{dateLabel(payment.date)}</b>
                      <b>{money(payment.amount)} с НДС</b>
                    </div>
                    <span>
                      Счёт
                      {payment.invoiceNumber
                        ? ` № ${payment.invoiceNumber}`
                        : ' не указан'}
                      {payment.invoiceDate
                        ? ` от ${dateLabel(payment.invoiceDate)}`
                        : ''}
                    </span>
                    <span>
                      Менеджер: {payment.managerName || 'Не назначен'}
                    </span>
                    {payment.companyAccounted && !payment.companyCancelled && <span className={styles.notice}>Учтено в общих продажах</span>}
                    {payment.companyAccounted && !payment.companyCancelled && !payment.saleId && <span className={styles.warning}>Не начислено менеджеру</span>}
                    <span className={styles.badge}>
                      {payment.companyCancelled
                        ? 'Общая продажа отменена'
                        : payment.cancelled
                        ? 'Продажа отменена'
                        : bankStatusLabel[payment.status]}
                    </span>
                  </article>
                ))
              ) : (
                <p className={styles.muted}>
                  {isAdmin
                    ? 'Банковских поступлений клиента пока нет.'
                    : 'Доступных вам проведённых оплат пока нет.'}
                </p>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
