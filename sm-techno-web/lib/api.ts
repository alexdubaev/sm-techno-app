import type {
  AppMeta,
  AppUser,
  CommercialOffer,
  CommercialOfferDetails,
  CommercialOfferDraftLine,
  Contract,
  Counterparty,
  CrmClient,
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

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function getApiBaseUrl() {
  if (configuredApiBaseUrl && configuredApiBaseUrl.length > 0) {
    return configuredApiBaseUrl;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname || "127.0.0.1";
    return `${protocol}//${hostname}:8000`;
  }

  return "http://127.0.0.1:8000";
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

    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sm-techno-auth-expired"));
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    cache: "no-store",
    headers: createHeaders(),
  });

  return parseJsonResponse<T>(response, `Ошибка API ${response.status}`);
}

async function requestJsonWithInit<T>(path: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    cache: "no-store",
    ...init,
    headers: createHeaders(init.headers),
  });

  return parseJsonResponse<T>(response, fallbackMessage);
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
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

  const plainMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackFilename;
}

async function downloadApiFile(path: string, fallbackMessage: string, fallbackFilename: string) {
  const response = await fetch(buildApiUrl(path), {
    cache: "no-store",
    headers: createHeaders(),
  });

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

  return parseJsonResponse<CommercialOfferDetails>(response, "Не удалось сформировать КП из Excel.");
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

  return parseJsonResponse<{
    created: number;
    updated: number;
    locationUpdated: number;
    locationSkipped: number;
  }>(
    response,
    "Не удалось импортировать прайс.",
  );
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
  return result.item;
}

export async function deleteItem(itemId: number): Promise<{ deleted: number; hidden: number }> {
  const response = await fetch(buildApiUrl(`/api/stock/items/${itemId}`), {
    method: "DELETE",
    headers: createHeaders(),
  });

  return parseJsonResponse<{ deleted: number; hidden: number }>(response, "Не удалось удалить товар.");
}

export async function clearCatalog(): Promise<{ deleted: number; hidden: number }> {
  const response = await fetch(buildApiUrl("/api/price/catalog"), {
    method: "DELETE",
    headers: createHeaders(),
  });

  return parseJsonResponse<{ deleted: number; hidden: number }>(response, "Не удалось очистить каталог.");
}

export type { LocalItemPayload };
