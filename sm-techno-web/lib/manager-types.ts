export type ManagerAccount = {
  id: number;
  userId: number | null;
  name: string;
  archived: boolean;
  avatarVersion: number;
  hasAvatar: boolean;
};
export type ManagerChoice = Pick<
  ManagerAccount,
  'id' | 'userId' | 'name' | 'archived'
> & { active: boolean };
export type ManagerTerms = {
  plan: number;
  fixed: number;
  rate: number;
  mode: 'plan' | 'always' | 'minimum';
};
export type ManagerSale = {
  id: number;
  date: string;
  client: string;
  amount: number;
  rate: number;
  cancelled: boolean;
  source: 'manual' | 'onec';
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  base: number | null;
  commission: number | null;
};
export type ManagerSummary = {
  salesTotal: number;
  fixed: number | null;
  commission: number | null;
  income: number | null;
  above: number | null;
  remaining: number | null;
  count: number;
};
export type ManagerDashboard = {
  account: ManagerAccount;
  month: string;
  version: number;
  closed: boolean;
  terms: ManagerTerms | null;
  summary: ManagerSummary;
  daily: { day: number; amount: number; cumulative: number }[];
  sales: ManagerSale[];
  total: number;
  page: number;
  pages: number;
};
export type ManagerChange = {
  managerId: number;
  month: string;
  version: number;
  reason?: string;
} & (
  | ({ kind: 'terms' } & ManagerTerms)
  | {
      kind: 'sale';
      saleId?: number;
      date: string;
      client: string;
      amount: number;
      rate: number;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
    }
  | { kind: 'cancel'; saleId: number }
  | { kind: 'close' | 'reopen' }
);
export type ManagerAuditState = {
  terms: ManagerTerms | null;
  summary: ManagerSummary;
  closed: boolean;
  version: number;
  sale: (ManagerSale & { updated_at: string }) | null;
};
export type ManagerAudit = {
  id: number;
  actor_name: string;
  at: string;
  kind: ManagerChange['kind'];
  reason: string;
  before: ManagerAuditState;
  after: ManagerAuditState;
};
export type ManagerHistory = { items: ManagerAudit[]; total: number };
export type ManagerSnapshotSummary = {
  id: number;
  at: string;
  actor: string;
  version: number;
};
export type ManagerSnapshot = ManagerSnapshotSummary & {
  data: ManagerDashboard;
};
