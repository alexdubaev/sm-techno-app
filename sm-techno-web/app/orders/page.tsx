"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import { fetchOrders } from "@/lib/api";
import type { OrderHistoryItem } from "@/lib/types";

const ORDERS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "localNumber", width: 134, minWidth: 112, maxWidth: 220 },
  { key: "date", width: 96, minWidth: 88, maxWidth: 160 },
  { key: "counterparty", width: 300, minWidth: 220, maxWidth: 520 },
  { key: "warehouses", width: 180, minWidth: 140, maxWidth: 260 },
  { key: "status", width: 108, minWidth: 96, maxWidth: 180 },
  { key: "onecNumber", width: 108, minWidth: 92, maxWidth: 180 },
  { key: "onecDate", width: 132, minWidth: 116, maxWidth: 220 },
  { key: "amount", width: 118, minWidth: 104, maxWidth: 200 },
  { key: "note", width: 190, minWidth: 140, maxWidth: 320 },
  { key: "open", width: 92, minWidth: 76, maxWidth: 140 },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-orders-table-widths-v2",
    ORDERS_TABLE_COLUMNS,
  );

  useEffect(() => {
    void loadOrders();
  }, []);

  const summary = useMemo(() => {
    const posted = orders.filter((item) => item.status === "posted_to_1c").length;
    const failed = orders.filter((item) => item.status === "error").length;
    const amount = orders.reduce((sum, item) => sum + item.totalAmount, 0);

    return {
      total: orders.length,
      posted,
      failed,
      amount,
    };
  }, [orders]);

  async function loadOrders() {
    setIsLoading(true);
    setError(null);

    try {
      const items = await fetchOrders();
      setOrders(items);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error && requestError.message.trim()
          ? requestError.message.trim()
          : "Не удалось загрузить историю заказов.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div className="max-w-[42rem]">
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Заказы
            </h1>
            <p className="mt-0.5 max-w-[64ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Здесь хранится вся история отправок в 1С: номера, даты, статусы и суммы по каждому заказу.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <MetricChip label="Всего" value={String(summary.total)} />
            <MetricChip label="Отправлено" value={String(summary.posted)} tone="ok" />
            <MetricChip label="Ошибки" value={String(summary.failed)} tone="error" />
            <MetricChip label="Сумма" value={formatMoney(summary.amount)} />
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={isLoading}
              className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}

        <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
          <div className="overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-white">
            {orders.length === 0 && !isLoading ? (
              <div className="px-3 py-5 text-[11px] leading-4 text-[var(--text-secondary)]">
                История пока пуста. Первый отправленный заказ появится здесь автоматически.
              </div>
            ) : (
              <div ref={containerRef} className="max-h-[calc(100dvh-8rem)] overflow-auto">
                <table
                  className="min-w-full table-fixed border-collapse"
                  style={{ width: tableWidth }}
                >
                  <colgroup>
                    {ORDERS_TABLE_COLUMNS.map((column) => (
                      <col key={column.key} style={{ width: getWidth(column.key) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                    <tr>
                      <ResizableTableHeader columnKey="localNumber" label="Локальный №" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="date" label="Дата" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="counterparty" label="Контрагент" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="warehouses" label="Склады" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="status" label="Статус" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="onecNumber" label="№ 1С" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="onecDate" label="Дата 1С" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="note" label="Комментарий / ошибка" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="open" label="Открыть" onResizeStart={onResizeStart} className="px-3 py-2 text-center font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const createdBy = sanitizeMetaValue(order.createdByName, "");
                      const note = sanitizeMetaValue(order.errorMessage, "Без ошибок");

                      return (
                        <tr
                          key={order.id}
                          className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                        >
                          <td className="px-3 py-1.5 font-semibold tabular-nums">
                            <Link
                              href={`/orders/${order.id}`}
                              className="transition-colors hover:text-[var(--brand-dark)]"
                            >
                              {order.localNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {formatShortDate(order.orderDate)}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">
                              {sanitizeMetaValue(order.counterpartyName)}
                            </div>
                            {createdBy ? (
                              <div className="mt-0.5 truncate text-[9px] text-[var(--text-secondary)]" title={createdBy}>
                                Создал: {createdBy}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-1.5 text-[10px] text-[var(--text-secondary)]">
                            <div className="line-clamp-2" title={order.warehouseSummary || "Основной склад"}>
                              {order.warehouseSummary || "Основной склад"}
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-[var(--text-primary)]">
                            {sanitizeMetaValue(order.onecNumber)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {formatShortDateTime(order.onecDate)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                            {formatMoney(order.totalAmount)}
                          </td>
                          <td className="px-3 py-1.5 text-[10px] leading-[14px] text-[var(--text-secondary)]">
                            <div className="line-clamp-2" title={note}>
                              {note}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Link
                              href={`/orders/${order.id}`}
                              className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
                            >
                              Открыть
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "error";
}) {
  const toneClass =
    tone === "ok"
      ? "text-[var(--stock-ok)]"
      : tone === "error"
        ? "text-[var(--stock-empty)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="inline-flex min-h-[28px] items-center gap-1 rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-2 py-1 text-[9px] text-[var(--text-secondary)]">
      <span>{label}</span>
      <span className={`text-[10px] font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const view =
    status === "posted_to_1c"
      ? {
          label: "Отправлен",
          className: "border-[#D8F0DE] bg-[#ECFDF3] text-[var(--stock-ok)]",
        }
      : status === "error"
        ? {
            label: "Ошибка",
            className: "border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]",
          }
        : {
            label: "В работе",
            className: "border-[var(--border-color)] bg-white text-[var(--text-secondary)]",
          };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.05em]",
        view.className,
      ].join(" ")}
    >
      {view.label}
    </span>
  );
}

function formatMoney(value: number) {
  const rubleSign = "\u20BD";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${rubleSign}`;
}

function formatShortDate(value: string) {
  if (!value) {
    return "—";
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function formatShortDateTime(value: string) {
  if (!value) {
    return "—";
  }

  return value.replace("T", " ").slice(0, 16);
}

function sanitizeMetaValue(value?: string | null, fallback = "—") {
  if (!value) {
    return fallback;
  }

  const compact = value
    .replace(/\r/g, "\n")
    .replace(/Ref_Key\s*1С[:\s-]*/gi, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " · ")
    .trim();

  return compact || fallback;
}
