import type {
  AppMeta,
  AppUser,
  Contract,
  Counterparty,
  OrderDetails,
  OrderHistoryItem,
  Organization,
  StockCatalogResponse,
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
  appPassword: string;
  role: "admin" | "user";
  isActive: boolean;
  onecUsername: string;
  onecPassword: string;
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
}): Promise<StockCatalogResponse> {
  const query = new URLSearchParams();

  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.category.trim()) query.set("category", params.category.trim());
  if (params.warehouseId) query.set("warehouse_id", String(params.warehouseId));
  if (params.onlyInStock) query.set("only_in_stock", "true");

  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));

  return requestJson<StockCatalogResponse>(`/api/stock/catalog?${query.toString()}`);
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

export async function importPriceFile(file: File): Promise<{ created: number; updated: number }> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(buildApiUrl("/api/price/import"), {
    method: "POST",
    body,
    headers: createHeaders(),
  });

  return parseJsonResponse<{ created: number; updated: number }>(
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
