"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import { deleteCommercialOffer, downloadCommercialOfferFile, fetchCommercialOffers } from "@/lib/api";
import type { CommercialOffer } from "@/lib/types";

const OFFERS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "number", width: 132, minWidth: 104, maxWidth: 190 },
  { key: "date", width: 98, minWidth: 86, maxWidth: 140 },
  { key: "client", width: 310, minWidth: 220, maxWidth: 520 },
  { key: "status", width: 110, minWidth: 92, maxWidth: 160 },
  { key: "lines", width: 84, minWidth: 70, maxWidth: 120 },
  { key: "amount", width: 124, minWidth: 104, maxWidth: 180 },
  { key: "author", width: 156, minWidth: 120, maxWidth: 240 },
  { key: "created", width: 124, minWidth: 106, maxWidth: 180 },
  { key: "actions", width: 220, minWidth: 174, maxWidth: 280 },
];

export default function CommercialOffersPage() {
  const { isAdmin } = useAuth();
  const [offers, setOffers] = useState<CommercialOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingOfferId, setDeletingOfferId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-commercial-offers-table-widths-v1",
    OFFERS_TABLE_COLUMNS,
  );

  useEffect(() => {
    void loadOffers();
  }, []);

  const summary = useMemo(() => {
    const sent = offers.filter((offer) => offer.status === "sent").length;
    const draft = offers.filter((offer) => offer.status !== "sent").length;
    const amount = offers.reduce((sum, offer) => sum + offer.totalAmount, 0);
    return { total: offers.length, sent, draft, amount };
  }, [offers]);

  async function loadOffers() {
    setIsLoading(true);
    setError(null);

    try {
      setOffers(await fetchCommercialOffers());
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить журнал КП."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownload(offerId: number, kind: "source" | "output") {
    setError(null);
    try {
      await downloadCommercialOfferFile(offerId, kind);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось скачать файл КП."));
    }
  }

  async function handleDelete(offer: CommercialOffer) {
    const confirmed = window.confirm(`Удалить КП ${offer.number}? Это действие нельзя отменить.`);
    if (!confirmed) {
      return;
    }

    setDeletingOfferId(offer.id);
    setError(null);
    try {
      await deleteCommercialOffer(offer.id);
      setOffers((current) => current.filter((item) => item.id !== offer.id));
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось удалить КП."));
    } finally {
      setDeletingOfferId(null);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div>
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Журнал КП
            </h1>
            <p className="mt-0.5 max-w-[64ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Коммерческие предложения создаются отдельно от счетов и не резервируют остатки.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <MetricChip label="Всего" value={String(summary.total)} />
            <MetricChip label="Черновики" value={String(summary.draft)} />
            <MetricChip label="Отправлено" value={String(summary.sent)} />
            <MetricChip label="Сумма" value={formatMoney(summary.amount)} />
            <Link
              href="/commercial-offers/new"
              className="app-action-button app-action-button--xs"
            >
              Создать КП
            </Link>
            <button
              type="button"
              onClick={() => void loadOffers()}
              disabled={isLoading}
              className="app-action-button app-action-button--xs"
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
            {offers.length === 0 && !isLoading ? (
              <div className="px-3 py-5 text-[11px] leading-4 text-[var(--text-secondary)]">
                Журнал пока пуст. Создайте КП из Excel или из черновика прайса.
              </div>
            ) : (
              <div ref={containerRef} className="max-h-[calc(100dvh-8rem)] overflow-auto">
                <table className="min-w-full table-fixed border-collapse" style={{ width: tableWidth }}>
                  <colgroup>
                    {OFFERS_TABLE_COLUMNS.map((column) => (
                      <col key={column.key} style={{ width: getWidth(column.key) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                    <tr>
                      <ResizableTableHeader columnKey="number" label="Номер" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="date" label="Дата" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="client" label="Клиент" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="status" label="Статус" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="lines" label="Строк" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="author" label="Автор" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="created" label="Создано" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="actions" label="Действия" onResizeStart={onResizeStart} className="px-3 py-2 text-center font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((offer) => (
                      <tr key={offer.id} className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]">
                        <td className="px-3 py-1.5 font-semibold tabular-nums">
                          <Link href={`/commercial-offers/${offer.id}`} className="transition-colors hover:text-[var(--brand-dark)]">
                            {offer.number}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{formatShortDate(offer.offerDate)}</td>
                        <td className="px-3 py-1.5">
                          <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{offer.clientName || "-"}</div>
                          <div className="mt-0.5 text-[9px] text-[var(--text-secondary)]">
                            {offer.clientSource === "onec" ? "Клиент из 1С" : "Локальный клиент"}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={offer.status} sentAt={offer.sentAt} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{offer.lineCount}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatMoney(offer.totalAmount)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{offer.createdByName || offer.createdByUsername || "-"}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{formatDateTime(offer.createdAt)}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex justify-center gap-1">
                            <Link href={`/commercial-offers/${offer.id}`} className="app-action-button app-action-button--xs">
                              Открыть
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleDownload(offer.id, "output")}
                              className="app-action-button app-action-button--xs"
                            >
                              Excel
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(offer)}
                                disabled={deletingOfferId === offer.id}
                                className="app-action-button app-action-button--xs"
                              >
                                {deletingOfferId === offer.id ? "..." : "Удалить"}
                              </button>
                            ) : null}
                          </div>
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

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--border-color)] bg-[#FBFCFE] px-2.5 py-1.5">
      <span className="text-[9px] text-[var(--text-secondary)]">{label}</span>
      <span className="ml-1.5 text-[11px] font-semibold text-[var(--text-primary)]">{value}</span>
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
