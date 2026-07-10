import type { AppUser, CommercialOfferDraftLine, DraftLine } from "@/lib/types";

export const DRAFT_STORAGE_KEY = "sm-techno-current-invoice";
export const STOCK_DRAFT_STORAGE_KEY = "sm-techno-stock-invoice-draft";
export const COMMERCIAL_OFFER_DRAFT_STORAGE_KEY = "sm-techno-commercial-offer-draft";
export const STOCK_PAGE_STATE_KEY = "sm-techno-stock-page-state";
export const INVOICE_FORM_STATE_KEY = "sm-techno-invoice-form-state";
export const AUTH_SESSION_STORAGE_KEY = "sm-techno-auth-session";

export type StoredAuthSession = {
  token: string;
  user: AppUser;
};

export type StockPageViewState = {
  searchInput: string;
  category: string;
  onlyInStock: boolean;
  activeWarehouseId: number | null;
  page: number;
  pageSize: number;
  selectedItemId: number | null;
  selectedCatalogRowKey: string | null;
  selectionCleared: boolean;
  selectedQuantityInput: string;
};

export type InvoiceFormState = {
  counterpartyId: number | null;
  contractId: number | null;
  organizationKey: string;
  orderDate: string;
  comment: string;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function getScopedStorageKey(key: string) {
  if (!canUseStorage()) {
    return key;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return key;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    const userId = parsed.user?.id;
    if (typeof userId === "number" && Number.isFinite(userId)) {
      return `${key}:user:${userId}`;
    }
  } catch {
    // Ignore corrupted auth data and keep the shared key.
  }

  return key;
}

export function loadAuthSessionFromStorage(): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSessionToStorage(session: StoredAuthSession) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSessionFromStorage() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function loadAuthTokenFromStorage(): string {
  return loadAuthSessionFromStorage()?.token ?? "";
}

export function loadDraftLinesFromStorage(): DraftLine[] | null {
  if (!canUseStorage()) {
    return null;
  }

  const saved = window.localStorage.getItem(getScopedStorageKey(DRAFT_STORAGE_KEY));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as DraftLine[];
  } catch {
    window.localStorage.removeItem(getScopedStorageKey(DRAFT_STORAGE_KEY));
    return null;
  }
}

export function saveDraftLinesToStorage(lines: DraftLine[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getScopedStorageKey(DRAFT_STORAGE_KEY), JSON.stringify(lines));
}

export function loadStockDraftLinesFromStorage(): DraftLine[] | null {
  if (!canUseStorage()) {
    return null;
  }

  const saved = window.localStorage.getItem(getScopedStorageKey(STOCK_DRAFT_STORAGE_KEY));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as DraftLine[];
  } catch {
    window.localStorage.removeItem(getScopedStorageKey(STOCK_DRAFT_STORAGE_KEY));
    return null;
  }
}

export function saveStockDraftLinesToStorage(lines: DraftLine[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getScopedStorageKey(STOCK_DRAFT_STORAGE_KEY), JSON.stringify(lines));
}

export function clearStockDraftLinesFromStorage() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(getScopedStorageKey(STOCK_DRAFT_STORAGE_KEY));
}

export function loadCommercialOfferDraftLinesFromStorage(): CommercialOfferDraftLine[] | null {
  if (!canUseStorage()) {
    return null;
  }

  const saved = window.localStorage.getItem(getScopedStorageKey(COMMERCIAL_OFFER_DRAFT_STORAGE_KEY));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as CommercialOfferDraftLine[];
  } catch {
    window.localStorage.removeItem(getScopedStorageKey(COMMERCIAL_OFFER_DRAFT_STORAGE_KEY));
    return null;
  }
}

export function saveCommercialOfferDraftLinesToStorage(lines: CommercialOfferDraftLine[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getScopedStorageKey(COMMERCIAL_OFFER_DRAFT_STORAGE_KEY), JSON.stringify(lines));
}

export function clearCommercialOfferDraftLinesFromStorage() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(getScopedStorageKey(COMMERCIAL_OFFER_DRAFT_STORAGE_KEY));
}

export function loadStockPageStateFromStorage(): Partial<StockPageViewState> | null {
  if (!canUseStorage()) {
    return null;
  }

  const saved = window.localStorage.getItem(getScopedStorageKey(STOCK_PAGE_STATE_KEY));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as Partial<StockPageViewState>;
  } catch {
    window.localStorage.removeItem(getScopedStorageKey(STOCK_PAGE_STATE_KEY));
    return null;
  }
}

export function saveStockPageStateToStorage(state: StockPageViewState) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getScopedStorageKey(STOCK_PAGE_STATE_KEY), JSON.stringify(state));
}

export function loadInvoiceFormStateFromStorage(): Partial<InvoiceFormState> | null {
  if (!canUseStorage()) {
    return null;
  }

  const saved = window.localStorage.getItem(getScopedStorageKey(INVOICE_FORM_STATE_KEY));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as Partial<InvoiceFormState>;
  } catch {
    window.localStorage.removeItem(getScopedStorageKey(INVOICE_FORM_STATE_KEY));
    return null;
  }
}

export function saveInvoiceFormStateToStorage(state: InvoiceFormState) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getScopedStorageKey(INVOICE_FORM_STATE_KEY), JSON.stringify(state));
}

export function clearCurrentUserSessionData() {
  // Reserved for user-scoped volatile data if it appears later.
}
