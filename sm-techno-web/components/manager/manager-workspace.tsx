'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  LockKeyhole,
  History,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { fetchManagerDashboard, fetchManagers } from '@/lib/api';
import type {
  ManagerChoice,
  ManagerDashboard,
  ManagerSale,
} from '@/lib/manager-types';
import { ManagerAvatar } from './manager-avatar';
import { ManagerEditor, type EditorKind } from './manager-editor';
import { ManagerHistory } from './manager-history';
import { ManagerSales } from './manager-sales';
import { errorMessage, money, monthLabel, shiftMonth } from './format';
import styles from './manager.module.css';
const ManagerChart = dynamic(() => import('./manager-chart'), {
  ssr: false,
  loading: () => <output className={styles.panel}>Загрузка графика…</output>,
});
export function ManagerWorkspace() {
  const { user, isAdmin } = useAuth();
  const [month, setMonth] = useState(() =>
    new Date()
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
      .slice(0, 7),
  );
  const [managerId, setManagerId] = useState<number | undefined>();
  const [managers, setManagers] = useState<ManagerChoice[]>([]);
  const [managerError, setManagerError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    fetchManagers()
      .then((items) => {
        if (active) setManagers(items);
      })
      .catch((e) => {
        if (active) setManagerError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);
  return (
    <div className={styles.workspace}>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Личный кабинет</p>
          <h1>Продажи и вознаграждение</h1>
          <p className={styles.hint}>План, начисления и результат за месяц</p>
        </div>
        <div className={styles.period}>
          <button
            aria-label="Предыдущий месяц"
            className={styles.iconButton}
            disabled={month === '1900-01'}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            <span className={styles.srOnly}>Месяц</span>
            <input
              type="month"
              min="1900-01"
              max="2199-12"
              value={month}
              onChange={(e) => {
                if (/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value))
                  setMonth(e.target.value);
              }}
            />
          </label>
          <button
            aria-label="Следующий месяц"
            className={styles.iconButton}
            disabled={month === '2199-12'}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {isAdmin && (
        <div className={styles.adminBar}>
          <label>
            Кабинет сотрудника
            <select
              value={managerId ?? ''}
              onChange={(e) =>
                setManagerId(
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            >
              <option value="">Мой кабинет</option>
              {managers
                .filter((m) => m.userId !== user.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.archived ? ' · архив' : !m.active ? ' · неактивен' : ''}
                  </option>
                ))}
            </select>
          </label>
          <span>Вы можете управлять продажами и условиями сотрудников.</span>
          {managerError && (
            <p role="alert" className={styles.error}>
              {managerError}
            </p>
          )}
        </div>
      )}
      <CabinetLoader
        key={`${user.id}:${managerId ?? 'self'}:${month}:${revision}`}
        month={month}
        managerId={managerId}
        admin={isAdmin}
        onRefresh={() => setRevision((r) => r + 1)}
      />
    </div>
  );
}
function CabinetLoader({
  month,
  managerId,
  admin,
  onRefresh,
}: {
  month: string;
  managerId?: number;
  admin: boolean;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<ManagerDashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchManagerDashboard(month, managerId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [month, managerId]);
  if (error)
    return (
      <section className={styles.panel}>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <button className={styles.secondary} onClick={onRefresh}>
          Повторить
        </button>
      </section>
    );
  if (!data)
    return <output className={styles.panel}>Загрузка кабинета…</output>;
  return <Cabinet data={data} admin={admin} onRefresh={onRefresh} />;
}
function Cabinet({
  data,
  admin,
  onRefresh,
}: {
  data: ManagerDashboard;
  admin: boolean;
  onRefresh: () => void;
}) {
  const [editor, setEditor] = useState<{
    kind: EditorKind;
    sale?: ManagerSale;
  } | null>(null);
  const [history, setHistory] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const summary = data.summary,
    terms = data.terms;
  const achieved = terms !== null && summary.salesTotal >= terms.plan;
  const progress =
    terms === null
      ? null
      : terms.plan === 0
        ? 100
        : (summary.salesTotal / terms.plan) * 100;
  return (
    <>
      <section className={styles.profile}>
        <ManagerAvatar
          key={data.account.avatarVersion}
          account={data.account}
          editable={admin}
          onSaved={onRefresh}
        />
        <div className={styles.person}>
          <h2>{data.account.name}</h2>
          <p>
            {data.account.archived
              ? 'Архив сотрудника'
              : 'Менеджер по продажам'}{' '}
            · {monthLabel(data.month)}
          </p>
        </div>
        <div className={styles.profileActions}>
          <span
            className={achieved ? styles.statusGreen : styles.statusNeutral}
          >
            {data.closed
              ? 'Месяц закрыт'
              : !terms
                ? 'Условия не заданы'
                : achieved
                  ? 'План выполнен'
                  : 'План в работе'}
          </span>
          {admin && !data.closed && (
            <button
              className={styles.secondary}
              onClick={() => setEditor({ kind: 'terms' })}
            >
              Настроить условия
            </button>
          )}
        </div>
      </section>
      {!terms && (
        <p className={styles.notice}>
          {admin
            ? 'Задайте план и условия начисления. Продажи можно вносить уже сейчас.'
            : 'Администратор ещё не установил условия этого месяца. Начисления появятся после настройки.'}
        </p>
      )}
      <section className={styles.metrics} aria-label="Результаты месяца">
        {[
          [
            'Продажи за месяц',
            money(summary.salesTotal),
            `${summary.count} продаж за месяц`,
          ],
          [
            'Фиксированная часть',
            money(summary.fixed),
            terms
              ? terms.mode === 'always'
                ? 'Независимо от плана'
                : achieved
                  ? 'Начислено за выполнение плана'
                  : `При выполнении: ${money(terms.fixed)}`
              : 'Условия не заданы',
          ],
          [
            'Комиссия сверх плана',
            money(summary.commission),
            `База: ${money(summary.above)}`,
          ],
          [
            'Итого начислено',
            money(summary.income),
            'Фикс + комиссия · до налогов',
          ],
        ].map(([title, value, hint], i) => (
          <article
            className={`${styles.metric} ${i === 3 ? styles.total : ''}`}
            key={title}
          >
            <h2>{title}</h2>
            <p>{value}</p>
            <small>{hint}</small>
          </article>
        ))}
      </section>
      <div className={styles.dashboardGrid}>
        <ManagerChart data={data} />
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>План на месяц</h2>
            <span className={styles.hint}>{monthLabel(data.month)}</span>
          </div>
          <div className={styles.planNumber}>
            {progress === null
              ? '—'
              : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(progress)}%`}
            <small>выполнено</small>
          </div>
          <progress
            className={styles.progress}
            aria-label="Выполнение плана"
            max={100}
            value={Math.min(progress ?? 0, 100)}
            aria-valuetext={
              progress === null
                ? 'Условия не заданы'
                : `${progress.toFixed(1)} процентов`
            }
          />
          <div className={styles.planValues}>
            <span>
              План <b>{money(terms?.plan ?? null)}</b>
            </span>
            <span>
              {achieved
                ? `+${money(summary.above)}`
                : `Осталось ${money(summary.remaining)}`}
            </span>
          </div>
          <div className={styles.callout}>
            <b>
              {achieved
                ? 'План выполнен. Дальше — больше.'
                : 'Каждая продажа приближает к цели'}
            </b>
            <p>
              Комиссия начисляется только с суммы сверх плана, по ставке каждой
              продажи.
            </p>
          </div>
          <details className={styles.conditions}>
            <summary>Условия начисления</summary>
            <p>
              План: {money(terms?.plan ?? null)}. Фикс:{' '}
              {money(terms?.fixed ?? null)}
              {terms?.mode === 'always'
                ? ' независимо от выполнения плана.'
                : ' при выполнении плана.'}
            </p>
            <p>
              Для продажи на границе плана учитывается только часть сверх плана.
              Порядок: дата, затем номер продажи. Начисления не подтверждают
              выплату денег.
            </p>
          </details>
        </section>
      </div>
      <section className={`${styles.panel} ${styles.salesPanel}`}>
        <div className={styles.salesHeading}>
          <div>
            <h2>Продажи</h2>
            <p className={styles.hint}>Расшифровка комиссии по каждой сделке</p>
          </div>
          <div className={styles.salesTools}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
                setPage(1);
              }}
              className={styles.search}
            >
              <input
                aria-label="Поиск по клиенту или номеру"
                placeholder="Клиент или № продажи"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={300}
              />
              <button type="submit" className={styles.secondary}>
                Найти
              </button>
            </form>
            {admin && !data.closed && (
              <button
                className={styles.primary}
                onClick={() => setEditor({ kind: 'sale' })}
              >
                <Plus size={16} />
                Добавить продажу
              </button>
            )}
          </div>
        </div>
        <SalesPage
          key={`${search}:${page}`}
          data={data}
          page={page}
          query={search}
          admin={admin}
          onPage={setPage}
          onEdit={(s) => setEditor({ kind: 'sale', sale: s })}
          onCancel={(s) => setEditor({ kind: 'cancel', sale: s })}
        />
      </section>
      {admin && (
        <div className={styles.bottomActions}>
          <button className={styles.secondary} onClick={() => setHistory(true)}>
            <History size={16} />
            История изменений
          </button>
          <button
            className={styles.secondary}
            disabled={!terms && !data.closed}
            onClick={() =>
              setEditor({ kind: data.closed ? 'reopen' : 'close' })
            }
          >
            <LockKeyhole size={16} />
            {data.closed ? 'Открыть месяц' : 'Закрыть месяц'}
          </button>
        </div>
      )}
      {editor && (
        <ManagerEditor
          data={data}
          kind={editor.kind}
          sale={editor.sale}
          onClose={() => setEditor(null)}
          onSaved={onRefresh}
        />
      )}
      {history && (
        <ManagerHistory data={data} onClose={() => setHistory(false)} />
      )}
    </>
  );
}
function SalesPage({
  data,
  page,
  query,
  admin,
  onPage,
  onEdit,
  onCancel,
}: {
  data: ManagerDashboard;
  page: number;
  query: string;
  admin: boolean;
  onPage: (p: number) => void;
  onEdit: (s: ManagerSale) => void;
  onCancel: (s: ManagerSale) => void;
}) {
  const initial = page === 1 && !query;
  const [result, setResult] = useState<ManagerDashboard | null>(
    initial ? data : null,
  );
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (initial) return;
    let active = true;
    fetchManagerDashboard(data.month, data.account.id, query, page)
      .then((d) => {
        if (active) setResult(d);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [data.month, data.account.id, initial, page, query, retry]);
  if (error)
    return (
      <div className={styles.empty}>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <button
          className={styles.secondary}
          onClick={() => {
            setError('');
            setRetry((r) => r + 1);
          }}
        >
          Повторить поиск
        </button>
      </div>
    );
  if (!result)
    return <output className={styles.empty}>Загрузка продаж…</output>;
  return (
    <>
      <div className={styles.tableHead} aria-hidden="true">
        <span>Дата</span>
        <span>Клиент / документ</span>
        <span>Сумма</span>
        <span>Ставка</span>
        <span>Начислено</span>
        <span />
      </div>
      <ManagerSales
        sales={result.sales}
        onEdit={admin && !data.closed ? onEdit : undefined}
        onCancel={admin && !data.closed ? onCancel : undefined}
      />
      <div className={styles.pagination}>
        <span>Найдено: {result.total}</span>
        <button
          className={styles.secondary}
          disabled={result.page <= 1}
          onClick={() => onPage(result.page - 1)}
        >
          Назад
        </button>
        <span>
          {result.page} / {result.pages}
        </span>
        <button
          className={styles.secondary}
          disabled={result.page >= result.pages}
          onClick={() => onPage(result.page + 1)}
        >
          Далее
        </button>
      </div>
    </>
  );
}
