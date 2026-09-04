"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";

import {
  archiveLocalCrmClient,
  confirmCrmExistingLink,
  downloadCrmExportFile,
  createCrmContact,
  createCrmClient,
  createCrmEvent,
  createCrmReminder,
  fetchCrmClients,
  fetchPrimaryCrmClients,
  fetchCrmAudit,
  fetchCrmSyncConflicts,
  fetchCrmLinkCandidates,
  fetchCrmContacts,
  fetchCrmEvents,
  fetchCrmReminders,
  fetchCrmTabs,
  fetchUsers,
  moveCrmClient,
  removeCrmAssignment,
  resolveCrmSyncConflict,
  retryCrmOnecCreate,
  restoreLocalCrmClient,
  saveCrmRowPreference,
  saveCrmPrimaryRowPreference,
  reorderCrmTabClients,
  reorderPrimaryCrmClients,
  sendCrmClientToOneC,
} from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { AppUser, CrmAuditAction, CrmContact, CrmEvent, CrmLinkCandidate, CrmReminder, CrmSyncConflict, CrmTab, CrmWorkspaceClient } from "@/lib/types";

type ActiveTab = "primary" | number;
type SyncFilter = "all" | "synced" | "local" | "pending" | "blocked_capability" | "blocked_credentials" | "conflict" | "sync_error";
type PrimaryOrderMode = "manual" | "name";

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

const colorByKey = new Map<string, string>(ROW_COLORS.map(([key, _label, color]) => [key, color]));

function emptyClientForm() {
  return { documentName: "", city: "", contactPerson: "", email: "", phone: "", notes: "" };
}

export function CrmWorkspace() {
  const { user, isAdmin } = useAuth();
  const [owners, setOwners] = useState<AppUser[]>([]);
  const [ownerId, setOwnerId] = useState(user.id);
  const [tabs, setTabs] = useState<CrmTab[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("primary");
  const [clients, setClients] = useState<CrmWorkspaceClient[]>([]);
  const [search, setSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [primaryOrderMode, setPrimaryOrderMode] = useState<PrimaryOrderMode>("manual");
  const [primaryOrderVersion, setPrimaryOrderVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CrmWorkspaceClient | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm);
  const requestId = useRef(0);
  const currentView = useRef({ activeTab, ownerId });
  currentView.current = { activeTab, ownerId };

  useEffect(() => {
    let active = true;
    if (!isAdmin) {
      setOwners([user]);
      setOwnerId(user.id);
      return () => { active = false; };
    }
    void fetchUsers()
      .then((items) => { if (active) setOwners(items); })
      .catch((cause) => { if (active) setError(errorMessage(cause, "Не удалось загрузить список сотрудников.")); });
    return () => { active = false; };
  }, [isAdmin, user]);

  const loadWorkspace = useCallback(async (tab: ActiveTab, { silent = false } = {}) => {
    const id = ++requestId.current;
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const nextTabsPromise = fetchCrmTabs(ownerId);
      const [nextTabs, primaryResult, personalClients] = await Promise.all([
        nextTabsPromise,
        tab === "primary" ? fetchPrimaryCrmClients(ownerId) : Promise.resolve(null),
        tab === "primary" ? Promise.resolve(null) : fetchCrmClients({ ownerId, tabId: tab }),
      ]);
      if (id !== requestId.current) return;
      setTabs(nextTabs);
      setClients(primaryResult?.items ?? personalClients ?? []);
      if (primaryResult) setPrimaryOrderVersion(primaryResult.orderVersion);
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause, "Не удалось загрузить CRM."));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [ownerId]);

  useEffect(() => {
    void loadWorkspace(activeTab);
  }, [activeTab, loadWorkspace, ownerId]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadWorkspace(activeTab, { silent: true }), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadWorkspace]);

  const visibleClients = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    const filtered = clients.filter((client) => {
      const matchesStatus = syncFilter === "all" || client.syncStatus === syncFilter;
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [client.name, client.documentName, client.fullName, client.inn, client.email, client.phone]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(needle);
    });
    if (activeTab === "primary" && primaryOrderMode === "name") {
      return [...filtered].sort((left, right) => (left.documentName || left.name).localeCompare(right.documentName || right.name, "ru"));
    }
    return filtered;
  }, [activeTab, clients, primaryOrderMode, search, syncFilter]);

  const personalOrderVersion = clients.reduce((version, client) => Math.max(version, client.rowPreference?.orderVersion ?? 0), 0);
  const isPrimaryManualOrderAvailable = activeTab === "primary" && primaryOrderMode === "manual" && !search.trim() && syncFilter === "all";
  const isPersonalManualOrderAvailable = activeTab !== "primary" && !search.trim() && syncFilter === "all";
  const isManualOrderAvailable = isPrimaryManualOrderAvailable || isPersonalManualOrderAvailable;

  const chooseTab = (tab: ActiveTab) => {
    currentView.current = { activeTab: tab, ownerId };
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
      }, ownerId);
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
      await moveCrmClient(client.id, targetTabId, ownerId);
      setNotice(`Клиент перемещён во вкладку «${target.name}».`);
      await loadWorkspace(activeTab, { silent: true });
    } catch (cause) {
      setClients((current) => current.map((item) => (item.id === client.id ? { ...item, assignment: previousAssignment } : item)));
      setError(errorMessage(cause, "Не удалось переместить клиента. Изменение отменено."));
    }
  };

  const isCurrentPrimaryView = (requestOwnerId: number) => currentView.current.activeTab === "primary" && currentView.current.ownerId === requestOwnerId;
  const reloadPrimaryAfterFailure = async (requestOwnerId: number) => {
    try {
      const primary = await fetchPrimaryCrmClients(requestOwnerId);
      if (currentView.current.activeTab !== "primary" || currentView.current.ownerId !== requestOwnerId) return "stale";
      setClients(primary.items);
      setPrimaryOrderVersion(primary.orderVersion);
      return "reloaded";
    } catch {
      return isCurrentPrimaryView(requestOwnerId) ? "reload_failed" : "stale";
    }
  };

  const setRowColor = async (client: CrmWorkspaceClient, colorKey: string | null) => {
    if (activeTab === "primary") {
      const requestOwnerId = ownerId;
      const previous = client.primaryRowPreference ?? null;
      setClients((current) => current.map((item) => item.id === client.id ? {
        ...item,
        primaryRowPreference: {
          clientId: client.id,
          colorKey,
          position: previous?.position ?? 0,
          orderVersion: previous?.orderVersion ?? primaryOrderVersion,
        },
      } : item));
      try {
        const preference = await saveCrmPrimaryRowPreference(client.id, { colorKey, expectedOrderVersion: primaryOrderVersion }, requestOwnerId);
        if (!isCurrentPrimaryView(requestOwnerId)) return;
        setClients((current) => current.map((item) => item.id === client.id ? { ...item, primaryRowPreference: preference } : item));
        setPrimaryOrderVersion(preference.orderVersion);
        setNotice("Оформление строки сохранено.");
      } catch (cause) {
        const reload = await reloadPrimaryAfterFailure(requestOwnerId);
        if (reload === "reloaded") setError(`${errorMessage(cause, "Не удалось сохранить цвет строки.")} Изменение не сохранено; список обновлён.`);
        if (reload === "reload_failed") setError(`${errorMessage(cause, "Не удалось сохранить цвет строки.")} Изменение не сохранено; не удалось обновить список.`);
      }
      return;
    }
    const previous = client.rowPreference ?? null;
    setClients((current) => current.map((item) => item.id === client.id ? {
      ...item,
      rowPreference: { tabId: activeTab, clientId: client.id, colorKey, position: previous?.position ?? 0, orderVersion: previous?.orderVersion ?? 0 },
    } : item));
    try {
      await saveCrmRowPreference(client.id, { tabId: activeTab, colorKey, position: previous?.position ?? 0 }, ownerId);
      setNotice("Оформление строки сохранено.");
    } catch (cause) {
      setClients((current) => current.map((item) => item.id === client.id ? { ...item, rowPreference: previous } : item));
      setError(errorMessage(cause, "Не удалось сохранить цвет. Изменение отменено."));
    }
  };

  const reorderPrimaryClients = async (clientId: number, insertionIndex: number) => {
    const requestOwnerId = ownerId;
    const reordered = moveClientInList(clients, clientId, insertionIndex);
    const nextIndex = reordered.findIndex((client) => client.id === clientId);
    if (nextIndex < 0 || reordered.every((client, index) => client.id === clients[index]?.id)) return;

    setClients(reordered);
    setError(null);
    try {
      const result = await reorderPrimaryCrmClients({
        clientId,
        beforeClientId: reordered[nextIndex + 1]?.id ?? null,
        afterClientId: reordered[nextIndex - 1]?.id ?? null,
        expectedOrderVersion: primaryOrderVersion,
      }, requestOwnerId);
      if (!isCurrentPrimaryView(requestOwnerId)) return;
      setPrimaryOrderVersion(result.orderVersion);
      setNotice("Порядок клиентов сохранён.");
    } catch (cause) {
      const reload = await reloadPrimaryAfterFailure(requestOwnerId);
      if (reload === "reloaded") setError(`${errorMessage(cause, "Не удалось сохранить порядок клиентов.")} Изменение порядка не сохранено; список обновлён.`);
      if (reload === "reload_failed") setError(`${errorMessage(cause, "Не удалось сохранить порядок клиентов.")} Изменение порядка не сохранено; не удалось обновить список.`);
    }
  };

  const reloadPersonalAfterFailure = async (requestTab: number, requestOwnerId: number) => {
    try {
      const refreshed = await fetchCrmClients({ ownerId: requestOwnerId, tabId: requestTab });
      if (currentView.current.activeTab !== requestTab || currentView.current.ownerId !== requestOwnerId) return "stale";
      setClients(refreshed);
      return "reloaded";
    } catch {
      return currentView.current.activeTab === requestTab && currentView.current.ownerId === requestOwnerId ? "reload_failed" : "stale";
    }
  };

  const reorderPersonalClients = async (clientId: number, insertionIndex: number) => {
    if (activeTab === "primary") return;
    const requestTab = activeTab;
    const requestOwnerId = ownerId;
    const reordered = moveClientInList(clients, clientId, insertionIndex);
    const nextIndex = reordered.findIndex((client) => client.id === clientId);
    if (nextIndex < 0 || reordered.every((client, index) => client.id === clients[index]?.id)) return;

    setClients(reordered);
    setError(null);
    try {
      const result = await reorderCrmTabClients(requestTab, {
        clientId,
        beforeClientId: reordered[nextIndex + 1]?.id ?? null,
        afterClientId: reordered[nextIndex - 1]?.id ?? null,
        expectedOrderVersion: personalOrderVersion,
      }, requestOwnerId);
      if (currentView.current.activeTab !== requestTab || currentView.current.ownerId !== requestOwnerId) return;
      const byId = new Map(reordered.map((item) => [item.id, item]));
      setClients(result.clientIds.flatMap((orderedClientId, index) => {
        const item = byId.get(orderedClientId);
        return item ? [{
          ...item,
          rowPreference: {
            tabId: requestTab,
            clientId: item.id,
            colorKey: item.rowPreference?.colorKey ?? null,
            position: (index + 1) * 1000,
            orderVersion: result.orderVersion,
          },
        }] : [];
      }));
      setNotice("Порядок клиентов сохранён.");
    } catch (cause) {
      const reload = await reloadPersonalAfterFailure(requestTab, requestOwnerId);
      if (reload === "reloaded") setError(`${errorMessage(cause, "Не удалось сохранить порядок клиентов.")} Изменение порядка не сохранено; список обновлён.`);
      if (reload === "reload_failed") setError(`${errorMessage(cause, "Не удалось сохранить порядок клиентов.")} Изменение порядка не сохранено; не удалось обновить список.`);
    }
  };

  const returnToPrimaryManualOrder = () => {
    setPrimaryOrderMode("manual");
    setSearch("");
    setSyncFilter("all");
  };

  const exportCrm = async (scope: "all" | "tab") => {
    if (scope === "tab" && activeTab === "primary") {
      setError("Для вкладки «Клиенты 1С» доступна только выгрузка всех клиентов.");
      return;
    }
    setIsExporting(true);
    setError(null);
    try {
      await downloadCrmExportFile({ scope, tabId: activeTab === "primary" ? undefined : activeTab, ownerId });
      setNotice(scope === "tab" ? "Выгрузка текущей вкладки началась." : "Выгрузка всех клиентов началась.");
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось выгрузить CRM в Excel."));
    } finally {
      setIsExporting(false);
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
          {isAdmin ? <label className="flex h-10 items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[11px] font-semibold text-[var(--text-secondary)]"><span>CRM сотрудника</span><select value={ownerId} onChange={(event) => { const nextOwnerId = Number(event.target.value); currentView.current = { activeTab: "primary", ownerId: nextOwnerId }; requestId.current += 1; setSelectedClient(null); setActiveTab("primary"); setOwnerId(nextOwnerId); }} className="min-w-28 bg-transparent text-[12px] font-semibold text-[var(--text-primary)] outline-none">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName || owner.username}</option>)}</select></label> : null}
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]">{isExporting ? "Выгружаем…" : "Выгрузить Excel"}</summary>
            <div className="absolute right-0 z-20 mt-1 grid w-52 gap-1 rounded-[12px] border border-[var(--border-color)] bg-white p-2 shadow-[0_12px_28px_rgba(7,22,46,0.16)]">
              <button type="button" disabled={isExporting} onClick={() => void exportCrm("all")} className="rounded-[8px] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[#F6F8FB] disabled:opacity-60">Все клиенты</button>
              <button type="button" disabled={isExporting || activeTab === "primary"} onClick={() => void exportCrm("tab")} className="rounded-[8px] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[#F6F8FB] disabled:opacity-60">Текущая вкладка</button>
            </div>
          </details>
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
                  <option value="all">Все</option><option value="synced">Связанные с 1С</option><option value="local">Локальные</option><option value="pending">Ожидают отправки</option><option value="blocked_capability">Заблокировано</option><option value="blocked_credentials">Нужны учётные данные 1С</option><option value="conflict">Конфликт</option><option value="sync_error">С ошибкой</option>
                </select>
              </label>
              {activeTab === "primary" ? <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Порядок</span><select value={primaryOrderMode} onChange={(event) => setPrimaryOrderMode(event.target.value as PrimaryOrderMode)} className="h-10 rounded-[12px] border border-[var(--border-color)] bg-white px-2 text-[12px] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]"><option value="manual">Мой порядок</option><option value="name">По названию</option></select></label> : null}
            </div>
            {!isManualOrderAvailable ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] bg-[#F6F8FB] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><span>Перемещение доступно только без поиска и фильтров{activeTab === "primary" ? " в режиме «Мой порядок»" : ""}.</span>{activeTab === "primary" ? <button type="button" onClick={returnToPrimaryManualOrder} className="font-semibold text-[var(--brand-dark)] underline underline-offset-2">Вернуться к «Мой порядок»</button> : null}</div> : null}
            {error ? <Message tone="error">{error}</Message> : null}
            {notice ? <Message tone="success">{notice}</Message> : null}
            {isLoading ? <LoadingRows /> : <ClientList activeTab={activeTab} clients={visibleClients} tabs={tabs} manualOrderEnabled={isManualOrderAvailable} onColor={setRowColor} onReorder={activeTab === "primary" ? reorderPrimaryClients : reorderPersonalClients} onMove={moveClient} onOpenAssignment={chooseTab} onOpenClient={setSelectedClient} />}
          </div>
        </div>
      </div>

      {isAdding ? <ClientDialog form={form} isSaving={isSaving} onChange={setForm} onClose={() => setIsAdding(false)} onSubmit={submitClient} /> : null}
      {selectedClient ? <ClientDetailDialog client={selectedClient} ownerId={ownerId} ownerName={owners.find((owner) => owner.id === ownerId)?.fullName || owners.find((owner) => owner.id === ownerId)?.username || `сотрудника #${ownerId}`} isAdmin={isAdmin} canResolveSyncConflicts={isAdmin || ownerId === user.id} onChanged={() => void loadWorkspace(activeTab, { silent: true })} onClose={() => setSelectedClient(null)} /> : null}
    </section>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`h-10 shrink-0 rounded-[11px] px-3 text-left text-[12px] font-semibold transition xl:w-full ${active ? "bg-[var(--brand-dark)] text-white shadow-[0_6px_14px_rgba(7,22,46,0.16)]" : "text-[var(--text-primary)] hover:bg-[#F6F8FB]"}`}>{label}</button>;
}

function ClientList({ activeTab, clients, tabs, manualOrderEnabled, onColor, onReorder, onMove, onOpenAssignment, onOpenClient }: { activeTab: ActiveTab; clients: CrmWorkspaceClient[]; tabs: CrmTab[]; manualOrderEnabled: boolean; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onReorder: (clientId: number, insertionIndex: number) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void; onOpenClient: (client: CrmWorkspaceClient) => void }) {
  const [drag, setDrag] = useState<{ clientId: number; insertionIndex: number } | null>(null);
  const startDrag = (clientId: number) => setDrag({ clientId, insertionIndex: clients.findIndex((client) => client.id === clientId) });
  const cancelDrag = () => setDrag(null);
  const finishDrag = () => {
    if (!drag) return;
    const completed = drag;
    setDrag(null);
    if (completed.insertionIndex !== clients.findIndex((client) => client.id === completed.clientId)) onReorder(completed.clientId, completed.insertionIndex);
  };
  const updatePointerTarget = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-crm-row-id]");
    const clientId = Number(row?.dataset.crmRowId);
    const targetIndex = clients.findIndex((client) => client.id === clientId);
    if (targetIndex < 0 || !row) return;
    const insertionIndex = targetIndex + (event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? 1 : 0);
    setDrag((current) => current && current.insertionIndex !== insertionIndex ? { ...current, insertionIndex } : current);
  };
  const moveByKeyboard = (clientId: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && drag?.clientId === clientId) { event.preventDefault(); cancelDrag(); return; }
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (drag?.clientId === clientId) finishDrag(); else startDrag(clientId); return; }
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || drag?.clientId !== clientId) return;
    event.preventDefault();
    const currentOrder = moveClientInList(clients, clientId, drag.insertionIndex);
    const currentIndex = currentOrder.findIndex((client) => client.id === clientId);
    const nextIndex = Math.max(0, Math.min(currentOrder.length - 1, currentIndex + (event.key === "ArrowUp" ? -1 : 1)));
    setDrag((current) => current ? { ...current, insertionIndex: insertionIndexForPosition(clients, clientId, nextIndex) } : current);
  };
  const dragControlsFor = (client: CrmWorkspaceClient): DragControls | undefined => manualOrderEnabled ? {
    isGrabbed: drag?.clientId === client.id,
    onPointerDown: (event) => { if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); startDrag(client.id); },
    onPointerMove: updatePointerTarget,
    onPointerUp: finishDrag,
    onPointerCancel: cancelDrag,
    onKeyDown: (event) => moveByKeyboard(client.id, event),
  } : undefined;

  if (!clients.length) return <div className="py-12 text-center"><p className="text-[14px] font-semibold">Клиентов пока нет</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">Добавьте локального клиента или выберите компанию из «Клиенты 1С».</p></div>;
  return <>
    {manualOrderEnabled ? <p id="crm-manual-order-help" className="sr-only" aria-live="polite">{drag ? "Перемещение активно. Стрелки меняют позицию, Enter сохраняет, Escape отменяет." : "Для перемещения используйте кнопку у строки."}</p> : null}
    <div className="mt-4 hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">{manualOrderEnabled ? <th className="w-12 border-b border-[var(--border-color)] px-2 py-2 font-semibold"><span className="sr-only">Порядок</span></th> : null}<th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Компания</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Контакты</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Город</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Синхронизация</th><th className="border-b border-[var(--border-color)] px-3 py-2 font-semibold">Действия</th></tr></thead><tbody>{clients.map((client, index) => <Fragment key={client.id}>{drag?.insertionIndex === index ? <InsertionRow columns={manualOrderEnabled ? 6 : 5} /> : null}<ClientTableRow activeTab={activeTab} client={client} color={activeTab === "primary" ? client.primaryRowPreference?.colorKey ?? null : client.rowPreference?.colorKey ?? null} tabs={tabs} dragControls={dragControlsFor(client)} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} onOpenClient={onOpenClient} /></Fragment>)}{drag?.insertionIndex === clients.length ? <InsertionRow columns={manualOrderEnabled ? 6 : 5} /> : null}</tbody></table></div>
    <div className="mt-4 grid gap-2 lg:hidden">{clients.map((client, index) => <Fragment key={client.id}>{drag?.insertionIndex === index ? <InsertionMarker /> : null}<ClientCard activeTab={activeTab} client={client} color={activeTab === "primary" ? client.primaryRowPreference?.colorKey ?? null : client.rowPreference?.colorKey ?? null} tabs={tabs} dragControls={dragControlsFor(client)} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} onOpenClient={onOpenClient} /></Fragment>)}{drag?.insertionIndex === clients.length ? <InsertionMarker /> : null}</div>
  </>;
}

function InsertionRow({ columns }: { columns: number }) { return <tr aria-hidden="true"><td colSpan={columns} className="p-0"><div className="h-1 rounded-full bg-[var(--brand-yellow)]" /></td></tr>; }
function InsertionMarker() { return <div aria-hidden="true" className="h-1 rounded-full bg-[var(--brand-yellow)]" />; }

function ClientTableRow(props: RowProps) { const { client, color } = props; return <tr data-crm-row-id={client.id} style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="text-[12px] text-[var(--text-primary)]">{props.dragControls ? <td className="border-b border-[var(--border-color)] px-2 py-3"><DragHandle client={client} controls={props.dragControls} /></td> : null}<td className="border-b border-[var(--border-color)] px-3 py-3"><Company client={client} onOpenAssignment={props.onOpenAssignment} /></td><td className="border-b border-[var(--border-color)] px-3 py-3"><Contact client={client} /></td><td className="border-b border-[var(--border-color)] px-3 py-3 text-[var(--text-secondary)]">{client.city || "—"}</td><td className="border-b border-[var(--border-color)] px-3 py-3"><Status status={client.syncStatus} /></td><td className="border-b border-[var(--border-color)] px-3 py-3"><Actions {...props} /></td></tr>; }

function ClientCard(props: RowProps) { const { client, color } = props; return <article data-crm-row-id={client.id} style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="rounded-[14px] border border-[var(--border-color)] px-3 py-3"><div className="flex items-start justify-between gap-3">{props.dragControls ? <DragHandle client={client} controls={props.dragControls} /> : null}<Company client={client} onOpenAssignment={props.onOpenAssignment} /><Status status={client.syncStatus} /></div><div className="mt-3 grid gap-2 text-[11px] text-[var(--text-secondary)]"><Contact client={client} /><span>{client.city || "Город не указан"}</span></div><div className="mt-3"><Actions {...props} /></div></article>; }

type DragControls = { isGrabbed: boolean; onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void; onPointerUp: () => void; onPointerCancel: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void };
type RowProps = { activeTab: ActiveTab; client: CrmWorkspaceClient; color: string | null; tabs: CrmTab[]; dragControls?: DragControls; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void; onOpenClient: (client: CrmWorkspaceClient) => void };

function DragHandle({ client, controls }: { client: CrmWorkspaceClient; controls: DragControls }) { return <button type="button" aria-label={`Переместить ${client.documentName || client.name}`} aria-pressed={controls.isGrabbed} aria-describedby="crm-manual-order-help" onPointerDown={controls.onPointerDown} onPointerMove={controls.onPointerMove} onPointerUp={controls.onPointerUp} onPointerCancel={controls.onPointerCancel} onKeyDown={controls.onKeyDown} className="flex size-8 touch-none items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]" title="Переместить">⠿</button>; }

function moveClientInList(clients: CrmWorkspaceClient[], clientId: number, insertionIndex: number) { const sourceIndex = clients.findIndex((client) => client.id === clientId); if (sourceIndex < 0) return clients; const withoutSource = clients.filter((client) => client.id !== clientId); const targetIndex = Math.max(0, Math.min(withoutSource.length, insertionIndex - (sourceIndex < insertionIndex ? 1 : 0))); return [...withoutSource.slice(0, targetIndex), clients[sourceIndex], ...withoutSource.slice(targetIndex)]; }
function insertionIndexForPosition(clients: CrmWorkspaceClient[], clientId: number, desiredIndex: number) { for (let insertionIndex = 0; insertionIndex <= clients.length; insertionIndex += 1) if (moveClientInList(clients, clientId, insertionIndex).findIndex((client) => client.id === clientId) === desiredIndex) return insertionIndex; return 0; }

function Company({ client, onOpenAssignment }: { client: CrmWorkspaceClient; onOpenAssignment: (tab: ActiveTab) => void }) { return <div><div className="font-semibold">{client.documentName || client.fullName || client.name}</div><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-[10px] text-[var(--text-secondary)]">ИНН {client.inn || "не указан"}</span>{client.linkedCounterpartyId ? <button type="button" onClick={() => onOpenAssignment(client.assignment?.tabId ?? "primary")} className="rounded-full border border-[var(--border-color)] bg-white/75 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-dark)] hover:bg-white">{client.assignment?.tabName || "Без вкладки"}</button> : null}</div></div>; }
function Contact({ client }: { client: CrmWorkspaceClient }) { return <div className="space-y-0.5"><div>{client.phone || "Телефон не указан"}</div><div className="text-[11px] text-[var(--text-secondary)]">{client.email || "Почта не указана"}</div></div>; }
function Status({ status }: { status: CrmWorkspaceClient["syncStatus"] }) { const labels = { synced: "1С", local: "Локальный", pending: "Ожидает отправки", blocked_capability: "Отправка заблокирована", blocked_credentials: "Нужны учётные данные 1С", conflict: "Конфликт", sync_error: "Ошибка", archived: "В архиве" }; const tone = status === "synced" ? "bg-[#DCFCE7] text-[#166534]" : status === "pending" ? "bg-[#FEF3C7] text-[#92400E]" : status === "conflict" || status === "sync_error" || status === "blocked_capability" || status === "blocked_credentials" ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#F1F5F9] text-[#475569]"; return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>{labels[status]}</span>; }
function Actions({ client, color, tabs, onColor, onMove, onOpenClient }: RowProps) { return <div className="flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => onOpenClient(client)} className="h-8 rounded-[8px] border border-[var(--border-color)] bg-white/80 px-2 text-[10px] font-semibold hover:bg-[#F6F8FB]">Открыть</button><select aria-label={`Переместить ${client.documentName || client.name} во вкладку`} value="" onChange={(event) => { const target = Number(event.target.value); if (target) onMove(client, target); }} className="h-8 max-w-[136px] rounded-[8px] border border-[var(--border-color)] bg-white/80 px-1.5 text-[10px] font-semibold"><option value="">Переместить…</option>{tabs.filter((tab) => tab.id !== client.assignment?.tabId).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select><details className="relative"><summary className="flex h-8 cursor-pointer list-none items-center rounded-[8px] border border-[var(--border-color)] bg-white/80 px-2 text-[10px] font-semibold">Цвет строки</summary><div className="absolute right-0 z-10 mt-1 grid w-[184px] grid-cols-4 gap-1 rounded-[10px] border border-[var(--border-color)] bg-white p-2 shadow-[0_12px_28px_rgba(7,22,46,0.16)]"><button type="button" onClick={() => onColor(client, null)} className={`col-span-4 rounded-[6px] px-2 py-1 text-left text-[10px] ${color === null ? "bg-[#F1F5F9] font-bold" : "hover:bg-[#F8FAFC]"}`}>Сбросить цвет</button>{ROW_COLORS.map(([key, label, swatch]) => <button key={key} type="button" onClick={() => onColor(client, key)} aria-label={`Цвет строки: ${label}`} aria-pressed={color === key} title={label} style={{ backgroundColor: swatch }} className="h-7 rounded-[6px] border border-black/5 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]" />)}</div></details></div>; }
function LoadingRows() { return <div className="mt-4 space-y-2" aria-label="Загрузка клиентов">{[1, 2, 3, 4].map((row) => <div key={row} className="h-16 animate-pulse rounded-[12px] bg-[#F3F6FA]" />)}</div>; }
function Message({ children, tone }: { children: string; tone: "error" | "success" }) { return <div className={`mt-3 rounded-[10px] border px-3 py-2 text-[11px] ${tone === "error" ? "border-[#F9D4D4] bg-[#FEF2F2] text-[#B91C1C]" : "border-[#BBE6CA] bg-[#F0FDF4] text-[#166534]"}`}>{children}</div>; }
function ClientDialog({ form, isSaving, onChange, onClose, onSubmit }: { form: ReturnType<typeof emptyClientForm>; isSaving: boolean; onChange: (form: ReturnType<typeof emptyClientForm>) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const update = (key: keyof ReturnType<typeof emptyClientForm>, value: string) => onChange({ ...form, [key]: value }); return <div role="dialog" aria-modal="true" aria-labelledby="crm-new-client-title" className="fixed inset-0 z-50 flex items-end bg-[#07162e]/35 p-2 sm:items-center sm:justify-center sm:p-4"><form onSubmit={onSubmit} className="w-full max-w-[620px] rounded-[22px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)] sm:p-5"><div className="flex items-start justify-between gap-4"><div><h2 id="crm-new-client-title" className="text-[19px] font-bold tracking-[-0.03em]">Новый локальный клиент</h2><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Будет сохранён локально во вкладке «В работе» без отправки в 1С.</p></div><button type="button" onClick={onClose} className="h-8 rounded-[8px] px-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Наименование компании *" value={form.documentName} onChange={(value) => update("documentName", value)} autoFocus /><Field label="Город" value={form.city} onChange={(value) => update("city", value)} /><Field label="Контактное лицо" value={form.contactPerson} onChange={(value) => update("contactPerson", value)} /><Field label="Телефон" value={form.phone} onChange={(value) => update("phone", value)} type="tel" /><Field label="Почта" value={form.email} onChange={(value) => update("email", value)} type="email" /><label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Комментарий</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-10 rounded-[10px] border border-[var(--border-color)] px-3 py-2 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-[11px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Отмена</button><button type="submit" disabled={isSaving} className="app-action-button h-10 rounded-[11px] px-4 text-[12px]">{isSaving ? "Сохраняем…" : "Добавить клиента"}</button></div></form></div>; }

function ClientDetailDialog({ client, ownerId, ownerName, isAdmin, canResolveSyncConflicts, onChanged, onClose }: { client: CrmWorkspaceClient; ownerId: number; ownerName: string; isAdmin: boolean; canResolveSyncConflicts: boolean; onChanged: () => void; onClose: () => void }) {
  const [currentClient, setCurrentClient] = useState(client);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [reminders, setReminders] = useState<CrmReminder[]>([]);
  const [audit, setAudit] = useState<CrmAuditAction[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<CrmSyncConflict[]>([]);
  const [linkCandidates, setLinkCandidates] = useState<CrmLinkCandidate[]>([]);
  const [linkCandidate, setLinkCandidate] = useState<CrmLinkCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<"contact" | "event" | "reminder" | "archive" | "restore" | "remove" | "link" | "retry" | "queue" | "resolve" | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", isPrimary: false });
  const [eventForm, setEventForm] = useState({ kind: "comment", body: "" });
  const [reminderDueAt, setReminderDueAt] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [isArchiveConfirmationOpen, setIsArchiveConfirmationOpen] = useState(false);
  const [isRemoveAssignmentConfirmationOpen, setIsRemoveAssignmentConfirmationOpen] = useState(false);
  const [isRetryConfirmationOpen, setIsRetryConfirmationOpen] = useState(false);
  const [isCreateConfirmationOpen, setIsCreateConfirmationOpen] = useState(false);
  const [syncConflictResolution, setSyncConflictResolution] = useState<{ conflict: CrmSyncConflict; choice: "local" | "remote" } | null>(null);
  const isResolvingSyncConflict = useRef(false);

  useEffect(() => { setCurrentClient(client); setIsArchiveConfirmationOpen(false); setIsRemoveAssignmentConfirmationOpen(false); setIsRetryConfirmationOpen(false); setIsCreateConfirmationOpen(false); setLinkCandidate(null); setSyncConflictResolution(null); setNotice(null); }, [client]);

  const refreshAudit = useCallback(async () => {
    setAudit(await fetchCrmAudit(currentClient.id, ownerId));
  }, [currentClient.id, ownerId]);

  const refreshSyncConflicts = useCallback(async () => {
    setSyncConflicts(await fetchCrmSyncConflicts(currentClient.id, ownerId));
  }, [currentClient.id, ownerId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    void Promise.all([fetchCrmContacts(currentClient.id, ownerId), fetchCrmEvents(currentClient.id, ownerId), fetchCrmReminders(ownerId), fetchCrmAudit(currentClient.id, ownerId), fetchCrmLinkCandidates(currentClient.id, ownerId), fetchCrmSyncConflicts(currentClient.id, ownerId)])
      .then(([nextContacts, nextEvents, nextReminders, nextAudit, nextCandidates, nextConflicts]) => {
        if (!active) return;
        setContacts(nextContacts);
        setEvents(nextEvents);
        setReminders(nextReminders.filter((reminder) => reminder.clientId === client.id));
        setAudit(nextAudit);
        setLinkCandidates(nextCandidates);
        setSyncConflicts(nextConflicts);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, "Не удалось загрузить карточку клиента."));
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [currentClient.id, ownerId]);

  const saveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactForm.name.trim()) { setError("Укажите имя контакта."); return; }
    const temporary: CrmContact = { id: -Date.now(), name: contactForm.name.trim(), phone: contactForm.phone.trim(), email: contactForm.email.trim(), isPrimary: contactForm.isPrimary, createdAt: "", updatedAt: "" };
    setContacts((current) => [...current, temporary]);
    setIsSaving("contact"); setError(null);
    try {
      const saved = await createCrmContact(client.id, temporary, ownerId);
      setContacts((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setContactForm({ name: "", phone: "", email: "", isPrimary: false });
    } catch (cause) {
      setContacts((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить контакт. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventForm.body.trim()) { setError("Введите описание события."); return; }
    const temporary: CrmEvent = { id: -Date.now(), kind: eventForm.kind, body: eventForm.body.trim(), authorUserId: null, createdAt: new Date().toISOString(), updatedAt: "" };
    setEvents((current) => [...current, temporary]);
    setIsSaving("event"); setError(null);
    try {
      const saved = await createCrmEvent(client.id, { kind: temporary.kind, body: temporary.body }, ownerId);
      setEvents((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setEventForm({ kind: "comment", body: "" });
    } catch (cause) {
      setEvents((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить событие. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const saveReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reminderDueAt) { setError("Укажите дату и время напоминания."); return; }
    const temporary: CrmReminder = { id: -Date.now(), clientId: client.id, dueAt: reminderDueAt, status: "active", createdAt: new Date().toISOString() };
    setReminders((current) => [...current, temporary]);
    setIsSaving("reminder"); setError(null);
    try {
      const saved = await createCrmReminder(client.id, { dueAt: reminderDueAt }, ownerId);
      setReminders((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setReminderDueAt("");
    } catch (cause) {
      setReminders((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить напоминание. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const archiveLocalClient = async () => {
    setIsSaving("archive"); setError(null);
    try {
      const result = await archiveLocalCrmClient(currentClient.id, { reason: archiveReason.trim(), expectedVersion: currentClient.version }, ownerId);
      setCurrentClient((item) => ({ ...item, syncStatus: "archived", syncError: archiveReason.trim(), version: result.version }));
      setIsArchiveConfirmationOpen(false);
      await refreshAudit();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось архивировать локального клиента. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const restoreLocalClient = async () => {
    setIsSaving("restore"); setError(null);
    try {
      const result = await restoreLocalCrmClient(currentClient.id, { expectedVersion: currentClient.version }, ownerId);
      setCurrentClient((item) => ({ ...item, syncStatus: "local", syncError: "", version: result.version }));
      await refreshAudit();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось восстановить локального клиента. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const removeAssignment = async () => {
    setIsSaving("remove"); setError(null);
    try {
      await removeCrmAssignment(client.id, ownerId);
      setCurrentClient((item) => ({ ...item, assignment: null, rowPreference: null }));
      setIsRemoveAssignmentConfirmationOpen(false);
      await refreshAudit();
      onChanged();
      setNotice("Клиент оставлен только в основной вкладке «Клиенты 1С».");
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось оставить клиента только в основной вкладке. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const confirmExistingLink = async () => {
    if (!linkCandidate) return;
    setIsSaving("link"); setError(null);
    try {
      const linked = await confirmCrmExistingLink(currentClient.id, linkCandidate.id, currentClient.version, ownerId);
      setCurrentClient(linked);
      setLinkCandidates([]);
      setLinkCandidate(null);
      await refreshAudit();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось подтвердить связь с 1С. Изменение отменено."));
    } finally { setIsSaving(null); }
  };

  const retryBlockedOnecCreate = async () => {
    setIsSaving("retry"); setError(null);
    try {
      const retried = await retryCrmOnecCreate(currentClient.id, ownerId);
      setCurrentClient(retried);
      setIsRetryConfirmationOpen(false);
      setNotice("Заявка на создание в 1С снова поставлена в очередь.");
      onChanged();
    } catch (cause) {
      setIsRetryConfirmationOpen(false);
      setError(errorMessage(cause, "Не удалось повторно поставить создание в 1С в очередь."));
    } finally { setIsSaving(null); }
  };

  const queueOnecCreate = async () => {
    setIsSaving("queue"); setError(null);
    try {
      const queued = await sendCrmClientToOneC(currentClient.id, ownerId);
      setCurrentClient(queued);
      setIsCreateConfirmationOpen(false);
      setNotice("Заявка на создание в 1С поставлена в очередь.");
      onChanged();
    } catch (cause) {
      setIsCreateConfirmationOpen(false);
      setError(errorMessage(cause, "Не удалось поставить создание в 1С в очередь."));
    } finally { setIsSaving(null); }
  };

  const resolveSyncConflict = async () => {
    if (!syncConflictResolution || isResolvingSyncConflict.current) return;
    const { conflict, choice } = syncConflictResolution;
    isResolvingSyncConflict.current = true;
    setIsSaving("resolve"); setError(null);
    try {
      const resolved = await resolveCrmSyncConflict(currentClient.id, conflict.id, { choice, expectedUpdatedAt: conflict.updatedAt }, ownerId);
      setCurrentClient(resolved);
      setSyncConflictResolution(null);
      setSyncConflicts((current) => current.filter((item) => item.id !== conflict.id));
      onChanged();
      try {
        await refreshSyncConflicts();
        await refreshAudit();
        setNotice(choice === "local" ? "Локальное значение сохранено для конфликта синхронизации." : "Значение из 1С принято для конфликта синхронизации.");
      } catch (cause) {
        setError(errorMessage(cause, "Конфликт разрешён, но не удалось обновить данные карточки. Обновите страницу."));
      }
    } catch (cause) {
      setSyncConflictResolution(null);
      setError(errorMessage(cause, "Не удалось разрешить конфликт синхронизации."));
    } finally { isResolvingSyncConflict.current = false; setIsSaving(null); }
  };

  const canManageLocalClient = isAdmin && currentClient.linkedCounterpartyId === null;
  const canRemoveAssignment = isAdmin && currentClient.linkedCounterpartyId !== null && currentClient.assignment !== null && currentClient.assignment.archivedAt === null;
  const canConfirmExistingLink = currentClient.linkedCounterpartyId === null && currentClient.syncStatus !== "archived";
  const canQueueOnecCreate = currentClient.linkedCounterpartyId === null && currentClient.syncStatus === "local";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="crm-client-detail-title" className="fixed inset-0 z-50 overflow-y-auto bg-[#07162e]/35 p-2 sm:p-5">
      <div className="mx-auto my-3 w-full max-w-5xl rounded-[22px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Карточка клиента</p>
            <h2 id="crm-client-detail-title" className="mt-1 text-[20px] font-bold tracking-[-0.03em]">{currentClient.documentName || currentClient.fullName || currentClient.name}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{[currentClient.city, currentClient.inn ? "ИНН " + currentClient.inn : "", currentClient.website].filter(Boolean).join(" · ") || "Реквизиты не указаны"}</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button>
        </div>
        {error ? <Message tone="error">{error}</Message> : null}
        {notice ? <Message tone="success">{notice}</Message> : null}
        {isLoading ? <div className="mt-5"><LoadingRows /></div> : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <DetailSection title="Контакты">
              <form onSubmit={saveContact} className="grid gap-2">
                <Field label="Имя *" value={contactForm.name} onChange={(name) => setContactForm((form) => ({ ...form, name }))} />
                <Field label="Телефон" value={contactForm.phone} onChange={(phone) => setContactForm((form) => ({ ...form, phone }))} type="tel" />
                <Field label="Почта" value={contactForm.email} onChange={(email) => setContactForm((form) => ({ ...form, email }))} type="email" />
                <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" checked={contactForm.isPrimary} onChange={(event) => setContactForm((form) => ({ ...form, isPrimary: event.target.checked }))} />Основной контакт</label>
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "contact" ? "Сохраняем…" : "Добавить контакт"}</button>
              </form>
              <DetailEmpty items={contacts} empty="Контактов пока нет." render={(contact) => <div key={contact.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{contact.name}{contact.isPrimary ? " · основной" : ""}</div><div className="mt-0.5 text-[var(--text-secondary)]">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "Контакты не указаны"}</div></div>} />
            </DetailSection>
            <DetailSection title="История">
              <form onSubmit={saveEvent} className="grid gap-2">
                <select value={eventForm.kind} onChange={(event) => setEventForm((form) => ({ ...form, kind: event.target.value }))} className="h-9 rounded-[9px] border border-[var(--border-color)] px-2 text-[11px]"><option value="comment">Комментарий</option><option value="call">Звонок</option><option value="meeting">Встреча</option><option value="email">Письмо</option></select>
                <textarea value={eventForm.body} onChange={(event) => setEventForm((form) => ({ ...form, body: event.target.value }))} placeholder="Что произошло?" className="min-h-20 rounded-[9px] border border-[var(--border-color)] px-2 py-2 text-[11px] outline-none focus:border-[var(--brand-yellow)]" />
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "event" ? "Сохраняем…" : "Добавить событие"}</button>
              </form>
              <DetailEmpty items={events} empty="История пока пуста." render={(item) => <div key={item.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{eventLabel(item.kind)} · {formatDate(item.createdAt)}</div><div className="mt-0.5 text-[var(--text-secondary)]">{item.body}</div></div>} />
            </DetailSection>
            <DetailSection title="Напоминания">
              <form onSubmit={saveReminder} className="grid gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Дата и время</span><input type="datetime-local" value={reminderDueAt} onChange={(event) => setReminderDueAt(event.target.value)} className="h-9 rounded-[9px] border border-[var(--border-color)] px-2 text-[11px] font-normal" /></label>
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "reminder" ? "Сохраняем…" : "Добавить напоминание"}</button>
              </form>
              <DetailEmpty items={reminders} empty="Активных напоминаний нет." render={(reminder) => <div key={reminder.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{formatDate(reminder.dueAt)}</div><div className="mt-0.5 text-[var(--text-secondary)]">{reminder.status === "active" ? "Активно" : reminder.status}</div></div>} />
            </DetailSection>
            {canConfirmExistingLink ? (
              <DetailSection title="Найденные в 1С совпадения">
                <p className="text-[11px] text-[var(--text-secondary)]">Показаны только локально импортированные точные совпадения по ИНН и КПП. Связь не создаётся без подтверждения.</p>
                <DetailEmpty items={linkCandidates} empty="Точных совпадений пока нет." render={(candidate) => <div key={candidate.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{candidate.name}</div><div className="mt-0.5 text-[var(--text-secondary)]">ИНН {candidate.inn}{candidate.kpp ? " · КПП " + candidate.kpp : ""}</div><button type="button" onClick={() => setLinkCandidate(candidate)} disabled={isSaving !== null} className="mt-2 h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold hover:bg-[#F6F8FB]">Проверить и подтвердить</button></div>} />
                {linkCandidate ? <div role="alertdialog" aria-label="Подтверждение связи с 1С" className="grid gap-2 rounded-[10px] border border-[#F0D98A] bg-[#FFF9E8] p-3 text-[11px]"><p>Связать «{currentClient.documentName || currentClient.name}» с контрагентом 1С «{linkCandidate.name}»?</p><dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] text-[var(--text-secondary)]"><dt>ИНН</dt><dd>{linkCandidate.inn}</dd>{linkCandidate.kpp ? <><dt>КПП</dt><dd>{linkCandidate.kpp}</dd></> : null}<dt>Ключ 1С</dt><dd>{linkCandidate.onecKey}</dd></dl><div className="flex gap-2"><button type="button" onClick={() => setLinkCandidate(null)} className="h-8 rounded-[8px] px-2 font-semibold text-[var(--text-secondary)]">Отмена</button><button type="button" onClick={() => void confirmExistingLink()} disabled={isSaving !== null} className="app-action-button h-8 rounded-[8px] px-3 text-[11px]">{isSaving === "link" ? "Связываем…" : "Подтвердить связь с 1С"}</button></div></div> : null}
              </DetailSection>
            ) : null}
            {canQueueOnecCreate ? <DetailSection title="Создание в 1С">
              <p className="text-[11px] text-[var(--text-secondary)]">Создание не отправляется автоматически: после подтверждения заявка будет поставлена в очередь и проверит реквизиты на сервере.</p>
              <button type="button" onClick={() => setIsCreateConfirmationOpen(true)} disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">Создать в 1С</button>
              <AlertDialog open={isCreateConfirmationOpen} onOpenChange={setIsCreateConfirmationOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Подтверждение создания в 1С</AlertDialogTitle>
                    <AlertDialogDescription>Поставить создание «{currentClient.documentName || currentClient.name}» в очередь 1С? Проверка совпадений и отправка выполняются серверной очередью от имени текущего submitter’а.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void queueOnecCreate()} disabled={isSaving !== null}>{isSaving === "queue" ? "Ставим в очередь…" : "Подтвердить создание"}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DetailSection> : null}
            {currentClient.syncStatus === "blocked_credentials" ? <DetailSection title="Отправка в 1С требует исправления">
              <p className="text-[11px] text-[var(--text-secondary)]">Исправьте учётные данные 1С для исходного submitter’а, затем повторите действие. {currentClient.syncError || "Создание не будет отправлено автоматически."}</p>
              <button type="button" onClick={() => setIsRetryConfirmationOpen(true)} disabled={isSaving !== null} className="h-9 rounded-[9px] border border-[#F0D98A] bg-[#FFF9E8] px-3 text-[11px] font-semibold text-[#92400E]">Повторить отправку в 1С</button>
              <AlertDialog open={isRetryConfirmationOpen} onOpenChange={setIsRetryConfirmationOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Подтверждение повторной отправки в 1С</AlertDialogTitle>
                    <AlertDialogDescription>Повторить создание «{currentClient.documentName || currentClient.name}» после исправления учётных данных? Очередь будет использовать только исправленные данные исходной учётной записи 1С, без подстановки данных другого сотрудника.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void retryBlockedOnecCreate()} disabled={isSaving !== null}>{isSaving === "retry" ? "Ставим в очередь…" : "Подтвердить повтор"}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DetailSection> : null}
            <DetailSection title="Конфликты синхронизации">
              <DetailEmpty items={syncConflicts} empty="Открытых конфликтов синхронизации нет." render={(conflict) => <div key={conflict.id} className="rounded-[9px] bg-[#FFF9E8] px-2.5 py-2 text-[11px]"><div className="font-semibold">{syncConflictFieldLabel(conflict.fieldName)}</div><div className="mt-1 grid gap-1 text-[var(--text-secondary)]"><span><strong className="text-[var(--text-primary)]">CRM:</strong> {formatSyncConflictValue(conflict.localValue)}</span><span><strong className="text-[var(--text-primary)]">1С:</strong> {formatSyncConflictValue(conflict.remoteValue)}</span></div>{canResolveSyncConflicts ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setSyncConflictResolution({ conflict, choice: "local" })} disabled={isSaving !== null} className="h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold">Оставить локальное</button><button type="button" onClick={() => setSyncConflictResolution({ conflict, choice: "remote" })} disabled={isSaving !== null} className="app-action-button h-8 rounded-[8px] px-2 text-[10px]">Принять из 1С</button></div> : null}</div>} />
              <AlertDialog open={syncConflictResolution !== null} onOpenChange={(open) => { if (!open) setSyncConflictResolution(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Подтверждение разрешения конфликта</AlertDialogTitle><AlertDialogDescription>{syncConflictResolution ? <>Разрешить только этот конфликт клиента «{currentClient.documentName || currentClient.name}» по полю «{syncConflictFieldLabel(syncConflictResolution.conflict.fieldName)}», выбрав значение «{formatSyncConflictValue(syncConflictResolution.choice === "local" ? syncConflictResolution.conflict.localValue : syncConflictResolution.conflict.remoteValue)}»? Выбор необратимо разрешит этот открытый конфликт для текущей карточки.</> : null}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void resolveSyncConflict()} disabled={isSaving !== null}>{isSaving === "resolve" ? "Разрешаем…" : "Подтвердить"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </DetailSection>
            {canManageLocalClient ? <DetailSection title="Административные действия"><p className="text-[11px] text-[var(--text-secondary)]">CRM сотрудника: {ownerName}</p>{currentClient.syncStatus === "archived" ? <button type="button" onClick={() => void restoreLocalClient()} disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "restore" ? "Восстанавливаем…" : "Восстановить локального клиента"}</button> : <><button type="button" onClick={() => setIsArchiveConfirmationOpen(true)} disabled={isSaving !== null} className="h-9 rounded-[9px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 text-[11px] font-semibold text-[#B91C1C]">Архивировать локального клиента</button>{isArchiveConfirmationOpen ? <div role="alertdialog" aria-label="Подтверждение архивации" className="grid gap-2 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] p-3 text-[11px]"><p>Подтвердите архивирование «{currentClient.documentName || currentClient.name}» в CRM сотрудника «{ownerName}». Активные напоминания будут отменены, история сохранится.</p><label className="grid gap-1"><span className="font-semibold">Причина</span><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} className="min-h-16 rounded-[8px] border border-[#F4B9B9] bg-white px-2 py-1.5" /></label><div className="flex gap-2"><button type="button" onClick={() => setIsArchiveConfirmationOpen(false)} className="h-8 rounded-[8px] px-2 font-semibold text-[var(--text-secondary)]">Отмена</button><button type="button" onClick={() => void archiveLocalClient()} disabled={isSaving !== null} className="h-8 rounded-[8px] bg-[#B91C1C] px-3 font-semibold text-white">{isSaving === "archive" ? "Архивируем…" : "Подтвердить архивирование"}</button></div></div> : null}</>}</DetailSection> : null}
            {canRemoveAssignment ? <DetailSection title="Административные действия"><p className="text-[11px] text-[var(--text-secondary)]">CRM сотрудника: {ownerName}</p><button type="button" onClick={() => setIsRemoveAssignmentConfirmationOpen(true)} disabled={isSaving !== null} className="h-9 rounded-[9px] border border-[#F0D98A] bg-[#FFF9E8] px-3 text-[11px] font-semibold text-[#92400E]">Оставить только в основной вкладке</button><AlertDialog open={isRemoveAssignmentConfirmationOpen} onOpenChange={setIsRemoveAssignmentConfirmationOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Подтверждение удаления из личной вкладки</AlertDialogTitle><AlertDialogDescription>Оставить «{currentClient.documentName || currentClient.name}» только в основной вкладке «Клиенты 1С» CRM сотрудника «{ownerName}»? Карточка останется в основной вкладке «Клиенты 1С», а история и напоминания сохранятся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void removeAssignment()} disabled={isSaving !== null}>{isSaving === "remove" ? "Удаляем…" : "Подтвердить"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DetailSection> : null}
            <DetailSection title="Журнал действий"><DetailEmpty items={audit} empty="Административных действий пока нет." render={(item) => <div key={item.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{auditActionLabel(item.action)} · {formatDate(item.createdAt)}</div><div className="mt-0.5 text-[var(--text-secondary)]">{item.reason || "Без комментария"}</div></div>} /></DetailSection>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-[var(--border-color)] p-3"><h3 className="text-[13px] font-bold">{title}</h3><div className="mt-3 grid gap-3">{children}</div></section>; }
function DetailEmpty<T extends { id: number }>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) { return <div className="grid gap-2">{items.length ? items.map(render) : <p className="text-[11px] text-[var(--text-secondary)]">{empty}</p>}</div>; }
function eventLabel(kind: string) { return ({ comment: "Комментарий", call: "Звонок", meeting: "Встреча", email: "Письмо" } as Record<string, string>)[kind] ?? kind; }
function auditActionLabel(action: string) { return ({ archive_local_client: "Локальный клиент архивирован", restore_local_client: "Локальный клиент восстановлен", archive_assignment: "Назначение архивировано", restore_assignment: "Назначение восстановлено", remove_assignment: "Оставлен только в основной вкладке" } as Record<string, string>)[action] ?? action; }
function syncConflictFieldLabel(fieldName: string) { return ({ documentName: "Наименование", email: "Почта", phone: "Телефон" } as Record<string, string>)[fieldName] ?? fieldName; }
function formatSyncConflictValue(value: unknown) { if (value === null || value === undefined || value === "") return "Не указано"; return typeof value === "string" ? value : JSON.stringify(value); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value || "Только что" : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }
function Field({ label, value, onChange, type = "text", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean }) { return <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>{label}</span><input autoFocus={autoFocus} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label>; }
function errorMessage(cause: unknown, fallback: string) { return cause instanceof Error && cause.message.trim() ? cause.message : fallback; }
