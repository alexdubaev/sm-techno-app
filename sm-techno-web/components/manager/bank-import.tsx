'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  ApiRequestError,
  fetchBankAccounts,
  fetchBankUploads,
  fetchBankUpload,
  refreshBankUpload,
  uploadBankStatement,
  saveBankAccount,
  downloadBankStatement,
  previewBankPayments,
  commitBankPayments,
} from '@/lib/api';
import type {
  BankAccounts,
  BankCommitRequest,
  BankPreview,
  BankSelection,
  BankUpload,
  BankUploadDetail,
} from '@/lib/bank-types';
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { dateLabel, money, errorMessage, monthLabel } from './format';
import { BankOperationCard } from './bank-operation-card';
import styles from './bank.module.css';

type PendingConfirmation = { uploadId: number; request: BankCommitRequest };
function readPending(key: string): PendingConfirmation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (
      value &&
      Number.isInteger(value.uploadId) &&
      typeof value.request?.idempotencyKey === 'string' &&
      Array.isArray(value.request.items) &&
      value.request.items.every(
        (item: BankSelection) =>
          Number.isInteger(item.operationId) &&
          Number.isInteger(item.version) &&
          typeof item.fingerprint === 'string',
      )
    )
      return value;
  } catch {
    /* Storage can be disabled; the current request still keeps its key in memory. */
  }
  return null;
}

export function BankImport({
  userId,
  onClose,
  onChanged,
}: {
  userId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop className={styles.backdrop} />
        <DialogPopup className={styles.modal}>
          <div className={styles.heading}>
            <DialogTitle>Банковские выписки</DialogTitle>
            <button className={styles.button} onClick={onClose}>
              Закрыть
            </button>
          </div>
          <DialogDescription className={styles.muted}>
            Общий импорт по организации. Оплаты распределяются по закреплениям
            клиентов на дату поступления.
          </DialogDescription>
          <BankImportContent userId={userId} onChanged={onChanged} />
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}

export function BankImportContent({
  userId,
  onChanged,
}: {
  userId: number;
  onChanged: () => void;
}) {
  const storageKey = `smtechno-bank-confirm:${userId}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const pendingRef = useRef(pending);
  const committingRef = useRef(false);
  const [accounts, setAccounts] = useState<BankAccounts | null>(null);
  const [uploads, setUploads] = useState<BankUpload[]>([]);
  const [detail, setDetail] = useState<BankUploadDetail | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<{
    data: BankPreview;
    items: BankSelection[];
  } | null>(null);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([fetchBankAccounts(), fetchBankUploads()])
      .then(([a, history]) => {
        if (active) {
          setAccounts(a);
          setUploads(history.items);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);

  function acceptDetail(value: BankUploadDetail) {
    setDetail(value);
    setSelected(
      value.operations.filter((op) => op.status === 'ready').map((op) => op.id),
    );
    setPreview(null);
  }
  async function action(work: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function storePending(value: PendingConfirmation | null) {
    pendingRef.current = value;
    setPending(value);
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* An in-memory key is sufficient for retries in this window. */
    }
  }
  async function refresh(id: number) {
    acceptDetail(await refreshBankUpload(id));
    setUploads((await fetchBankUploads()).items);
  }
  async function upload(event: SubmitEvent) {
    event.preventDefault();
    if (!file || !accountId) return;
    await action(async () => {
      acceptDetail(await uploadBankStatement(Number(accountId), file));
      setUploads((await fetchBankUploads()).items);
      setHistoryOpen(false);
      setNotice(
        'Выписка сохранена. Проверьте распределение оплат. Продажи пока не созданы.',
      );
    });
  }
  async function calculatePreview() {
    if (!detail) return;
    const items = detail.operations
      .filter((op) => selected.includes(op.id) && op.status === 'ready')
      .map((op) => ({
        operationId: op.id,
        version: op.version,
        fingerprint: op.fingerprint,
      }));
    await action(async () => {
      setPreview({ data: await previewBankPayments(items), items });
    });
  }
  async function confirm() {
    if (committingRef.current) return;
    const attempt =
      pendingRef.current ??
      (preview && detail
        ? {
            uploadId: detail.id,
            request: {
              items: preview.items,
              idempotencyKey: crypto.randomUUID(),
            },
          }
        : null);
    if (!attempt) return;
    committingRef.current = true;
    storePending(attempt);
    setBusy(true);
    setError('');
    try {
      const result = await commitBankPayments(attempt.request);
      storePending(null);
      setPreview(null);
      setNotice(
        `Добавлено продаж: ${result.createdCount}. Связано с существующими: ${result.linkedCount}. Проблемные операции сохранены.`,
      );
      onChanged();
      window.dispatchEvent(new Event('smtechno-bank-changed'));
      await refresh(attempt.uploadId);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status >= 400 && e.status < 500)
        storePending(null);
      setError(errorMessage(e));
    } finally {
      committingRef.current = false;
      setBusy(false);
    }
  }
  const frozen = busy || pending !== null;
  const selectedOps =
    detail?.operations.filter(
      (op) => selected.includes(op.id) && op.status === 'ready',
    ) ?? [];
  const selectedAccount = accounts?.accounts.find(
    (account) => String(account.id) === accountId,
  );
  return (
    <div className={styles.body}>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <div>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => {
                setError('');
                setRetry((v) => v + 1);
              }}
            >
              Повторить загрузку
            </button>
          </div>
        </div>
      )}
      {notice && <output className={styles.notice}>{notice}</output>}
      {pending && (
        <section
          className={styles.confirmation}
          aria-label="Незавершённое подтверждение"
        >
          <b>Ответ на подтверждение ещё не получен</b>
          <p className={styles.muted}>
            Повторите тот же запрос: повторных продаж не появится. До получения
            результата другие решения недоступны.
          </p>
          <button
            className={styles.primary}
            disabled={busy}
            onClick={() => void confirm()}
          >
            Повторить подтверждение
          </button>
        </section>
      )}
      <section className={styles.panel}>
        <h3>Загрузить выписку</h3>
        <p className={styles.muted}>
          XLSX · рублёвый счёт · суммы поступлений полностью с НДС. Файл
          доступен только администраторам.
        </p>
        {!accounts ? (
          <output>Загрузка организаций и счетов…</output>
        ) : (
          <>
            <form onSubmit={(event) => void upload(event)}>
              <div className={styles.form}>
                <label className={styles.field}>
                  Организация и счёт
                  <select
                    aria-label="Организация и счёт"
                    required
                    value={accountId}
                    disabled={frozen}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">Выберите подтверждённый счёт</option>
                    {accounts.accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.organizationName} · {a.account}
                        </option>
                      ))}
                  </select>
                  {selectedAccount && (
                    <output className={styles.selectedValue}>
                      {selectedAccount.organizationName} ·{' '}
                      {selectedAccount.account}
                    </output>
                  )}
                </label>
                <label className={styles.field}>
                  Файл выписки XLSX
                  <input
                    required
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={frozen}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="mt-3">
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={frozen || !file || !accountId}
                >
                  {busy ? 'Подождите…' : 'Прочитать выписку'}
                </button>
              </div>
            </form>
            {!accounts.accounts.length && (
              <p className={styles.warning}>
                Сначала подтвердите банковский счёт организации в настройке
                ниже.
              </p>
            )}
            <AccountSetup
              accounts={accounts}
              disabled={frozen}
              onSave={(payload) =>
                action(async () => {
                  const account = await saveBankAccount(payload);
                  setAccounts(await fetchBankAccounts());
                  setAccountId(String(account.id));
                  setNotice('Счёт подтверждён для импорта.');
                })
              }
            />
          </>
        )}
      </section>
      <section className={styles.panel}>
        <div className={styles.heading}>
          <h3>История загрузок</h3>
          <button
            className={styles.button}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? 'Свернуть историю' : 'Открыть историю загрузок'}
          </button>
        </div>
        {historyOpen && (
          <div className={styles.history}>
            {uploads.length ? (
              uploads.map((item) => (
                <button
                  className={styles.button}
                  key={item.id}
                  disabled={frozen}
                  onClick={() =>
                    void action(async () => {
                      acceptDetail(await fetchBankUpload(item.id));
                      setNotice('');
                    })
                  }
                >
                  <span>
                    {item.organizationName}
                    <br />
                    <span className={styles.muted}>
                      {item.periodStart && dateLabel(item.periodStart)} —{' '}
                      {item.periodEnd && dateLabel(item.periodEnd)} ·{' '}
                      {item.filename}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className={styles.muted}>Сохранённых выписок пока нет.</p>
            )}
          </div>
        )}
      </section>
      {detail && (
        <>
          <section
            className={styles.panel}
            aria-label="Результат чтения выписки"
          >
            <div className={styles.heading}>
              <h3>{detail.organizationName}</h3>
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={frozen}
                  onClick={() => void action(() => refresh(detail.id))}
                >
                  Обновить проверки
                </button>
                <button
                  className={styles.button}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await downloadBankStatement(detail.id);
                    })
                  }
                >
                  Скачать исходную выписку
                </button>
              </div>
            </div>
            <p className={styles.muted}>
              {detail.account} · {detail.currency} ·{' '}
              {detail.periodStart && dateLabel(detail.periodStart)} —{' '}
              {detail.periodEnd && dateLabel(detail.periodEnd)} ·{' '}
              {detail.operationCount} операций
            </p>
            <div className={styles.metrics}>
              {[
                [
                  'Готово',
                  `${detail.summary.readyCount} · ${money(detail.summary.readyAmount)}`,
                ],
                ['Уже учтено', String(detail.summary.accountedCount)],
                ['Требуют проверки', String(detail.summary.reviewCount)],
                ['Исключено', String(detail.summary.excludedCount)],
              ].map(([label, value]) => (
                <div className={styles.metric} key={label}>
                  <span className={styles.muted}>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <table className={styles.reconciliation}>
              <caption>Сверка всех операций с оборотами файла</caption>
              <thead>
                <tr>
                  <th>Оборот</th>
                  <th>В файле</th>
                  <th>Прочитано</th>
                  <th>Разница</th>
                </tr>
              </thead>
              <tbody>
                {(['credit', 'debit'] as const).map((side) => (
                  <tr key={side}>
                    <th>{side === 'credit' ? 'Входящий' : 'Исходящий'}</th>
                    <td>{money(detail.reconciliation[side].expected)}</td>
                    <td>{money(detail.reconciliation[side].read)}</td>
                    <td>{money(detail.reconciliation[side].difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>
              Входящий остаток: {money(detail.metadata.openingBalance ?? null)}.
              Исходящий: {money(detail.metadata.closingBalance ?? null)}. «—»
              означает, что значение не указано.
            </p>
            {!detail.reconciliation.valid && (
              <p className={styles.error}>
                Обороты не сошлись. Проведение всей выписки заблокировано.
              </p>
            )}
            {detail.errors.map((item, index) => (
              <p className={styles.error} key={index}>
                {item}
              </p>
            ))}
          </section>
          <div className={styles.actions}>
            <h3>Операции выписки</h3>
            <button
              className={styles.button}
              disabled={frozen || detail.status === 'blocked'}
              onClick={() => {
                setSelected(
                  detail.operations
                    .filter((op) => op.status === 'ready')
                    .map((op) => op.id),
                );
                setPreview(null);
              }}
            >
              Выбрать готовые
            </button>
          </div>
          <div className={styles.list}>
            {detail.operations.map((op) => (
              <BankOperationCard
                key={`${op.id}:${op.version}`}
                operation={op}
                disabled={frozen}
                selected={selected.includes(op.id)}
                onSelect={(checked) => {
                  setSelected((ids) =>
                    checked
                      ? [...ids, op.id]
                      : ids.filter((id) => id !== op.id),
                  );
                  setPreview(null);
                }}
                onSaved={() =>
                  action(async () => {
                    await refresh(detail.id);
                    window.dispatchEvent(new Event('smtechno-bank-changed'));
                  })
                }
              />
            ))}
          </div>
          {!preview && (
            <div className={styles.actions}>
              <p className={styles.muted}>
                Выбрано {selectedOps.length} оплат ·{' '}
                {money(
                  selectedOps.reduce((sum, op) => sum + (op.amount ?? 0), 0),
                )}{' '}
                с НДС
              </p>
              <button
                className={styles.primary}
                disabled={
                  frozen ||
                  !selectedOps.length ||
                  detail.status === 'blocked' ||
                  !detail.reconciliation.valid
                }
                onClick={() => void calculatePreview()}
              >
                Проверить итог перед добавлением
              </button>
            </div>
          )}
          {preview && (
            <section
              className={styles.confirmation}
              aria-label="Изменение вознаграждения"
            >
              <h3>Результат выбранных оплат</h3>
              <p className={styles.muted}>
                Связанных с существующими продажами: {preview.data.linkedCount}.
                Они не увеличивают итог повторно.
              </p>
              <div className={styles.effects}>
                {preview.data.effects.map((effect) => (
                  <article
                    className={styles.effect}
                    key={`${effect.managerId}:${effect.month}`}
                  >
                    <b>
                      {effect.managerName} · {monthLabel(effect.month)}
                    </b>
                    <p>
                      Продажи: {money(effect.before.salesTotal)} →{' '}
                      {money(effect.after.salesTotal)}
                    </p>
                    <p>
                      Комиссия: {money(effect.before.commission)} →{' '}
                      {money(effect.after.commission)}
                    </p>
                    <p>
                      Фикс: {money(effect.before.fixed)} →{' '}
                      {money(effect.after.fixed)}
                    </p>
                    <p>
                      Итого начислено: {money(effect.before.income)} →{' '}
                      {money(effect.after.income)}
                    </p>
                  </article>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={frozen}
                  onClick={() => setPreview(null)}
                >
                  Вернуться к выбору
                </button>
                <button
                  className={styles.primary}
                  disabled={frozen}
                  onClick={() => void confirm()}
                >
                  Добавить {preview.data.count} оплат на{' '}
                  {money(preview.data.amount)} с НДС
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AccountSetup({
  accounts,
  disabled,
  onSave,
}: {
  accounts: BankAccounts;
  disabled: boolean;
  onSave: (payload: {
    organizationId: number;
    ownerInn: string;
    account: string;
    bik: string;
    reason: string;
  }) => Promise<void>;
}) {
  const [organizationId, setOrganizationId] = useState('');
  const [inn, setInn] = useState('');
  const [account, setAccount] = useState('');
  const [bik, setBik] = useState('');
  const [reason, setReason] = useState('');
  return (
    <details className={styles.details}>
      <summary>Подтвердить счёт организации для импорта</summary>
      <p className={styles.muted}>
        Проверьте реквизиты нашей организации. Это разрешает импорт выписок
        только по указанному счёту.
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            organizationId: Number(organizationId),
            ownerInn: inn,
            account,
            bik,
            reason,
          });
        }}
      >
        <label className={styles.field}>
          Наша организация
          <select
            required
            disabled={disabled}
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setInn(
                accounts.organizations.find(
                  (org) => String(org.id) === e.target.value,
                )?.inn ?? '',
              );
            }}
          >
            <option value="">Выберите организацию</option>
            {accounts.organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          ИНН владельца счёта
          <input
            required
            inputMode="numeric"
            maxLength={12}
            value={inn}
            disabled={disabled}
            onChange={(e) => setInn(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Расчётный счёт
          <input
            required
            inputMode="numeric"
            maxLength={20}
            value={account}
            disabled={disabled}
            onChange={(e) => setAccount(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          БИК банка
          <input
            required
            inputMode="numeric"
            maxLength={9}
            value={bik}
            disabled={disabled}
            onChange={(e) => setBik(e.target.value)}
          />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          Основание подтверждения счёта
          <input
            required
            maxLength={500}
            value={reason}
            disabled={disabled}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className={styles.full}>
          <button
            className={styles.button}
            type="submit"
            disabled={disabled || !organizationId || !reason.trim()}
          >
            Подтвердить реквизиты счёта
          </button>
        </div>
      </form>
      {!accounts.organizations.length && (
        <p className={styles.warning}>
          В справочнике пока нет наших организаций. Заполните его штатным
          способом перед настройкой счёта.
        </p>
      )}
    </details>
  );
}
