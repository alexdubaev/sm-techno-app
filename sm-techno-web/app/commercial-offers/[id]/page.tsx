"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import {
  downloadCommercialOfferFile,
  fetchCommercialOfferDetails,
  markCommercialOfferSent,
} from "@/lib/api";
import type { CommercialOfferDetails } from "@/lib/types";

const OFFER_LINES_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "index", width: 42, minWidth: 34, maxWidth: 64 },
  { key: "article", width: 122, minWidth: 96, maxWidth: 180 },
  { key: "name", width: 340, minWidth: 220, maxWidth: 560 },
  { key: "brand", width: 124, minWidth: 96, maxWidth: 190 },
  { key: "qty", width: 86, minWidth: 72, maxWidth: 120 },
  { key: "price", width: 112, minWidth: 94, maxWidth: 170 },
  { key: "amount", width: 122, minWidth: 104, maxWidth: 180 },
  { key: "delivery", width: 134, minWidth: 110, maxWidth: 210 },
  { key: "note", width: 190, minWidth: 140, maxWidth: 320 },
];

export default function CommercialOfferDetailsPage() {
  const params = useParams<{ id: string }>();
  const offerId = Number(params?.id);
  const invalidOfferId = !Number.isFinite(offerId) || offerId <= 0;

  const [details, setDetails] = useState<CommercialOfferDetails | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [sentNotes, setSentNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-commercial-offer-details-table-widths-v1",
    OFFER_LINES_TABLE_COLUMNS,
  );

  const loadDetails = useCallback(async (targetOfferId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCommercialOfferDetails(targetOfferId);
      setDetails(data);
      setSentTo(data.offer.sentTo || "");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить КП."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!invalidOfferId) {
      void loadDetails(offerId);
    }
  }, [invalidOfferId, loadDetails, offerId]);

  const totals = useMemo(() => {
    const lines = details?.lines ?? [];
    return {
      lines: lines.length,
      qty: lines.reduce((sum, line) => sum + line.qty, 0),
      amount: lines.reduce((sum, line) => sum + line.amountVat, 0),
    };
  }, [details]);

  async function handleDownload(kind: "source" | "output") {
    setError(null);
    setNotice(null);

    try {
      await downloadCommercialOfferFile(offerId, kind);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось скачать файл КП."));
    }
  }

  async function handleMarkSent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details || invalidOfferId) {
      return;
    }

    setIsSending(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await markCommercialOfferSent(offerId, {
        sentTo: sentTo.trim(),
        notes: sentNotes.trim() || details.offer.notes || "",
      });
      setDetails(updated);
      setNotice("КП отмечено как отправленное.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось отметить КП отправленным."));
    } finally {
      setIsSending(false);
    }
  }

  if (invalidOfferId) {
    return (
      <AppShell>
        <div className="rounded-[14px] bg-white p-3 text-[11px] text-[var(--stock-empty)] shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
          Некорректный номер КП.
        </div>
      </AppShell>
    );
  }

  const offer = details?.offer;

  return (
    <AppShell>
      <div className="flex flex-col gap-2 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Link href="/commercial-offers" className="text-[10px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--brand-dark)]">
                Журнал КП
              </Link>
              <span className="text-[10px] text-[var(--text-secondary)]">/</span>
              {offer ? <StatusBadge status={offer.status} sentAt={offer.sentAt} /> : null}
            </div>
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              {offer ? `КП ${offer.number}` : "Коммерческое предложение"}
            </h1>
            <p className="mt-0.5 max-w-[72ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              {offer ? `${offer.clientName || "Клиент не указан"} · ${formatShortDate(offer.offerDate)}` : "Загрузка..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <MetricChip label="Строк" value={String(totals.lines)} />
            <MetricChip label="Кол-во" value={formatNumber(totals.qty)} />
            <MetricChip label="Сумма" value={formatMoney(totals.amount)} />
            <button
              type="button"
              onClick={() => void handleDownload("output")}
              disabled={!details}
              className="app-action-button app-action-button--xs"
            >
              Скачать Excel
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("source")}
              disabled={!offer?.hasSourceFile}
              className="app-action-button app-action-button--xs"
            >
              Исходник
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-[10px] border border-[#BFE8D2] bg-[#F0FDF4] px-3 py-1.5 text-[10px] text-[#166534]">
            {notice}
          </div>
        ) : null}

        {offer ? (
          <section className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
              <div className="overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-white">
                <div ref={containerRef} className="max-h-[calc(100dvh-12rem)] overflow-auto">
                  <table className="min-w-full table-fixed border-collapse" style={{ width: tableWidth }}>
                    <colgroup>
                      {OFFER_LINES_TABLE_COLUMNS.map((column) => (
                        <col key={column.key} style={{ width: getWidth(column.key) }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                      <tr>
                        <ResizableTableHeader columnKey="index" label="#" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="article" label="Артикул" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="name" label="Наименование" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="brand" label="Бренд" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="qty" label="Кол-во" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="price" label="Цена" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="delivery" label="Срок" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="note" label="Примечание" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {details.lines.map((line) => (
                        <tr key={line.id} className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]">
                          <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{line.rowNo}</td>
                          <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{line.article || "-"}</td>
                          <td className="px-3 py-1.5">
                            <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{line.name}</div>
                            {line.warehouseName ? (
                              <div className="mt-0.5 text-[9px] text-[var(--text-secondary)]">{line.warehouseName}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">{line.brand || "-"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(line.qty)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(line.priceVat)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatMoney(line.amountVat)}</td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">{line.deliveryTime || "-"}</td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            <div className="line-clamp-2">{line.note || "-"}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <div className="grid gap-1.5 text-[10px] text-[var(--text-secondary)]">
                <MetaRow label="Клиент" value={offer.clientName || "-"} />
                <MetaRow label="Источник" value={offer.clientSource === "onec" ? "1С" : "Локальный"} />
                <MetaRow label="Создал" value={offer.createdByName || offer.createdByUsername || "-"} />
                <MetaRow label="Создано" value={formatDateTime(offer.createdAt)} />
                <MetaRow label="Отправлено" value={offer.sentAt ? formatDateTime(offer.sentAt) : "-"} />
                <MetaRow label="Получатель" value={offer.sentTo || "-"} />
                <MetaRow label="Заметка" value={offer.notes || "-"} />
              </div>

              <form onSubmit={(event) => void handleMarkSent(event)} className="mt-3 grid gap-1.5">
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Кому отправлено
                  </span>
                  <input
                    type="text"
                    value={sentTo}
                    onChange={(event) => setSentTo(event.target.value)}
                    placeholder="email или имя"
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Комментарий
                  </span>
                  <textarea
                    value={sentNotes}
                    onChange={(event) => setSentNotes(event.target.value)}
                    rows={3}
                    placeholder="Например: отправлено по почте"
                    className="w-full resize-none rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSending}
                  className="app-action-button app-action-button--md"
                >
                  {isSending ? "Сохраняем..." : "Отметить отправленным"}
                </button>
              </form>
            </aside>
          </section>
        ) : (
          <div className="rounded-[12px] border border-[var(--border-color)] bg-[var(--page-bg)] px-3 py-6 text-[11px] text-[var(--text-secondary)]">
            {isLoading ? "Загружаем КП..." : "КП не найдено."}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--border-color)] bg-[#FBFCFE] px-2.5 py-1.5">
      <span className="text-[9px] text-[var(--text-secondary)]">{label}</span>
      <span className="ml-1.5 text-[11px] font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-white px-2.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.05em]">{label}</div>
      <div className="mt-0.5 break-words text-[11px] font-medium text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function StatusBadge({ sentAt, status }: { sentAt: string; status: string }) {
  const sent = status === "sent" || Boolean(sentAt);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${sent ? "bg-[#DCFCE7] text-[#166534]" : "bg-[var(--brand-light)] text-[var(--brand-dark)]"}`}>
      {sent ? "Отправлено" : "Черновик"}
    </span>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    currency: "RUB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function formatShortDate(value: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
