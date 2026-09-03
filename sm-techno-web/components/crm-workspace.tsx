"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  createCrmClient,
  fetchCrmClients,
  fetchCrmTabs,
  moveCrmClient,
  saveCrmRowPreference,
} from "@/lib/api";
import type { CrmTab, CrmWorkspaceClient } from "@/lib/types";

type ActiveTab = "primary" | number;
type SyncFilter = "all" | "synced" | "local" | "sync_error";

const PRIMARY_TAB: { id: ActiveTab; name: string; systemKind: "primary" } = {
  id: "primary",
  name: "Клиенты 1С",
  systemKind: "primary",
};

const ROW_COLORS = [
  ["blue", "Голубой", "#DBEAFE"],
  ["cyan", "Бирюзовый", "#CFFAFE"],
  ["teal", "Мятный", "#CCFBF1"],
  ["green", "Зелёный", "#DCFCE7"],
  ["lime", "Лаймовый", "#ECFCCB"],
  ["yellow", "Жёлтый", "#FEF9C3"],
  ["amber", "Янтарный", "#FEF3C7"],
  ["orange", "Оранжевый", "#FFEDD5"],
  ["red", "Красный", "#FEE2E2"],
  ["pink", "Розовый", "#FCE7F3"],
  ["purple", "Фиолетовый", "#F3E8FF"],
  ["gray", "Серый", "#E5E7EB"],
] as const;

const colorByKey = new Map(ROW_COLORS.map(([key, _label, color]) => [key, color]));

function emptyClientForm() {
  return { documentName: "", city: "", contactPerson: "", email: "", phone: "", notes: "" };
}

export function CrmWorkspace() {
  const [tabs, setTabs] = useState<CrmTab[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("primary");
  const [clients, setClients] = useState<CrmWorkspaceClient[]>([]);
  const [search, setSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [colors, setColors] = useState<Record<number, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm);
  const requestId = useRef(0);

  const loadWorkspace = useCallback(async (tab: ActiveTab, { silent = false } = {}) => {
    const id = ++requestId.current;
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const [nextTabs, nextClients] = await Promise.all([
        fetchCrmTabs(),
        fetchCrmClients(tab === "primary" ? { primaryOnly: true } : { tabId: tab }),
      ]);
      if (id !== requestId.current) return;
      setTabs(nextTabs);
      setClients(nextClients);
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause, "Не удалось загрузить CRM."));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadWorkspace(activeTab);
  }, [activeTab, loadWorkspace]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadWorkspace(activeTab, { silent: true }), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadWorkspace]);

  const visibleClients = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    return clients.filter((client) => {
      const matchesStatus = syncFilter === "all" || client.syncStatus === syncFilter;
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [client.name, client.documentName, client.fullName, client.inn, client.email, client.phone]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(needle);
    });
  }, [clients, search, syncFilter]);

  const chooseTab = (tab: ActiveTab) => {
    setSearch("");
    setSyncFilter("all");
    setActiveTab(tab);
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.documentName.trim()) {
      setError("Укажите наименование компании.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await createCrmClient({
        documentName: form.documentName.trim(),
        city: form.city.trim(),
        contactPerson: form.contactPerson.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      });
      setForm(emptyClientForm());
      setIsAdding(false);
      setNotice("Клиент добавлен во вкладку «В работе».");
      const workTab = tabs.find((tab) => tab.systemKind === "work");
      chooseTab(workTab?.id ?? activeTab);
      if (workTab?.id === activeTab) await loadWorkspace(activeTab, { silent: true });
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось добавить клиента."));
    } finally {
      setIsSaving(false);
    }
  };

  const moveClient = async (client: CrmWorkspaceClient, targetTabId: number) => {
    const previousAssignment = client.assignment;
    const target = tabs.find((tab) => tab.id === targetTabId);
    if (!target) return;

    setClients((current) =>
      current.map((item) =>
        item.id === client.id && item.assignment
          ? { ...item, assignment: { ...item.assignment, tabId: target.id, tabName: target.name } }
          : item,
      ),
    );
    try {
      await moveCrmClient(client.id, targetTabId);
      setNotice(`Клиент перемещён во вкладку «${target.name}».`);
      await loadWorkspace(activeTab, { silent: true });
    } catch (cause) {
      setClients((current) => current.map((item) => (item.id === client.id ? { ...item, assignment: previousAssignment } : item)));
      setError(errorMessage(cause, "Не удалось переместить клиента. Изменение отменено."));
    }
  };

  const setRowColor = async (client: CrmWorkspaceClient, colorKey: string | null) => {
    if (activeTab === "primary") return;
    const previous = colors[client.id] ?? null;
    setColors((current) => ({ ...current, [client.id]: colorKey }));
    try {
      await saveCrmRowPreference(client.id, { tabId: activeTab, colorKey, position: 0 });
      setNotice("Оформление строки сохранено.");
    } catch (cause) {
      setColors((current) => ({ ...current, [client.id]: previous }));
      setError(errorMessage(cause, "Не удалось сохранить цвет. Изменение отменено."));
    }
  };

  return (
    <section className="mx-auto max-w-[1500px]">
      <header className="flex flex-col justify-between gap-4 rounded-[22px] border border-[var(--border-color)] bg-white/90 px-4 py-4 shadow-[0_12px_30px_rgba(7,22,46,0.05)] sm:px-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Рабочее пространство</p>
          <h1 className="mt-1 text-[25px] font-[700] tracking-[-0.045em] text-[var(--text-primary)]">CRM</h1>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Клиенты, личные вкладки и быстрые действия менеджера.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadWorkspace(activeTab, { silent: true })} disabled={isRefreshing} className="h-10 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:opacity-60">
            {isRefreshing ? "Обновляем…" : "Обновить"}
          </button>
          <button type="button" onClick={() => setIsAdding(true)} className="app-action-button h-10 rounded-[12px] px-4 text-[12px]">
            Добавить клиента
          </button>
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="rounded-[20px] border border-[var(--border-color)] bg-white/88 p-2.5 shadow-[0_10px_24px_rgba(7,22,46,0.04)]">
          <p className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Вкладки</p>
          <nav className="flex gap-1 overflow-x-auto xl:flex-col" aria-label="Вкладки CRM">
            <TabButton active={activeTab === "primary"} label={PRIMARY_TAB.name} onClick={() => chooseTab("primary")} />
            {tabs.map((tab) => <TabButton key={tab.id} active={activeTab === tab.id} label={tab.name} onClick={() => chooseTab(tab.id)} />)}
          </nav>
          <p className="mt-3 border-t border-[var(--border-color)] px-2.5 pt-3 text-[10px] leading-4 text-[var(--text-secondary)]">
            «Клиенты 1С» и «В работе» — постоянные вкладки. Новые клиенты автоматически попадают в «В работе».
          </p>
        </aside>

        <div className="min-w-0">
          <div className="rounded-[20px] border border-[var(--border-color)] bg-white/90 p-3 shadow-[0_10px_24px_rgba(7,22,46,0.04)] sm:p-4">
            <div className="flex flex-col gap-2 md:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Поиск клиентов</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по компании, контакту, телефону, почте или ИНН" className="h-10 w-full rounded-[12px] border border-[var(--border-color)] bg-[#FBFCFE] px-3 text-[12px] outline-none transition placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:ring-4 focus:ring-[rgba(255,196,0,0.12)]" />
              </label>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)]">
                <span>Синхронизация</span>
                <select value={syncFilter} onChange={(event) => setSyncFilter(event.target.value as SyncFilter)} className="h-10 rounded-[12px] border border-[var(--border-color)] bg-white px-2 text-[12px] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]">
                  <option value="all">Все</option><option value="synced">Связанные с 1С</option><option value="local">Локальные</option><option value="sync_error">С ошибкой</option>
                </select>
              </label>
            </div>
            {error ? <Message tone="error">{error}</Message> : null}
            {notice ? <Message tone="success">{notice}</Message> : null}
            {isLoading ? <LoadingRows /> : <ClientList activeTab={activeTab} clients={visibleClients} colors={colors} tabs={tabs} onColor={setRowColor} onMove={moveClient} onOpenAssignment={chooseTab} />}
          </div>
        </div>
      </div>

      {isAdding ? <ClientDialog form={form} isSaving={isSaving} onChange={setForm} onClose={() => setIsAdding(false)} onSubmit={submitClient} /> : null}
    </section>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`h-10 shrink-0 rounded-[11px] px-3 text-left text-[12px] font-semibold transition xl:w-full ${active ? "bg-[var(--brand-dark)] text-white shadow-[0_6px_14px_rgba(7,22,46,0.16)]" : "text-[var(--text-primary)] hover:bg-[#F6F8FB]"}`}>{label}</button>;
}

function ClientList({ activeTab, clients, colors, tabs, onColor, onMove, onOpenAssignment }: { activeTab: ActiveTab; clients: CrmWorkspaceClient[]; colors: Record<number, string | null>; tabs: CrmTab[]; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void }) {
  if (!clients.length) return <div className="py-12 text-center"><p className="text-[14px] font-semibold">Клиентов пока нет</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">Добавьте локального клиента или выберите компанию из «Клиенты 1С».</p></div>;
  return <>
    <div className="mt-4 hidden overflow-x-auto lg:block"><table className="w-full min-w-[930px] border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]"><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Компания</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Контакты</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Город</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Синхронизация</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Действия</th></tr></thead><tbody>{clients.map((client) => <ClientTableRow key={client.id} activeTab={activeTab} client={client} color={colors[client.id] ?? null} tabs={tabs} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} />)}</tbody></table></div>
    <div className="mt-4 grid gap-2 lg:hidden">{clients.map((client) => <ClientCard key={client.id} activeTab={activeTab} client={client} color={colors[client.id] ?? null} tabs={tabs} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} />)}</div>
  </>;
}

function ClientTableRow(props: RowProps) { const { client, color } = props; return <tr style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="text-[12px] text-[var(--text-primary)]"><td className="border-b border-[var(--border-color)] px-3 py-3"><Company client={client} onOpenAssignment={props.onOpenAssignment} /></td><td className="border-b border-[var(--border-color)] px-3 py-3"><Contact client={client} /></td><td className="border-b border-[var(--border-color)] px-3 py-3 text-[var(--text-secondary)]">{client.city || "—"}</td><td className="border-b border-[var(--border-color)] px-3 py-3"><Status status={client.syncStatus} /></td><td className="border-b border-[var(--border-color)] px-3 py-3"><Actions {...props} /></td></tr>; }

function ClientCard(props: RowProps) { const { client, color } = props; return <article style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="rounded-[14px] border border-[var(--border-color)] px-3 py-3"><div className="flex items-start justify-between gap-3"><Company client={client} onOpenAssignment={props.onOpenAssignment} /><Status status={client.syncStatus} /></div><div className="mt-3 grid gap-2 text-[11px] text-[var(--text-secondary)]"><Contact client={client} /><span>{client.city || "Город не указан"}</span></div><div className="mt-3"><Actions {...props} /></div></article>; }

type RowProps = { activeTab: ActiveTab; client: CrmWorkspaceClient; color: string | null; tabs: CrmTab[]; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void };

function Company({ client, onOpenAssignment }: { client: CrmWorkspaceClient; onOpenAssignment: (tab: ActiveTab) => void }) { return <div><div className="font-semibold">{client.documentName || client.fullName || client.name}</div><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-[10px] text-[var(--text-secondary)]">ИНН {client.inn || "не указан"}</span>{client.linkedCounterpartyId ? <button type="button" onClick={() => onOpenAssignment(client.assignment?.tabId ?? "primary")} className="rounded-full border border-[var(--border-color)] bg-white/75 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-dark)] hover:bg-white">{client.assignment?.tabName || "Без вкладки"}</button> : null}</div></div>; }
function Contact({ client }: { client: CrmWorkspaceClient }) { return <div className="space-y-0.5"><div>{client.phone || "Телефон не указан"}</div><div className="text-[11px] text-[var(--text-secondary)]">{client.email || "Почта не указана"}</div></div>; }
function Status({ status }: { status: CrmWorkspaceClient["syncStatus"] }) { const labels = { synced: "1С", local: "Локальный", sync_error: "Ошибка" }; const tone = status === "synced" ? "bg-[#DCFCE7] text-[#166534]" : status === "sync_error" ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#FEF3C7] text-[#92400E]"; return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>{labels[status]}</span>; }
function Actions({ activeTab, client, color, tabs, onColor, onMove }: RowProps) { const canColor = activeTab !== "primary"; return <div className="flex flex-wrap items-center gap-1.5"><select aria-label={`Переместить ${client.documentName || client.name} во вкладку`} value="" onChange={(event) => { const target = Number(event.target.value); if (target) onMove(client, target); }} className="h-8 max-w-[136px] rounded-[8px] border border-[var(--border-color)] bg-white/80 px-1.5 text-[10px] font-semibold"><option value="">Переместить…</option>{tabs.filter((tab) => tab.id !== client.assignment?.tabId).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select>{canColor ? <details className="relative"><summary className="flex h-8 cursor-pointer list-none items-center rounded-[8px] border border-[var(--border-color)] bg-white/80 px-2 text-[10px] font-semibold">Цвет строки</summary><div className="absolute right-0 z-10 mt-1 grid w-[184px] grid-cols-4 gap-1 rounded-[10px] border border-[var(--border-color)] bg-white p-2 shadow-[0_12px_28px_rgba(7,22,46,0.16)]"><button type="button" onClick={() => onColor(client, null)} className={`col-span-4 rounded-[6px] px-2 py-1 text-left text-[10px] ${color === null ? "bg-[#F1F5F9] font-bold" : "hover:bg-[#F8FAFC]"}`}>Сбросить цвет</button>{ROW_COLORS.map(([key, label, swatch]) => <button key={key} type="button" onClick={() => onColor(client, key)} aria-label={`Цвет строки: ${label}`} aria-pressed={color === key} title={label} style={{ backgroundColor: swatch }} className="h-7 rounded-[6px] border border-black/5 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]" />)}</div></details> : null}</div>; }
function LoadingRows() { return <div className="mt-4 space-y-2" aria-label="Загрузка клиентов">{[1, 2, 3, 4].map((row) => <div key={row} className="h-16 animate-pulse rounded-[12px] bg-[#F3F6FA]" />)}</div>; }
function Message({ children, tone }: { children: string; tone: "error" | "success" }) { return <div className={`mt-3 rounded-[10px] border px-3 py-2 text-[11px] ${tone === "error" ? "border-[#F9D4D4] bg-[#FEF2F2] text-[#B91C1C]" : "border-[#BBE6CA] bg-[#F0FDF4] text-[#166534]"}`}>{children}</div>; }
function ClientDialog({ form, isSaving, onChange, onClose, onSubmit }: { form: ReturnType<typeof emptyClientForm>; isSaving: boolean; onChange: (form: ReturnType<typeof emptyClientForm>) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const update = (key: keyof ReturnType<typeof emptyClientForm>, value: string) => onChange({ ...form, [key]: value }); return <div role="dialog" aria-modal="true" aria-labelledby="crm-new-client-title" className="fixed inset-0 z-50 flex items-end bg-[#07162e]/35 p-2 sm:items-center sm:justify-center sm:p-4"><form onSubmit={onSubmit} className="w-full max-w-[620px] rounded-[22px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)] sm:p-5"><div className="flex items-start justify-between gap-4"><div><h2 id="crm-new-client-title" className="text-[19px] font-bold tracking-[-0.03em]">Новый локальный клиент</h2><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Будет сохранён локально во вкладке «В работе» без отправки в 1С.</p></div><button type="button" onClick={onClose} className="h-8 rounded-[8px] px-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Наименование компании *" value={form.documentName} onChange={(value) => update("documentName", value)} autoFocus /><Field label="Город" value={form.city} onChange={(value) => update("city", value)} /><Field label="Контактное лицо" value={form.contactPerson} onChange={(value) => update("contactPerson", value)} /><Field label="Телефон" value={form.phone} onChange={(value) => update("phone", value)} type="tel" /><Field label="Почта" value={form.email} onChange={(value) => update("email", value)} type="email" /><label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Комментарий</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-10 rounded-[10px] border border-[var(--border-color)] px-3 py-2 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-[11px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Отмена</button><button type="submit" disabled={isSaving} className="app-action-button h-10 rounded-[11px] px-4 text-[12px]">{isSaving ? "Сохраняем…" : "Добавить клиента"}</button></div></form></div>; }
function Field({ label, value, onChange, type = "text", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean }) { return <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>{label}</span><input autoFocus={autoFocus} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label>; }
function errorMessage(cause: unknown, fallback: string) { return cause instanceof Error && cause.message.trim() ? cause.message : fallback; }
