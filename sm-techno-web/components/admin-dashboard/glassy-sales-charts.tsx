'use client';

import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesOverview } from '@/lib/admin-dashboard-types';
import styles from './dashboard.module.css';

const chartColors = ['#f3b900', '#143353', '#6c95bc', '#8b6d45', '#446583', '#b78b33'];
const compactMoney = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });

function shortDate(value: string) {
  const day = new Date(value.length === 7 ? `${value}-01` : value);
  if (Number.isNaN(day.getTime())) return value;
  return (value.length === 7 ? monthLabel : dayLabel).format(day);
}

export function GlassySalesArea({ data, large, label, money }: {
  data: SalesOverview['series'];
  large?: boolean;
  label: string;
  money: (value: number) => string;
}) {
  const fillId = useId();

  return (
    <div className={`${styles.chart} ${styles.glassyArea} ${large ? styles.largeChart : ''}`} aria-label={label}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 0, height: 0 }}>
        <AreaChart data={data} accessibilityLayer={large === true} margin={{ top: 14, right: 8, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffc400" stopOpacity={.62} />
              <stop offset="100%" stopColor="#ffc400" stopOpacity={.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#667e9b6b" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="date" minTickGap={24} tick={{ fontSize: 12, fill: '#263b54' }} tickLine={false} tickFormatter={shortDate} />
          <YAxis width={68} tick={{ fontSize: 11, fill: '#263b54' }} tickLine={false} tickFormatter={(value: number) => `${compactMoney.format(value / 100)}\u00a0₽`} />
          <Tooltip cursor={{ stroke: '#9b7000', strokeDasharray: '4 3' }} labelFormatter={value => shortDate(String(value))} formatter={value => typeof value === 'number' ? money(value) : value} />
          <Area type="monotone" dataKey="amount" name="Продажи" stroke="#e5a800" strokeWidth={3} fill={`url(#${fillId})`} dot={data.length === 1} activeDot={{ r: 5, fill: '#ffc400', stroke: '#fff', strokeWidth: 2 }} isAnimationActive="auto" animationDuration={420} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GlassySalesBreakdown({ sales, money }: {
  sales: SalesOverview;
  money: (value: number) => string;
}) {
  const [tooltipTarget, setTooltipTarget] = useState<HTMLDivElement | null>(null);
  const assigned = sales.managers.map(manager => ({ key: manager.id, name: manager.name, amount: manager.salesTotal }));
  const assignedTotal = assigned.reduce((sum, manager) => sum + manager.amount, 0);
  const unallocated = sales.totals.unallocatedSalesTotal ?? sales.totals.salesTotal - assignedTotal;
  const amounts = [...assigned, { key: 'unallocated', name: 'Не распределено', amount: unallocated }];
  const chart = amounts.filter(entry => entry.amount > 0).map((entry, index) => ({
    ...entry,
    fill: entry.key === 'unallocated' ? '#718399' : chartColors[index % chartColors.length],
  }));
  const total = chart.reduce((sum, entry) => sum + entry.amount, 0);

  if (total <= 0) return null;

  return (
    <section className={`app-surface ${styles.breakdown}`}>
      <h3>Продажи по менеджерам</h3>
      <div className={styles.breakdownBody}>
        <div className={styles.donut}>
          <div aria-hidden="true" className={styles.donutChart}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 0, height: 0 }}>
              <PieChart accessibilityLayer={false}>
                <Pie data={chart} dataKey="amount" nameKey="name" innerRadius="69%" outerRadius="97%" startAngle={90} endAngle={-270} stroke="#fffdf8" strokeWidth={1} isAnimationActive="auto" animationDuration={420} />
                {tooltipTarget && (
                  <Tooltip
                    portal={tooltipTarget}
                    wrapperStyle={{ maxWidth: '100%', pointerEvents: 'none' }}
                    content={({ payload }) => {
                      const entry = payload?.[0];
                      if (typeof entry?.value !== 'number') return null;
                      return (
                        <div className={styles.donutReadout}>
                          <span>{entry.name}</span>
                          <strong>{money(entry.value)}</strong>
                        </div>
                      );
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.donutTotal}>
            <strong>{money(total)}</strong>
            <span>{total === sales.totals.salesTotal ? 'Всего продаж' : 'Положительные суммы'}</span>
          </div>
        </div>
        <ul className={styles.legend}>
          {chart.map(entry => (
            <li key={entry.key}>
              <span className={styles.legendDot} style={{ backgroundColor: entry.fill }} aria-hidden="true" />
              <div><strong>{entry.name}</strong><span>{money(entry.amount)} ({(entry.amount / total).toLocaleString('ru-RU', { style: 'percent', maximumFractionDigits: 1 })})</span></div>
            </li>
          ))}
        </ul>
      </div>
      <div ref={setTooltipTarget} className={styles.donutTooltip} aria-hidden="true" />
    </section>
  );
}
