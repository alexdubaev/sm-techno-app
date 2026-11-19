import type { BankPreview } from './bank-types';

export type CompanySaleKind = 'bank' | 'manager';
export type CompanySaleSummary = {
  kind: CompanySaleKind;
  id: number;
  date: string;
  clientName: string;
  amount: number;
  source: 'manual' | 'onec' | 'bank_statement';
  crmClientId: number | null;
  managerId: number | null;
  managerName: string | null;
  rate: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  canAssignManager: boolean;
};
export type CompanySaleDetail = CompanySaleSummary & {
  purpose: string | null;
  documentNumber: string | null;
  issue: string | null;
};
export type CompanySalesPage = {
  items: CompanySaleSummary[];
  page: number;
  pages: number;
  total: number;
};
export type CompanySaleManagerPreview = {
  token: string;
  managerId: number;
  month: string;
  rate: number | null;
  canSave: boolean;
  problem: string | null;
  effects: BankPreview['effects'];
  assignment: { managerId: number | null; managerName: string | null; startDate: string; endDate: string | null } | null;
  paymentDate: string;
};
