'use client';
import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { cancelBankCompanyPayment, changeBankDecision, searchBankClients } from '@/lib/api';
import type {
  BankClassification,
  BankClientChoice,
  BankDecisionChange,
  BankOperation,
} from '@/lib/bank-types';
import { bankStatusLabel, canSelectBankPayment } from './bank-format';
import { dateLabel, errorMessage, money } from './format';
import styles from './bank.module.css';

export function BankOperationCard({
  operation: op,
  selected,
  disabled,
  onSelect,
  onSaved,
}: {
  operation: BankOperation;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [classification, setClassification] = useState<BankClassification>(
    op.classification,
  );
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<BankClientChoice[]>(
    op.candidateClients,
  );
  const [clientId, setClientId] = useState(
    op.clientId ? String(op.clientId) : '',
  );
  const [duplicate, setDuplicate] = useState<'new' | 'link' | 'review' | ''>(
    '',
  );
  const [saleId, setSaleId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(op.invoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = useState(op.invoiceDate ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const chosenClient = clients.find((client) => String(client.id) === clientId);
  const mismatch =
    chosenClient &&
    (chosenClient.inn ?? '').replace(/\s/g, '') !==
      (op.inn ?? '').replace(/\s/g, '');
  async function search() {
    setBusy(true);
    setError('');
    try {
      setClients((await searchBankClients(query)).items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError('');
    const payload: BankDecisionChange = {
      version: op.version,
      classification,
      reason: reason.trim(),
      invoiceNumber: invoiceNumber.trim() || null,
      invoiceDate: invoiceDate || null,
    };
    if (clientId) payload.clientId = Number(clientId);
    if (duplicate) payload.duplicateAction = duplicate;
    if (duplicate === 'link' && saleId) payload.linkSaleId = Number(saleId);
    try {
      await changeBankDecision(op.id, payload);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveDuplicate(event: SubmitEvent) {
    event.preventDefault();
    if (!reason.trim() || !duplicate || (duplicate === 'link' && !saleId)) return;
    setBusy(true);
    setError('');
    try {
      await changeBankDecision(op.id, {
        version: op.version,
        reason: reason.trim(),
        duplicateAction: duplicate,
        ...(duplicate === 'link' ? { linkSaleId: Number(saleId) } : {}),
      });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = disabled || busy;
  return (
    <article
      className={styles.operation}
      aria-label={`Оплата ${op.documentNumber ?? op.id}`}
    >
      <div className={styles.operationHead}>
        <input
          type="checkbox"
          aria-label={`Выбрать оплату ${op.documentNumber ?? op.id}`}
          checked={selected}
          disabled={locked || !canSelectBankPayment(op)}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <div className={styles.operationInfo}>
          <b>{op.clientName || op.payerName || 'Плательщик не указан'}</b>
          <span className={styles.muted}>
            {op.date ? dateLabel(op.date) : 'Дата не определена'} · платёж №{' '}
            {op.documentNumber || '—'} · ИНН {op.inn || '—'}
          </span>
        </div>
        <div className={styles.amount}>
          {money(op.amount)}
          <span className={styles.muted}> с НДС</span>
        </div>
      </div>
      <div className={styles.operationInfo}>
        <span>
          Клиент: <b>{op.clientName || 'Не сопоставлен'}</b>
        </span>
        <span>
          Менеджер: <b>{op.managerName || 'Не назначен'}</b>
        </span>
        <span className={styles.muted}>
          Счёт{op.invoiceNumber ? ` № ${op.invoiceNumber}` : ' не указан'}
          {op.invoiceDate ? ` от ${dateLabel(op.invoiceDate)}` : ''}
        </span>
      </div>
      <span
        className={`${styles.badge} ${op.status === 'ready' || op.status === 'accounted' ? styles.ready : op.status !== 'excluded' ? styles.review : ''}`}
      >
        {op.companyCancelled
          ? 'Общая продажа отменена'
          : op.cancelled
          ? 'Учтённая продажа отменена'
          : bankStatusLabel[op.status]}
      </span>
      {op.companyAccounted && !op.companyCancelled && (
        <p className={styles.notice}>Учтено в общих продажах</p>
      )}
      {op.companyAccounted && !op.companyCancelled && !op.saleId && (
        <p className={styles.warning}>Не начислено менеджеру · {bankStatusLabel[op.status]}</p>
      )}
      <p className={styles.muted}>{op.explanation}</p>
      {op.errors.map((error, index) => (
        <p key={index} className={styles.error}>
          {error}
        </p>
      ))}
      {op.warnings.map((warning, index) => (
        <p key={index} className={styles.warning}>
          {warning}
        </p>
      ))}
      <details className={styles.details}>
        <summary>Назначение и банковские реквизиты</summary>
        <p>{op.purpose || 'Назначение не указано'}</p>
        <dl className={styles.facts}>
          {[
            ['Плательщик', op.payerName],
            ['ИНН / КПП', `${op.inn || '—'} / ${op.kpp || '—'}`],
            ['Счёт плательщика', op.account],
            ['БИК', op.bik],
            ['Банк', op.bankName],
            [
              'Направление',
              op.direction === 'credit'
                ? 'Поступление'
                : op.direction === 'debit'
                  ? 'Списание'
                  : 'Не определено',
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || '—'}</dd>
            </div>
          ))}
        </dl>
        {op.invoiceReferences.length > 1 && (
          <div>
            <b>Счета в назначении</b>
            <ul>
              {op.invoiceReferences.map((reference, index) => (
                <li key={index}>
                  {reference.text ||
                    `№ ${reference.number ?? '—'}${reference.date ? ` от ${dateLabel(reference.date)}` : ''}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
      {op.id < 0 && (
        <p className={styles.warning}>
          Исправьте исходные данные в XLSX и загрузите исправленную выписку.
          Сумму, дату и другие критические банковские поля нельзя исправить
          вручную в предварительном результате.
        </p>
      )}
      {op.id > 0 && op.companyAccounted && !op.companyCancelled && !op.saleId && op.status === 'possible_duplicate' && (
        <details className={styles.details}>
          <summary>Разрешить возможный дубль</summary>
          <p className={styles.muted}>
            Оплата уже учтена в общих продажах. Проверьте совпадения перед начислением менеджеру.
            Связывание с существующей продажей не увеличивает итог повторно.
          </p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <form className={styles.form} onSubmit={(event) => void saveDuplicate(event)}>
            {op.probableDuplicates.map((item) => (
              <p className={`${styles.muted} ${styles.full}`} key={item.id}>
                Банковская операция № {item.id} · {dateLabel(item.date)} · документ {item.documentNumber || '—'} · {money(item.amount)}
                {item.saleId ? ` · продажа № ${item.saleId}` : ''}
              </p>
            ))}
            <label className={styles.field}>
              Решение по возможному дублю
              <select required value={duplicate} disabled={locked} onChange={(event) => setDuplicate(event.target.value as typeof duplicate)}>
                <option value="">Выберите решение</option>
                <option value="review">Оставить на проверку</option>
                <option value="new">Это отдельная новая оплата</option>
                <option value="link">Связать с существующей продажей</option>
              </select>
            </label>
            {duplicate === 'link' && (
              <label className={styles.field}>
                Существующая продажа
                <select required value={saleId} disabled={locked} onChange={(event) => setSaleId(event.target.value)}>
                  <option value="">Выберите продажу 1:1</option>
                  {op.candidateSales.map((sale) => (
                    <option key={sale.id} value={sale.id}>№ {sale.id} · {sale.managerName} · {dateLabel(sale.date)} · {money(sale.amount)} · {sale.client}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={`${styles.field} ${styles.full}`}>
              Причина решения по дублю
              <input required maxLength={500} disabled={locked} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className={styles.full}>
              <button type="submit" className={styles.button} disabled={locked || !reason.trim() || !duplicate || (duplicate === 'link' && !saleId)}>Сохранить решение по дублю</button>
            </div>
          </form>
        </details>
      )}
      {op.id > 0 && op.companyAccounted && !op.companyCancelled && !op.saleId && (
        <details className={styles.details}>
          <summary>Отменить учёт в общих продажах</summary>
          <p className={styles.muted}>Поступление останется в журнале. Повторная загрузка не восстановит продажу.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault();
            if (!cancelReason.trim()) return;
            setBusy(true);
            setError('');
            void cancelBankCompanyPayment(op.id, { version: op.version, reason: cancelReason.trim() })
              .then(() => onSaved())
              .catch((e) => setError(errorMessage(e)))
              .finally(() => setBusy(false));
          }}>
            <label className={`${styles.field} ${styles.full}`}>
              Причина отмены общей продажи
              <input required maxLength={500} disabled={locked} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            </label>
            <button className={styles.button} disabled={locked || !cancelReason.trim()} type="submit">Отменить общую продажу</button>
          </form>
        </details>
      )}
      {op.id > 0 && op.status !== 'accounted' && !op.companyAccounted && !op.companyCancelled && (
        <details className={styles.details}>
          <summary>Проверить и изменить решение</summary>
          <p className={styles.muted}>
            Решение сохраняется отдельно от исходного платежа. Проведение
            выполняется общей кнопкой после проверки итогов.
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <form className={styles.form} onSubmit={(e) => void save(e)}>
            <label className={styles.field}>
              Тип поступления
              <select
                value={classification}
                disabled={locked}
                onChange={(e) =>
                  setClassification(e.target.value as BankClassification)
                }
              >
                <option value="sale">
                  Оплата покупателя — кандидат в продажи
                </option>
                <option value="review">Оставить на проверку</option>
                <option value="excluded">Исключить из продаж</option>
                <option value="return">Возврат — ручная корректировка</option>
              </select>
            </label>
            <label className={styles.field}>
              Выбранный клиент
              <select
                aria-label="Выбранный клиент"
                value={clientId}
                disabled={locked}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">
                  {op.clientId ? 'Не менять клиента' : 'Не выбран'}
                </option>
                {op.clientId &&
                  !clients.some((client) => client.id === op.clientId) && (
                    <option value={op.clientId}>{op.clientName}</option>
                  )}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.inn || 'без ИНН'}
                    {client.kpp ? ` / ${client.kpp}` : ''}
                  </option>
                ))}
              </select>
              {(chosenClient?.name || op.clientName) && (
                <output className={styles.selectedValue}>
                  {chosenClient?.name || op.clientName}
                  {chosenClient?.inn ? ` · ИНН ${chosenClient.inn}` : ''}
                  {chosenClient?.kpp ? ` / ${chosenClient.kpp}` : ''}
                </output>
              )}
            </label>
            <div className={`${styles.field} ${styles.full}`}>
              <label>
                Найти клиента CRM
                <input
                  value={query}
                  disabled={locked}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Наименование или ИНН"
                  maxLength={200}
                />
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={locked || !query.trim()}
                  onClick={() => void search()}
                >
                  Найти клиента
                </button>
                <Link
                  className={styles.link}
                  href="/crm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть CRM для создания клиента
                </Link>
              </div>
            </div>
            {mismatch && (
              <p className={`${styles.warning} ${styles.full}`}>
                ИНН выбранного клиента отличается от ИНН плательщика.
                Подтвердите принадлежность оплаты в причине решения. Исходный
                плательщик сохранится.
              </p>
            )}
            <label className={styles.field}>
              Номер счёта на оплату
              <input
                value={invoiceNumber}
                disabled={locked}
                maxLength={100}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Дата счёта на оплату
              <input
                type="date"
                min="1900-01-01"
                max="2199-12-31"
                value={invoiceDate}
                disabled={locked}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
            {(op.status === 'possible_duplicate' ||
              op.candidateSales.length > 0 ||
              op.probableDuplicates.length > 0) && (
              <>
                <div className={`${styles.warning} ${styles.full}`}>
                  Возможны повторы. Связывание с существующей продажей не
                  увеличивает продажи и вознаграждение. Подтверждение отдельной
                  оплаты добавляет новую продажу.
                </div>
                {op.probableDuplicates.map((item) => (
                  <p className={`${styles.muted} ${styles.full}`} key={item.id}>
                    Банковская операция № {item.id} · {dateLabel(item.date)} ·
                    документ {item.documentNumber || '—'} · {money(item.amount)}
                    {item.saleId ? ` · продажа № ${item.saleId}` : ''}
                  </p>
                ))}
                <label className={styles.field}>
                  Решение по возможному дублю
                  <select
                    value={duplicate}
                    disabled={locked}
                    onChange={(e) =>
                      setDuplicate(e.target.value as typeof duplicate)
                    }
                  >
                    <option value="">Не изменять решение</option>
                    <option value="review">Оставить на проверку</option>
                    <option value="new">Это отдельная новая оплата</option>
                    <option value="link">
                      Связать с существующей продажей
                    </option>
                  </select>
                </label>
                {duplicate === 'link' && (
                  <label className={styles.field}>
                    Существующая продажа
                    <select
                      required
                      value={saleId}
                      disabled={locked}
                      onChange={(e) => setSaleId(e.target.value)}
                    >
                      <option value="">Выберите продажу 1:1</option>
                      {op.candidateSales.map((sale) => (
                        <option key={sale.id} value={sale.id}>
                          № {sale.id} · {sale.managerName} ·{' '}
                          {dateLabel(sale.date)} · {money(sale.amount)} ·{' '}
                          {sale.client}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <label className={`${styles.field} ${styles.full}`}>
              Причина решения
              <input
                required
                value={reason}
                disabled={locked}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {classification === 'excluded' && (
              <p className={`${styles.warning} ${styles.full}`}>
                Оплата сохранится в журнале и не будет засчитана в продажи.
              </p>
            )}
            {classification === 'return' && (
              <p className={`${styles.warning} ${styles.full}`}>
                Возврат не создаёт отрицательную продажу и не отменяет ранее
                учтённую. Нужна штатная ручная корректировка.
              </p>
            )}
            <div className={styles.full}>
              <button
                className={styles.button}
                disabled={locked || !reason.trim()}
                type="submit"
              >
                Сохранить решение
              </button>
            </div>
          </form>
        </details>
      )}
    </article>
  );
}
