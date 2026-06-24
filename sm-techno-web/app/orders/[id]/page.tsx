"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import { fetchOrderDetails } from "@/lib/api";
import type { OrderDetails } from "@/lib/types";

const ORDER_DETAILS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "index", width: 34, minWidth: 30, maxWidth: 60 },
  { key: "sku", width: 118, minWidth: 96, maxWidth: 180 },
  { key: "name", width: 320, minWidth: 220, maxWidth: 520 },
  { key: "warehouse", width: 158, minWidth: 130, maxWidth: 240 },
  { key: "category", width: 114, minWidth: 96, maxWidth: 180 },
  { key: "quantity", width: 78, minWidth: 68, maxWidth: 120 },
  { key: "price", width: 100, minWidth: 88, maxWidth: 180 },
  { key: "amount", width: 100, minWidth: 88, maxWidth: 180 },
];

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params?.id);

  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const invalidOrderId = !Number.isFinite(orderId) || orderId <= 0;
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-order-details-table-widths-v2",
    ORDER_DETAILS_TABLE_COLUMNS,
  );

  const loadOrderDetails = useCallback(async (targetOrderId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchOrderDetails(targetOrderId);
      setDetails(data);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error && requestError.message.trim()
          ? requestError.message.trim()
          : "Не удалось загрузить заказ.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (invalidOrderId) {
      return;
    }

    void loadOrderDetails(orderId);
  }, [invalidOrderId, loadOrderDetails, orderId]);

  const totals = useMemo(() => {
    const lines = details?.lines ?? [];
    return {
      positions: lines.length,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      amount: lines.reduce((sum, line) => sum + line.amount, 0),
    };
  }, [details]);

  const order = invalidOrderId ? null : details?.order ?? null;
  const createdByLabel = sanitizeMetaValue(order?.createdByName);
  const commentLabel = sanitizeMetaValue(order?.comment, "Комментарий не указан");

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <Link href="/orders" className="transition-colors hover:text-[var(--text-primary)]">
                История заказов
              </Link>
              <span>/</span>
              <span>Заказ #{Number.isFinite(orderId) ? orderId : "—"}</span>
            </div>
            <h1 className="mt-0.5 text-[16px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              {order?.localNumber ? `Заказ ${order.localNumber}` : "Карточка заказа"}
            </h1>
            <p className="mt-0.5 max-w-[42rem] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Основной акцент здесь на табличной части заказа: товар, количество, цена и сумма.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {order ? <StatusBadge status={order.status} /> : null}
            <MetricChip label="Позиций" value={String(totals.positions)} />
            <MetricChip label="Количество" value={formatQuantity(totals.quantity)} />
            <MetricChip label="Сумма" value={formatMoney(totals.amount)} />
          </div>
        </header>

        {invalidOrderId ? <Alert>Некорректный номер заказа.</Alert> : null}

        {error ? <Alert>{error}</Alert> : null}

        <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
          <div className="grid gap-1.5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
            <div className="flex flex-wrap gap-1">
              <InlineMeta label="Контрагент" value={sanitizeMetaValue(order?.counterpartyName)} />
              <InlineMeta label="Договор" value={sanitizeMetaValue(order?.contractName, "Без договора")} />
              <InlineMeta label="Организация" value={sanitizeMetaValue(order?.organizationName)} />
              <InlineMeta label="Дата" value={formatShortDate(order?.orderDate || "")} />
              <InlineMeta label="№ 1С" value={sanitizeMetaValue(order?.onecNumber)} />
              <InlineMeta label="Дата 1С" value={formatShortDateTime(order?.onecDate || "")} />
              <InlineMeta label="Создал" value={createdByLabel} />
              <InlineMeta label="Склады" value={sanitizeMetaValue(order?.warehouseSummary, "Основной склад")} />
            </div>

            <div className="flex flex-wrap gap-1 2xl:justify-end">
              <Link
                href="/orders"
                className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
              >
                Назад к истории
              </Link>
              <Link
                href="/work-with-invoice"
                className="inline-flex h-7 items-center justify-center rounded-[9px] bg-[var(--brand-yellow)] px-2.5 text-[10px] font-semibold text-[var(--brand-dark)] transition hover:bg-[var(--brand-yellow-hover)]"
              >
                Перейти к счету
              </Link>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            <InlineNotice label="Комментарий" tone="default">
              {commentLabel}
            </InlineNotice>
            {order?.errorMessage ? (
              <InlineNotice label="Ошибка" tone="error">
                {sanitizeMetaValue(order.errorMessage)}
              </InlineNotice>
            ) : null}
          </div>

          <div className="mt-1.5 overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-white">
            {isLoading ? (
              <div className="px-3 py-4 text-[11px] leading-4 text-[var(--text-secondary)]">
                Загружаю строки заказа...
              </div>
            ) : !details || details.lines.length === 0 ? (
              <div className="px-3 py-4 text-[11px] leading-4 text-[var(--text-secondary)]">
                В этом заказе пока нет строк.
              </div>
            ) : (
              <div ref={containerRef} className="max-h-[calc(100dvh-8.5rem)] overflow-auto">
                <table
                  className="min-w-full table-fixed border-collapse"
                  style={{ width: tableWidth }}
                >
                  <colgroup>
                    {ORDER_DETAILS_TABLE_COLUMNS.map((column) => (
                      <col key={column.key} style={{ width: getWidth(column.key) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                    <tr>
                      <ResizableTableHeader columnKey="index" label="№" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="sku" label="Артикул" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="name" label="Наименование" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="warehouse" label="Склад" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="category" label="Категория" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="quantity" label="Кол-во" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="price" label="Цена" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {details.lines.map((line, index) => (
                      <tr
                        key={line.id}
                        className="border-t border-[var(--border-color)] align-top text-[10px] text-[var(--text-primary)]"
                      >
                        <td className="px-3 py-1.5 text-[10px] tabular-nums text-[var(--text-secondary)]">
                          {index + 1}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="space-y-0.5">
                            <div className="font-semibold tabular-nums">{line.sku || "—"}</div>
                            <div className="text-[9px] text-[var(--text-secondary)]">
                              {line.unitName || "шт."}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{line.name}</div>
                          {line.groupName ? (
                            <div className="mt-0.5 text-[9px] text-[var(--text-secondary)]">
                              Группа: {line.groupName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {line.warehouseName || "Основной склад"}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {line.categoryName || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatQuantity(line.quantity)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                          {formatMoney(line.price)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatMoney(line.amount)}
                        </td>
                      </tr>
                    ))}
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

function Alert({ children }: { children: string }) {
  return (
    <div className="rounded-[12px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[var(--stock-empty)]">
      {children}
    </div>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex min-h-[28px] max-w-full items-center gap-1 rounded-[10px] border border-[var(--border-color)] bg-white px-2 py-1">
      <span className="text-[9px] uppercase tracking-[0.05em] text-[var(--text-secondary)]">{label}</span>
      <span className="max-w-[220px] truncate text-[10px] font-semibold text-[var(--text-primary)]" title={value || "—"}>
        {value || "—"}
      </span>
    </div>
  );
}

function InlineNotice({
  label,
  children,
  tone,
}: {
  label: string;
  children: string;
  tone: "default" | "error";
}) {
  return (
    <div
      className={[
        "min-w-0 flex-1 rounded-[10px] border px-2 py-1",
        tone === "error"
          ? "border-[#F9D4D4] bg-[#FEF2F2]"
          : "border-[var(--border-color)] bg-white",
      ].join(" ")}
    >
      <div className="text-[9px] uppercase tracking-[0.05em] text-[var(--text-secondary)]">{label}</div>
      <div
        className={[
          "mt-0.5 truncate text-[10px] leading-4",
          tone === "error" ? "text-[var(--stock-empty)]" : "text-[var(--text-primary)]",
        ].join(" ")}
        title={children || "—"}
      >
        {children || "—"}
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex min-h-[28px] items-center gap-1 rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-2 py-1 text-[9px] text-[var(--text-secondary)]">
      <span>{label}</span>
      <span className="font-semibold text-[10px] text-[var(--text-primary)]">{value}</span>
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
            label: "В обработке",
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

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
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

  const cleaned = value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Ref_Key\s*1С/i.test(line))
    .filter((line) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(line));

  const compact = cleaned
    .join(" · ")
    .replace(/Ref_Key\s*1С[:\s-]*/gi, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " · ")
    .trim();

  return compact || fallback;
}
