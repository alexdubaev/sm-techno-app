'use client';
import { useState } from 'react';
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

export default function ManagerChart({ data }: { data: ManagerDashboard }) {
  const [daily, setDaily] = useState(false);
  const points = data.daily.map((d) => ({
    ...d,
    amount: d.amount / 100,
    cumulative: d.cumulative / 100,
  }));
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="#edf0f5" />
      <XAxis
        dataKey="day"
        tickLine={false}
        axisLine={false}
        minTickGap={20}
        tick={{ fontSize: 11, fill: '#6b7890' }}
      />
      <YAxis
        width={58}
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: '#6b7890' }}
        tickFormatter={(v: number) =>
          v >= 1e6 ? `${v / 1e6} млн` : `${v / 1000} тыс`
        }
      />
      <Tooltip
        formatter={(v) => money(Math.round(Number(v) * 100))}
        labelFormatter={(day) => `${day} число`}
      />
    </>
  );
  return (
    <section
      className={`${styles.panel} ${styles.chartPanel}`}
      aria-label="График продаж"
    >
      <div className={styles.panelHeading}>
        <h2>Динамика продаж</h2>
        <button className={styles.linkButton} onClick={() => setDaily(!daily)}>
          {daily ? 'Накопительно' : 'По дням'}
        </button>
      </div>
      <p className={styles.hint}>
        {daily
          ? 'Сумма продаж за каждый день'
          : data.terms?.plan === 0
            ? 'Накопительные продажи за месяц'
            : 'Накопительные продажи и план месяца'}
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
                fill="#ffc400"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <AreaChart data={points}>
              {axes}
              <Area
                type="stepAfter"
                dataKey="cumulative"
                name="Продажи"
                stroke="#d4a100"
                strokeWidth={2}
                fill="#fff6d7"
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
        <table>
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
        </table>
      </details>
    </section>
  );
}
