import type {
  AppMeta,
  AppUser,
  CommercialOffer,
  CommercialOfferDetails,
  CommercialOfferDraftLine,
  Contract,
  Counterparty,
  CrmAssignment,
  CrmAuditAction,
  CrmContact,
  CrmEvent,
  CrmImportPreview,
  CrmImportResult,
  CrmLinkCandidate,
  CrmPrimaryListResponse,
  CrmPrimaryRowPreference,
  CrmReminder,
  CrmClient,
  CrmRowPreference,
  CrmSyncConflict,
  CrmTab,
  CrmWorkspaceClient,
  GeneratedDocument,
  OrderDetails,
  OrderHistoryItem,
  Organization,
  StockCatalogResponse,
  StockSortOrder,
  StockItem,
  SystemSettings,
  Warehouse,
} from "@/lib/types";
import { loadAuthTokenFromStorage } from "@/lib/storage";


export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

const transientResponseStatuses = new Set([502, 503, 504]);
const retryDelaysMs = [500, 1500];
const REQUEST_TIMEOUT_MS = 15_000;
const CRM_SYNC_TIMEOUT_MS = 90_000;

type FetchRetryOptions = {
  retryTransient?: boolean;
  timeoutMs?: number;
};

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  { retryTransient = false, timeoutMs = REQUEST_TIMEOUT_MS }: FetchRetryOptions = {},
): Promise<Response> {
  const requestGeneration = cacheGeneration;
  const isSafeGet = (init?.method ?? "GET").toUpperCase() === "GET";
  const maxAttempts = retryTransient && isSafeGet ? retryDelaysMs.length + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(input, { ...init, signal });
      if (
        retryTransient &&
        transientResponseStatuses.has(response.status) &&
        attempt < maxAttempts - 1
      ) {
        await waitForRetry(retryDelaysMs[attempt]);
        continue;
      }

      responseGenerations.set(response, requestGeneration);
      return response;
    } catch (error: unknown) {
      if (timedOut) {
        throw new ApiRequestError("Время ожидания ответа сервера истекло. Повторите попытку.", 0);
      }

      if (attempt >= maxAttempts - 1 || (error instanceof Error && error.name === "AbortError")) {
        throw error;
      }

      await waitForRetry(retryDelaysMs[attempt]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error("Сетевой запрос не выполнен.");
}

const GET_CACHE_TTL_MS = 30_000;

type GetCacheEntry = {
  expiresAt: number;
  data: unknown;
};

// Клиентский кэш GET-запросов: повторные переходы между разделами не
// перезакачивают одни и те же списки. Любая мутация и ответ 401 сбрасывают
// кэш целиком. Существует только в браузере, на сервере кэширование выключено.
const getCache = new Map<string, GetCacheEntry>();
const inflightGetRequests = new Map<string, Promise<unknown>>();
const responseGenerations = new WeakMap<Response, number>();
let cacheGeneration = 0;

export function invalidateApiCache() {
  cacheGeneration += 1;
  getCache.clear();
  inflightGetRequests.clear();
}

function canCacheGet(path: string) {
  return typeof window !== "undefined" && !path.startsWith("/api/auth/");
}

function readGetCache<T>(url: string): T | undefined {
  const entry = getCache.get(url);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    getCache.delete(url);
    return undefined;
  }

  return entry.data as T;
}

function createHeaders(existing?: HeadersInit) {
  const headers = new Headers(existing);
  const token = loadAuthTokenFromStorage();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

type LocalItemPayload = {
  sku: string;
  name: string;
  printName: string;
  categoryName: string;
  groupName: string;
  price: number;
  quantity?: number;
  warehouses?: Array<{
    warehouseId?: number | null;
    warehouseName: string;
    quantity: number;
    rack?: string;
    cell?: string;
  }>;
};

export type SendOrderPayload = {
  onecUsername?: string;
  onecPassword?: string;
  counterpartyId: number;
  contractId: number | null;
  organizationKey: string;
  orderDate: string;
  comment: string;
  draftLines: Array<{
    itemId: number;
    warehouseId: number;
    quantity: number;
    price: number;
  }>;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: AppUser;
};

export type AppUserPayload = {
  username: string;
  password: string;
  appPassword: string;
  fullName: string;
  role: "admin" | "user";
  onecUsername: string;
  onecPassword: string;
};

export type AppUserUpdatePayload = {
  fullName: string;
  appPassword?: string;
  role: "admin" | "user";
  isActive: boolean;
  onecUsername: string;
  onecPassword?: string;
};

export type CreateClientPayload = {
  legalType: "legal_entity" | "individual_entrepreneur";
  documentName: string;
  fullName: string;
  inn: string;
  kpp: string;
  isBuyer: boolean;
  isSupplier: boolean;
  isInactive: boolean;
  bankNameOrBik: string;
  bankName?: string;
  bankBik?: string;
  bankAccount: string;
  correspondentAccount?: string;
  contactPerson?: string;
  email?: string;
  emailNote?: string;
  phone?: string;
  phoneNote?: string;
  legalAddress?: string;
  actualAddress?: string;
  ogrn?: string;
  signerPosition?: string;
  signerName?: string;
  signerBasis?: string;
  notes?: string;
};

export type ClientSyncResult = {
  status: "local" | "synced" | "sync_error";
  message: string;
  onecRefKey?: string;
};

export type CreateClientResponse = {
  client: CrmClient;
  sync: ClientSyncResult;
};

export type CrmCreateClientPayload = {
  documentName: string;
  fullName?: string;
  inn?: string;
  kpp?: string;
  city?: string;
  website?: string;
  email?: string;
  phone?: string;
  telegram?: string;
  maxLink?: string;
  notes?: string;
  contactPerson?: string;
  legalType?: "legal_entity" | "individual_entrepreneur";
};

export type CrmClientsQuery = {
  ownerId?: number;
  tabId?: number;
  primaryOnly?: boolean;
};

type CrmImportPayload = {
  file: File;
  ownerId?: number;
  targetTabId?: number | null;
  newTabName?: string | null;
  includeExistingClients?: boolean;
};

export type ResolveCrmSyncConflictPayload = {
  choice: "local" | "remote";
  expectedUpdatedAt: string;
};

export type CreateCommercialOfferPayload = {
  clientSource: "onec" | "local" | "manual";
  clientId?: number | null;
  clientName: string;
  notes?: string;
  lines: CommercialOfferDraftLine[];
};

export type CreateDocumentPayload = {
  documentType: "contract" | "specification";
  number: string;
  documentDate: string;
  clientSource: "onec" | "local";
  clientId: number;
  commercialOfferId?: number | null;
  correspondentAccount?: string;
  signerPosition?: string;
  notes?: string;
};

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string" && data.detail.trim()) {
        message = data.detail.trim();
      }
    } catch {
      // Keep fallback if the response body is not JSON.
    }

    const responseGeneration = responseGenerations.get(response) ?? cacheGeneration;
    if (
      response.status === 401
      && responseGeneration === cacheGeneration
      && typeof window !== "undefined"
    ) {
      getCache.clear();
      inflightGetRequests.clear();
      window.dispatchEvent(new CustomEvent("sm-techno-auth-expired"));
    }

    throw new ApiRequestError(message, response.status);
  }

  return (await response.json()) as T;
}

type GetRequestOptions = { bypassCache?: boolean };

async function requestJson<T>(path: string, { bypassCache = false }: GetRequestOptions = {}): Promise<T> {
  const url = buildApiUrl(path);
  const requestGeneration = cacheGeneration;

  if (!bypassCache && canCacheGet(path)) {
    const cached = readGetCache<T>(url);
    if (cached !== undefined) {
      return cached;
    }

    const inflight = inflightGetRequests.get(url) as Promise<T> | undefined;
    if (inflight) {
      return inflight;
    }

    const request: Promise<T> = (async () => {
      const response = await fetchWithRetry(
        url,
        { cache: "no-store", headers: createHeaders() },
        { retryTransient: true },
      );
      const data = await parseJsonResponse<T>(response, `Ошибка API ${response.status}`);
      if (requestGeneration === cacheGeneration) {
        getCache.set(url, { expiresAt: Date.now() + GET_CACHE_TTL_MS, data });
      }
      return data;
    })().finally(() => {
      if (inflightGetRequests.get(url) === request) {
        inflightGetRequests.delete(url);
      }
    });

    inflightGetRequests.set(url, request);
    return request;
  }

  const response = await fetchWithRetry(
    url,
    { cache: "no-store", headers: createHeaders() },
    { retryTransient: true },
  );

  return parseJsonResponse<T>(response, `Ошибка API ${response.status}`);
}

async function requestJsonWithInit<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options?: FetchRetryOptions,
): Promise<T> {
  const response = await fetchWithRetry(buildApiUrl(path), {
    cache: "no-store",
    ...init,
    headers: createHeaders(init.headers),
  }, options);

  const data = await parseJsonResponse<T>(response, fallbackMessage);

  if ((init.method ?? "GET").toUpperCase() !== "GET") {
    invalidateApiCache();
  }

  return data;
}

export function buildApiUrl(path: string) {
  // The browser always uses the published Sites origin. The server-side route
  // forwards /api/* requests to the private application server, so an external
  // device never needs direct access to its Tailscale address.
  return path;
}

function buildClientPriceFilename() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  return `cmteh_stock_${day}.${month}.${year}.xlsx`;
}

function parseDownloadFilename(contentDisposition: string | null, fallbackFilename: string) {
  if (!contentDisposition) {
    return fallbackFilename;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackFilename;
}

async function downloadApiFile(path: string, fallbackMessage: string, fallbackFilename: string) {
  const response = await fetchWithRetry(buildApiUrl(path), {
    cache: "no-store",
    headers: createHeaders(),
  }, { retryTransient: true });

  if (!response.ok) {
    await parseJsonResponse<never>(response, fallbackMessage);
  }

  const blob = await response.blob();
  const filename = parseDownloadFilename(
    response.headers.get("Content-Disposition"),
    fallbackFilename,
  );
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function loginAppUser(payload: LoginPayload): Promise<LoginResponse> {
  return requestJsonWithInit<LoginResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось выполнить вход.",
    { retryTransient: true },
  );
}

export async function fetchCurrentUser(): Promise<AppUser> {
  const response = await requestJson<{ user: AppUser }>("/api/auth/me");
  return response.user;
}

export async function logoutAppUser(): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    "/api/auth/logout",
    {
      method: "POST",
    },
    "Не удалось завершить сессию.",
  );
}

export async function fetchMeta(): Promise<AppMeta> {
  return requestJson<AppMeta>("/api/meta");
}

export async function fetchStockCatalog(params: {
  search: string;
  category: string;
  warehouseId?: number | null;
  onlyInStock: boolean;
  page: number;
  pageSize: number;
  sortOrder?: StockSortOrder;
}): Promise<StockCatalogResponse> {
  const query = new URLSearchParams();

  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.category.trim()) query.set("category", params.category.trim());
  if (params.warehouseId) query.set("warehouse_id", String(params.warehouseId));
  if (params.onlyInStock) query.set("only_in_stock", "true");

  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  query.set("sort_order", params.sortOrder ?? "newest");

  return requestJson<StockCatalogResponse>(`/api/stock/catalog?${query.toString()}`);
}

export async function downloadClientPriceFile(params: {
  search: string;
  category: string;
  warehouseId?: number | null;
  onlyInStock: boolean;
}): Promise<void> {
  const query = new URLSearchParams();

  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.category.trim()) query.set("category", params.category.trim());
  if (params.warehouseId) query.set("warehouse_id", String(params.warehouseId));
  if (params.onlyInStock) query.set("only_in_stock", "true");

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  await downloadApiFile(
    `/api/price/client-export${suffix}`,
    "Не удалось выгрузить прайс для клиента.",
    buildClientPriceFilename(),
  );
}

export async function downloadPriceTemplateFile(): Promise<void> {
  await downloadApiFile(
    "/api/price/template",
    "Не удалось скачать шаблон прайса.",
    "stock_template.xlsx",
  );
}

export async function downloadStockSnapshotFile(): Promise<void> {
  await downloadApiFile(
    "/api/price/snapshot",
    "Не удалось выгрузить текущий срез.",
    "stock_snapshot.xlsx",
  );
}

export async function fetchStockItem(itemId: number): Promise<StockItem | null> {
  const result = await requestJson<{ item: StockItem | null }>(`/api/stock/items/${itemId}`);
  return result.item;
}

export async function addItemStock(
  itemId: number,
  payload: { warehouseId: number; quantity: number; comment?: string },
): Promise<StockItem> {
  const result = await requestJsonWithInit<{ item: StockItem }>(
    `/api/stock/items/${itemId}/add-stock`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось добавить остаток.",
  );
  return result.item;
}

export async function moveItemStock(
  itemId: number,
  payload: { fromWarehouseId: number; toWarehouseId: number; quantity: number; comment?: string },
): Promise<StockItem> {
  const result = await requestJsonWithInit<{ item: StockItem }>(
    `/api/stock/items/${itemId}/move-stock`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось переместить остаток.",
  );
  return result.item;
}

export async function writeoffItemStock(
  itemId: number,
  payload: { warehouseId: number; quantity: number; comment?: string },
): Promise<StockItem> {
  const result = await requestJsonWithInit<{ item: StockItem }>(
    `/api/stock/items/${itemId}/writeoff-stock`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось списать остаток.",
  );
  return result.item;
}

export async function fetchSystemSettings(): Promise<SystemSettings> {
  return requestJson<SystemSettings>("/api/settings/system");
}

export async function saveSystemSettings(payload: Partial<SystemSettings>): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    "/api/settings/system",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить настройки.",
  );
}

export async function fetchUsers(): Promise<AppUser[]> {
  const result = await requestJson<{ items: AppUser[] }>("/api/users");
  return result.items;
}

export async function createAppUser(payload: AppUserPayload): Promise<AppUser> {
  const result = await requestJsonWithInit<{ user: AppUser }>(
    "/api/users",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось создать пользователя.",
  );
  return result.user;
}

export async function updateAppUser(userId: number, payload: AppUserUpdatePayload): Promise<AppUser> {
  const result = await requestJsonWithInit<{ user: AppUser }>(
    `/api/users/${userId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось обновить пользователя.",
  );
  return result.user;
}

export async function deleteAppUser(userId: number): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    `/api/users/${userId}`,
    {
      method: "DELETE",
    },
    "Не удалось удалить пользователя.",
  );
}

export async function testOneCAccess(payload?: {
  onecUsername?: string;
  onecPassword?: string;
}): Promise<{ counterparties: number; organizations: number }> {
  return requestJsonWithInit<{ counterparties: number; organizations: number }>(
    "/api/onec/test",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    },
    "Не удалось проверить доступ к 1С.",
  );
}

export async function syncReferences(payload?: {
  onecUsername?: string;
  onecPassword?: string;
}): Promise<{ counterparties: number; contracts: number; organizations: number }> {
  return requestJsonWithInit<{ counterparties: number; contracts: number; organizations: number }>(
    "/api/references/sync",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    },
    "Не удалось синхронизировать справочники.",
  );
}

export async function fetchCounterparties(): Promise<Counterparty[]> {
  const result = await requestJson<{ items: Counterparty[] }>("/api/references/counterparties");
  return result.items;
}

export async function fetchContracts(counterpartyId?: number | null): Promise<Contract[]> {
  const query = new URLSearchParams();
  if (counterpartyId) {
    query.set("counterparty_id", String(counterpartyId));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const result = await requestJson<{ items: Contract[] }>(`/api/references/contracts${suffix}`);
  return result.items;
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const result = await requestJson<{ items: Organization[] }>("/api/references/organizations");
  return result.items;
}

export async function fetchClients(): Promise<CrmClient[]> {
  const result = await requestJson<{ items: CrmClient[] }>("/api/clients");
  return result.items;
}

export async function createClient(payload: CreateClientPayload): Promise<CreateClientResponse> {
  return requestJsonWithInit<CreateClientResponse>(
    "/api/clients",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить клиента.",
  );
}

function buildCrmQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return suffix;
}

export type CrmSyncStatus = {
  status: "synced" | "error" | "never";
  lastSyncAt: string;
};

export async function fetchCrmSyncStatus(): Promise<CrmSyncStatus> {
  return requestJson<CrmSyncStatus>("/api/crm/sync-status");
}

export async function fetchCrmTabs(ownerId?: number, options?: GetRequestOptions): Promise<CrmTab[]> {
  const result = await requestJson<{ items: CrmTab[] }>(
    `/api/crm/tabs${buildCrmQuery({ ownerId })}`,
    options,
  );
  return result.items;
}

export async function syncCrmWorkspace(): Promise<{ status: string; counterparties: number }> {
  return requestJsonWithInit<{ status: string; counterparties: number }>(
    "/api/crm/sync",
    { method: "POST" },
    "Не удалось обновить CRM из 1С.",
    { timeoutMs: CRM_SYNC_TIMEOUT_MS },
  );
}

export async function createCrmTab(name: string, ownerId?: number): Promise<CrmTab> {
  const result = await requestJsonWithInit<{ tab: CrmTab }>(
    `/api/crm/tabs${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Не удалось создать личную вкладку.",
  );
  return result.tab;
}

export async function renameCrmTab(tabId: number, name: string, ownerId?: number): Promise<CrmTab> {
  const result = await requestJsonWithInit<{ tab: CrmTab }>(
    `/api/crm/tabs/${tabId}${buildCrmQuery({ ownerId })}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Не удалось переименовать личную вкладку.",
  );
  return result.tab;
}

export async function deleteCrmTab(tabId: number, replacementTabId: number, ownerId?: number): Promise<{ ok: true }> {
  return requestJsonWithInit<{ ok: true }>(
    `/api/crm/tabs/${tabId}${buildCrmQuery({ replacementTabId, ownerId })}`,
    { method: "DELETE" },
    "Не удалось удалить личную вкладку.",
  );
}

export async function fetchCrmClients(query: CrmClientsQuery = {}, options?: GetRequestOptions): Promise<CrmWorkspaceClient[]> {
  const result = await requestJson<{ items: CrmWorkspaceClient[] }>(
    `/api/crm/clients${buildCrmQuery(query)}`,
    options,
  );
  return result.items;
}

export async function fetchCrmClient(clientId: number, ownerId: number): Promise<CrmWorkspaceClient> {
  const result = await requestJson<{ client: CrmWorkspaceClient }>(
    `/api/crm/clients/${clientId}${buildCrmQuery({ ownerId })}`,
  );
  return result.client;
}

export async function fetchPrimaryCrmClients(ownerId: number, options?: GetRequestOptions): Promise<CrmPrimaryListResponse> {
  return requestJson<CrmPrimaryListResponse>(
    `/api/crm/clients${buildCrmQuery({ ownerId, primaryOnly: true })}`,
    options,
  );
}

export async function downloadCrmExportFile(params: {
  scope: "all" | "tab";
  tabId?: number;
  ownerId?: number;
}): Promise<void> {
  await downloadApiFile(
    `/api/crm/export${buildCrmQuery({ scope: params.scope, tabId: params.tabId, ownerId: params.ownerId })}`,
    "Не удалось выгрузить CRM в Excel.",
    "crm_export.xlsx",
  );
}

async function postCrmImport<T>(
  path: "/api/crm/import/preview" | "/api/crm/import",
  payload: CrmImportPayload,
  fallbackMessage: string,
): Promise<T> {
  const body = new FormData();
  body.append("file", payload.file);
  if (payload.targetTabId !== undefined && payload.targetTabId !== null) {
    body.append("targetTabId", String(payload.targetTabId));
  }
  if (payload.newTabName !== undefined && payload.newTabName !== null) {
    body.append("newTabName", payload.newTabName);
  }
  body.append("includeExistingClients", String(payload.includeExistingClients ?? true));

  return requestJsonWithInit<T>(
    `${path}${buildCrmQuery({ ownerId: payload.ownerId })}`,
    { method: "POST", body },
    fallbackMessage,
  );
}

export async function previewCrmImport(payload: CrmImportPayload): Promise<CrmImportPreview> {
  return postCrmImport(
    "/api/crm/import/preview",
    payload,
    "Не удалось проверить CRM Excel файл.",
  );
}

export async function importCrmFile(payload: CrmImportPayload): Promise<CrmImportResult> {
  return postCrmImport(
    "/api/crm/import",
    payload,
    "Не удалось импортировать CRM Excel файл.",
  );
}

export async function fetchCrmContacts(clientId: number, ownerId?: number): Promise<CrmContact[]> {
  const result = await requestJson<{ items: CrmContact[] }>(
    `/api/crm/clients/${clientId}/contacts${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function createCrmContact(
  clientId: number,
  payload: { name: string; email: string; phone: string; isPrimary: boolean },
  ownerId?: number,
): Promise<CrmContact> {
  const result = await requestJsonWithInit<{ contact: CrmContact }>(
    `/api/crm/clients/${clientId}/contacts${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось добавить контакт.",
  );
  return result.contact;
}

export async function fetchCrmEvents(clientId: number, ownerId?: number): Promise<CrmEvent[]> {
  const result = await requestJson<{ items: CrmEvent[] }>(
    `/api/crm/clients/${clientId}/events${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function fetchCrmAudit(clientId: number, ownerId?: number): Promise<CrmAuditAction[]> {
  const result = await requestJson<{ items: CrmAuditAction[] }>(
    `/api/crm/clients/${clientId}/audit${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function fetchCrmSyncConflicts(clientId: number, ownerId: number): Promise<CrmSyncConflict[]> {
  const result = await requestJson<{ items: CrmSyncConflict[] }>(
    `/api/crm/clients/${clientId}/sync-conflicts${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function resolveCrmSyncConflict(
  clientId: number,
  conflictId: number,
  payload: ResolveCrmSyncConflictPayload,
  ownerId: number,
): Promise<CrmWorkspaceClient> {
  const result = await requestJsonWithInit<{ client: CrmWorkspaceClient }>(
    `/api/crm/clients/${clientId}/sync-conflicts/${conflictId}/resolve${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось разрешить конфликт синхронизации.",
  );
  return result.client;
}

export async function createCrmEvent(
  clientId: number,
  payload: { kind: string; body: string },
  ownerId?: number,
): Promise<CrmEvent> {
  const result = await requestJsonWithInit<{ event: CrmEvent }>(
    `/api/crm/clients/${clientId}/events${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось добавить событие.",
  );
  return result.event;
}

export async function fetchCrmReminders(ownerId?: number): Promise<CrmReminder[]> {
  const result = await requestJson<{ items: CrmReminder[] }>(
    `/api/crm/reminders${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function createCrmReminder(
  clientId: number,
  payload: { dueAt: string },
  ownerId?: number,
): Promise<CrmReminder> {
  const result = await requestJsonWithInit<{ reminder: CrmReminder }>(
    `/api/crm/clients/${clientId}/reminders${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось добавить напоминание.",
  );
  return result.reminder;
}

export async function rescheduleCrmReminder(reminderId: number, payload: { dueAt: string; expectedUpdatedAt: string }, ownerId?: number): Promise<CrmReminder> {
  const result = await requestJsonWithInit<{ reminder: CrmReminder }>(`/api/crm/reminders/${reminderId}/reschedule${buildCrmQuery({ ownerId })}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "Не удалось перенести напоминание.");
  return result.reminder;
}

export async function fetchCurrentUserDueCrmReminders(): Promise<CrmReminder[]> {
  const result = await requestJson<{ items: CrmReminder[] }>("/api/crm/reminders/due");
  return result.items;
}

async function transitionCrmReminder(
  reminderId: number,
  action: "complete" | "cancel",
  expectedUpdatedAt: string,
  ownerId?: number,
): Promise<CrmReminder> {
  const result = await requestJsonWithInit<{ reminder: CrmReminder }>(
    `/api/crm/reminders/${reminderId}/${action}${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt }),
    },
    action === "complete" ? "Не удалось отметить напоминание выполненным." : "Не удалось отменить напоминание.",
  );
  return result.reminder;
}

export async function completeCrmReminder(reminderId: number, expectedUpdatedAt: string, ownerId?: number): Promise<CrmReminder> {
  return transitionCrmReminder(reminderId, "complete", expectedUpdatedAt, ownerId);
}

export async function cancelCrmReminder(reminderId: number, expectedUpdatedAt: string, ownerId?: number): Promise<CrmReminder> {
  return transitionCrmReminder(reminderId, "cancel", expectedUpdatedAt, ownerId);
}

export async function createCrmClient(
  payload: CrmCreateClientPayload,
  ownerId?: number,
): Promise<CrmWorkspaceClient> {
  const result = await requestJsonWithInit<{ client: CrmWorkspaceClient }>(
    `/api/crm/clients${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось добавить клиента в CRM.",
  );
  return result.client;
}

export async function updateCrmClient(
  clientId: number,
  payload: {
    documentName: string;
    fullName: string;
    inn: string;
    kpp: string;
    city: string;
    email: string;
    phone: string;
    telegram?: string;
    maxLink?: string;
    expectedVersion: number;
  },
  ownerId?: number,
): Promise<CrmWorkspaceClient> {
  const result = await requestJsonWithInit<{ client: CrmWorkspaceClient }>(
    `/api/crm/clients/${clientId}${buildCrmQuery({ ownerId })}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить реквизиты компании.",
  );
  return result.client;
}

export async function fetchCrmLinkCandidates(clientId: number, ownerId?: number): Promise<CrmLinkCandidate[]> {
  const result = await requestJson<{ items: CrmLinkCandidate[] }>(
    `/api/crm/clients/${clientId}/link-candidates${buildCrmQuery({ ownerId })}`,
  );
  return result.items;
}

export async function confirmCrmExistingLink(
  clientId: number,
  counterpartyId: number,
  expectedVersion: number,
  ownerId?: number,
): Promise<CrmWorkspaceClient> {
  const result = await requestJsonWithInit<{ client: CrmWorkspaceClient }>(
    `/api/crm/clients/${clientId}/link-existing${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartyId, expectedVersion }),
    },
    "Не удалось подтвердить связь с 1С.",
  );
  return result.client;
}

export async function moveCrmClient(
  clientId: number,
  tabId: number,
  ownerId?: number,
): Promise<CrmAssignment> {
  const result = await requestJsonWithInit<{ assignment: CrmAssignment }>(
    `/api/crm/clients/${clientId}/move${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId }),
    },
    "Не удалось переместить клиента.",
  );
  return result.assignment;
}

export async function removeCrmAssignment(
  clientId: number,
  ownerId?: number,
): Promise<{ ok: true }> {
  return requestJsonWithInit<{ ok: true }>(
    `/api/crm/clients/${clientId}/assignment${buildCrmQuery({ ownerId })}`,
    { method: "DELETE" },
    "Не удалось оставить клиента только в основной вкладке.",
  );
}

export async function saveCrmRowPreference(
  clientId: number,
  payload: { tabId: number; colorKey: string | null; expectedOrderVersion: number },
  ownerId?: number,
): Promise<CrmRowPreference> {
  const result = await requestJsonWithInit<{ preference: CrmRowPreference }>(
    `/api/crm/clients/${clientId}/row-preference${buildCrmQuery({ ownerId })}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить оформление строки.",
  );
  return result.preference;
}

export async function saveCrmPrimaryRowPreference(
  clientId: number,
  payload: { colorKey: string | null; expectedOrderVersion: number },
  ownerId: number,
): Promise<CrmPrimaryRowPreference> {
  const result = await requestJsonWithInit<{ preference: CrmPrimaryRowPreference }>(
    `/api/crm/clients/${clientId}/primary-row-preference${buildCrmQuery({ ownerId })}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить цвет строки.",
  );
  return result.preference;
}

export async function reorderPrimaryCrmClients(
  payload: {
    clientId: number;
    beforeClientId: number | null;
    afterClientId: number | null;
    expectedOrderVersion: number;
  },
  ownerId: number,
): Promise<{ clientIds: number[]; orderVersion: number }> {
  return requestJsonWithInit<{ clientIds: number[]; orderVersion: number }>(
    `/api/crm/primary/reorder${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить порядок клиентов.",
  );
}

export async function reorderCrmTabClients(
  tabId: number,
  payload: {
    clientId: number;
    beforeClientId: number | null;
    afterClientId: number | null;
    expectedOrderVersion: number;
  },
  ownerId: number,
): Promise<{ clientIds: number[]; orderVersion: number }> {
  return requestJsonWithInit<{ clientIds: number[]; orderVersion: number }>(
    `/api/crm/tabs/${tabId}/reorder${buildCrmQuery({ ownerId })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Не удалось сохранить порядок клиентов.",
  );
}

export async function archiveLocalCrmClient(
  clientId: number,
  payload: { reason: string; expectedVersion: number },
  ownerId?: number,
): Promise<{ version: number }> {
  return requestJsonWithInit<{ ok: true; version: number }>(
    `/api/crm/clients/${clientId}/local-archive${buildCrmQuery({ ownerId })}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "Не удалось архивировать локального клиента.",
  );
}

export async function restoreLocalCrmClient(
  clientId: number,
  payload: { expectedVersion: number },
  ownerId?: number,
): Promise<{ version: number }> {
  return requestJsonWithInit<{ ok: true; version: number }>(
    `/api/crm/clients/${clientId}/local-restore${buildCrmQuery({ ownerId })}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "Не удалось восстановить локального клиента.",
  );
}

export async function sendClientToOneC(clientId: number): Promise<CreateClientResponse> {
  return requestJsonWithInit<CreateClientResponse>(
    `/api/clients/${clientId}/send-to-onec`,
    {
      method: "POST",
    },
    "Не удалось отправить клиента в 1С.",
  );
}

export async function fetchCommercialOffers(): Promise<CommercialOffer[]> {
  const result = await requestJson<{ items: CommercialOffer[] }>("/api/commercial-offers");
  return result.items;
}

export async function fetchCommercialOfferDetails(offerId: number): Promise<CommercialOfferDetails> {
  return requestJson<CommercialOfferDetails>(`/api/commercial-offers/${offerId}`);
}

export async function createCommercialOfferFromDraft(
  payload: CreateCommercialOfferPayload,
): Promise<CommercialOfferDetails> {
  return requestJsonWithInit<CommercialOfferDetails>(
    "/api/commercial-offers/from-draft",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось сформировать КП из черновика.",
  );
}

export async function createCommercialOfferFromExcel(payload: {
  clientSource: "onec" | "local" | "manual";
  clientId?: number | null;
  clientName: string;
  notes?: string;
  file: File;
}): Promise<CommercialOfferDetails> {
  const body = new FormData();
  body.append("clientSource", payload.clientSource);
  if (payload.clientId) {
    body.append("clientId", String(payload.clientId));
  }
  body.append("clientName", payload.clientName);
  body.append("notes", payload.notes ?? "");
  body.append("file", payload.file);

  const response = await fetch(buildApiUrl("/api/commercial-offers/from-excel"), {
    method: "POST",
    body,
    headers: createHeaders(),
  });

  const result = await parseJsonResponse<CommercialOfferDetails>(
    response,
    "Не удалось сформировать КП из Excel.",
  );
  invalidateApiCache();
  return result;
}

export async function markCommercialOfferSent(
  offerId: number,
  payload: { sentTo: string; notes: string },
): Promise<CommercialOfferDetails> {
  return requestJsonWithInit<CommercialOfferDetails>(
    `/api/commercial-offers/${offerId}/mark-sent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось отметить КП отправленным.",
  );
}

export async function deleteCommercialOffer(offerId: number): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    `/api/commercial-offers/${offerId}`,
    {
      method: "DELETE",
    },
    "Не удалось удалить КП.",
  );
}

export async function downloadCommercialOfferFile(
  offerId: number,
  kind: "source" | "output",
): Promise<void> {
  await downloadApiFile(
    `/api/commercial-offers/${offerId}/download/${kind}`,
    "Не удалось скачать файл КП.",
    kind === "source" ? "source.xlsx" : "commercial_offer.xlsx",
  );
}

export async function fetchDocuments(): Promise<GeneratedDocument[]> {
  const result = await requestJson<{ items: GeneratedDocument[] }>("/api/documents");
  return result.items;
}

export async function fetchDocument(documentId: number): Promise<GeneratedDocument> {
  const result = await requestJson<{ document: GeneratedDocument }>(`/api/documents/${documentId}`);
  return result.document;
}

export async function createDocument(payload: CreateDocumentPayload): Promise<GeneratedDocument> {
  const result = await requestJsonWithInit<{ document: GeneratedDocument }>(
    "/api/documents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось сформировать документ.",
  );
  return result.document;
}

export async function downloadDocumentFile(documentId: number): Promise<void> {
  await downloadApiFile(
    `/api/documents/${documentId}/download`,
    "Не удалось скачать документ.",
    "document.docx",
  );
}

export async function deleteDocument(documentId: number): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    `/api/documents/${documentId}`,
    {
      method: "DELETE",
    },
    "Не удалось удалить документ.",
  );
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  const result = await requestJson<{ items: Warehouse[] }>("/api/warehouses");
  return result.items;
}

export async function createWarehouse(payload: {
  name: string;
  externalCode?: string;
}): Promise<Warehouse> {
  const result = await requestJsonWithInit<{ warehouse: Warehouse }>(
    "/api/warehouses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось создать склад.",
  );
  return result.warehouse;
}

export async function deleteWarehouse(warehouseId: number): Promise<{ ok: boolean }> {
  return requestJsonWithInit<{ ok: boolean }>(
    `/api/warehouses/${warehouseId}`,
    {
      method: "DELETE",
    },
    "Не удалось удалить склад.",
  );
}

export async function sendOrderToOneC(payload: SendOrderPayload): Promise<{
  orderId: number;
  order: OrderHistoryItem | null;
  onecDocument: {
    refKey: string;
    number: string;
    date: string;
  };
}> {
  return requestJsonWithInit(
    "/api/orders/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Не удалось отправить заказ в 1С.",
  );
}

export async function fetchOrders(): Promise<OrderHistoryItem[]> {
  const result = await requestJson<{ items: OrderHistoryItem[] }>("/api/orders");
  return result.items;
}

export async function fetchOrderDetails(orderId: number): Promise<OrderDetails> {
  return requestJson<OrderDetails>(`/api/orders/${orderId}`);
}

export async function writeoffOrder(orderId: number): Promise<OrderDetails> {
  return requestJsonWithInit<OrderDetails>(
    `/api/orders/${orderId}/writeoff`,
    {
      method: "POST",
    },
    "Не удалось списать заказ со склада.",
  );
}

export async function importPriceFile(file: File): Promise<{
  created: number;
  updated: number;
  locationUpdated: number;
  locationSkipped: number;
}> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(buildApiUrl("/api/price/import"), {
    method: "POST",
    body,
    headers: createHeaders(),
  });

  const result = await parseJsonResponse<{
    created: number;
    updated: number;
    locationUpdated: number;
    locationSkipped: number;
  }>(
    response,
    "Не удалось импортировать прайс.",
  );
  invalidateApiCache();
  return result;
}

export async function updateItemQuantity(itemId: number, quantity: number): Promise<StockItem | null> {
  const response = await fetch(buildApiUrl(`/api/stock/items/${itemId}/quantity`), {
    method: "POST",
    headers: createHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ quantity }),
  });

  const result = await parseJsonResponse<{ item: StockItem | null }>(response, "Не удалось обновить остаток.");
  invalidateApiCache();
  return result.item;
}

export async function createLocalItem(payload: LocalItemPayload): Promise<StockItem | null> {
  const response = await fetch(buildApiUrl("/api/stock/items"), {
    method: "POST",
    headers: createHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  const result = await parseJsonResponse<{ item: StockItem | null }>(response, "Не удалось создать позицию.");
  invalidateApiCache();
  return result.item;
}

export async function updateLocalItem(itemId: number, payload: LocalItemPayload): Promise<StockItem | null> {
  const response = await fetch(buildApiUrl(`/api/stock/items/${itemId}`), {
    method: "PATCH",
    headers: createHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  const result = await parseJsonResponse<{ item: StockItem | null }>(
    response,
    "Не удалось сохранить изменения по позиции.",
  );
  invalidateApiCache();
  return result.item;
}

export async function deleteItem(itemId: number): Promise<{ deleted: number; hidden: number }> {
  const response = await fetch(buildApiUrl(`/api/stock/items/${itemId}`), {
    method: "DELETE",
    headers: createHeaders(),
  });

  const result = await parseJsonResponse<{ deleted: number; hidden: number }>(response, "Не удалось удалить товар.");
  invalidateApiCache();
  return result;
}

export async function clearCatalog(): Promise<{ deleted: number; hidden: number }> {
  const response = await fetch(buildApiUrl("/api/price/catalog"), {
    method: "DELETE",
    headers: createHeaders(),
  });

  const result = await parseJsonResponse<{ deleted: number; hidden: number }>(response, "Не удалось очистить каталог.");
  invalidateApiCache();
  return result;
}

export type { LocalItemPayload };
