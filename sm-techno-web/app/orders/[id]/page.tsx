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
import { fetchOrderDetails, writeoffOrder } from "@/lib/api";
import type { OrderDetails } from "@/lib/types";

type PrintOrientation = "portrait" | "landscape";

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
  const [isSubmittingWriteoff, setIsSubmittingWriteoff] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("landscape");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const canPrint = !!order && !isLoading;
  const canWriteoff =
    !!order &&
    order.status !== "posted_to_1c" &&
    order.status !== "written_off_locally" &&
    !isLoading &&
    !isSubmittingWriteoff;

  const handleWriteoff = useCallback(async () => {
    if (!order || isSubmittingWriteoff) {
      return;
    }

    const confirmed = window.confirm(
      `Списать заказ ${order.localNumber} со складов без отправки в 1С? Повторно списать этот заказ будет нельзя.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSubmittingWriteoff(true);
    setError(null);
    setNotice(null);

    try {
      const data = await writeoffOrder(order.id);
      setDetails(data);
      setNotice("Заказ успешно списан со складов.");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error && requestError.message.trim()
          ? requestError.message.trim()
          : "Не удалось списать заказ со склада.",
      );
    } finally {
      setIsSubmittingWriteoff(false);
    }
  }, [isSubmittingWriteoff, order]);

  const handlePrint = useCallback(() => {
    if (!order) {
      return;
    }
    window.print();
  }, [order]);

  return (
    <AppShell>
      <>
      <PrintStyles orientation={printOrientation} />
      <div className="order-print-screen flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div>
            <div className="print-hidden flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
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
        {notice ? <SuccessAlert>{notice}</SuccessAlert> : null}

        <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
          <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
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

            <div className="print-hidden flex flex-wrap gap-1 2xl:justify-end">
              {order ? (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-[9px] border border-[var(--border-color)] bg-white px-1.5 py-1">
                  <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Печать
                  </span>
                  <select
                    value={printOrientation}
                    onChange={(event) => setPrintOrientation(event.target.value as PrintOrientation)}
                    className="h-7 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-medium text-[var(--text-primary)]"
                  >
                    <option value="portrait">Книжная</option>
                    <option value="landscape">Альбомная</option>
                  </select>
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={!canPrint}
                    className="inline-flex h-7 items-center justify-center rounded-[8px] border border-[var(--border-color)] bg-[#F8FAFD] px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Печать
                  </button>
                </div>
              ) : null}
              {canWriteoff ? (
                <button
                  type="button"
                  onClick={() => void handleWriteoff()}
                  disabled={isSubmittingWriteoff}
                  className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[#F5E1B8] bg-[#FFF6E5] px-2.5 text-[10px] font-semibold text-[var(--brand-dark)] transition hover:bg-[#FFEECC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingWriteoff ? "Списание..." : "Списать со склада"}
                </button>
              ) : null}
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
              <div ref={containerRef} className="order-print-table-scroll max-h-[calc(100dvh-8.5rem)] overflow-auto">
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
      <OrderPrintDocument
        details={details}
        totals={totals}
        orientation={printOrientation}
      />
      </>
    </AppShell>
  );
}

function PrintStyles({ orientation }: { orientation: PrintOrientation }) {
  return (
    <style jsx global>{`
      .order-print-only {
        display: none;
      }

      @media print {
        @page {
          size: A4 ${orientation};
          margin: 10mm;
        }

        html,
        body {
          background: #ffffff !important;
        }

        body::before,
        body::after {
          display: none !important;
        }

        .app-shell-sidebar,
        .app-shell-mobile-header,
        .order-print-screen {
          display: none !important;
        }

        .app-shell-main {
          padding: 0 !important;
        }

        .app-shell-content {
          position: static !important;
        }

        .order-print-only {
          display: block !important;
          color: #0b1736;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .order-print-sheet {
          width: 100%;
        }

        .order-print-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 12px;
          margin-bottom: 10px;
        }

        .order-print-meta-item {
          border: 1px solid #d8e0ea;
          border-radius: 8px;
          padding: 6px 8px;
          background: #ffffff;
        }

        .order-print-meta-label {
          font-size: 9px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #5c6a82;
        }

        .order-print-meta-value {
          margin-top: 2px;
          font-size: 10px;
          line-height: 1.35;
          font-weight: 600;
          word-break: break-word;
        }

        .order-print-table-wrapper {
          overflow: visible !important;
          border: 1px solid #d8e0ea;
          border-radius: 0;
          background: #ffffff;
        }

        .order-print-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .order-print-table thead {
          display: table-header-group;
        }

        .order-print-table th,
        .order-print-table td {
          border: 1px solid #d8e0ea;
          padding: 4px 6px;
          vertical-align: top;
          font-size: 10px;
          line-height: 1.25;
          word-break: break-word;
        }

        .order-print-table th {
          background: #f5f7fa !important;
          font-weight: 700;
          text-align: left;
        }

        .order-print-table tr {
          break-inside: avoid;
        }

        .order-print-number {
          text-align: right;
          white-space: nowrap;
          word-break: normal;
        }

        .order-print-secondary {
          display: block;
          margin-top: 2px;
          font-size: 9px;
          color: #5c6a82;
        }

        .order-print-totals {
          display: flex;
          justify-content: flex-end;
          gap: 16px;
          margin-top: 8px;
          font-size: 11px;
          font-weight: 600;
        }

        .order-print-portrait .order-print-table th:nth-child(1),
        .order-print-portrait .order-print-table td:nth-child(1) {
          width: 4%;
        }

        .order-print-portrait .order-print-table th:nth-child(2),
        .order-print-portrait .order-print-table td:nth-child(2) {
          width: 12%;
        }

        .order-print-portrait .order-print-table th:nth-child(3),
        .order-print-portrait .order-print-table td:nth-child(3) {
          width: 34%;
        }

        .order-print-portrait .order-print-table th:nth-child(4),
        .order-print-portrait .order-print-table td:nth-child(4) {
          width: 16%;
        }

        .order-print-portrait .order-print-table th:nth-child(5),
        .order-print-portrait .order-print-table td:nth-child(5) {
          width: 11%;
        }

        .order-print-portrait .order-print-table th:nth-child(6),
        .order-print-portrait .order-print-table td:nth-child(6) {
          width: 8%;
        }

        .order-print-portrait .order-print-table th:nth-child(7),
        .order-print-portrait .order-print-table td:nth-child(7) {
          width: 7%;
        }

        .order-print-portrait .order-print-table th:nth-child(8),
        .order-print-portrait .order-print-table td:nth-child(8) {
          width: 8%;
        }

        .order-print-landscape .order-print-table th:nth-child(1),
        .order-print-landscape .order-print-table td:nth-child(1) {
          width: 4%;
        }

        .order-print-landscape .order-print-table th:nth-child(2),
        .order-print-landscape .order-print-table td:nth-child(2) {
          width: 12%;
        }

        .order-print-landscape .order-print-table th:nth-child(3),
        .order-print-landscape .order-print-table td:nth-child(3) {
          width: 40%;
        }

        .order-print-landscape .order-print-table th:nth-child(4),
        .order-print-landscape .order-print-table td:nth-child(4) {
          width: 15%;
        }

        .order-print-landscape .order-print-table th:nth-child(5),
        .order-print-landscape .order-print-table td:nth-child(5) {
          width: 12%;
        }

        .order-print-landscape .order-print-table th:nth-child(6),
        .order-print-landscape .order-print-table td:nth-child(6) {
          width: 5%;
        }

        .order-print-landscape .order-print-table th:nth-child(7),
        .order-print-landscape .order-print-table td:nth-child(7) {
          width: 6%;
        }

        .order-print-landscape .order-print-table th:nth-child(8),
        .order-print-landscape .order-print-table td:nth-child(8) {
          width: 6%;
        }
      }
    `}</style>
  );
}

function OrderPrintDocument({
  details,
  totals,
  orientation,
}: {
  details: OrderDetails | null;
  totals: { positions: number; quantity: number; amount: number };
  orientation: PrintOrientation;
}) {
  const order = details?.order ?? null;
  const lines = details?.lines ?? [];

  if (!order) {
    return null;
  }

  return (
    <div className={`order-print-only order-print-sheet order-print-${orientation}`}>
      <div className="order-print-meta-grid">
        <PrintMetaItem label="Контрагент" value={sanitizeMetaValue(order.counterpartyName)} />
        <PrintMetaItem label="Дата" value={formatShortDate(order.orderDate)} />
      </div>

      <div className="order-print-table-wrapper">
        <table className="order-print-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Артикул</th>
              <th>Наименование</th>
              <th>Склад</th>
              <th>Категория</th>
              <th className="order-print-number">Кол-во</th>
              <th className="order-print-number">Цена</th>
              <th className="order-print-number">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8}>В этом заказе пока нет строк.</td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td>
                    {line.sku || "—"}
                    <span className="order-print-secondary">{line.unitName || "шт."}</span>
                  </td>
                  <td>
                    {line.printName || line.name}
                    {line.groupName ? (
                      <span className="order-print-secondary">Группа: {line.groupName}</span>
                    ) : null}
                  </td>
                  <td>{line.warehouseName || "Основной склад"}</td>
                  <td>{line.categoryName || "—"}</td>
                  <td className="order-print-number">{formatQuantity(line.quantity)}</td>
                  <td className="order-print-number">{formatMoney(line.price)}</td>
                  <td className="order-print-number">{formatMoney(line.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="order-print-totals">
        <span>Позиций: {String(totals.positions)}</span>
        <span>Количество: {formatQuantity(totals.quantity)}</span>
        <span>Сумма: {formatMoney(totals.amount)}</span>
      </div>
    </div>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <div className="rounded-[12px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[var(--stock-empty)]">
      {children}
    </div>
  );
}

function SuccessAlert({ children }: { children: string }) {
  return (
    <div className="rounded-[12px] border border-[#D8F0DE] bg-[#ECFDF3] px-3 py-2 text-[11px] text-[var(--stock-ok)]">
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

function PrintMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="order-print-meta-item">
      <div className="order-print-meta-label">{label}</div>
      <div className="order-print-meta-value">{value || "—"}</div>
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
  const label = formatOrderStatusLabel(status);
  const className =
    status === "posted_to_1c"
      ? {
          className: "border-[#D8F0DE] bg-[#ECFDF3] text-[var(--stock-ok)]",
        }
      : status === "written_off_locally"
        ? {
            className: "border-[#F5E1B8] bg-[#FFF6E5] text-[var(--brand-dark)]",
          }
        : status === "error"
        ? {
            className: "border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]",
          }
        : {
            className: "border-[var(--border-color)] bg-white text-[var(--text-secondary)]",
          };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.05em]",
        className.className,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function formatOrderStatusLabel(status: string) {
  if (status === "posted_to_1c") {
    return "Отправлен";
  }
  if (status === "written_off_locally") {
    return "Списан локально";
  }
  if (status === "error") {
    return "Ошибка";
  }
  return "В обработке";
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
