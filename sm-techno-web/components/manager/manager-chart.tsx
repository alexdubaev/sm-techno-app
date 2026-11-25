'use client';
import { Table } from '@/components/ui/table';
import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ManagerDashboard } from '@/lib/manager-types';
import { money } from './format';
import styles from './manager.module.css';

const compactAmount = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export default function ManagerChart({ data }: { data: ManagerDashboard }) {
  const [daily, setDaily] = useState(false);
  const fillId = useId();
  const panelClass = `${styles.panel} app-surface`;
  const hasSales = data.summary.count > 0 || data.daily.some((day) => day.amount !== 0 || day.cumulative !== 0);
  if (!hasSales) {
    return (
      <section className={panelClass} aria-label="График продаж">
        <h2>Динамика продаж</h2>
        <p className={styles.chartEmpty}>За этот месяц продаж пока нет.</p>
      </section>
    );
  }

  const points = data.daily.map((d) => ({
    ...d,
    amount: d.amount / 100,
    cumulative: d.cumulative / 100,
  }));
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--manager-chart-grid, #e3e8f0)" strokeDasharray="4 4" />
      <XAxis
        dataKey="day"
        tickLine={false}
        axisLine={false}
        minTickGap={20}
        tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
      />
      <YAxis
        width={58}
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
        tickFormatter={(v: number) => `${compactAmount.format(v)}\u00a0₽`}
      />
      <Tooltip
        contentStyle={{
          background: 'var(--panel-muted)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
          borderRadius: 'var(--app-control-radius)',
        }}
        formatter={(v) => money(Math.round(Number(v) * 100))}
        labelFormatter={(day) => `${day} число`}
      />
    </>
  );
  return (
    <section
      className={panelClass}
      aria-label="График продаж"
    >
      <div className={styles.panelHeading}>
        <h2>Динамика продаж</h2>
        <button type="button" data-app-action="secondary" className={styles.secondary} onClick={() => setDaily(!daily)}>
          {daily ? 'Накопительно' : 'По дням'}
        </button>
      </div>
      <p className={styles.hint}>
        {daily
          ? 'Сумма продаж за каждый день'
          : data.terms && data.terms.plan > 0
            ? 'Накопительные продажи и план месяца'
            : 'Накопительные продажи за месяц'}
      </p>
      <div className={styles.chart}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 320, height: 220 }}
        >
          {daily ? (
            <BarChart data={points}>
              {axes}
              <Bar
                dataKey="amount"
                name="Продажи"
                fill="var(--brand-yellow)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <AreaChart data={points}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-yellow)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--brand-yellow)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              {axes}
              <Area
                type="stepAfter"
                dataKey="cumulative"
                name="Продажи"
                stroke="#d4a100"
                strokeWidth={2}
                fill={`url(#${fillId})`}
                isAnimationActive={false}
              />
              {data.terms && data.terms.plan > 0 && (
                <ReferenceLine
                  y={data.terms.plan / 100}
                  stroke="#8996aa"
                  strokeDasharray="5 5"
                  ifOverflow="extendDomain"
                  label={{
                    value: 'План',
                    position: 'insideTopRight',
                    fill: '#6b7890',
                    fontSize: 11,
                  }}
                />
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className={styles.chartFooter}>
        <span>
          Средняя продажа{' '}
          <b>
            {money(
              data.summary.count
                ? Math.round(data.summary.salesTotal / data.summary.count)
                : 0,
            )}
          </b>
        </span>
        <span>
          {data.terms?.plan === 0 ? 'Продажи для расчёта комиссии' : 'Сверх плана'}{' '}
          <b>{money(data.terms?.plan === 0 ? data.summary.salesTotal : data.summary.above)}</b>
        </span>
      </div>
      <details className={styles.chartData}>
        <summary>Данные графика по дням</summary>
        <Table unstyled>
          <thead>
            <tr>
              <th>День</th>
              <th>Продажи</th>
              <th>Накопительно</th>
            </tr>
          </thead>
          <tbody>
            {data.daily.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{money(d.amount)}</td>
                <td>{money(d.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </details>
    </section>
  );
}
