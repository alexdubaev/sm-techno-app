"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type SetStateAction, type SubmitEvent } from "react";

import {
  downloadCrmExportFile,
  createCrmClient,
  createCrmTab,
  deleteCrmTab,
  fetchCrmClient,
  fetchCrmClients,
  fetchCrmSyncStatus,
  fetchPrimaryCrmClients,
  fetchCrmReminders,
  fetchCrmTabs,
  fetchUsers,
  invalidateApiCache,
  moveCrmClient,
  saveCrmRowPreference,
  saveCrmPrimaryRowPreference,
  reorderCrmTabClients,
  reorderPrimaryCrmClients,
  renameCrmTab,
  syncCrmWorkspace,
  type CrmSyncStatus,
} from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { MobileCrmWorkspace } from "@/components/crm/mobile/mobile-crm-workspace";
import { MessengerLinks } from "@/components/crm/messenger-links";
import { DesktopCrmImportDialog } from "@/components/crm/import/desktop-crm-import-dialog";
import { getImportantReminders, getNearestActiveReminderByClient } from "@/components/crm/mobile/mobile-crm-utils";
import {
  applyOwnerReminderLoad,
  createRefreshActivityTracker,
  createMobileDetailSelection,
  getMobileListContextOnClose,
  getOwnerReminders,
  getWorkspaceClientsForView,
  resolveReminderDetailSelection,
  transitionWorkspaceClientView,
  type MobileDetailSelection,
  type OwnerReminderState,
  type WorkspaceClientView,
} from "@/components/crm/mobile/mobile-crm-workspace-state";
import type { MobileDetailSection } from "@/components/crm/mobile/types";
import { useCrmClientDetailController, type CrmClientDetailControllerOptions } from "@/components/crm/use-crm-client-detail";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { readCrmWorkspaceCache, saveCrmWorkspaceCache, updateCrmWorkspaceCache } from "@/lib/crm-workspace-cache";
import type { AppUser, CrmReminder, CrmTab, CrmWorkspaceClient } from "@/lib/types";

type ActiveTab = "primary" | number;
type SyncFilter = "all" | "synced" | "local" | "pending" | "blocked_capability" | "blocked_credentials" | "conflict" | "sync_error";
type PrimaryOrderMode = "manual" | "name";
type LocalImportLoad = "activation" | "import";
type LocalImportFreshness = { ownerId: number; tab: ActiveTab; generation: number; pendingLoads: Set<LocalImportLoad> };

const PRIMARY_TAB: { id: ActiveTab; name: string; systemKind: "primary" } = {
  id: "primary",
  name: "Клиенты 1С",
  systemKind: "primary",
};

const CRM_SYNC_FRESHNESS_MS = 10 * 60_000;
const CRM_SYNC_FAILURE_MESSAGE = "Не удалось обновить данные из 1С. Показаны сохранённые данные.";

const ROW_COLORS = [
  ["blue", "Синий", "#2563EB", "#DBEAFE"],
  ["cyan", "Бирюзовый", "#0891B2", "#CFFAFE"],
  ["teal", "Тёмно-бирюзовый", "#0F766E", "#CCFBF1"],
  ["green", "Зелёный", "#16A34A", "#DCFCE7"],
  ["lime", "Лаймовый", "#65A30D", "#ECFCCB"],
  ["yellow", "Жёлтый", "#CA8A04", "#FEF9C3"],
  ["amber", "Янтарный", "#D97706", "#FEF3C7"],
  ["orange", "Оранжевый", "#EA580C", "#FFEDD5"],
  ["red", "Красный", "#DC2626", "#FEE2E2"],
  ["pink", "Розовый", "#DB2777", "#FCE7F3"],
  ["purple", "Фиолетовый", "#7E22CE", "#F3E8FF"],
  ["gray", "Серый", "#475569", "#E2E8F0"],
] as const;

const colorByKey = new Map<string, string>(ROW_COLORS.map(([key, _label, _swatch, tint]) => [key, tint]));

function formatCrmSyncStatusText(syncStatus: CrmSyncStatus | null, isRefreshing: boolean) {
  if (isRefreshing) return "Обновляем…";
  if (!syncStatus) return null;
  if (syncStatus.status === "never") return "Данные из 1С ещё не обновлялись";
  const syncedAt = new Date(syncStatus.lastSyncAt);
  if (Number.isNaN(syncedAt.valueOf())) {
    return syncStatus.status === "error" ? "1С недоступна" : "Данные из 1С обновлены";
  }
  const time = syncedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  if (syncStatus.status === "error") {
    return `1С недоступна · данные от ${time}`;
  }
  const minutesAgo = Math.max(0, Math.floor((Date.now() - syncedAt.valueOf()) / 60_000));
  if (minutesAgo < 1) return "Обновлено только что";
  if (minutesAgo < 60) return `Обновлено ${minutesAgo} мин назад`;
  const today = new Date().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
  const syncedDate = syncedAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
  return syncedDate === today ? `Обновлено сегодня в ${time}` : `Обновлено ${syncedDate} в ${time}`;
}

function emptyClientForm() {
  return { documentName: "", city: "", contactPerson: "", email: "", phone: "", telegram: "", maxLink: "", notes: "" };
}

export function CrmWorkspace() {
  const { user, isAdmin } = useAuth();
  const [initialWorkspaceCache] = useState(() => readCrmWorkspaceCache(user.id, "primary"));
  const [owners, setOwners] = useState<AppUser[]>([]);
  const [ownerId, setOwnerId] = useState(user.id);
  const canEditWorkspace = ownerId === user.id;
  const [tabs, setTabs] = useState<CrmTab[]>(() => initialWorkspaceCache?.tabs ?? []);
  const [activeTab, setActiveTab] = useState<ActiveTab>("primary");
  const [clientView, setClientView] = useState<WorkspaceClientView>(() => ({
    ownerId: user.id,
    activeTab: "primary",
    clients: initialWorkspaceCache?.clients ?? [],
  }));
  const clients = getWorkspaceClientsForView(clientView, { ownerId, activeTab });
  const setClients = useCallback((next: SetStateAction<CrmWorkspaceClient[]>) => {
    setClientView((current) => ({
      ...current,
      clients: typeof next === "function" ? next(current.clients) : next,
    }));
  }, []);
  const [search, setSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [primaryOrderMode, setPrimaryOrderMode] = useState<PrimaryOrderMode>("manual");
  const [primaryOrderVersion, setPrimaryOrderVersion] = useState(() => initialWorkspaceCache?.primaryOrderVersion ?? 0);
  const [isLoading, setIsLoading] = useState(() => initialWorkspaceCache === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshActivityTracker] = useState(() => createRefreshActivityTracker(setIsRefreshing));
  const [syncStatus, setSyncStatus] = useState<CrmSyncStatus | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CrmWorkspaceClient | null>(null);
  const [mobileDetail, setMobileDetail] = useState<MobileDetailSelection | null>(null);
  const [reminderState, setReminderState] = useState<OwnerReminderState>(null);
  const [reminderError, setReminderError] = useState<{ ownerId: number; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm);
  const [tabEditor, setTabEditor] = useState<CrmTab | "new" | null>(null);
  const [tabName, setTabName] = useState("");
  const [tabPendingDelete, setTabPendingDelete] = useState<CrmTab | null>(null);
  const [replacementTabId, setReplacementTabId] = useState<number | null>(null);
  const [isSavingTab, setIsSavingTab] = useState(false);
  const requestId = useRef(0);
  const crmSyncInFlight = useRef<Promise<void> | null>(null);
  const crmRefreshInFlight = useRef<{ ownerId: number; request: Promise<void> } | null>(null);
  const initialLocalLoad = useRef<{ ownerId: number; tab: ActiveTab; request: Promise<void> } | null>(null);
  const freshnessInFlight = useRef<{ ownerId: number; tab: ActiveTab; request: Promise<void> } | null>(null);
  const localImportFreshness = useRef<LocalImportFreshness | null>(null);
  const localImportFreshnessGeneration = useRef(0);
  const loadedSyncVersion = useRef<{ ownerId: number; tab: ActiveTab; lastSyncAt: number } | null>(null);
  const reminderRequestId = useRef(0);
  const currentView = useRef({ activeTab, ownerId });
  currentView.current = { activeTab, ownerId };
  const isCurrentWorkspaceView = useCallback((requestTab: ActiveTab, requestOwnerId: number) => currentView.current.activeTab === requestTab && currentView.current.ownerId === requestOwnerId, []);
  const isCurrentWorkspaceOwner = useCallback((requestOwnerId: number) => currentView.current.ownerId === requestOwnerId, []);
  const isLocalImportTransition = useCallback((tab: ActiveTab, requestOwnerId: number, generation?: number) => {
    const localImport = localImportFreshness.current;
    return localImport?.ownerId === requestOwnerId
      && localImport.tab === tab
      && (generation === undefined || localImport.generation === generation)
      && isCurrentWorkspaceView(tab, requestOwnerId);
  }, [isCurrentWorkspaceView]);
  const settleLocalImportTransition = useCallback((tab: ActiveTab, requestOwnerId: number, generation: number, load: LocalImportLoad) => {
    const localImport = localImportFreshness.current;
    if (localImport?.ownerId !== requestOwnerId || localImport.tab !== tab || localImport.generation !== generation) return false;
    localImport.pendingLoads.delete(load);
    if (localImport.pendingLoads.size === 0) localImportFreshness.current = null;
    return true;
  }, []);

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

  const refreshReminders = useCallback(async (ownerId: number) => {
    const id = ++reminderRequestId.current;
    try {
      const items = await fetchCrmReminders(ownerId);
      if (id !== reminderRequestId.current) return;
      const activeOwnerId = currentView.current.ownerId;
      setReminderState((current) => applyOwnerReminderLoad(current, activeOwnerId, ownerId, items));
      if (activeOwnerId !== ownerId) return;
      setReminderError(null);
    } catch (cause) {
      if (id === reminderRequestId.current) {
        const activeOwnerId = currentView.current.ownerId;
        setReminderState((current) => applyOwnerReminderLoad(current, activeOwnerId, ownerId, undefined));
        if (activeOwnerId !== ownerId) return;
        setReminderError({ ownerId, message: errorMessage(cause, "Не удалось загрузить напоминания. Карточки клиентов не изменены.") });
      }
    }
  }, []);

  useEffect(() => {
    void refreshReminders(ownerId);
  }, [ownerId, refreshReminders]);

  const loadLocalWorkspace = useCallback(async (tab: ActiveTab, { silent = false, lastSyncAt }: { silent?: boolean; lastSyncAt?: string } = {}) => {
    const id = ++requestId.current;
    const finishRefreshing = silent ? refreshActivityTracker.start() : null;
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const nextTabsPromise = fetchCrmTabs(ownerId, { bypassCache: true });
      const [nextTabs, primaryResult, personalClients] = await Promise.all([
        nextTabsPromise,
        tab === "primary" ? fetchPrimaryCrmClients(ownerId, { bypassCache: true }) : Promise.resolve(null),
        tab === "primary" ? Promise.resolve(null) : fetchCrmClients({ ownerId, tabId: tab }, { bypassCache: true }),
      ]);
      if (id !== requestId.current || !isCurrentWorkspaceView(tab, ownerId)) return;
      setTabs(nextTabs);
      const nextClients = primaryResult?.items ?? personalClients ?? [];
      setClientView({ ownerId, activeTab: tab, clients: nextClients });
      if (lastSyncAt) loadedSyncVersion.current = { ownerId, tab, lastSyncAt: Date.parse(lastSyncAt) };
      if (primaryResult) setPrimaryOrderVersion(primaryResult.orderVersion);
      saveCrmWorkspaceCache(ownerId, tab, { tabs: nextTabs, clients: nextClients, primaryOrderVersion: primaryResult?.orderVersion ?? null });
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause, "Не удалось загрузить CRM."));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
      }
      finishRefreshing?.();
    }
  }, [isCurrentWorkspaceView, ownerId, refreshActivityTracker]);

  const refreshAfterDetailChange = useCallback((requestOwnerId: number, requestTab: ActiveTab) => {
    if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
    void loadLocalWorkspace(requestTab, { silent: true });
    void refreshReminders(requestOwnerId);
  }, [isCurrentWorkspaceView, loadLocalWorkspace, refreshReminders]);

  const syncCrmBeforeReload = useCallback(() => {
    if (!crmSyncInFlight.current) {
      crmSyncInFlight.current = syncCrmWorkspace().then(() => undefined).finally(() => { crmSyncInFlight.current = null; });
    }
    return crmSyncInFlight.current;
  }, []);

  const syncAndReloadWorkspace = useCallback((tab: ActiveTab, { manual = false } = {}) => {
    if (!manual && document.visibilityState !== "visible") return Promise.resolve();
    if (!isCurrentWorkspaceView(tab, ownerId)) return Promise.resolve();
    if (!manual && isLocalImportTransition(tab, ownerId)) return Promise.resolve();
    const pendingRefresh = crmRefreshInFlight.current;
    if (pendingRefresh?.ownerId === ownerId) return pendingRefresh.request;
    const requestOwnerId = ownerId;
    const finishRefreshing = refreshActivityTracker.start();
    const request = (async () => {
      setError(null);
      try {
        await syncCrmBeforeReload();
      } catch {
        try {
          invalidateApiCache();
          const failedSyncStatus = await fetchCrmSyncStatus();
          setSyncStatus(failedSyncStatus);
        } catch {
          // The saved client view and the actionable sync error remain available.
        }
        if (isCurrentWorkspaceOwner(requestOwnerId)) setError(CRM_SYNC_FAILURE_MESSAGE);
        return;
      }
      let lastSyncAt: string | undefined;
      try {
        const nextSyncStatus = await fetchCrmSyncStatus();
        setSyncStatus(nextSyncStatus);
        lastSyncAt = nextSyncStatus.lastSyncAt;
      } catch {
        // Status text is supplementary; a successful sync still reloads SQLite.
      }
      const latestView = currentView.current;
      if (latestView.ownerId !== requestOwnerId) return;
      await loadLocalWorkspace(latestView.activeTab, { silent: true, lastSyncAt });
    })().finally(finishRefreshing);
    crmRefreshInFlight.current = { ownerId: requestOwnerId, request };
    void request.finally(() => {
      if (crmRefreshInFlight.current?.request === request) crmRefreshInFlight.current = null;
    });
    return request;
  }, [isCurrentWorkspaceOwner, isCurrentWorkspaceView, isLocalImportTransition, loadLocalWorkspace, ownerId, refreshActivityTracker, syncCrmBeforeReload]);

  const checkWorkspaceFreshness = useCallback((tab: ActiveTab) => {
    if (isLocalImportTransition(tab, ownerId)) {
      return Promise.resolve();
    }
    if (document.visibilityState !== "visible" || !isCurrentWorkspaceView(tab, ownerId)) return Promise.resolve();
    const pending = freshnessInFlight.current;
    if (pending?.ownerId === ownerId && pending.tab === tab) return pending.request;
    const request = (async () => {
      const initial = initialLocalLoad.current;
      if (initial?.ownerId === ownerId && initial.tab === tab) await initial.request;
      if (document.visibilityState !== "visible" || !isCurrentWorkspaceView(tab, ownerId) || isLocalImportTransition(tab, ownerId)) return;
      try {
        const nextSyncStatus = await fetchCrmSyncStatus();
        if (document.visibilityState !== "visible" || !isCurrentWorkspaceView(tab, ownerId) || isLocalImportTransition(tab, ownerId)) return;
        setSyncStatus(nextSyncStatus);
        const lastSyncAt = Date.parse(nextSyncStatus.lastSyncAt);
        const loaded = loadedSyncVersion.current;
        // A global sync can be fresh while this session still displays older
        // SQLite rows. Only acknowledge the version after a successful read.
        if (Number.isFinite(lastSyncAt) && (loaded?.ownerId !== ownerId || loaded.tab !== tab || lastSyncAt > loaded.lastSyncAt)) {
          await loadLocalWorkspace(tab, { silent: true, lastSyncAt: nextSyncStatus.lastSyncAt });
        }
        if (isLocalImportTransition(tab, ownerId)) return;
        if (Number.isFinite(lastSyncAt) && Date.now() - lastSyncAt < CRM_SYNC_FRESHNESS_MS) return;
        await syncAndReloadWorkspace(tab);
      } catch {
        if (isCurrentWorkspaceView(tab, ownerId)) setError(CRM_SYNC_FAILURE_MESSAGE);
      }
    })();
    freshnessInFlight.current = { ownerId, tab, request };
    void request.finally(() => {
      if (freshnessInFlight.current?.request === request) freshnessInFlight.current = null;
    });
    return request;
  }, [isCurrentWorkspaceView, isLocalImportTransition, loadLocalWorkspace, ownerId, syncAndReloadWorkspace]);

  useEffect(() => {
    let active = true;
    const localImport = localImportFreshness.current;
    const localImportGeneration = localImport?.ownerId === ownerId && localImport.tab === activeTab ? localImport.generation : null;
    const cachedWorkspace = readCrmWorkspaceCache(ownerId, activeTab);
    const request = loadLocalWorkspace(activeTab, { silent: cachedWorkspace !== null });
    initialLocalLoad.current = { ownerId, tab: activeTab, request };
    void request.then(() => {
      if (localImportGeneration !== null && settleLocalImportTransition(activeTab, ownerId, localImportGeneration, "activation")) return;
      if (active) void checkWorkspaceFreshness(activeTab);
    });
    return () => { active = false; };
  }, [activeTab, checkWorkspaceFreshness, loadLocalWorkspace, ownerId, settleLocalImportTransition]);

  useEffect(() => {
    const refreshVisibleWorkspace = () => {
      if (document.visibilityState !== "visible") return;
      void checkWorkspaceFreshness(activeTab);
    };
    const timer = window.setInterval(refreshVisibleWorkspace, 10 * 60_000);
    document.addEventListener("visibilitychange", refreshVisibleWorkspace);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleWorkspace);
    };
  }, [activeTab, checkWorkspaceFreshness]);

  const visibleClients = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    const filtered = clients.filter((client) => {
      const matchesStatus = syncFilter === "all" || client.syncStatus === syncFilter;
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [client.name, client.documentName, client.fullName, client.contactPerson, client.inn, client.email, client.phone]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(needle);
    });
    if (activeTab === "primary" && primaryOrderMode === "name") {
      return [...filtered].sort((left, right) => (left.documentName || left.name).localeCompare(right.documentName || right.name, "ru"));
    }
    return filtered;
  }, [activeTab, clients, primaryOrderMode, search, syncFilter]);

  const ownerReminders = useMemo(() => getOwnerReminders(reminderState, ownerId), [ownerId, reminderState]);
  const importantReminders = useMemo(() => getImportantReminders(ownerReminders), [ownerReminders]);
  const nearestReminderByClient = useMemo(() => getNearestActiveReminderByClient(ownerReminders), [ownerReminders]);

  const personalOrderVersion = clients.reduce((version, client) => Math.max(version, client.rowPreference?.orderVersion ?? 0), 0);
  const isPrimaryManualOrderAvailable = activeTab === "primary" && primaryOrderMode === "manual" && !search.trim() && syncFilter === "all";
  const isPersonalManualOrderAvailable = activeTab !== "primary" && !search.trim() && syncFilter === "all";
  const isManualOrderAvailable = canEditWorkspace && (isPrimaryManualOrderAvailable || isPersonalManualOrderAvailable);

  const activateTab = (tab: ActiveTab) => {
    currentView.current = { activeTab: tab, ownerId };
    requestId.current += 1;
    const cachedWorkspace = readCrmWorkspaceCache(ownerId, tab);
    setClientView((current) => transitionWorkspaceClientView(current, { ownerId, activeTab: tab }, cachedWorkspace?.clients ?? null));
    if (cachedWorkspace) {
      setTabs(cachedWorkspace.tabs);
      if (cachedWorkspace.primaryOrderVersion !== null) setPrimaryOrderVersion(cachedWorkspace.primaryOrderVersion);
    }
    setIsLoading(cachedWorkspace === null);
    setActiveTab(tab);
  };

  const importIntoWorkspace = async (targetTabId: number) => {
    if (!canEditWorkspace) return;
    const wasAlreadyActive = isCurrentWorkspaceView(targetTabId, ownerId);
    const generation = ++localImportFreshnessGeneration.current;
    localImportFreshness.current = {
      ownerId,
      tab: targetTabId,
      generation,
      pendingLoads: new Set<LocalImportLoad>(wasAlreadyActive ? ["import"] : ["activation", "import"]),
    };
    activateTab(targetTabId);
    await loadLocalWorkspace(targetTabId, { silent: true });
    settleLocalImportTransition(targetTabId, ownerId, generation, "import");
    if (isCurrentWorkspaceView(targetTabId, ownerId)) setNotice("Клиенты импортированы в выбранную вкладку.");
  };

  const chooseTab = (tab: ActiveTab) => {
    localImportFreshness.current = null;
    activateTab(tab);
    setSearch("");
    setSyncFilter("all");
  };

  const chooseMobileTab = (tab: ActiveTab) => {
    localImportFreshness.current = null;
    activateTab(tab);
  };

  const chooseOwner = (nextOwnerId: number) => {
    localImportFreshness.current = null;
    const cachedWorkspace = readCrmWorkspaceCache(nextOwnerId, "primary");
    currentView.current = { activeTab: "primary", ownerId: nextOwnerId };
    requestId.current += 1;
    setSelectedClient(null); setIsAdding(false); setForm(emptyClientForm()); setTabEditor(null);
    setMobileDetail(null);
    setTabPendingDelete(null);
    setIsSavingTab(false);
    setTabs(cachedWorkspace?.tabs ?? []);
    setClientView((current) => transitionWorkspaceClientView(current, { ownerId: nextOwnerId, activeTab: "primary" }, cachedWorkspace?.clients ?? null));
    setPrimaryOrderVersion(cachedWorkspace?.primaryOrderVersion ?? 0);
    setIsLoading(cachedWorkspace === null);
    setActiveTab("primary");
    setOwnerId(nextOwnerId);
  };

  const openMobileClient = (client: CrmWorkspaceClient, initialSection: MobileDetailSection = "overview") => {
    setMobileDetail(createMobileDetailSelection(client, initialSection, { search, scrollTop: window.scrollY }));
  };

  const closeMobileClient = () => {
    const listContext = mobileDetail ? getMobileListContextOnClose(mobileDetail) : null;
    setMobileDetail(null);
    if (!listContext) return;
    setSearch(listContext.search);
    window.requestAnimationFrame(() => window.scrollTo({ top: listContext.scrollTop }));
  };

  const openReminder = async (reminder: CrmReminder) => {
    const requestOwnerId = ownerId;
    const listContext = { search, scrollTop: window.scrollY };
    try {
      const selection = await resolveReminderDetailSelection({
        reminder,
        clients,
        ownerId,
        listContext,
        fetchClient: () => fetchCrmClient(reminder.clientId, ownerId),
      });
      if (!isCurrentWorkspaceOwner(requestOwnerId)) return;
      setMobileDetail(selection);
    } catch (cause) {
      if (isCurrentWorkspaceOwner(requestOwnerId)) setError(errorMessage(cause, "Не удалось открыть клиента для напоминания. Список не изменён."));
    }
  };

  const submitClient = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditWorkspace) return;
    if (!form.documentName.trim()) {
      setError("Укажите наименование компании.");
      return;
    }
    const requestOwnerId = ownerId;
    const requestTab = activeTab;
    setIsSaving(true);
    setError(null);
    try {
      await createCrmClient({
        documentName: form.documentName.trim(),
        city: form.city.trim(),
        contactPerson: form.contactPerson.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        telegram: form.telegram.trim(),
        maxLink: form.maxLink.trim(),
        notes: form.notes.trim(),
      }, requestOwnerId);
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setForm(emptyClientForm());
      setIsAdding(false);
      setNotice("Клиент добавлен во вкладку «В работе».");
      const workTab = tabs.find((tab) => tab.systemKind === "work");
      chooseTab(workTab?.id ?? requestTab);
      if (workTab?.id === requestTab) await loadLocalWorkspace(requestTab, { silent: true });
    } catch (cause) {
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setError(errorMessage(cause, "Не удалось добавить клиента."));
    } finally {
      if (isCurrentWorkspaceOwner(requestOwnerId)) setIsSaving(false);
    }
  };

  const moveClient = async (client: CrmWorkspaceClient, targetTabId: number) => {
    if (!canEditWorkspace) return;
    const target = tabs.find((tab) => tab.id === targetTabId);
    if (!target) return;
    const requestOwnerId = ownerId;
    const requestTab = activeTab;
    try {
      const savedAssignment = await moveCrmClient(client.id, targetTabId, ownerId);
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setClients((current) => current.map((item) => item.id === client.id ? { ...item, assignment: savedAssignment } : item));
      setNotice(client.assignment ? `Клиент перемещён во вкладку «${target.name}».` : `Клиент добавлен во вкладку «${target.name}».`);
      if (requestTab === "primary") {
        await loadLocalWorkspace("primary", { silent: true });
      } else {
        await loadLocalWorkspace(requestTab, { silent: true });
      }
    } catch (cause) {
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setError(errorMessage(cause, client.assignment ? "Не удалось переместить клиента. Изменение отменено." : "Не удалось добавить клиента во вкладку. Изменение отменено."));
    }
  };

  const isCurrentPrimaryView = (requestOwnerId: number) => currentView.current.activeTab === "primary" && currentView.current.ownerId === requestOwnerId;
  const reloadPrimaryAfterFailure = async (requestOwnerId: number) => {
    try {
      const primary = await fetchPrimaryCrmClients(requestOwnerId);
      if (currentView.current.activeTab !== "primary" || currentView.current.ownerId !== requestOwnerId) return "stale";
      setClients(primary.items);
      setPrimaryOrderVersion(primary.orderVersion);
      updateCrmWorkspaceCache(requestOwnerId, "primary", (cached) => ({ ...cached, clients: primary.items, primaryOrderVersion: primary.orderVersion }));
      return "reloaded";
    } catch {
      return isCurrentPrimaryView(requestOwnerId) ? "reload_failed" : "stale";
    }
  };

  const setRowColor = async (client: CrmWorkspaceClient, colorKey: string | null) => {
    if (!canEditWorkspace) return;
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
        setClients((current) => {
          const nextClients = current.map((item) => item.id === client.id ? { ...item, primaryRowPreference: preference } : item);
          updateCrmWorkspaceCache(requestOwnerId, "primary", (cached) => ({ ...cached, clients: nextClients, primaryOrderVersion: preference.orderVersion }));
          return nextClients;
        });
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
      const preference = await saveCrmRowPreference(client.id, { tabId: activeTab, colorKey, expectedOrderVersion: personalOrderVersion }, ownerId);
      if (currentView.current.activeTab !== activeTab || currentView.current.ownerId !== ownerId) return;
      setClients((current) => {
        const nextClients = current.map((item) => item.id === client.id ? { ...item, rowPreference: preference } : item);
        updateCrmWorkspaceCache(ownerId, activeTab, (cached) => ({ ...cached, clients: nextClients }));
        return nextClients;
      });
      setNotice("Оформление строки сохранено.");
    } catch (cause) {
      const reload = await reloadPersonalAfterFailure(activeTab, ownerId);
      if (reload === "stale") return;
      setError(errorMessage(cause, "Не удалось сохранить цвет. Изменение отменено."));
    }
  };

  const reorderPrimaryClients = async (clientId: number, insertionIndex: number) => {
    if (!canEditWorkspace) return;
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
      updateCrmWorkspaceCache(requestOwnerId, "primary", (cached) => ({ ...cached, clients: reordered, primaryOrderVersion: result.orderVersion }));
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
      updateCrmWorkspaceCache(requestOwnerId, requestTab, (cached) => ({ ...cached, clients: refreshed }));
      return "reloaded";
    } catch {
      return currentView.current.activeTab === requestTab && currentView.current.ownerId === requestOwnerId ? "reload_failed" : "stale";
    }
  };

  const reorderPersonalClients = async (clientId: number, insertionIndex: number) => {
    if (!canEditWorkspace || activeTab === "primary") return;
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
      const nextClients = result.clientIds.flatMap((orderedClientId, index) => {
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
      });
      setClients(nextClients);
      updateCrmWorkspaceCache(requestOwnerId, requestTab, (cached) => ({ ...cached, clients: nextClients }));
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

  const openTabEditor = (tab: CrmTab | "new") => {
    if (!canEditWorkspace) return;
    setTabEditor(tab);
    setTabName(tab === "new" ? "" : tab.name);
    setError(null);
  };

  const reloadAfterTabFailure = async (requestTab: ActiveTab, requestOwnerId: number, message: string) => {
    if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
    await loadLocalWorkspace(requestTab, { silent: true });
    if (isCurrentWorkspaceView(requestTab, requestOwnerId)) setError(message);
  };

  const saveTab = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditWorkspace) return;
    const name = tabName.trim();
    if (!name) { setError("Укажите название личной вкладки."); return; }
    if (!tabEditor) return;
    const requestOwnerId = ownerId;
    const requestTab = activeTab;
    const editor = tabEditor;
    setIsSavingTab(true);
    setError(null);
    try {
      const saved = editor === "new"
        ? await createCrmTab(name, requestOwnerId)
        : await renameCrmTab(editor.id, name, requestOwnerId);
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setTabEditor(null);
      setNotice(editor === "new" ? "Личная вкладка создана." : "Личная вкладка переименована.");
      if (editor === "new") chooseTab(saved.id);
      await loadLocalWorkspace(editor === "new" ? saved.id : requestTab, { silent: true });
    } catch (cause) {
      await reloadAfterTabFailure(requestTab, requestOwnerId, errorMessage(cause, "Не удалось сохранить личную вкладку. Изменение отменено."));
    } finally {
      if (isCurrentWorkspaceOwner(requestOwnerId)) setIsSavingTab(false);
    }
  };

  const removeTab = async () => {
    if (!canEditWorkspace) return;
    if (!tabPendingDelete || replacementTabId === null) return;
    const tab = tabPendingDelete;
    const requestOwnerId = ownerId;
    const requestTab = activeTab;
    setIsSavingTab(true);
    setError(null);
    try {
      await deleteCrmTab(tab.id, replacementTabId, requestOwnerId);
      if (!isCurrentWorkspaceView(requestTab, requestOwnerId)) return;
      setTabPendingDelete(null);
      setNotice(`Личная вкладка «${tab.name}» удалена; карточки сохранены в выбранной вкладке.`);
      const nextTab = requestTab === tab.id ? replacementTabId : requestTab;
      chooseTab(nextTab);
      await loadLocalWorkspace(nextTab, { silent: true });
    } catch (cause) {
      await reloadAfterTabFailure(requestTab, requestOwnerId, errorMessage(cause, "Не удалось удалить личную вкладку. Изменение отменено."));
    } finally {
      if (isCurrentWorkspaceOwner(requestOwnerId)) setIsSavingTab(false);
    }
  };

  const ownerName = owners.find((owner) => owner.id === ownerId)?.fullName
    || owners.find((owner) => owner.id === ownerId)?.username
    || `сотрудник #${ownerId}`;
  const syncStatusText = formatCrmSyncStatusText(syncStatus, isRefreshing);

  return (
    <section className="mx-auto max-w-[1500px]">
      <div className="md:hidden">
        <MobileCrmWorkspace
          activeTab={activeTab}
          canEditWorkspace={canEditWorkspace}
          clients={visibleClients}
          initialDetailSection={mobileDetail?.initialSection ?? "overview"}
          isAdding={isAdding}
          importantReminders={importantReminders}
          isAdmin={isAdmin}
          isExporting={isExporting}
          isLoading={isLoading}
          isLoadingReminders={reminderState?.ownerId !== ownerId && reminderError?.ownerId !== ownerId}
          isRefreshing={isRefreshing}
          isSavingClient={isSaving}
          manualOrderAvailable={isManualOrderAvailable}
          nearestReminderByClient={nearestReminderByClient}
          newClientError={error}
          newClientForm={form}
          notice={notice}
          ownerId={ownerId}
          ownerName={ownerName}
          owners={owners}
          primaryOrderMode={primaryOrderMode}
          reminderError={reminderError?.ownerId === ownerId ? reminderError.message : null}
          search={search}
          selectedClient={mobileDetail?.client ?? null}
          syncFilter={syncFilter}
          syncStatusText={syncStatusText}
          tabs={tabs}
          totalClientCount={clients.length}
          workspaceError={error}
          onAddClient={() => setIsAdding(true)}
          onChangeClientForm={setForm}
          onCloseClient={closeMobileClient}
          onCloseNewClient={() => setIsAdding(false)}
          onColorClient={(client, color) => void setRowColor(client, color)}
          onCreateTab={() => openTabEditor("new")}
          onDeleteTab={(tab) => { setTabPendingDelete(tab); setReplacementTabId(tabs.find((item) => item.systemKind === "work")?.id ?? null); }}
          onDetailChanged={refreshAfterDetailChange}
          onExport={(scope) => void exportCrm(scope)}
          onImportCompleted={importIntoWorkspace}
          onMoveClient={(client, tabId) => void moveClient(client, tabId)}
          onOpenClient={openMobileClient}
          onOpenReminder={(reminder) => void openReminder(reminder)}
          onOwnerChange={chooseOwner}
          onPrimaryOrderModeChange={setPrimaryOrderMode}
          onRefresh={() => void syncAndReloadWorkspace(activeTab, { manual: true })}
          onRenameTab={openTabEditor}
          onReorder={activeTab === "primary" ? reorderPrimaryClients : reorderPersonalClients}
          onSearchChange={setSearch}
          onSubmitClient={submitClient}
          onSyncFilterChange={setSyncFilter}
          onTabChange={chooseMobileTab}
        />
      </div>
      <div className="hidden md:block">
      <header className="flex flex-col justify-between gap-4 rounded-[22px] border border-[var(--border-color)] bg-white/90 px-4 py-4 shadow-[0_12px_30px_rgba(7,22,46,0.05)] sm:px-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Рабочее пространство</p>
          <h1 className="mt-1 text-[25px] font-[700] tracking-[-0.045em] text-[var(--text-primary)]">CRM</h1>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Клиенты, личные вкладки и быстрые действия менеджера.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? <label className="flex h-10 items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[11px] font-semibold text-[var(--text-secondary)]"><span>CRM сотрудника</span><select value={ownerId} onChange={(event) => chooseOwner(Number(event.target.value))} className="min-w-28 bg-transparent text-[12px] font-semibold text-[var(--text-primary)] outline-none">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName || owner.username}</option>)}</select></label> : null}
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]">{isExporting ? "Выгружаем…" : "Выгрузить Excel"}</summary>
            <div className="absolute right-0 z-20 mt-1 grid w-52 gap-1 rounded-[12px] border border-[var(--border-color)] bg-white p-2 shadow-[0_12px_28px_rgba(7,22,46,0.16)]">
              <button type="button" disabled={isExporting} onClick={() => void exportCrm("all")} className="rounded-[8px] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[#F6F8FB] disabled:opacity-60">Все клиенты</button>
              <button type="button" disabled={isExporting || activeTab === "primary"} onClick={() => void exportCrm("tab")} className="rounded-[8px] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[#F6F8FB] disabled:opacity-60">Текущая вкладка</button>
            </div>
          </details>
          {canEditWorkspace ? <button type="button" onClick={() => setIsImportDialogOpen(true)} className="h-10 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]">Загрузить клиентов</button> : null}
          <button type="button" onClick={() => void syncAndReloadWorkspace(activeTab, { manual: true })} disabled={isRefreshing} className="h-10 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:opacity-60">
            {isRefreshing ? "Обновляем…" : "Обновить"}
          </button>
          {canEditWorkspace ? <button type="button" onClick={() => setIsAdding(true)} className="app-action-button h-10 rounded-[12px] px-4 text-[12px]">Добавить клиента</button> : null}
        </div>
      </header>

      <div className="mt-4 min-w-0">
        <nav className="crm-tab-strip flex items-end gap-1 overflow-x-auto border-b border-[var(--border-color)] px-2 pt-2" aria-label="Вкладки CRM">
          <TabButton active={activeTab === "primary"} label={PRIMARY_TAB.name} onClick={() => chooseTab("primary")} />
          {tabs.map((tab) => <div key={tab.id} className="flex shrink-0 items-center"><TabButton active={activeTab === tab.id} label={tab.name} onClick={() => chooseTab(tab.id)} />{canEditWorkspace && tab.systemKind === "custom" ? <span className={`-ml-1 flex h-9 items-center border-b-0 pr-1 ${activeTab === tab.id ? "border border-[var(--border-color)] border-b-white bg-white" : "border border-[var(--border-color)] border-b-[#E9EEF5] bg-[#E9EEF5]"}`}><button type="button" aria-label={`Переименовать вкладку ${tab.name}`} onClick={() => openTabEditor(tab)} className="h-7 rounded-[6px] px-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-white/75">✎</button><button type="button" aria-label={`Удалить вкладку ${tab.name}`} onClick={() => { setTabPendingDelete(tab); setReplacementTabId(tabs.find((item) => item.systemKind === "work")?.id ?? null); }} className="h-7 rounded-[6px] px-1.5 text-[11px] text-red-700 hover:bg-red-50">×</button></span> : null}</div>)}
          {canEditWorkspace ? <button type="button" onClick={() => openTabEditor("new")} className="mb-1 h-8 shrink-0 rounded-[8px] border border-dashed border-[var(--border-color)] px-2.5 text-[11px] font-semibold text-[var(--brand-dark)] hover:bg-[#F6F8FB]">+ Новая вкладка</button> : null}
        </nav>
        <p className="px-2 pt-2 text-[10px] leading-4 text-[var(--text-secondary)]">«Клиенты 1С» и «В работе» — постоянные вкладки. Новые клиенты автоматически попадают в «В работе».</p>
        <div className="mt-2 min-w-0">
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
            {error ? <><Message tone="error">{error}</Message>{error === CRM_SYNC_FAILURE_MESSAGE ? <button type="button" onClick={() => void syncAndReloadWorkspace(activeTab, { manual: true })} disabled={isRefreshing} className="mt-2 h-9 rounded-[9px] border border-[#F9D4D4] bg-white px-3 text-[11px] font-semibold text-[#B91C1C] disabled:opacity-60">Повторить</button> : null}</> : null}
            {notice ? <Message tone="success">{notice}</Message> : null}
            {isLoading ? <LoadingRows /> : <ClientList activeTab={activeTab} clients={visibleClients} tabs={tabs} canEditWorkspace={canEditWorkspace} manualOrderEnabled={isManualOrderAvailable} onColor={setRowColor} onReorder={activeTab === "primary" ? reorderPrimaryClients : reorderPersonalClients} onMove={moveClient} onOpenAssignment={chooseTab} onOpenClient={setSelectedClient} />}
          </div>
        </div>
      </div>

      {isAdding ? <ClientDialog form={form} isSaving={isSaving} onChange={setForm} onClose={() => setIsAdding(false)} onSubmit={submitClient} /> : null}
      {canEditWorkspace && isImportDialogOpen ? <DesktopCrmImportDialog ownerId={ownerId} tabs={tabs} onClose={() => setIsImportDialogOpen(false)} onImported={importIntoWorkspace} /> : null}
      {tabEditor ? <form role="dialog" aria-modal="true" aria-labelledby="crm-tab-editor-title" onSubmit={saveTab} className="fixed inset-0 z-50 flex items-center justify-center bg-[#07162e]/35 p-4"><div className="w-full max-w-sm rounded-[18px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)]"><h2 id="crm-tab-editor-title" className="text-[16px] font-bold">{tabEditor === "new" ? "Новая вкладка" : "Переименовать вкладку"}</h2>{error ? <div role="alert" aria-live="assertive" className="mt-3 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[#B91C1C]">{error}</div> : null}<label className="mt-4 grid gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Название</span><input autoFocus value={tabName} onChange={(event) => setTabName(event.target.value)} className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setTabEditor(null)} className="h-9 rounded-[9px] px-3 text-[11px] font-semibold text-[var(--text-secondary)]">Отмена</button><button type="submit" disabled={isSavingTab} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSavingTab ? "Сохраняем…" : "Сохранить"}</button></div></div></form> : null}
      <AlertDialog open={tabPendingDelete !== null} onOpenChange={(open) => { if (!open) setTabPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить вкладку</AlertDialogTitle><AlertDialogDescription>Карточки и история из вкладки «{tabPendingDelete?.name}» сохранятся. Выберите личную вкладку для переноса; по умолчанию выбрана «В работе».</AlertDialogDescription></AlertDialogHeader><label className="grid gap-1 text-[12px] font-medium"><span>Перенести карточки в</span><select value={replacementTabId ?? ""} onChange={(event) => setReplacementTabId(Number(event.target.value))} className="h-10 rounded-[9px] border border-[var(--border-color)] bg-white px-2">{tabs.filter((tab) => tab.id !== tabPendingDelete?.id).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select></label><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void removeTab()} disabled={isSavingTab || replacementTabId === null}>{isSavingTab ? "Удаляем…" : "Удалить вкладку"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {selectedClient ? <ClientDetailDialog client={selectedClient} ownerId={ownerId} activeTab={activeTab} ownerName={ownerName} isAdmin={isAdmin} canEditWorkspace={canEditWorkspace} canManageReminders={canEditWorkspace} canResolveSyncConflicts={isAdmin || canEditWorkspace} onChanged={refreshAfterDetailChange} onClose={() => setSelectedClient(null)} /> : null}
      </div>
    </section>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`relative -mb-px h-9 shrink-0 rounded-t-[10px] border border-b-0 px-3 text-left text-[11px] font-bold transition ${active ? "z-10 border-t-[3px] border-[var(--border-color)] border-t-[var(--brand-yellow)] bg-white text-[var(--text-primary)]" : "border-[#D8E0EA] bg-[#E9EEF5] text-[#526174] hover:bg-[#F6F8FB]"}`}>{label}</button>;
}

function ClientList({ activeTab, clients, tabs, canEditWorkspace, manualOrderEnabled, onColor, onReorder, onMove, onOpenAssignment, onOpenClient }: { activeTab: ActiveTab; clients: CrmWorkspaceClient[]; tabs: CrmTab[]; canEditWorkspace: boolean; manualOrderEnabled: boolean; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onReorder: (clientId: number, insertionIndex: number) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void; onOpenClient: (client: CrmWorkspaceClient) => void }) {
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
    <div className="mt-2 hidden overflow-x-auto lg:block"><table className="min-w-[1040px] table-fixed border-separate border-spacing-0"><thead><tr className="bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">{manualOrderEnabled ? <th className="w-10 border-b border-[var(--border-color)] px-3 py-2 font-semibold"><span className="sr-only">Порядок</span></th> : null}<th className="w-[24%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Компания</th><th className="w-[14%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Контактное лицо</th><th className="w-[19%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Связь</th><th className="w-[12%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Город</th><th className="w-[12%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Статус</th><th className="w-[19%] border-b border-[var(--border-color)] px-3 py-2 font-semibold">Действия</th></tr></thead><tbody>{clients.map((client, index) => <Fragment key={client.id}>{drag?.insertionIndex === index ? <InsertionRow columns={manualOrderEnabled ? 7 : 6} /> : null}<ClientTableRow activeTab={activeTab} client={client} color={activeTab === "primary" ? client.primaryRowPreference?.colorKey ?? null : client.rowPreference?.colorKey ?? null} tabs={tabs} canEditWorkspace={canEditWorkspace} dragControls={dragControlsFor(client)} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} onOpenClient={onOpenClient} /></Fragment>)}{drag?.insertionIndex === clients.length ? <InsertionRow columns={manualOrderEnabled ? 7 : 6} /> : null}</tbody></table></div>
    <div className="mt-2 grid gap-2 lg:hidden">{clients.map((client, index) => <Fragment key={client.id}>{drag?.insertionIndex === index ? <InsertionMarker /> : null}<ClientCard activeTab={activeTab} client={client} color={activeTab === "primary" ? client.primaryRowPreference?.colorKey ?? null : client.rowPreference?.colorKey ?? null} tabs={tabs} canEditWorkspace={canEditWorkspace} dragControls={dragControlsFor(client)} onColor={onColor} onMove={onMove} onOpenAssignment={onOpenAssignment} onOpenClient={onOpenClient} /></Fragment>)}{drag?.insertionIndex === clients.length ? <InsertionMarker /> : null}</div>
  </>;
}

function InsertionRow({ columns }: { columns: number }) { return <tr aria-hidden="true"><td colSpan={columns} className="p-0"><div className="h-1 rounded-full bg-[var(--brand-yellow)]" /></td></tr>; }
function InsertionMarker() { return <div aria-hidden="true" className="h-1 rounded-full bg-[var(--brand-yellow)]" />; }

function ClientTableRow(props: RowProps) { const { client, color } = props; return <tr data-crm-row-id={client.id} style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="text-[10px] text-[var(--text-primary)]">{props.dragControls ? <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><DragHandle client={client} controls={props.dragControls} /></td> : null}<td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><Company client={client} onOpenAssignment={props.onOpenAssignment} /></td><td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><ContactPerson client={client} /></td><td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><Contact client={client} /></td><td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] text-[var(--text-secondary)]"><span className="block truncate">{client.city || "—"}</span></td><td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><Status status={client.syncStatus} /></td><td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px]"><Actions {...props} /></td></tr>; }

function ClientCard(props: RowProps) { const { client, color } = props; return <article data-crm-row-id={client.id} style={color ? { backgroundColor: colorByKey.get(color) } : undefined} className="rounded-[14px] border border-[var(--border-color)] px-3 py-3"><div className="flex items-start justify-between gap-3">{props.dragControls ? <DragHandle client={client} controls={props.dragControls} /> : null}<Company client={client} onOpenAssignment={props.onOpenAssignment} /><Status status={client.syncStatus} /></div><div className="mt-2 grid gap-1.5 text-[11px] text-[var(--text-secondary)]"><ContactPerson client={client} /><Contact client={client} /><span>{client.city || "Город не указан"}</span></div><div className="mt-3"><Actions {...props} /></div></article>; }

type DragControls = { isGrabbed: boolean; onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void; onPointerUp: () => void; onPointerCancel: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void };
type RowProps = { activeTab: ActiveTab; client: CrmWorkspaceClient; color: string | null; tabs: CrmTab[]; canEditWorkspace: boolean; dragControls?: DragControls; onColor: (client: CrmWorkspaceClient, color: string | null) => void; onMove: (client: CrmWorkspaceClient, tabId: number) => void; onOpenAssignment: (tab: ActiveTab) => void; onOpenClient: (client: CrmWorkspaceClient) => void };

function DragHandle({ client, controls }: { client: CrmWorkspaceClient; controls: DragControls }) { return <button type="button" aria-label={`Переместить ${client.documentName || client.name}`} aria-pressed={controls.isGrabbed} aria-describedby="crm-manual-order-help" onPointerDown={controls.onPointerDown} onPointerMove={controls.onPointerMove} onPointerUp={controls.onPointerUp} onPointerCancel={controls.onPointerCancel} onKeyDown={controls.onKeyDown} className="flex size-7 touch-none items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]" title="Переместить">⠿</button>; }

function moveClientInList(clients: CrmWorkspaceClient[], clientId: number, insertionIndex: number) { const sourceIndex = clients.findIndex((client) => client.id === clientId); if (sourceIndex < 0) return clients; const withoutSource = clients.filter((client) => client.id !== clientId); const targetIndex = Math.max(0, Math.min(withoutSource.length, insertionIndex - (sourceIndex < insertionIndex ? 1 : 0))); return [...withoutSource.slice(0, targetIndex), clients[sourceIndex], ...withoutSource.slice(targetIndex)]; }
function insertionIndexForPosition(clients: CrmWorkspaceClient[], clientId: number, desiredIndex: number) { for (let insertionIndex = 0; insertionIndex <= clients.length; insertionIndex += 1) if (moveClientInList(clients, clientId, insertionIndex).findIndex((client) => client.id === clientId) === desiredIndex) return insertionIndex; return 0; }

function Company({ client, onOpenAssignment }: { client: CrmWorkspaceClient; onOpenAssignment: (tab: ActiveTab) => void }) { return <div className="min-w-0"><div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{client.documentName || client.fullName || client.name}</div><div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-[var(--text-secondary)]"><span className="truncate">ИНН {client.inn || "не указан"}</span>{client.linkedCounterpartyId ? <button type="button" onClick={() => onOpenAssignment(client.assignment?.tabId ?? "primary")} className="shrink-0 rounded-full border border-[var(--border-color)] bg-white/75 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-dark)] hover:bg-white">{client.assignment?.tabName || "Без вкладки"}</button> : null}</div></div>; }
function ContactPerson({ client }: { client: CrmWorkspaceClient }) { return <span className={`block truncate ${client.contactPerson ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{client.contactPerson || "—"}</span>; }
function Contact({ client }: { client: CrmWorkspaceClient }) { return <div className="min-w-0 truncate text-[10px] text-[var(--text-secondary)]">{[client.phone, client.email].filter(Boolean).join(" · ") || "Контакты не указаны"}</div>; }
function Status({ status }: { status: CrmWorkspaceClient["syncStatus"] }) { const labels = { synced: "1С", local: "Локальный", pending: "Ожидает отправки", blocked_capability: "Отправка заблокирована", blocked_credentials: "Нужны учётные данные 1С", conflict: "Конфликт", sync_error: "Ошибка", archived: "В архиве" }; const tone = status === "synced" ? "bg-emerald-600 text-white" : status === "pending" ? "bg-amber-500 text-[#312000]" : status === "conflict" || status === "sync_error" || status === "blocked_capability" || status === "blocked_credentials" ? "bg-red-600 text-white" : "bg-slate-700 text-white"; return <span className={`inline-flex rounded-[6px] px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>{labels[status]}</span>; }
function Actions({ client, color, tabs, canEditWorkspace, onColor, onMove, onOpenClient }: RowProps) { const tabActionLabel = client.assignment ? "Переместить…" : "Добавить во вкладку…"; return <div className="flex min-w-max items-center gap-1"><button type="button" onClick={() => onOpenClient(client)} className="h-7 rounded-[6px] border border-[var(--border-color)] bg-white/80 px-2 text-[10px] font-semibold hover:bg-[#F6F8FB]">Открыть</button>{canEditWorkspace ? <><select aria-label={`${client.assignment ? "Переместить" : "Добавить"} ${client.documentName || client.name} во вкладку`} value="" onChange={(event) => { const target = Number(event.target.value); if (target) onMove(client, target); }} className="h-7 max-w-[126px] rounded-[6px] border border-[var(--border-color)] bg-white/80 px-1.5 text-[10px] font-semibold"><option value="">{tabActionLabel}</option>{tabs.filter((tab) => tab.id !== client.assignment?.tabId).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select><details className="relative"><summary className="flex h-7 cursor-pointer list-none items-center rounded-[6px] border border-[var(--border-color)] bg-white/80 px-2 text-[10px] font-semibold">Цвет</summary><div className="absolute right-0 z-10 mt-1 grid w-[184px] grid-cols-4 gap-1 rounded-[10px] border border-[var(--border-color)] bg-white p-2 shadow-[0_12px_28px_rgba(7,22,46,0.16)]"><button type="button" onClick={() => onColor(client, null)} className={`col-span-4 rounded-[6px] px-2 py-1 text-left text-[10px] ${color === null ? "bg-[#F1F5F9] font-bold" : "hover:bg-[#F8FAFC]"}`}>Сбросить цвет</button>{ROW_COLORS.map(([key, label, swatch]) => <button key={key} type="button" onClick={() => onColor(client, key)} aria-label={`Цвет строки: ${label}`} aria-pressed={color === key} title={label} style={{ backgroundColor: swatch }} className="h-7 rounded-[6px] border border-black/5 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]" />)}</div></details></> : null}</div>; }
function LoadingRows() { return <div className="mt-4 space-y-2" aria-label="Загрузка клиентов">{[1, 2, 3, 4].map((row) => <div key={row} className="h-16 animate-pulse rounded-[12px] bg-[#F3F6FA]" />)}</div>; }
function Message({ children, tone }: { children: string; tone: "error" | "success" }) { return <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} className={`mt-3 rounded-[10px] border px-3 py-2 text-[11px] ${tone === "error" ? "border-[#F9D4D4] bg-[#FEF2F2] text-[#B91C1C]" : "border-[#BBE6CA] bg-[#F0FDF4] text-[#166534]"}`}>{children}</div>; }
function ClientDialog({ form, isSaving, onChange, onClose, onSubmit }: { form: ReturnType<typeof emptyClientForm>; isSaving: boolean; onChange: (form: ReturnType<typeof emptyClientForm>) => void; onClose: () => void; onSubmit: (event: SubmitEvent<HTMLFormElement>) => void }) { const update = (key: keyof ReturnType<typeof emptyClientForm>, value: string) => onChange({ ...form, [key]: value }); return <div role="dialog" aria-modal="true" aria-labelledby="crm-new-client-title" className="fixed inset-0 z-50 flex items-end bg-[#07162e]/35 p-2 sm:items-center sm:justify-center sm:p-4"><form onSubmit={onSubmit} className="w-full max-w-[620px] rounded-[22px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)] sm:p-5"><div className="flex items-start justify-between gap-4"><div><h2 id="crm-new-client-title" className="text-[19px] font-bold tracking-[-0.03em]">Новый локальный клиент</h2><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Будет сохранён локально во вкладке «В работе» без отправки в 1С.</p></div><button type="button" onClick={onClose} className="h-8 rounded-[8px] px-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Наименование компании *" value={form.documentName} onChange={(value) => update("documentName", value)} autoFocus /><Field label="Город" value={form.city} onChange={(value) => update("city", value)} /><Field label="Контактное лицо" value={form.contactPerson} onChange={(value) => update("contactPerson", value)} /><Field label="Телефон" value={form.phone} onChange={(value) => update("phone", value)} type="tel" /><Field label="Почта" value={form.email} onChange={(value) => update("email", value)} type="email" /><Field label="Telegram (username, ссылка или номер)" value={form.telegram} onChange={(value) => update("telegram", value)} /><Field label="MAX (ссылка)" value={form.maxLink} onChange={(value) => update("maxLink", value)} /><label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Комментарий</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-10 rounded-[10px] border border-[var(--border-color)] px-3 py-2 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-[11px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Отмена</button><button type="submit" disabled={isSaving} className="app-action-button h-10 rounded-[11px] px-4 text-[12px]">{isSaving ? "Сохраняем…" : "Добавить клиента"}</button></div></form></div>; }

function ReadonlyCompanyRequisites({ client }: { client: CrmWorkspaceClient }) { return <dl className="grid gap-1 text-[11px] text-[var(--text-secondary)]"><div><dt className="font-semibold">Наименование</dt><dd>{client.documentName || "—"}</dd></div><div><dt className="font-semibold">Полное наименование</dt><dd>{client.fullName || "—"}</dd></div><div><dt className="font-semibold">ИНН / КПП</dt><dd>{[client.inn, client.kpp].filter(Boolean).join(" / ") || "—"}</dd></div><div><dt className="font-semibold">Город</dt><dd>{client.city || "—"}</dd></div><div><dt className="font-semibold">Телефон / почта</dt><dd>{[client.phone, client.email].filter(Boolean).join(" / ") || "—"}</dd></div><div><dt className="font-semibold">Мессенджеры</dt><dd><MessengerLinks telegram={client.telegram} maxLink={client.maxLink} className="mt-1" /></dd></div></dl>; }

type ClientDetailDialogProps = CrmClientDetailControllerOptions & { onClose: () => void };

function ClientDetailDialog({ onClose, ...controllerOptions }: ClientDetailDialogProps) {
  const {
    currentClient,
    contacts,
    events,
    reminders,
    audit,
    syncConflicts,
    linkCandidates,
    linkCandidate,
    isLoading,
    error,
    notice,
    isSaving,
    requisitesForm,
    contactForm,
    eventForm,
    reminderDueAt,
    archiveReason,
    isArchiveConfirmationOpen,
    isRemoveAssignmentConfirmationOpen,
    syncConflictResolution,
    ownerName,
    canEditWorkspace,
    canManageReminders,
    canResolveSyncConflicts,
    canManageLocalClient,
    canRemoveAssignment,
    canConfirmExistingLink,
    setRequisitesForm,
    setContactForm,
    setEventForm,
    setReminderDueAt,
    setArchiveReason,
    setIsArchiveConfirmationOpen,
    setIsRemoveAssignmentConfirmationOpen,
    setLinkCandidate,
    setSyncConflictResolution,
    saveContact,
    saveEvent,
    saveReminder,
    transitionReminder,
    rescheduleReminder,
    saveCompanyRequisites,
    archiveLocalClient,
    restoreLocalClient,
    removeAssignment,
    confirmExistingLink,
    resolveSyncConflict,
  } = useCrmClientDetailController(controllerOptions);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="crm-client-detail-title" className="fixed inset-0 z-50 overflow-y-auto bg-[#07162e]/35 p-2 sm:p-5">
      <div className="mx-auto my-3 w-full max-w-5xl rounded-[22px] bg-white p-4 shadow-[0_24px_64px_rgba(7,22,46,0.24)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Карточка клиента</p>
            <h2 id="crm-client-detail-title" className="mt-1 text-[20px] font-bold tracking-[-0.03em]">{currentClient.documentName || currentClient.fullName || currentClient.name}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{[currentClient.city, currentClient.inn ? "ИНН " + currentClient.inn : "", currentClient.website].filter(Boolean).join(" · ") || "Реквизиты не указаны"}</p>
            <MessengerLinks telegram={currentClient.telegram} maxLink={currentClient.maxLink} className="mt-2" />
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button>
        </div>
        {error ? <Message tone="error">{error}</Message> : null}
        {notice ? <Message tone="success">{notice}</Message> : null}
        {isLoading ? <div className="mt-5"><LoadingRows /></div> : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <DetailSection title="Реквизиты компании">
              {canEditWorkspace ? <form onSubmit={saveCompanyRequisites} className="grid gap-2">
                <Field label="Наименование компании *" value={requisitesForm.documentName} onChange={(documentName) => setRequisitesForm((form) => ({ ...form, documentName }))} />
                <Field label="Полное наименование" value={requisitesForm.fullName} onChange={(fullName) => setRequisitesForm((form) => ({ ...form, fullName }))} />
                <div className="grid grid-cols-2 gap-2"><Field label="ИНН" value={requisitesForm.inn} onChange={(inn) => setRequisitesForm((form) => ({ ...form, inn }))} /><Field label="КПП" value={requisitesForm.kpp} onChange={(kpp) => setRequisitesForm((form) => ({ ...form, kpp }))} /></div>
                <Field label="Город" value={requisitesForm.city} onChange={(city) => setRequisitesForm((form) => ({ ...form, city }))} />
                <Field label="Общий телефон компании" value={requisitesForm.phone} onChange={(phone) => setRequisitesForm((form) => ({ ...form, phone }))} type="tel" />
                <Field label="Общая почта компании" value={requisitesForm.email} onChange={(email) => setRequisitesForm((form) => ({ ...form, email }))} type="email" />
                <Field label="Telegram (username, ссылка или номер)" value={requisitesForm.telegram || ""} onChange={(telegram) => setRequisitesForm((form) => ({ ...form, telegram }))} />
                <Field label="MAX (ссылка)" value={requisitesForm.maxLink || ""} onChange={(maxLink) => setRequisitesForm((form) => ({ ...form, maxLink }))} />
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "requisites" ? "Сохраняем…" : "Сохранить реквизиты"}</button>
              </form> : <ReadonlyCompanyRequisites client={currentClient} />}
            </DetailSection>
            <DetailSection title="Контакты">
              {canEditWorkspace ? <form onSubmit={saveContact} className="grid gap-2">
                <Field label="Имя *" value={contactForm.name} onChange={(name) => setContactForm((form) => ({ ...form, name }))} />
                <Field label="Телефон" value={contactForm.phone} onChange={(phone) => setContactForm((form) => ({ ...form, phone }))} type="tel" />
                <Field label="Почта" value={contactForm.email} onChange={(email) => setContactForm((form) => ({ ...form, email }))} type="email" />
                <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" checked={contactForm.isPrimary} onChange={(event) => setContactForm((form) => ({ ...form, isPrimary: event.target.checked }))} />Основной контакт</label>
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "contact" ? "Сохраняем…" : "Добавить контакт"}</button>
              </form> : <p className="text-[11px] text-[var(--text-secondary)]">Контакты доступны только для просмотра.</p>}
              <DetailEmpty items={contacts} empty="Контактов пока нет." render={(contact) => <div key={contact.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{contact.name}{contact.isPrimary ? " · основной" : ""}</div><div className="mt-0.5 text-[var(--text-secondary)]">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "Контакты не указаны"}</div></div>} />
            </DetailSection>
            <DetailSection title="История">
              {canEditWorkspace ? <form onSubmit={saveEvent} className="grid gap-2">
                <select value={eventForm.kind} onChange={(event) => setEventForm((form) => ({ ...form, kind: event.target.value }))} className="h-9 rounded-[9px] border border-[var(--border-color)] px-2 text-[11px]"><option value="comment">Комментарий</option><option value="call">Звонок</option><option value="meeting">Встреча</option><option value="email">Письмо</option></select>
                <textarea value={eventForm.body} onChange={(event) => setEventForm((form) => ({ ...form, body: event.target.value }))} placeholder="Что произошло?" className="min-h-20 rounded-[9px] border border-[var(--border-color)] px-2 py-2 text-[11px] outline-none focus:border-[var(--brand-yellow)]" />
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "event" ? "Сохраняем…" : "Добавить событие"}</button>
              </form> : <p className="text-[11px] text-[var(--text-secondary)]">История доступна только для просмотра.</p>}
              <DetailEmpty items={events} empty="История пока пуста." render={(item) => <div key={item.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{eventLabel(item.kind)} · {formatDate(item.createdAt)}</div><div className="mt-0.5 text-[var(--text-secondary)]">{item.body}</div></div>} />
            </DetailSection>
            <DetailSection title="Напоминания">
              {canManageReminders ? <form onSubmit={saveReminder} className="grid gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]"><span>Дата и время (МСК)</span><input type="datetime-local" value={reminderDueAt} onChange={(event) => setReminderDueAt(event.target.value)} className="h-9 rounded-[9px] border border-[var(--border-color)] px-2 text-[11px] font-normal" /></label>
                <button type="submit" disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "reminder" ? "Сохраняем…" : "Добавить напоминание"}</button>
              </form> : <p className="text-[11px] text-[var(--text-secondary)]">Напоминания доступны только для просмотра.</p>}
              <DetailEmpty items={reminders} empty="Активных напоминаний нет." render={(reminder) => <div key={reminder.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{formatMoscowDate(reminder.dueAt)} МСК</div><div className="mt-0.5 text-[var(--text-secondary)]">{reminder.status === "active" ? "Активно" : reminder.status}</div>{canManageReminders && reminder.status === "active" ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => { const nextDueAt = window.prompt("Новая дата и время (МСК)", utcToMoscowInput(reminder.dueAt)); if (nextDueAt) void rescheduleReminder(reminder, nextDueAt); }} disabled={isSaving !== null} className="h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold">Перенести</button><button type="button" onClick={() => void transitionReminder(reminder, "complete")} disabled={isSaving !== null} className="h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold">{isSaving === "complete-reminder" ? "Отмечаем…" : "Выполнено"}</button><button type="button" onClick={() => void transitionReminder(reminder, "cancel")} disabled={isSaving !== null} className="h-8 rounded-[8px] border border-[#F0D98A] bg-[#FFF9E8] px-2 text-[10px] font-semibold text-[#92400E]">{isSaving === "cancel-reminder" ? "Отменяем…" : "Отменить"}</button></div> : null}</div>} />
            </DetailSection>
            {canConfirmExistingLink ? (
              <DetailSection title="Найденные в 1С совпадения">
                <p className="text-[11px] text-[var(--text-secondary)]">Показаны только локально импортированные точные совпадения по ИНН и КПП. Связь не создаётся без подтверждения.</p>
                <DetailEmpty items={linkCandidates} empty="Точных совпадений пока нет." render={(candidate) => <div key={candidate.id} className="rounded-[9px] bg-[#F7F9FC] px-2.5 py-2 text-[11px]"><div className="font-semibold">{candidate.name}</div><div className="mt-0.5 text-[var(--text-secondary)]">ИНН {candidate.inn}{candidate.kpp ? " · КПП " + candidate.kpp : ""}</div><button type="button" onClick={() => setLinkCandidate(candidate)} disabled={isSaving !== null} className="mt-2 h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold hover:bg-[#F6F8FB]">Проверить и подтвердить</button></div>} />
                {linkCandidate ? <div role="alertdialog" aria-label="Подтверждение связи с 1С" className="grid gap-2 rounded-[10px] border border-[#F0D98A] bg-[#FFF9E8] p-3 text-[11px]"><p>Связать «{currentClient.documentName || currentClient.name}» с контрагентом 1С «{linkCandidate.name}»?</p><dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] text-[var(--text-secondary)]"><dt>ИНН</dt><dd>{linkCandidate.inn}</dd>{linkCandidate.kpp ? <><dt>КПП</dt><dd>{linkCandidate.kpp}</dd></> : null}<dt>Ключ 1С</dt><dd>{linkCandidate.onecKey}</dd></dl><div className="flex gap-2"><button type="button" onClick={() => setLinkCandidate(null)} className="h-8 rounded-[8px] px-2 font-semibold text-[var(--text-secondary)]">Отмена</button><button type="button" onClick={() => void confirmExistingLink()} disabled={isSaving !== null} className="app-action-button h-8 rounded-[8px] px-3 text-[11px]">{isSaving === "link" ? "Связываем…" : "Подтвердить связь с 1С"}</button></div></div> : null}
              </DetailSection>
            ) : null}
            <DetailSection title="Конфликты синхронизации">
              <DetailEmpty items={syncConflicts} empty="Открытых конфликтов синхронизации нет." render={(conflict) => <div key={conflict.id} className="rounded-[9px] bg-[#FFF9E8] px-2.5 py-2 text-[11px]"><div className="font-semibold">{syncConflictFieldLabel(conflict.fieldName)}</div><div className="mt-1 grid gap-1 text-[var(--text-secondary)]"><span><strong className="text-[var(--text-primary)]">CRM:</strong> {formatSyncConflictValue(conflict.localValue)}</span><span><strong className="text-[var(--text-primary)]">1С:</strong> {formatSyncConflictValue(conflict.remoteValue)}</span></div>{canResolveSyncConflicts ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setSyncConflictResolution({ conflict, choice: "local" })} disabled={isSaving !== null} className="h-8 rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-semibold">Оставить локальное</button><button type="button" onClick={() => setSyncConflictResolution({ conflict, choice: "remote" })} disabled={isSaving !== null} className="app-action-button h-8 rounded-[8px] px-2 text-[10px]">Принять из 1С</button></div> : null}</div>} />
              <AlertDialog open={syncConflictResolution !== null} onOpenChange={(open) => { if (!open) setSyncConflictResolution(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Подтверждение разрешения конфликта</AlertDialogTitle><AlertDialogDescription>{syncConflictResolution ? <>Разрешить только этот конфликт клиента «{currentClient.documentName || currentClient.name}» по полю «{syncConflictFieldLabel(syncConflictResolution.conflict.fieldName)}», выбрав значение «{formatSyncConflictValue(syncConflictResolution.choice === "local" ? syncConflictResolution.conflict.localValue : syncConflictResolution.conflict.remoteValue)}»? Выбор необратимо разрешит этот открытый конфликт для текущей карточки.</> : null}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void resolveSyncConflict()} disabled={isSaving !== null}>{isSaving === "resolve" ? "Разрешаем…" : "Подтвердить"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </DetailSection>
            {canManageLocalClient ? <DetailSection title="Административные действия"><p className="text-[11px] text-[var(--text-secondary)]">CRM сотрудника: {ownerName}</p>{currentClient.syncStatus === "archived" ? <button type="button" onClick={() => void restoreLocalClient()} disabled={isSaving !== null} className="app-action-button h-9 rounded-[9px] px-3 text-[11px]">{isSaving === "restore" ? "Восстанавливаем…" : "Восстановить локального клиента"}</button> : <><button type="button" onClick={() => setIsArchiveConfirmationOpen(true)} disabled={isSaving !== null} className="h-9 rounded-[9px] border border-transparent bg-[#B91C1C] px-3 text-[11px] font-semibold text-white">Архивировать локального клиента</button>{isArchiveConfirmationOpen ? <div role="alertdialog" aria-label="Подтверждение архивации" className="grid gap-2 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] p-3 text-[11px]"><p>Подтвердите архивирование «{currentClient.documentName || currentClient.name}» в CRM сотрудника «{ownerName}». Активные напоминания будут отменены, история сохранится.</p><label className="grid gap-1"><span className="font-semibold">Причина</span><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} className="min-h-16 rounded-[8px] border border-[#F4B9B9] bg-white px-2 py-1.5" /></label><div className="flex gap-2"><button type="button" onClick={() => setIsArchiveConfirmationOpen(false)} className="h-8 rounded-[8px] px-2 font-semibold text-[var(--text-secondary)]">Отмена</button><button type="button" onClick={() => void archiveLocalClient()} disabled={isSaving !== null} className="h-8 rounded-[8px] bg-[#B91C1C] px-3 font-semibold text-white">{isSaving === "archive" ? "Архивируем…" : "Подтвердить архивирование"}</button></div></div> : null}</>}</DetailSection> : null}
            {canRemoveAssignment ? <DetailSection title="Административные действия"><p className="text-[11px] text-[var(--text-secondary)]">CRM сотрудника: {ownerName}</p><button type="button" onClick={() => setIsRemoveAssignmentConfirmationOpen(true)} disabled={isSaving !== null} className="app-action-button h-9 whitespace-nowrap rounded-[9px] px-3 text-[11px]">Вернуть в Клиенты 1С</button><AlertDialog open={isRemoveAssignmentConfirmationOpen} onOpenChange={setIsRemoveAssignmentConfirmationOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Подтверждение удаления из личной вкладки</AlertDialogTitle><AlertDialogDescription>Оставить «{currentClient.documentName || currentClient.name}» только в основной вкладке «Клиенты 1С» CRM сотрудника «{ownerName}»? Карточка останется в основной вкладке «Клиенты 1С», а история и напоминания сохранятся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void removeAssignment()} disabled={isSaving !== null}>{isSaving === "remove" ? "Удаляем…" : "Подтвердить"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DetailSection> : null}
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
function formatMoscowDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }); }
function utcToMoscowInput(value: string) { const date = new Date(value); return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T"); }
function Field({ label, value, onChange, type = "text", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean }) { return <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"><span>{label}</span><input autoFocus={autoFocus} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label>; }
function errorMessage(cause: unknown, fallback: string) { return cause instanceof Error && cause.message.trim() ? cause.message : fallback; }
