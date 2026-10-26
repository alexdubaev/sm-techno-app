'use client';
import { Pencil, X } from 'lucide-react';
import type { ManagerSale } from '@/lib/manager-types';
import { dateLabel, money, percent } from './format';
import styles from './manager.module.css';
export function ManagerSales({
  sales,
  onEdit,
  onCancel,
}: {
  sales: ManagerSale[];
  onEdit?: (sale: ManagerSale) => void;
  onCancel?: (sale: ManagerSale) => void;
}) {
  if (!sales.length)
    return (
      <p className={styles.empty}>
        Продажи не найдены. Проверьте период и поиск.
      </p>
    );
  return (
    <div className={styles.saleList}>
      {sales.map((sale) => (
        <article
          className={`${styles.saleRow} ${sale.cancelled ? styles.cancelled : ''}`}
          key={sale.id}
        >
          <div className={styles.saleDate}>
            <span className={styles.mobileLabel}>Дата</span>
            {dateLabel(sale.date)}
          </div>
          <div className={styles.saleClient}>
            <b>{sale.client}</b>
            <small>
              № {sale.id} · {sale.source === 'manual' ? 'Ручной ввод' : '1С'}
              {sale.cancelled ? ' · Отменена' : ''}
            </small>
          </div>
          <div className={styles.numeric}>
            <span className={styles.mobileLabel}>Сумма</span>
            {money(sale.amount)}
          </div>
          <div className={styles.numeric}>
            <span className={styles.mobileLabel}>Ставка</span>
            {percent(sale.rate)}
          </div>
          <div className={styles.numeric}>
            <span className={styles.mobileLabel}>Начислено</span>
            <b className={sale.commission ? styles.green : ''}>
              {money(sale.commission)}
            </b>
            <small>
              {sale.cancelled
                ? 'Не участвует в расчёте'
                : sale.base === null
                  ? 'Условия не заданы'
                  : sale.base
                    ? `С базы ${money(sale.base)}`
                    : 'В пределах плана'}
            </small>
          </div>
          {(onEdit || onCancel) && (
            <div className={styles.rowActions}>
              {!sale.cancelled && (
                <>
                  <button
                    className={styles.iconButton}
                    onClick={() => onEdit?.(sale)}
                    aria-label={`Изменить продажу № ${sale.id}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className={styles.iconButton}
                    onClick={() => onCancel?.(sale)}
                    aria-label={`Отменить продажу № ${sale.id}`}
                  >
                    <X size={17} />
                  </button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
