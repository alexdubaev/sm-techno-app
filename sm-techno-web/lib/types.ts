export type WarehouseBalance = {
  warehouseId: number;
  warehouseName: string;
  quantity: number;
  rack: string;
  cell: string;
  locationLabel: string;
  updatedAt?: string;
};

export type Warehouse = {
  id: number;
  name: string;
  externalCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockItem = {
  id: number;
  sku: string;
  name: string;
  printName: string;
  categoryName: string;
  groupName: string;
  createdAt: string;
  quantity: number;
  price: number;
  onecKey: string;
  unitKey: string;
  unitName: string;
  hasStock: boolean;
  isLinkedToOneC: boolean;
  warehouseCount: number;
  topWarehouseName: string;
  warehouseSummary: string;
  catalogRowKey: string;
  rowWarehouseId: number | null;
  rowWarehouseName: string;
  rowQuantity: number;
  rowRack: string;
  rowCell: string;
  rowLocationLabel: string;
  warehouses: WarehouseBalance[];
};

export type StockSortOrder = "newest" | "oldest";

export type StockCatalogResponse = {
  items: StockItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  groups: string[];
  summary: {
    catalog_count: number;
    filtered_count: number;
    filtered_quantity: number;
  };
};

export type AppMeta = {
  appTitle: string;
  priceLoaded: boolean;
  catalogCount: number;
};

export type AppUser = {
  id: number;
  username: string;
  role: "admin" | "user";
  fullName: string;
  onecUsername: string;
  hasOnecPassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DraftLine = {
  lineId: string;
  itemId: number;
  sku: string;
  name: string;
  categoryName: string;
  price: number;
  quantity: number;
  available: number;
  warehouseId: number;
  warehouseName: string;
  rack: string;
  cell: string;
  locationLabel: string;
  availableOnWarehouse: number;
};

export type CommercialOfferDraftLine = {
  lineId: string;
  itemId: number;
  article: string;
  name: string;
  brand: string;
  qty: number;
  priceVat: number;
  deliveryTime: string;
  note: string;
  warehouseId: number | null;
  warehouseName: string;
};

export type Counterparty = {
  id: number;
  onecKey: string;
  name: string;
  fullName: string;
  inn: string;
  kpp: string;
};

export type CrmClient = {
  source: "onec" | "local";
  id: number;
  counterpartyId: number | null;
  crmClientId: number | null;
  legalType: "legal_entity" | "individual_entrepreneur";
  name: string;
  documentName: string;
  fullName: string;
  inn: string;
  kpp: string;
  isBuyer: boolean;
  isSupplier: boolean;
  isInactive: boolean;
  bankNameOrBik: string;
  bankName: string;
  bankBik: string;
  bankAccount: string;
  correspondentAccount: string;
  contactPerson: string;
  email: string;
  emailNote: string;
  phone: string;
  phoneNote: string;
  legalAddress: string;
  actualAddress: string;
  ogrn: string;
  signerPosition: string;
  signerName: string;
  signerBasis: string;
  notes: string;
  syncStatus: "local" | "synced" | "sync_error";
  syncError: string;
  onecSyncedAt: string;
  isLinkedToOneC: boolean;
};

export type CrmTab = {
  id: number;
  name: string;
  systemKind: "work" | "custom";
  sortOrder: number;
};

export type CrmAssignment = {
  id: number;
  tabId: number;
  tabName: string;
  archivedAt: string | null;
};

export type CrmWorkspaceClient = {
  id: number;
  version: number;
  name: string;
  documentName: string;
  fullName: string;
  inn: string;
  kpp: string;
  city: string;
  website: string;
  email: string;
  phone: string;
  notes: string;
  linkedCounterpartyId: number | null;
  syncStatus: "local" | "synced" | "sync_error" | "pending" | "blocked_capability" | "archived";
  syncError: string;
  createdAt: string;
  updatedAt: string;
  assignment: CrmAssignment | null;
  rowPreference?: CrmRowPreference | null;
};

export type CrmLinkCandidate = {
  id: number;
  onecKey: string;
  name: string;
  inn: string;
  kpp: string;
};

export type CrmRowPreference = {
  tabId: number;
  clientId: number;
  colorKey: string | null;
  position: number;
  orderVersion: number;
};

export type CrmContact = {
  id: number;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmEvent = {
  id: number;
  kind: string;
  body: string;
  authorUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmAuditAction = {
  id: number;
  actorUserId: number;
  ownerUserId: number;
  clientId: number;
  action: string;
  reason: string;
  createdAt: string;
};

export type CrmReminder = {
  id: number;
  clientId: number;
  dueAt: string;
  status: string;
  createdAt: string;
};

export type Contract = {
  id: number;
  onecKey: string;
  counterpartyKey: string;
  organizationKey: string;
  name: string;
  contractNumber: string;
};

export type Organization = {
  id: number;
  onecKey: string;
  name: string;
  inn: string;
  kpp: string;
};

export type CommercialOffer = {
  id: number;
  number: string;
  clientSource: "onec" | "local";
  counterpartyId: number | null;
  crmClientId: number | null;
  clientName: string;
  offerDate: string;
  status: string;
  sentAt: string;
  sentTo: string;
  sourceFilename: string;
  notes: string;
  lineCount: number;
  totalAmount: number;
  createdByName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
  hasSourceFile: boolean;
};

export type GeneratedDocument = {
  id: number;
  documentType: "contract" | "specification";
  number: string;
  clientSource: "onec" | "local";
  counterpartyId: number | null;
  crmClientId: number | null;
  commercialOfferId: number | null;
  clientName: string;
  documentDate: string;
  status: string;
  notes: string;
  missingFields: string[];
  createdByName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type CommercialOfferLine = {
  id: number;
  offerId: number;
  rowNo: number;
  itemId: number | null;
  article: string;
  name: string;
  brand: string;
  qty: number;
  priceVat: number;
  amountVat: number;
  deliveryTime: string;
  note: string;
  warehouseId: number | null;
  warehouseName: string;
};

export type CommercialOfferDetails = {
  offer: CommercialOffer;
  lines: CommercialOfferLine[];
};

export type OrderHistoryItem = {
  id: number;
  localNumber: string;
  orderDate: string;
  status: string;
  onecNumber: string;
  onecDate: string;
  totalAmount: number;
  errorMessage: string;
  counterpartyName: string;
  createdByName: string;
  createdByUsername: string;
  warehouseSummary: string;
};

export type OrderDetailLine = {
  id: number;
  itemId: number;
  quantity: number;
  price: number;
  amount: number;
  onecKey: string;
  sku: string;
  name: string;
  printName: string;
  categoryName: string;
  groupName: string;
  unitKey: string;
  unitName: string;
  warehouseId: number | null;
  warehouseName: string;
  rack: string;
  cell: string;
  locationLabel: string;
  availableQuantity: number;
};

export type OrderDetails = {
  order: OrderHistoryItem & {
    counterpartyId: number;
    contractId: number | null;
    organizationKey: string;
    organizationName: string;
    counterpartyOnecKey: string;
    counterpartyFullName: string;
    contractOnecKey: string;
    contractName: string;
    comment: string;
    onecRefKey: string;
    createdAt: string;
    updatedAt: string;
  };
  lines: OrderDetailLine[];
};

export type SystemSettings = {
  base_url: string;
  username: string;
  password: string;
  default_organization_key: string;
  sale_operation: string;
  currency_key: string;
  order_type_key: string;
  order_type_type: string;
  price_type_key: string;
  order_state_key: string;
  order_state_type: string;
  sale_unit_key: string;
  reserve_unit_key: string;
  business_operation_key: string;
  vat_rate_key: string;
  vat_percent: string;
  vat_included: string;
  sum_includes_vat: string;
  unit_type: string;
};
