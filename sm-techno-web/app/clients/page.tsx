"use client";

import { useEffect, useMemo, useState, type SyntheticEvent, type ReactNode, type SVGProps } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import {
  createClient,
  fetchClients,
  sendClientToOneC,
  syncCrmWorkspace,
  type ClientSyncResult,
  type CreateClientPayload,
} from "@/lib/api";
import type { CrmClient } from "@/lib/types";

const CLIENTS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "status", width: 128, minWidth: 112, maxWidth: 170 },
  { key: "type", width: 108, minWidth: 92, maxWidth: 140 },
  { key: "roles", width: 116, minWidth: 98, maxWidth: 156 },
  { key: "name", width: 310, minWidth: 230, maxWidth: 520 },
  { key: "inn", width: 150, minWidth: 128, maxWidth: 190 },
  { key: "contact", width: 170, minWidth: 132, maxWidth: 260 },
  { key: "email", width: 210, minWidth: 150, maxWidth: 300 },
  { key: "phone", width: 160, minWidth: 128, maxWidth: 230 },
  { key: "notes", width: 230, minWidth: 160, maxWidth: 360 },
  { key: "actions", width: 148, minWidth: 132, maxWidth: 180 },
];

type SyncFilter = "all" | "synced" | "sync_error" | "local";

const SIGNER_POSITION_OPTIONS = ["Директор", "Генеральный директор"];

function createEmptyForm(): CreateClientPayload {
  return {
    legalType: "legal_entity",
    documentName: "",
    fullName: "",
    inn: "",
    kpp: "",
    isBuyer: true,
    isSupplier: false,
    isInactive: false,
    bankNameOrBik: "",
    bankName: "",
    bankBik: "",
    bankAccount: "",
    correspondentAccount: "",
    contactPerson: "",
    email: "",
    emailNote: "",
    phone: "",
    phoneNote: "",
    legalAddress: "",
    actualAddress: "",
    ogrn: "",
    signerPosition: "",
    signerName: "",
    signerBasis: "",
    notes: "",
  };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [form, setForm] = useState<CreateClientPayload>(() => createEmptyForm());
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingReferences, setIsSyncingReferences] = useState(false);
  const [retryingClientId, setRetryingClientId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-crm-clients-table-widths-v2",
    CLIENTS_TABLE_COLUMNS,
  );

  useEffect(() => {
    void loadClients();
  }, []);

  const summary = useMemo(() => {
    const onec = clients.filter((client) => client.source === "onec").length;
    const local = clients.filter((client) => client.source === "local").length;
    const errors = clients.filter((client) => client.syncStatus === "sync_error").length;
    const synced = clients.filter((client) => client.syncStatus === "synced").length;
    return { total: clients.length, onec, local, errors, synced };
  }, [clients]);

  const filteredClients = useMemo(() => {
    if (syncFilter === "all") {
      return clients;
    }
    return clients.filter((client) => client.syncStatus === syncFilter);
  }, [clients, syncFilter]);

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

  async function handleSyncReferences() {
    setIsSyncingReferences(true);
    setError(null);
    setNotice(null);

    try {
      const result = await syncCrmWorkspace();
      await loadClients();
      setNotice(result.status === "coalesced"
        ? "Синхронизация с 1С уже выполняется. Список обновится после её завершения."
        : `Проверены новые контрагенты 1С: ${result.counterparties}.`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось синхронизировать клиентов с 1С."));
    } finally {
      setIsSyncingReferences(false);
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = normalizeFormForSubmit(form);
    const validationError = validateClientForm(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await createClient(payload);
      setForm(createEmptyForm());
      setNotice(formatSyncNotice(result.sync));
      await loadClients();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось создать клиента."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRetrySync(client: CrmClient) {
    const clientId = client.crmClientId ?? client.id;
    setRetryingClientId(clientId);
    setError(null);
    setNotice(null);

    try {
      const result = await sendClientToOneC(clientId);
      setNotice(formatSyncNotice(result.sync));
      await loadClients();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось повторно отправить клиента в 1С."));
    } finally {
      setRetryingClientId(null);
    }
  }

  function updateForm<K extends keyof CreateClientPayload>(key: K, value: CreateClientPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <header className="rounded-[10px] bg-white px-3 py-2 shadow-[0_8px_20px_rgba(7,22,46,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[17px] font-[650] leading-none text-[var(--text-primary)]">
                Клиенты
              </h1>
              <p className="mt-1 max-w-[76ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
                Карточки контрагентов, локальные черновики и связь с 1С.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <MetricChip label="Всего" value={String(summary.total)} />
              <MetricChip label="1С" value={String(summary.onec)} />
              <MetricChip label="Локальные" value={String(summary.local)} />
              <MetricChip label="Синхр." value={String(summary.synced)} />
              <MetricChip label="Ошибки" value={String(summary.errors)} tone={summary.errors > 0 ? "error" : "default"} />
              <button
                type="button"
                onClick={() => void handleSyncReferences()}
                disabled={isLoading || isSyncingReferences}
                className="app-action-button app-action-button--xs"
              >
                {isSyncingReferences ? "Синхронизация..." : "Синхронизировать с 1С"}
              </button>
              <button
                type="button"
                onClick={() => void loadClients()}
                disabled={isLoading || isSyncingReferences}
                className="app-action-button app-action-button--xs"
              >
                {isLoading ? "Обновление..." : "Обновить"}
              </button>
            </div>
          </div>
        </header>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="overflow-hidden rounded-[10px] border border-[var(--border-color)] bg-white shadow-[0_8px_20px_rgba(7,22,46,0.05)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[#FAFBFD] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)]">
                <BuildingIcon className="h-5 w-5 stroke-[1.9]" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-[650] leading-[20px] text-[var(--text-primary)]">
                  Новый контрагент
                </h1>
                <p className="mt-0.5 text-[10px] leading-[14px] text-[var(--text-secondary)]">
                  {form.legalType === "individual_entrepreneur" ? "Создание индивидуального предпринимателя" : "Создание юридического лица"}
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="app-action-button app-action-button--md w-full sm:w-auto"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5 stroke-[2.2]" />
              {isSaving ? "Отправка..." : "Создать в 1С"}
            </button>
          </div>

          <div className="grid gap-2 p-2 xl:grid-cols-2">
            <section className="min-w-0 rounded-[8px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <SectionTitle icon={<DocumentCardIcon className="h-4 w-4 stroke-[1.9]" />}>Основное</SectionTitle>
              <div className="grid gap-1.5 lg:grid-cols-[minmax(190px,0.9fr)_minmax(0,1.1fr)]">
                <Field label="Вид">
                  <select
                    value={form.legalType}
                    onChange={(event) => {
                      const legalType = event.target.value as CreateClientPayload["legalType"];
                      setForm((current) => ({
                        ...current,
                        legalType,
                        kpp: legalType === "individual_entrepreneur" ? "" : current.kpp,
                      }));
                    }}
                    className={fieldClassName}
                  >
                    <option value="legal_entity">Юридическое лицо</option>
                    <option value="individual_entrepreneur">Индивидуальный предприниматель</option>
                  </select>
                </Field>
                <div className="grid gap-1.5 sm:grid-cols-3 lg:pt-[16px]">
                  <CheckBox
                    checked={form.isBuyer}
                    label="Покупатель"
                    onChange={(checked) => updateForm("isBuyer", checked)}
                  />
                  <CheckBox
                    checked={form.isSupplier}
                    label="Поставщик"
                    onChange={(checked) => updateForm("isSupplier", checked)}
                  />
                  <CheckBox
                    checked={form.isInactive}
                    label="Недействителен"
                    onChange={(checked) => updateForm("isInactive", checked)}
                  />
                </div>
              </div>

              <div className="mt-1.5 grid gap-1.5">
                <TextInput
                  label="Наименование для документов"
                  value={form.documentName}
                  onChange={(value) => updateForm("documentName", value)}
                  placeholder="ООО Ромашка"
                />
                <TextInput
                  label="Наименование в программе"
                  value={form.fullName}
                  onChange={(value) => updateForm("fullName", value)}
                  placeholder="Полное наименование"
                />
                <div className="grid gap-1.5 md:grid-cols-2">
                  <TextInput
                    label="ИНН"
                    value={form.inn}
                    onChange={(value) => updateForm("inn", value)}
                    placeholder={form.legalType === "legal_entity" ? "10 цифр" : "12 цифр"}
                    inputMode="numeric"
                  />
                  <TextInput
                    label="КПП"
                    value={form.kpp}
                    onChange={(value) => updateForm("kpp", value)}
                    placeholder="9 цифр"
                    inputMode="numeric"
                    disabled={form.legalType === "individual_entrepreneur"}
                  />
                </div>
                <TextInput
                  label="ОГРН / ОГРНИП"
                  value={form.ogrn ?? ""}
                  onChange={(value) => updateForm("ogrn", value)}
                  placeholder={form.legalType === "legal_entity" ? "13 цифр" : "15 цифр"}
                  inputMode="numeric"
                />
              </div>
            </section>

            <section className="min-w-0 rounded-[8px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <SectionTitle icon={<WalletIcon className="h-4 w-4 stroke-[1.9]" />}>Контакты и реквизиты</SectionTitle>
              <div className="grid gap-1.5 md:grid-cols-2">
                <TextInput
                  label="Банк"
                  value={form.bankNameOrBik}
                  onChange={(value) => updateForm("bankNameOrBik", value)}
                  placeholder="БИК или название"
                />
                <TextInput
                  label="Название банка"
                  value={form.bankName ?? ""}
                  onChange={(value) => updateForm("bankName", value)}
                  placeholder="ПАО Банк"
                />
                <TextInput
                  label="БИК"
                  value={form.bankBik ?? ""}
                  onChange={(value) => updateForm("bankBik", value)}
                  placeholder="9 цифр"
                  inputMode="numeric"
                />
                <TextInput
                  label="Номер счета"
                  value={form.bankAccount}
                  onChange={(value) => updateForm("bankAccount", value)}
                  placeholder="20 цифр"
                  inputMode="numeric"
                />
                <TextInput
                  label="Корр. счет"
                  value={form.correspondentAccount ?? ""}
                  onChange={(value) => updateForm("correspondentAccount", value)}
                  placeholder="20 цифр"
                  inputMode="numeric"
                />
                <TextInput
                  label="Телефон"
                  value={form.phone ?? ""}
                  onChange={(value) => updateForm("phone", value)}
                  placeholder="+7"
                />
                <TextInput
                  label="Примечание к телефону"
                  value={form.phoneNote ?? ""}
                  onChange={(value) => updateForm("phoneNote", value)}
                  placeholder="Основной"
                />
                <TextInput
                  label="E-mail"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(value) => updateForm("email", value)}
                  placeholder="mail@example.ru"
                />
                <TextInput
                  label="Примечание к e-mail"
                  value={form.emailNote ?? ""}
                  onChange={(value) => updateForm("emailNote", value)}
                  placeholder="Счета"
                />
              </div>
            </section>

            <section className="min-w-0 rounded-[8px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <SectionTitle icon={<MapPinIcon className="h-4 w-4 stroke-[1.9]" />}>Адреса</SectionTitle>
              <div className="grid gap-1.5 md:grid-cols-2">
                <TextArea
                  label="Юридический адрес"
                  value={form.legalAddress ?? ""}
                  onChange={(value) => updateForm("legalAddress", value)}
                  placeholder="Адрес"
                  minHeightClass="min-h-[50px]"
                />
                <TextArea
                  label="Фактический адрес"
                  value={form.actualAddress ?? ""}
                  onChange={(value) => updateForm("actualAddress", value)}
                  placeholder="Адрес"
                  minHeightClass="min-h-[50px]"
                />
              </div>
            </section>

            <section className="min-w-0 rounded-[8px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <SectionTitle icon={<DocumentCardIcon className="h-4 w-4 stroke-[1.9]" />}>Подписант</SectionTitle>
              <div className="grid gap-1.5 md:grid-cols-2">
                <Field label="Должность">
                  <select
                    value={form.signerPosition ?? ""}
                    onChange={(event) => updateForm("signerPosition", event.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">Выберите должность</option>
                    {form.signerPosition && !SIGNER_POSITION_OPTIONS.includes(form.signerPosition) ? (
                      <option value={form.signerPosition}>{form.signerPosition}</option>
                    ) : null}
                    {SIGNER_POSITION_OPTIONS.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </Field>
                <TextInput
                  label="ФИО"
                  value={form.signerName ?? ""}
                  onChange={(value) => updateForm("signerName", value)}
                  placeholder="Иванов Иван Иванович"
                />
                <TextInput
                  label="Основание"
                  value={form.signerBasis ?? ""}
                  onChange={(value) => updateForm("signerBasis", value)}
                  placeholder="Устав"
                />
              </div>
            </section>

            <section className="min-w-0 rounded-[8px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2">
              <SectionTitle icon={<NotesIcon className="h-4 w-4 stroke-[1.9]" />}>Заметки</SectionTitle>
              <TextArea
                label="Заметки"
                value={form.notes ?? ""}
                onChange={(value) => updateForm("notes", value)}
                placeholder="Дополнительная информация"
                minHeightClass="min-h-[82px]"
              />
            </section>
          </div>
        </form>

        <section className="overflow-hidden rounded-[10px] border border-[var(--border-color)] bg-white shadow-[0_8px_20px_rgba(7,22,46,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[#FAFBFD] px-3 py-2">
            <div className="text-[11px] font-semibold text-[var(--text-primary)]">
              Список клиентов
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSyncFilter(filter.value)}
                  className={`h-7 rounded-[8px] border px-2.5 text-[10px] font-semibold transition ${
                    syncFilter === filter.value
                      ? "border-[var(--brand-yellow)] bg-[var(--brand-yellow)] text-[var(--brand-dark)]"
                      : "border-[var(--border-color)] bg-white text-[var(--text-primary)] hover:bg-[#F8FAFD]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {filteredClients.length === 0 && !isLoading ? (
            <div className="px-3 py-5 text-[11px] text-[var(--text-secondary)]">
              По текущему фильтру клиентов нет.
            </div>
          ) : (
            <div ref={containerRef} className="max-h-[calc(100dvh-25rem)] overflow-auto">
              <table className="min-w-full table-fixed border-collapse" style={{ width: tableWidth }}>
                <colgroup>
                  {CLIENTS_TABLE_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: getWidth(column.key) }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                  <tr>
                    <ResizableTableHeader columnKey="status" label="Статус" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="type" label="Вид" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="roles" label="Роли" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="name" label="Клиент" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="inn" label="ИНН / КПП" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="contact" label="Контакт" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="email" label="E-mail" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="phone" label="Телефон" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="notes" label="Заметка" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                    <ResizableTableHeader columnKey="actions" label="" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const localClientId = client.crmClientId ?? client.id;
                    const canRetry = client.source === "local" && client.syncStatus !== "synced";
                    return (
                      <tr key={`${client.source}:${client.id}`} className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]">
                        <td className="px-3 py-1.5 align-top">
                          <StatusBadge client={client} />
                          {client.syncError ? (
                            <div className="mt-1 line-clamp-2 text-[9px] leading-[12px] text-[var(--stock-empty)]">
                              {client.syncError}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 align-top text-[var(--text-secondary)]">
                          {client.legalType === "individual_entrepreneur" ? "ИП" : "Юр. лицо"}
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <div className="flex flex-wrap gap-1">
                            {client.isBuyer ? <RoleBadge>Покупатель</RoleBadge> : null}
                            {client.isSupplier ? <RoleBadge>Поставщик</RoleBadge> : null}
                            {client.isInactive ? <RoleBadge tone="muted">Не действует</RoleBadge> : null}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <div className="line-clamp-2 text-[11px] font-semibold leading-[15px]">
                            {formatClientDisplayName(client)}
                          </div>
                          {client.fullName && client.fullName !== client.documentName ? (
                            <div className="mt-0.5 line-clamp-1 text-[9px] text-[var(--text-secondary)]">
                              {client.fullName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 align-top tabular-nums text-[var(--text-secondary)]">
                          <div>{client.inn || "-"}</div>
                          <div className="mt-0.5 text-[9px]">{client.kpp || "-"}</div>
                        </td>
                        <td className="px-3 py-1.5 align-top">{client.contactPerson || "-"}</td>
                        <td className="px-3 py-1.5 align-top text-[var(--text-secondary)]">
                          <div className="line-clamp-1">{client.email || "-"}</div>
                          {client.emailNote ? <div className="mt-0.5 line-clamp-1 text-[9px]">{client.emailNote}</div> : null}
                        </td>
                        <td className="px-3 py-1.5 align-top text-[var(--text-secondary)]">
                          <div className="line-clamp-1">{client.phone || "-"}</div>
                          {client.phoneNote ? <div className="mt-0.5 line-clamp-1 text-[9px]">{client.phoneNote}</div> : null}
                        </td>
                        <td className="px-3 py-1.5 align-top text-[var(--text-secondary)]">
                          <div className="line-clamp-2">{client.notes || "-"}</div>
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          {canRetry ? (
                            <button
                              type="button"
                              disabled={retryingClientId === localClientId}
                              onClick={() => void handleRetrySync(client)}
                              className="app-action-button app-action-button--xs w-full"
                            >
                              {retryingClientId === localClientId ? "Отправка..." : "В 1С"}
                            </button>
                          ) : (
                            <span className="text-[9px] text-[var(--text-secondary)]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

const FILTERS: Array<{ value: SyncFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "synced", label: "Синхр." },
  { value: "sync_error", label: "Ошибки" },
  { value: "local", label: "Локальные" },
];

const fieldClassName =
  "h-[34px] w-full rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition placeholder:text-[#8A95A8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)] disabled:bg-[#F1F5F9] disabled:text-[var(--text-secondary)]";

function normalizeFormForSubmit(form: CreateClientPayload): CreateClientPayload {
  const documentName = form.documentName.trim();
  return {
    ...form,
    documentName,
    fullName: form.fullName.trim() || documentName,
    inn: form.inn.trim(),
    kpp: form.legalType === "individual_entrepreneur" ? "" : form.kpp.trim(),
    bankNameOrBik: form.bankNameOrBik.trim(),
    bankName: form.bankName?.trim() ?? "",
    bankBik: onlyDigits(form.bankBik ?? ""),
    bankAccount: form.bankAccount.trim(),
    correspondentAccount: onlyDigits(form.correspondentAccount ?? ""),
    contactPerson: form.contactPerson?.trim() ?? "",
    email: form.email?.trim() ?? "",
    emailNote: form.emailNote?.trim() ?? "",
    phone: form.phone?.trim() ?? "",
    phoneNote: form.phoneNote?.trim() ?? "",
    legalAddress: form.legalAddress?.trim() ?? "",
    actualAddress: form.actualAddress?.trim() ?? "",
    ogrn: onlyDigits(form.ogrn ?? ""),
    signerPosition: form.signerPosition?.trim() ?? "",
    signerName: form.signerName?.trim() ?? "",
    signerBasis: form.signerBasis?.trim() ?? "",
    notes: form.notes?.trim() ?? "",
  };
}

function validateClientForm(form: CreateClientPayload) {
  const inn = onlyDigits(form.inn);
  const kpp = onlyDigits(form.kpp);
  if (!form.documentName) {
    return "Укажите наименование для документов.";
  }
  if (!form.isBuyer && !form.isSupplier) {
    return "Выберите хотя бы одну роль: покупатель или поставщик.";
  }
  if (form.legalType === "legal_entity") {
    if (inn.length !== 10) {
      return "Для юридического лица ИНН должен содержать 10 цифр.";
    }
    if (kpp.length !== 9) {
      return "Для юридического лица КПП должен содержать 9 цифр.";
    }
  }
  if (form.legalType === "individual_entrepreneur" && inn.length !== 12) {
    return "Для ИП ИНН должен содержать 12 цифр.";
  }
  return "";
}

function onlyDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function formatClientDisplayName(client: CrmClient) {
  return client.documentName || client.fullName || client.name || "-";
}

function formatSyncNotice(sync: ClientSyncResult) {
  if (sync.status === "synced") {
    return sync.onecRefKey ? `Клиент отправлен в 1С. Ref_Key: ${sync.onecRefKey}.` : sync.message;
  }
  return sync.message || "Клиент сохранен локально, но 1С вернула ошибку.";
}

function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-[650] leading-[14px] text-[var(--text-primary)]">
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--brand-dark)]">{icon}</span> : null}
      <span>{children}</span>
    </h2>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-semibold uppercase leading-none text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  disabled = false,
  inputMode,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <Field label={label}>
      <input
        disabled={disabled}
        inputMode={inputMode}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </Field>
  );
}

function TextArea({
  label,
  minHeightClass = "min-h-[82px]",
  onChange,
  placeholder,
  value,
}: {
  label: string;
  minHeightClass?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${minHeightClass} w-full resize-y rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none transition placeholder:text-[#8A95A8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]`}
      />
    </Field>
  );
}

function CheckBox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-[34px] items-center gap-2 rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--brand-dark)]"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

function MetricChip({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "error";
  value: string;
}) {
  const toneClass =
    tone === "error"
      ? "border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]"
      : "border-[var(--border-color)] bg-[#FBFCFE] text-[var(--text-primary)]";
  return (
    <div className={`rounded-[8px] border px-2.5 py-1.5 ${toneClass}`}>
      <span className="text-[9px] text-[var(--text-secondary)]">{label}</span>
      <span className="ml-1.5 text-[11px] font-semibold">{value}</span>
    </div>
  );
}

function StatusBadge({ client }: { client: CrmClient }) {
  const label =
    client.syncStatus === "synced"
      ? client.source === "onec"
        ? "1С"
        : "Синхр."
      : client.syncStatus === "sync_error"
        ? "Ошибка"
        : "Локально";
  const className =
    client.syncStatus === "synced"
      ? "bg-[#ECFDF3] text-[#166534]"
      : client.syncStatus === "sync_error"
        ? "bg-[#FEF2F2] text-[var(--stock-empty)]"
        : "bg-[var(--brand-light)] text-[var(--brand-dark)]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function RoleBadge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "muted" }) {
  const className =
    tone === "muted"
      ? "bg-[#F1F5F9] text-[var(--text-secondary)]"
      : "bg-[#EEF2FF] text-[#3730A3]";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${className}`}>{children}</span>;
}

function Alert({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  const className =
    tone === "success"
      ? "border-[#BFE8D2] bg-[#F0FDF4] text-[#166534]"
      : "border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]";
  return <div className={`rounded-[8px] border px-3 py-1.5 text-[10px] ${className}`}>{children}</div>;
}

function BuildingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4.5 21V5.8c0-.9.6-1.6 1.5-1.8l7-1.4c1-.2 2 .6 2 1.6V21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 9h3.6c.8 0 1.4.6 1.4 1.4V21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8h3M8 12h3M8 16h3M3 21h18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M7 3.5h7l3 3V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3.5V7h3.5M8.5 11h6M8.5 14.5h6M8.5 18h3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 7.5c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9.5h16M7.5 14h3M15.5 14h1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MapPinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M7 4h8.5L19 7.5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5.5A1.5 1.5 0 0 1 7 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 4V8H19M8.5 12h7M8.5 15.5h7M8.5 19h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M8.5 15.5 15.5 8.5M10 8.5h5.5V14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 4.5H6.8a2.3 2.3 0 0 0-2.3 2.3v10.4a2.3 2.3 0 0 0 2.3 2.3h10.4a2.3 2.3 0 0 0 2.3-2.3v-6.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
