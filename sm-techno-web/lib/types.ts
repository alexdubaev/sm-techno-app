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

export type StockCatalogResponse = {
  items: StockItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
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
  databasePath: string;
};

export type AppUser = {
  id: number;
  username: string;
  role: "admin" | "user";
  fullName: string;
  appPassword?: string;
  onecUsername: string;
  onecPassword?: string;
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

export type Counterparty = {
  id: number;
  onecKey: string;
  name: string;
  fullName: string;
  inn: string;
  kpp: string;
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
