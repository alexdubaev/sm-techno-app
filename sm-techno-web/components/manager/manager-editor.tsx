'use client';
import { useState } from 'react';
import {
  fetchManagerDashboard,
  previewManagerChange,
  saveManagerChange,
} from '@/lib/api';
import type {
  ManagerChange,
  ManagerDashboard,
  ManagerSale,
} from '@/lib/manager-types';
import { useSettingsDirtyState } from '@/components/settings/users/use-settings-dirty-state';
import {
  errorMessage,
  minorUnits,
  money,
  monthLabel,
  shiftMonth,
} from './format';
import { ManagerModal } from './manager-modal';
import styles from './manager.module.css';

export type EditorKind = ManagerChange['kind'];
const titles = {
  terms: 'Условия начисления',
  sale: 'Продажа',
  cancel: 'Отменить продажу',
  close: 'Закрыть месяц',
  reopen: 'Открыть месяц',
};
export function ManagerEditor({
  data,
  kind,
  sale,
  onClose,
  onSaved,
}: {
  data: ManagerDashboard;
  kind: EditorKind;
  sale?: ManagerSale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState(String((data.terms?.plan ?? 0) / 100));
  const [fixed, setFixed] = useState(String((data.terms?.fixed ?? 0) / 100));
  const [rate, setRate] = useState(
    String((sale?.rate ?? data.terms?.rate ?? 0) / 100),
  );
  const [mode, setMode] = useState<'plan' | 'always'>(
    data.terms?.mode ?? 'plan',
  );
  const [date, setDate] = useState(sale?.date ?? `${data.month}-01`);
  const [client, setClient] = useState(sale?.client ?? '');
  const [amount, setAmount] = useState(sale ? String(sale.amount / 100) : '');
  const [reason, setReason] = useState(
    kind === 'sale' && !sale
      ? 'Ручной ввод продажи'
      : kind === 'terms' && !data.terms
        ? 'Условия месяца'
        : '',
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    result: ManagerDashboard;
    payload: ManagerChange;
  } | null>(null);
  const guard = useSettingsDirtyState(dirty);
  function close() {
    if (!busy) guard.request(onClose);
  }
  async function calculate(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const base = {
        managerId: data.account.id,
        month: data.month,
        version: data.version,
        reason: reason.trim(),
      };
      if ((kind === 'terms' || kind === 'sale') && minorUnits(rate) > 10000)
        throw new Error('Процент должен быть от 0 до 100.');
      let payload: ManagerChange;
      if (kind === 'terms')
        payload = {
          ...base,
          kind,
          plan: minorUnits(plan),
          fixed: minorUnits(fixed),
          rate: minorUnits(rate),
          mode,
        };
      else if (kind === 'sale')
        payload = {
          ...base,
          kind,
          saleId: sale?.id,
          date,
          client: client.trim(),
          amount: minorUnits(amount),
          rate: minorUnits(rate),
        };
      else if (kind === 'cancel') payload = { ...base, kind, saleId: sale!.id };
      else payload = { ...base, kind };
      const result = await previewManagerChange(payload);
      setPreview({ result, payload });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await saveManagerChange(preview.payload);
      setDirty(false);
      onSaved();
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setBusy(true);
    setError('');
    try {
      const previous = await fetchManagerDashboard(
        shiftMonth(data.month, -1),
        data.account.id,
      );
      if (!previous.terms)
        throw new Error('В предыдущем месяце условия не заданы.');
      setPlan(String(previous.terms.plan / 100));
      setFixed(String(previous.terms.fixed / 100));
      setRate(String(previous.terms.rate / 100));
      setMode(previous.terms.mode);
      setDirty(true);
      setPreview(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ManagerModal
        title={titles[kind]}
        description={`${data.account.name} · ${monthLabel(data.month)}`}
        onClose={close}
      >
        <form
          onSubmit={calculate}
          onChange={() => {
            setDirty(true);
            setPreview(null);
          }}
        >
          <fieldset disabled={busy} className={styles.fieldset}>
            {kind === 'terms' && (
              <>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void copy()}
                >
                  Скопировать из предыдущего месяца
                </button>
                <label>
                  План продаж, ₽
                  <input
                    inputMode="decimal"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Фиксированная часть, ₽
                  <input
                    inputMode="decimal"
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Когда начислять фикс
                  <select
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as 'plan' | 'always')
                    }
                  >
                    <option value="plan">При выполнении плана</option>
                    <option value="always">
                      Независимо от выполнения плана
                    </option>
                  </select>
                </label>
              </>
            )}
            {kind === 'sale' && (
              <>
                <label>
                  Дата продажи
                  <input
                    type="date"
                    value={date}
                    min={`${data.month}-01`}
                    max={`${data.month}-${new Date(Number(data.month.slice(0, 4)), Number(data.month.slice(5)), 0).getDate()}`}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Наименование клиента для документов
                  <input
                    maxLength={300}
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Сумма продажи, ₽
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
              </>
            )}
            {(kind === 'terms' || kind === 'sale') && (
              <label>
                {kind === 'terms'
                  ? 'Ставка для новых продаж, %'
                  : 'Ставка продажи, %'}
                <input
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
                <small>
                  Процент только с суммы сверх плана. Ставки существующих продаж
                  не меняются автоматически.
                </small>
              </label>
            )}
            {kind === 'cancel' && (
              <p className={styles.notice}>
                Продажа «{sale?.client}» на {money(sale?.amount ?? 0)} будет
                исключена из расчёта. Запись останется в истории.
              </p>
            )}
            {(kind === 'close' || kind === 'reopen') && (
              <p className={styles.notice}>
                {kind === 'close'
                  ? 'Условия и начисления будут зафиксированы. Изменения потребуют повторного открытия месяца. Это не подтверждение выплаты зарплаты.'
                  : 'Месяц снова станет доступен для исправлений. Предыдущий снимок начислений сохранится.'}
              </p>
            )}
            <label>
              Причина изменения
              <input
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {preview && (
            <div className={styles.preview} aria-live="polite">
              <h3>После изменения</h3>
              <dl>
                <div>
                  <dt>Продажи</dt>
                  <dd>
                    {money(data.summary.salesTotal)} →{' '}
                    {money(preview.result.summary.salesTotal)}
                  </dd>
                </div>
                <div>
                  <dt>Комиссия</dt>
                  <dd>
                    {money(data.summary.commission)} →{' '}
                    {money(preview.result.summary.commission)}
                  </dd>
                </div>
                <div>
                  <dt>Итого начислено</dt>
                  <dd>
                    {money(data.summary.income)} →{' '}
                    {money(preview.result.summary.income)}
                  </dd>
                </div>
              </dl>
              <p className={styles.hint}>Проверьте расчёт перед сохранением.</p>
            </div>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={close}
            >
              Отмена
            </button>
            {preview ? (
              <button
                className={styles.primary}
                type="button"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? 'Сохранение…' : 'Сохранить изменения'}
              </button>
            ) : (
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Расчёт…' : 'Рассчитать изменения'}
              </button>
            )}
          </div>
        </form>
      </ManagerModal>
      {guard.confirming && (
        <ManagerModal
          title="Есть несохранённые изменения"
          description="Выйти без сохранения?"
          onClose={guard.cancel}
        >
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={guard.cancel}>
              Продолжить редактирование
            </button>
            <button className={styles.primary} onClick={guard.discard}>
              Выйти без сохранения
            </button>
          </div>
        </ManagerModal>
      )}
    </>
  );
}
