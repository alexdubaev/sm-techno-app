"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import {
  createCommercialOfferFromDraft,
  createCommercialOfferFromExcel,
  fetchClients,
} from "@/lib/api";
import {
  clearCommercialOfferDraftLinesFromStorage,
  loadCommercialOfferDraftLinesFromStorage,
  saveCommercialOfferDraftLinesToStorage,
} from "@/lib/storage";
import type { CommercialOfferDraftLine, CrmClient } from "@/lib/types";

type SourceMode = "draft" | "excel";

const MANUAL_CLIENT_VALUE = "manual";

export default function NewCommercialOfferPage() {
  const router = useRouter();
  const [mode, setMode] = useState<SourceMode>("draft");
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [clientValue, setClientValue] = useState(MANUAL_CLIENT_VALUE);
  const [manualClientName, setManualClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<CommercialOfferDraftLine[]>([]);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedDraft = loadCommercialOfferDraftLinesFromStorage() ?? [];
    setDraftLines(sanitizeDraftLines(savedDraft));

    void fetchClients()
      .then((items) => {
        setClients(items);
        const firstLocal = items.find((client) => client.source === "local");
        const firstOneC = items.find((client) => client.source === "onec");
        const first = firstLocal ?? firstOneC;
        if (first) {
          setClientValue(buildClientValue(first));
        }
      })
      .catch((requestError: unknown) => {
        setError(getErrorMessage(requestError, "Не удалось загрузить клиентов."));
      })
      .finally(() => setIsLoadingClients(false));
  }, []);

  const totals = useMemo(() => {
    const qty = draftLines.reduce((sum, line) => sum + line.qty, 0);
    const amount = draftLines.reduce((sum, line) => sum + line.qty * line.priceVat, 0);
    return { lines: draftLines.length, qty, amount };
  }, [draftLines]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const clientPayload = resolveClientPayload(clientValue, manualClientName, clients);
    if (!clientPayload) {
      setError("Выберите клиента или введите название локального клиента.");
      return;
    }

    if (mode === "draft" && draftLines.length === 0) {
      setError("В черновике КП нет позиций. Добавьте их из раздела Остатки.");
      return;
    }

    if (mode === "excel" && !excelFile) {
      setError("Выберите Excel-файл .xlsx для создания КП.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result =
        mode === "draft"
          ? await createCommercialOfferFromDraft({
              ...clientPayload,
              lines: draftLines,
              notes: notes.trim(),
            })
          : await createCommercialOfferFromExcel({
              ...clientPayload,
              file: excelFile as File,
              notes: notes.trim(),
            });

      if (mode === "draft") {
        clearCommercialOfferDraftLinesFromStorage();
        setDraftLines([]);
      }

      router.push(`/commercial-offers/${result.offer.id}`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось создать КП."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRemoveLine(lineId: string) {
    const nextLines = draftLines.filter((line) => line.lineId !== lineId);
    setDraftLines(nextLines);
    saveCommercialOfferDraftLinesToStorage(nextLines);
  }

  function handleClearDraft() {
    setDraftLines([]);
    clearCommercialOfferDraftLinesFromStorage();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setExcelFile(event.target.files?.[0] ?? null);
  }

  return (
    <AppShell>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-2 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Создать КП
            </h1>
            <p className="mt-0.5 max-w-[64ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              КП создается отдельно от счета: оно не резервирует и не списывает остатки.
            </p>
          </div>
          <div className="flex gap-1">
            <Link
              href="/commercial-offers"
              className="app-action-button app-action-button--xs"
            >
              Журнал КП
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="app-action-button app-action-button--xs"
            >
              {isSubmitting ? "Формируем..." : "Сформировать"}
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}

        <section className="grid gap-2 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
            <div className="grid gap-2">
              <label>
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Клиент
                </span>
                <select
                  value={clientValue}
                  onChange={(event) => setClientValue(event.target.value)}
                  disabled={isLoadingClients}
                  className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                >
                  <option value={MANUAL_CLIENT_VALUE}>Новый локальный клиент</option>
                  {clients.map((client) => (
                    <option key={buildClientValue(client)} value={buildClientValue(client)}>
                      {client.source === "onec" ? "1С" : "Локальный"} · {client.name}
                    </option>
                  ))}
                </select>
              </label>

              {clientValue === MANUAL_CLIENT_VALUE ? (
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Название клиента
                  </span>
                  <input
                    type="text"
                    value={manualClientName}
                    onChange={(event) => setManualClientName(event.target.value)}
                    placeholder="Компания или контакт"
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                </label>
              ) : null}

              <label>
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Комментарий
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Внутренняя заметка к КП"
                  className="w-full resize-none rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--border-color)] bg-white p-2">
            <div className="mb-2 inline-flex rounded-[12px] border border-[var(--border-color)] bg-[#FBFCFE] p-0.5">
              <ModeButton active={mode === "draft"} onClick={() => setMode("draft")}>
                Из прайса
              </ModeButton>
              <ModeButton active={mode === "excel"} onClick={() => setMode("excel")}>
                Из Excel
              </ModeButton>
            </div>

            {mode === "draft" ? (
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap gap-1">
                    <MetricChip label="Строк" value={String(totals.lines)} />
                    <MetricChip label="Кол-во" value={formatNumber(totals.qty)} />
                    <MetricChip label="Сумма" value={formatMoney(totals.amount)} />
                  </div>
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    disabled={draftLines.length === 0}
                    className="app-action-button app-action-button--xs"
                  >
                    Очистить
                  </button>
                </div>

                {draftLines.length === 0 ? (
                  <div className="rounded-[12px] border border-dashed border-[var(--border-color)] bg-[var(--page-bg)] px-3 py-6 text-[11px] leading-4 text-[var(--text-secondary)]">
                    Черновик КП пуст. Откройте Остатки и нажмите “Добавить в КП” у нужных позиций.
                  </div>
                ) : (
                  <div className="max-h-[calc(100dvh-17rem)] overflow-auto rounded-[12px] border border-[var(--border-color)]">
                    <table className="min-w-full border-collapse text-[10px]">
                      <thead className="sticky top-0 bg-[#FAFBFD] text-left text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Артикул</th>
                          <th className="px-3 py-2 font-semibold">Наименование</th>
                          <th className="px-3 py-2 text-right font-semibold">Кол-во</th>
                          <th className="px-3 py-2 text-right font-semibold">Цена</th>
                          <th className="px-3 py-2 text-right font-semibold">Сумма</th>
                          <th className="px-3 py-2 text-center font-semibold">Убрать</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftLines.map((line) => (
                          <tr key={line.lineId} className="border-t border-[var(--border-color)] text-[var(--text-primary)]">
                            <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{line.article || "-"}</td>
                            <td className="px-3 py-1.5">
                              <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{line.name}</div>
                              <div className="mt-0.5 text-[9px] text-[var(--text-secondary)]">{line.warehouseName || "Склад не указан"}</div>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(line.qty)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(line.priceVat)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatMoney(line.qty * line.priceVat)}</td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(line.lineId)}
                                className="app-action-button app-action-button--xs"
                              >
                                Убрать
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-[12px] border border-dashed border-[var(--border-color)] bg-[var(--page-bg)] p-3">
                <label className="block">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Excel-файл .xlsx
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileChange}
                    className="block w-full cursor-pointer rounded-[10px] border border-[var(--border-color)] bg-white px-2 py-2 text-[11px] text-[var(--text-primary)] file:mr-3 file:rounded-[9px] file:border-0 file:bg-[var(--brand-yellow)] file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-[var(--brand-dark)]"
                  />
                </label>
                <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                  Поддерживаются колонки с артикулом, наименованием, количеством, ценой, сроком и примечанием. PDF на этом этапе не создается.
                </p>
                {excelFile ? (
                  <div className="mt-2 rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-[10px] text-[var(--text-primary)]">
                    Выбран файл: <span className="font-semibold">{excelFile.name}</span>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        </section>
      </form>
    </AppShell>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-[10px] px-3 text-[10px] font-semibold transition ${
        active
          ? "bg-[var(--brand-yellow)] text-[var(--brand-dark)]"
          : "text-[var(--text-secondary)] hover:bg-white"
      }`}
    >
      {children}
    </button>
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

function sanitizeDraftLines(lines: CommercialOfferDraftLine[]) {
  return lines
    .map((line) => {
      const itemId = Number(line.itemId);
      const qty = Number(line.qty);
      const priceVat = Number(line.priceVat);
      if (!Number.isFinite(itemId) || !Number.isFinite(qty) || qty <= 0) {
        return null;
      }
      return {
        lineId: String(line.lineId || itemId),
        itemId,
        article: String(line.article ?? ""),
        name: String(line.name ?? ""),
        brand: String(line.brand ?? ""),
        qty,
        priceVat: Number.isFinite(priceVat) ? priceVat : 0,
        deliveryTime: String(line.deliveryTime ?? ""),
        note: String(line.note ?? ""),
        warehouseId: typeof line.warehouseId === "number" ? line.warehouseId : null,
        warehouseName: String(line.warehouseName ?? ""),
      };
    })
    .filter((line): line is CommercialOfferDraftLine => line !== null);
}

function buildClientValue(client: CrmClient) {
  return `${client.source}:${client.id}`;
}

function resolveClientPayload(
  clientValue: string,
  manualClientName: string,
  clients: CrmClient[],
): { clientSource: "onec" | "local" | "manual"; clientId?: number | null; clientName: string } | null {
  if (clientValue === MANUAL_CLIENT_VALUE) {
    const clientName = manualClientName.trim();
    return clientName ? { clientSource: "manual", clientId: null, clientName } : null;
  }

  const [source, rawId] = clientValue.split(":");
  const id = Number(rawId);
  const client = clients.find((item) => item.source === source && item.id === id);
  if (!client) {
    return null;
  }

  return {
    clientSource: client.source,
    clientId: client.id,
    clientName: client.name || client.fullName,
  };
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
