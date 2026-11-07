export type BankClientChoice = {
  id: number;
  name: string;
  inn: string | null;
  kpp: string | null;
};
export type BankAccount = {
  id: number;
  organizationId: number;
  organizationName: string;
  ownerInn: string;
  account: string;
  bik: string;
  currency: string;
  active: boolean;
};
export type BankAccounts = {
  organizations: { id: number; name: string; inn: string | null }[];
  accounts: BankAccount[];
};
export type BankStatus =
  | 'ready'
  | 'client_not_found'
  | 'multiple_clients'
  | 'manager_missing'
  | 'terms_missing'
  | 'possible_duplicate'
  | 'accounted'
  | 'month_closed'
  | 'purpose_review'
  | 'excluded'
  | 'data_error'
  | 'client_archived'
  | 'manager_inactive';
export type BankClassification = 'sale' | 'excluded' | 'review' | 'return';
export type BankOperation = {
  id: number;
  version: number;
  fingerprint: string;
  date: string | null;
  amount: number | null;
  direction: 'credit' | 'debit' | 'invalid';
  documentNumber: string | null;
  payerName: string | null;
  inn: string | null;
  kpp: string | null;
  account: string | null;
  bik: string | null;
  bankName: string | null;
  purpose: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceReferences: {
    number?: string | null;
    date?: string | null;
    text?: string;
  }[];
  clientId: number | null;
  clientName: string | null;
  managerId: number | null;
  managerName: string | null;
  rate: number | null;
  status: BankStatus;
  explanation: string;
  warnings: string[];
  errors: string[];
  classification: BankClassification;
  candidateClients: BankClientChoice[];
  candidateSales: {
    id: number;
    date: string;
    client: string;
    amount: number;
    managerId: number;
    managerName: string;
    source: string;
    invoiceNumber: string | null;
  }[];
  probableDuplicates: {
    id: number;
    date: string;
    documentNumber: string | null;
    amount: number;
    saleId: number | null;
  }[];
  saleId: number | null;
  cancelled: boolean;
};
export type BankUpload = {
  id: number;
  filename: string;
  organizationId: number;
  organizationName: string;
  account: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  parserVersion: string;
  status: 'parsed' | 'blocked';
  operationCount: number;
  debitTotal: number | null;
  creditTotal: number | null;
  errors: string[];
};
export type BankReconciliationSide = {
  expected: number | null;
  read: number | null;
  difference: number | null;
};
export type BankUploadDetail = BankUpload & {
  metadata: {
    ownerName?: string | null;
    ownerInn?: string | null;
    bik?: string | null;
    openingBalance?: number | null;
    closingBalance?: number | null;
  };
  reconciliation: {
    debit: BankReconciliationSide;
    credit: BankReconciliationSide;
    valid: boolean;
  };
  summary: {
    readyCount: number;
    readyAmount: number;
    accountedCount: number;
    reviewCount: number;
    excludedCount: number;
  };
  operations: BankOperation[];
};
export type BankSelection = {
  operationId: number;
  version: number;
  fingerprint: string;
};
export type BankEffectSummary = {
  salesTotal: number;
  commission: number | null;
  fixed: number | null;
  income: number | null;
};
export type BankPreview = {
  count: number;
  amount: number;
  linkedCount: number;
  effects: {
    managerId: number;
    managerName: string;
    month: string;
    before: BankEffectSummary;
    after: BankEffectSummary;
  }[];
};
export type BankCommitRequest = {
  items: BankSelection[];
  idempotencyKey: string;
};
export type BankCommitResult = BankPreview & {
  createdCount: number;
  linkedCount: number;
  saleIds: number[];
};
export type BankDecisionChange = {
  version: number;
  clientId?: number;
  classification?: BankClassification;
  reason: string;
  duplicateAction?: 'new' | 'link' | 'review';
  linkSaleId?: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
};
export type BankClientSummary = {
  clientId: number;
  version: number;
  assignment: {
    managerId: number | null;
    managerName: string | null;
    startDate: string;
    endDate: string | null;
  } | null;
  history: {
    id: number;
    managerId: number | null;
    managerName: string | null;
    startDate: string;
    endDate: string | null;
    actorName: string;
    changedAt: string;
    reason: string;
  }[];
  payments: {
    id: number;
    date: string;
    amount: number;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    managerId: number | null;
    managerName: string | null;
    status: BankStatus;
    saleId: number | null;
    cancelled: boolean;
  }[];
  pending: {
    count: number;
    amount: number;
    periodStart: string | null;
    periodEnd: string | null;
  } | null;
};
