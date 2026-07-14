"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell } from "@/components/app-shell";
import {
  createDocument,
  downloadDocumentFile,
  fetchClients,
  fetchCommercialOffers,
} from "@/lib/api";
import type { CommercialOffer, CrmClient, GeneratedDocument } from "@/lib/types";

type DocumentType = GeneratedDocument["documentType"];

const REQUIRED_FIELDS: Record<DocumentType, Array<keyof CrmClient>> = {
  contract: [
    "documentName",
    "inn",
    "kpp",
    "ogrn",
    "legalAddress",
    "bankAccount",
    "bankName",
    "bankBik",
    "correspondentAccount",
    "signerPosition",
    "signerName",
    "signerBasis",
  ],
  specification: [
    "documentName",
    "inn",
    "legalAddress",
    "bankAccount",
    "bankName",
    "bankBik",
    "correspondentAccount",
    "signerName",
    "signerBasis",
  ],
};

const FIELD_LABELS: Partial<Record<keyof CrmClient, string>> = {
  bankAccount: "расчетный счет",
  bankBik: "БИК",
  bankName: "название банка",
  correspondentAccount: "корреспондентский счет",
  documentName: "наименование",
  inn: "ИНН",
  kpp: "КПП",
  legalAddress: "юридический адрес",
  ogrn: "ОГРН",
  signerBasis: "основание подписанта",
  signerName: "ФИО подписанта",
  signerPosition: "должность подписанта",
};

export default function DocumentsPage() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>("contract");
  const [number, setNumber] = useState("");
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientValue, setClientValue] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [commercialOfferId, setCommercialOfferId] = useState("");
  const [notes, setNotes] = useState("");
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [offers, setOffers] = useState<CommercialOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchClients(), fetchCommercialOffers()])
      .then(([loadedClients, loadedOffers]) => {
        setClients(loadedClients);
        setOffers(loadedOffers);
        if (loadedClients[0]) {
          setClientValue(buildClientValue(loadedClients[0]));
          setClientSearch(formatClientSearchValue(loadedClients[0]));
        }
      })
      .catch((requestError: unknown) => {
        setError(getErrorMessage(requestError, "Не удалось загрузить клиентов и КП."));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const selectedClient = useMemo(
    () => clients.find((client) => buildClientValue(client) === clientValue) ?? null,
    [clientValue, clients],
  );
  const selectedOffer = useMemo(
    () => offers.find((offer) => String(offer.id) === commercialOfferId) ?? null,
    [commercialOfferId, offers],
  );
  const filteredClients = useMemo(() => {
    const query = normalizeClientSearch(clientSearch);
    const source = query
      ? clients.filter((client) => clientMatchesSearch(client, query))
      : clients;
    return source.slice(0, 20);
  }, [clientSearch, clients]);
  const missingFields = useMemo(() => {
    if (!selectedClient) {
      return [];
    }
    return REQUIRED_FIELDS[documentType].filter((field) => !String(selectedClient[field] ?? "").trim());
  }, [documentType, selectedClient]);

  function handleOfferChange(value: string) {
    setCommercialOfferId(value);
    const offer = offers.find((item) => String(item.id) === value);
    const offerClientValue = offer ? buildClientValueFromOffer(offer) : "";
    const offerClient = clients.find((client) => buildClientValue(client) === offerClientValue);
    if (offerClient) {
      setClientValue(offerClientValue);
      setClientSearch(formatClientSearchValue(offerClient));
    }
  }

  function handleClientSearchChange(value: string) {
    setClientSearch(value);
    if (!selectedClient || value !== formatClientSearchValue(selectedClient)) {
      setClientValue("");
    }
  }

  function handleClientSelect(client: CrmClient) {
    setClientValue(buildClientValue(client));
    setClientSearch(formatClientSearchValue(client));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const clientPayload = resolveClientPayload(clientValue);
    if (!clientPayload) {
      setError("Выберите клиента.");
      return;
    }
    if (documentType === "specification" && !commercialOfferId) {
      setError("Для спецификации выберите КП.");
      return;
    }

    setIsSubmitting(true);
    try {
      const document = await createDocument({
        documentType,
        number: number.trim(),
        documentDate,
        ...clientPayload,
        commercialOfferId: documentType === "specification" ? Number(commercialOfferId) : null,
        notes: notes.trim(),
      });
      await downloadDocumentFile(document.id);
      router.push("/documents/journal");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось сформировать документ."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-2 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="mb-1">
              <Link href="/documents/journal" className="text-[10px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--brand-dark)]">
                Журнал документов
              </Link>
            </div>
            <h1 className="text-[17px] font-[650] leading-none text-[var(--text-primary)]">
              Сформировать документ
            </h1>
            <p className="mt-0.5 max-w-[72ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Данные берутся из карточки клиента. Спецификация дополнительно использует строки выбранного КП.
            </p>
          </div>
          <button type="submit" disabled={isSubmitting || isLoading} className="app-action-button app-action-button--md">
            {isSubmitting ? "Формируем..." : "Сформировать DOCX"}
          </button>
        </header>

        {error ? (
          <div className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}

        <section className="grid gap-2 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
            <div className="grid gap-2">
              <label>
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Тип
                </span>
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as DocumentType)}
                  className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                >
                  <option value="contract">Договор</option>
                  <option value="specification">Спецификация</option>
                </select>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Номер
                  </span>
                  <input
                    type="text"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                    placeholder="Автонумерация"
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Дата
                  </span>
                  <input
                    type="date"
                    value={documentDate}
                    onChange={(event) => setDocumentDate(event.target.value)}
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  />
                </label>
              </div>

              <div>
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Клиент
                </span>
                <input
                  type="search"
                  value={clientSearch}
                  onChange={(event) => handleClientSearchChange(event.target.value)}
                  disabled={isLoading}
                  placeholder="Поиск по названию, ИНН или КПП"
                  className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                />
                <div className="mt-1 max-h-[176px] overflow-auto rounded-[10px] border border-[var(--border-color)] bg-white p-1">
                  {filteredClients.length > 0 ? (
                    <div className="grid gap-1">
                      {filteredClients.map((client) => {
                        const value = buildClientValue(client);
                        const isSelected = value === clientValue;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleClientSelect(client)}
                            className={`rounded-[8px] border px-2.5 py-1.5 text-left text-[10px] transition ${
                              isSelected
                                ? "border-[var(--brand-yellow)] bg-[var(--brand-light)] text-[var(--brand-dark)]"
                                : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-color)] hover:bg-[var(--page-bg)]"
                            }`}
                          >
                            <span className="block truncate font-semibold">
                              {client.source === "onec" ? "1С" : "Локальный"} · {client.documentName || client.name || client.fullName}
                            </span>
                            <span className="mt-0.5 block truncate text-[9px] text-[var(--text-secondary)]">
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
              </div>

              {documentType === "specification" ? (
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    КП
                  </span>
                  <select
                    value={commercialOfferId}
                    onChange={(event) => handleOfferChange(event.target.value)}
                    disabled={isLoading}
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  >
                    <option value="">Выберите КП</option>
                    {offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.number} · {offer.clientName} · {formatMoney(offer.totalAmount)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                  Заметка
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Внутренняя заметка к документу"
                  className="w-full resize-none rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                />
              </label>
            </div>
          </div>

          <aside className="rounded-[14px] border border-[var(--border-color)] bg-white p-2">
            <div className="grid gap-1.5 text-[10px] text-[var(--text-secondary)]">
              <MetaRow label="Клиент" value={selectedClient?.documentName || selectedClient?.name || "-"} />
              <MetaRow label="ИНН / КПП" value={selectedClient ? `${selectedClient.inn || "-"} / ${selectedClient.kpp || "-"}` : "-"} />
              <MetaRow label="Адрес" value={selectedClient?.legalAddress || "-"} />
              <MetaRow label="Название банка" value={selectedClient?.bankName || (isBik(selectedClient?.bankNameOrBik) ? "-" : (selectedClient?.bankNameOrBik ?? "-"))} />
              <MetaRow label="Расчетный счет" value={selectedClient?.bankAccount || "-"} />
              <MetaRow label="БИК" value={selectedClient?.bankBik || (isBik(selectedClient?.bankNameOrBik) ? (selectedClient?.bankNameOrBik ?? "-") : "-")} />
              <MetaRow label="Корр. счет" value={selectedClient?.correspondentAccount || "-"} />
              <MetaRow label="Подписант" value={selectedClient?.signerName || "-"} />
              {documentType === "specification" ? (
                <MetaRow label="КП" value={selectedOffer ? `${selectedOffer.number} · ${formatMoney(selectedOffer.totalAmount)}` : "-"} />
              ) : null}
            </div>

            {missingFields.length > 0 ? (
              <div className="mt-2 rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[10px] leading-4 text-[#92400E]">
                Не заполнено в карточке клиента: {missingFields.map((field) => FIELD_LABELS[field] ?? String(field)).join(", ")}. Документ сформируется, но эти места будут пустыми.
              </div>
            ) : (
              <div className="mt-2 rounded-[12px] border border-[#BFE8D2] bg-[#F0FDF4] px-3 py-2 text-[10px] leading-4 text-[#166534]">
                Обязательные реквизиты для выбранного шаблона заполнены.
              </div>
            )}
          </aside>
        </section>
      </form>
    </AppShell>
  );
}

function buildClientValue(client: CrmClient) {
  return `${client.source}:${client.id}`;
}

function formatClientSearchValue(client: CrmClient) {
  const name = client.documentName || client.name || client.fullName || "";
  const parts = [name];
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
      client.name,
      client.fullName,
      client.inn,
      client.kpp,
      client.source === "onec" ? "1С" : "локальный",
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(query);
}

function buildClientValueFromOffer(offer: CommercialOffer) {
  const id = offer.clientSource === "onec" ? offer.counterpartyId : offer.crmClientId;
  return id ? `${offer.clientSource}:${id}` : "";
}

function resolveClientPayload(clientValue: string): { clientSource: "onec" | "local"; clientId: number } | null {
  const [source, rawId] = clientValue.split(":");
  const id = Number(rawId);
  if ((source !== "onec" && source !== "local") || !Number.isFinite(id) || id <= 0) {
    return null;
  }
  return { clientSource: source, clientId: id };
}

function isBik(value: string | null | undefined) {
  return /^\d{9}$/.test(String(value ?? "").trim());
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-[var(--page-bg)] px-2.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.05em]">{label}</div>
      <div className="mt-0.5 break-words text-[11px] font-medium text-[var(--text-primary)]">{value}</div>
    </div>
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
