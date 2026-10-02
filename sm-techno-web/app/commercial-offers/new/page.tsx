"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from "react";

import { AppShell } from "@/components/app-shell";
import {
  createCommercialOfferFromExcel,
  fetchClients,
} from "@/lib/api";
import type { CrmClient } from "@/lib/types";

const MANUAL_CLIENT_VALUE = "manual";
const MANUAL_CLIENT_LABEL = "Новый локальный клиент";

export default function NewCommercialOfferPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [clientValue, setClientValue] = useState(MANUAL_CLIENT_VALUE);
  const [clientSearch, setClientSearch] = useState(MANUAL_CLIENT_LABEL);
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [manualClientName, setManualClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchClients()
      .then((items) => {
        setClients(items);
        const firstLocal = items.find((client) => client.source === "local");
        const firstOneC = items.find((client) => client.source === "onec");
        const first = firstLocal ?? firstOneC;
        if (first) {
          setClientValue(buildClientValue(first));
          setClientSearch(formatClientSearchValue(first));
        }
      })
      .catch((requestError: unknown) => {
        setError(getErrorMessage(requestError, "Не удалось загрузить клиентов."));
      })
      .finally(() => setIsLoadingClients(false));
  }, []);

  const filteredClients = useMemo(() => {
    const query = normalizeClientSearch(clientSearch);
    const source =
      query && query !== normalizeClientSearch(MANUAL_CLIENT_LABEL)
        ? clients.filter((client) => clientMatchesSearch(client, query))
        : clients;
    return source.slice(0, 50);
  }, [clientSearch, clients]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const clientPayload = resolveClientPayload(clientValue, manualClientName, clients);
    if (!clientPayload) {
      setError("Выберите клиента или введите название локального клиента.");
      return;
    }

    if (!excelFile) {
      setError("Выберите Excel-файл .xlsx для создания КП.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCommercialOfferFromExcel({
        ...clientPayload,
        file: excelFile,
        notes: notes.trim(),
      });

      router.push(`/commercial-offers/${result.offer.id}`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось создать КП."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setExcelFile(event.target.files?.[0] ?? null);
  }

  function handleExcelDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      setExcelFile(file);
    }
  }

  function handleClientSearchChange(value: string) {
    setClientSearch(value);
    setIsClientPickerOpen(true);
    if (normalizeClientSearch(value) === normalizeClientSearch(MANUAL_CLIENT_LABEL)) {
      setClientValue(MANUAL_CLIENT_VALUE);
      return;
    }

    const matchedClient = clients.find((client) => formatClientSearchValue(client) === value);
    setClientValue(matchedClient ? buildClientValue(matchedClient) : "");
  }

  function handleClientSelect(client: CrmClient) {
    setClientValue(buildClientValue(client));
    setClientSearch(formatClientSearchValue(client));
    setIsClientPickerOpen(false);
  }

  function handleManualClientSelect() {
    setClientValue(MANUAL_CLIENT_VALUE);
    setClientSearch(MANUAL_CLIENT_LABEL);
    setIsClientPickerOpen(false);
  }

  function handleClientSearchClear() {
    setClientValue("");
    setClientSearch("");
    setIsClientPickerOpen(true);
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
              <div
                className="relative"
                onBlur={(event) => {
                  // Keep the picker open while focus moves inside it (clear
                  // button, suggestions) so keyboard users can Tab into it.
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsClientPickerOpen(false);
                }}
              >
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Клиент
                </span>
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(event) => handleClientSearchChange(event.target.value)}
                    onFocus={() => setIsClientPickerOpen(true)}
                    disabled={isLoadingClients}
                    placeholder="Поиск по названию, ИНН или КПП"
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 pr-8 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                  {clientSearch ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleClientSearchClear}
                      className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[14px] leading-none text-[var(--text-secondary)] transition hover:bg-[var(--page-bg)] hover:text-[var(--text-primary)]"
                      aria-label="Очистить клиента"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {isClientPickerOpen ? (
                  <div
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[214px] overflow-x-hidden overflow-y-auto rounded-[10px] border border-[var(--border-color)] bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleManualClientSelect}
                      className={`mb-1 w-full rounded-[8px] border px-2.5 py-1.5 text-left text-[10px] transition ${
                        clientValue === MANUAL_CLIENT_VALUE
                          ? "border-[var(--brand-yellow)] bg-[var(--brand-light)] text-[var(--brand-dark)]"
                          : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-color)] hover:bg-[var(--page-bg)]"
                      }`}
                    >
                      <span className="block truncate font-semibold">{MANUAL_CLIENT_LABEL}</span>
                    </button>
                    {filteredClients.length > 0 ? (
                      <div className="grid min-w-0 gap-1">
                        {filteredClients.map((client) => {
                          const value = buildClientValue(client);
                          const isSelected = value === clientValue;
                          return (
                            <button
                              key={value}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleClientSelect(client)}
                              className={`min-w-0 w-full overflow-hidden rounded-[8px] border px-2.5 py-1.5 text-left text-[10px] transition ${
                                isSelected
                                  ? "border-[var(--brand-yellow)] bg-[var(--brand-light)] text-[var(--brand-dark)]"
                                  : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-color)] hover:bg-[var(--page-bg)]"
                              }`}
                            >
                              <span className="block min-w-0 truncate font-semibold">
                                {client.source === "onec" ? "1С" : "Локальный"} · {formatClientDisplayName(client)}
                              </span>
                              <span className="mt-0.5 block min-w-0 truncate text-[9px] text-[var(--text-secondary)]">
                                ИНН {client.inn || "-"} · КПП {client.kpp || "-"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-2.5 py-2 text-[10px] text-[var(--text-secondary)]">
                        Клиенты не найдены.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

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
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleExcelDrop}
              className="flex min-h-[184px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--border-color)] bg-[var(--page-bg)] p-4 text-center transition hover:border-[var(--brand-yellow)] hover:bg-white"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="sr-only"
              />
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                Перетащите Excel-файл .xlsx
              </span>
              <span className="mt-1 max-w-[54ch] text-[10px] leading-4 text-[var(--text-secondary)]">
                Поддерживаются колонки с артикулом, наименованием, количеством, ценой, сроком и примечанием.
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="app-action-button app-action-button--xs mt-3"
              >
                Выбрать файл
              </button>
              {excelFile ? (
                <span className="mt-3 rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-[10px] text-[var(--text-primary)]">
                  Выбран файл: <span className="font-semibold">{excelFile.name}</span>
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </form>
    </AppShell>
  );
}

function buildClientValue(client: CrmClient) {
  return `${client.source}:${client.id}`;
}

function formatClientSearchValue(client: CrmClient) {
  const parts = [`${client.source === "onec" ? "1С" : "Локальный"} · ${formatClientDisplayName(client)}`];
  if (client.inn) {
    parts.push(`ИНН ${client.inn}`);
  }
  if (client.kpp) {
    parts.push(`КПП ${client.kpp}`);
  }
  return parts.join(" · ");
}

function normalizeClientSearch(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function clientMatchesSearch(client: CrmClient, query: string) {
  const haystack = normalizeClientSearch(
    [
      client.documentName,
      client.fullName,
      client.name,
      client.inn,
      client.kpp,
      client.source === "onec" ? "1С" : "локальный",
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(query);
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
    clientName: formatClientDisplayName(client),
  };
}

function formatClientDisplayName(client: CrmClient) {
  return client.documentName || client.fullName || client.name || "-";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
