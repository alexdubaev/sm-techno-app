"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import { createClient, fetchClients, type CreateClientPayload } from "@/lib/api";
import type { CrmClient } from "@/lib/types";

const CLIENTS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "source", width: 86, minWidth: 76, maxWidth: 120 },
  { key: "name", width: 310, minWidth: 220, maxWidth: 520 },
  { key: "inn", width: 122, minWidth: 96, maxWidth: 170 },
  { key: "contact", width: 170, minWidth: 130, maxWidth: 260 },
  { key: "email", width: 190, minWidth: 140, maxWidth: 280 },
  { key: "phone", width: 140, minWidth: 112, maxWidth: 220 },
  { key: "notes", width: 220, minWidth: 150, maxWidth: 340 },
];

const EMPTY_FORM: CreateClientPayload = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  notes: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [form, setForm] = useState<CreateClientPayload>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-crm-clients-table-widths-v1",
    CLIENTS_TABLE_COLUMNS,
  );

  useEffect(() => {
    void loadClients();
  }, []);

  const summary = useMemo(() => {
    const onec = clients.filter((client) => client.source === "onec").length;
    const local = clients.filter((client) => client.source === "local").length;
    return { total: clients.length, onec, local };
  }, [clients]);

  async function loadClients() {
    setIsLoading(true);
    setError(null);

    try {
      setClients(await fetchClients());
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить клиентов."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Введите название клиента.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await createClient({
        name,
        contactPerson: form.contactPerson?.trim() ?? "",
        email: form.email?.trim() ?? "",
        phone: form.phone?.trim() ?? "",
        notes: form.notes?.trim() ?? "",
      });
      setForm(EMPTY_FORM);
      setNotice("Локальный клиент добавлен. Он доступен для коммерческих предложений.");
      await loadClients();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось создать клиента."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Клиенты
            </h1>
            <p className="mt-0.5 max-w-[64ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Общая база: контрагенты из 1С и локальные лиды для коммерческих предложений.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <MetricChip label="Всего" value={String(summary.total)} />
            <MetricChip label="1С" value={String(summary.onec)} />
            <MetricChip label="Локальные" value={String(summary.local)} />
            <button
              type="button"
              onClick={() => void loadClients()}
              disabled={isLoading}
              className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>
        </header>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="grid gap-1.5 rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2 lg:grid-cols-[minmax(200px,1.3fr)_minmax(140px,0.9fr)_minmax(160px,0.9fr)_minmax(140px,0.8fr)_minmax(180px,1fr)_auto]"
        >
          <TextInput
            label="Новый клиент"
            value={form.name}
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            placeholder="Название компании"
          />
          <TextInput
            label="Контакт"
            value={form.contactPerson ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, contactPerson: value }))}
            placeholder="Имя"
          />
          <TextInput
            label="Email"
            type="email"
            value={form.email ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, email: value }))}
            placeholder="mail@example.ru"
          />
          <TextInput
            label="Телефон"
            value={form.phone ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
            placeholder="+7"
          />
          <TextInput
            label="Заметка"
            value={form.notes ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, notes: value }))}
            placeholder="Комментарий"
          />
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSaving}
              className="h-[34px] w-full rounded-[11px] bg-[var(--brand-dark)] px-3 text-[11px] font-semibold text-white transition hover:bg-[#10264A] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
            >
              {isSaving ? "Сохраняем..." : "Добавить"}
            </button>
          </div>
        </form>

        <section className="overflow-hidden rounded-[14px] border border-[var(--border-color)] bg-white">
          {clients.length === 0 && !isLoading ? (
            <div className="px-3 py-5 text-[11px] text-[var(--text-secondary)]">
              Клиентов пока нет.
            </div>
          ) : (
            <div ref={containerRef} className="max-h-[calc(100dvh-14rem)] overflow-auto">
              <table className="min-w-full table-fixed border-collapse" style={{ width: tableWidth }}>
                <colgroup>
                  {CLIENTS_TABLE_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: getWidth(column.key) }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                  <tr>
                    <ResizableTableHeader columnKey="source" label="Источник" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="name" label="Клиент" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="inn" label="ИНН" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="contact" label="Контакт" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="email" label="Email" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="phone" label="Телефон" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="notes" label="Заметка" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={`${client.source}:${client.id}`} className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]">
                      <td className="px-3 py-1.5">
                        <SourceBadge source={client.source} />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="line-clamp-2 text-[11px] font-semibold leading-[15px]">
                          {client.name || client.fullName || "-"}
                        </div>
                        {client.fullName && client.fullName !== client.name ? (
                          <div className="mt-0.5 line-clamp-1 text-[9px] text-[var(--text-secondary)]">
                            {client.fullName}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{client.inn || "-"}</td>
                      <td className="px-3 py-1.5">{client.contactPerson || "-"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{client.email || "-"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{client.phone || "-"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        <div className="line-clamp-2">{client.notes || "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
      />
    </label>
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

function SourceBadge({ source }: { source: CrmClient["source"] }) {
  const local = source === "local";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${local ? "bg-[var(--brand-light)] text-[var(--brand-dark)]" : "bg-[#EEF2FF] text-[#3730A3]"}`}>
      {local ? "Локальный" : "1С"}
    </span>
  );
}

function Alert({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  const className =
    tone === "success"
      ? "border-[#BFE8D2] bg-[#F0FDF4] text-[#166534]"
      : "border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]";
  return <div className={`rounded-[10px] border px-3 py-1.5 text-[10px] ${className}`}>{children}</div>;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
