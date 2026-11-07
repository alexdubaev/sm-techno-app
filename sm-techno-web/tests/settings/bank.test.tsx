import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerSales } from '@/components/manager/manager-sales';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';
import { BankImportContent } from '@/components/manager/bank-import';
import { ClientSalesPanel } from '@/components/crm/client-sales-panel';
import type { ManagerSale } from '@/lib/manager-types';
import type { BankOperation, BankUploadDetail } from '@/lib/bank-types';

const mocks = vi.hoisted(() => ({
  admin: true,
  dashboard: vi.fn(),
  managers: vi.fn(),
  accounts: vi.fn(),
  uploads: vi.fn(),
  detail: vi.fn(),
  refresh: vi.fn(),
  upload: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  decision: vi.fn(),
  client: vi.fn(),
  assignment: vi.fn(),
}));
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: { id: 8 }, isAdmin: mocks.admin }),
}));
vi.mock('next/dynamic', () => ({
  default: () => () => <div>График продаж</div>,
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  fetchManagerDashboard: mocks.dashboard,
  fetchManagers: mocks.managers,
  fetchBankAccounts: mocks.accounts,
  fetchBankUploads: mocks.uploads,
  fetchBankUpload: mocks.detail,
  refreshBankUpload: mocks.refresh,
  uploadBankStatement: mocks.upload,
  previewBankPayments: mocks.preview,
  commitBankPayments: mocks.commit,
  changeBankDecision: mocks.decision,
  fetchBankClient: mocks.client,
  saveClientSalesManager: mocks.assignment,
}));

const operation: BankOperation = {
  id: 11,
  version: 2,
  fingerprint: 'synthetic-fingerprint',
  date: '2026-11-06',
  amount: 36000000,
  direction: 'credit',
  documentNumber: '2810',
  payerName: 'Тестовый плательщик',
  inn: '7700000002',
  kpp: null,
  account: null,
  bik: null,
  bankName: null,
  purpose: 'Оплата товара с НДС',
  invoiceNumber: '256',
  invoiceDate: null,
  invoiceReferences: [],
  clientId: 3,
  clientName: 'Тестовый клиент',
  managerId: 31,
  managerName: 'Тестовый менеджер',
  rate: 500,
  status: 'ready',
  explanation: 'Оплата покупателя',
  warnings: [],
  errors: [],
  classification: 'sale',
  candidateClients: [],
  candidateSales: [],
  probableDuplicates: [],
  saleId: null,
  cancelled: false,
};
const upload: BankUploadDetail = {
  id: 9,
  filename: 'synthetic.xlsx',
  organizationId: 1,
  organizationName: 'Тестовая организация',
  account: '00000000000000000001',
  currency: 'RUB',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-07',
  createdAt: '2026-11-07T12:00:00Z',
  parserVersion: 'test',
  status: 'parsed',
  operationCount: 2,
  debitTotal: 0,
  creditTotal: 36000100,
  errors: [],
  metadata: { openingBalance: null, closingBalance: null },
  reconciliation: {
    debit: { expected: 0, read: 0, difference: 0 },
    credit: { expected: 36000100, read: 36000100, difference: 0 },
    valid: true,
  },
  summary: {
    readyCount: 1,
    readyAmount: 36000000,
    accountedCount: 0,
    reviewCount: 1,
    excludedCount: 0,
  },
  operations: [
    operation,
    {
      ...operation,
      id: 12,
      amount: 100,
      documentNumber: '2811',
      clientId: null,
      clientName: null,
      status: 'client_not_found',
      explanation: 'Клиент не найден',
    },
  ],
};
beforeEach(() => {
  sessionStorage.clear();
  mocks.admin = true;
  mocks.dashboard.mockResolvedValue({
    account: {
      id: 31,
      userId: 8,
      name: 'Тестовый менеджер',
      avatarVersion: 0,
      hasAvatar: false,
    },
    month: '2026-11',
    version: 1,
    closed: true,
    terms: { plan: 0, fixed: 0, rate: 500, mode: 'always' },
    summary: { salesTotal: 0, commission: 0, fixed: 0, income: 0, count: 0 },
    sales: [],
    daily: [],
    page: 1,
    pages: 1,
    total: 0,
  });
  mocks.managers.mockResolvedValue([
    {
      id: 31,
      userId: 8,
      name: 'Тестовый менеджер',
      active: true,
      archived: false,
    },
  ]);
  mocks.accounts.mockResolvedValue({
    organizations: [{ id: 1, name: 'Тестовая организация', inn: '7700000002' }],
    accounts: [
      {
        id: 5,
        organizationId: 1,
        organizationName: 'Тестовая организация',
        ownerInn: '7700000002',
        account: '00000000000000000001',
        bik: '000000001',
        currency: 'RUB',
        active: true,
      },
    ],
  });
  mocks.uploads.mockResolvedValue({ items: [upload] });
  mocks.detail.mockResolvedValue(upload);
  mocks.refresh.mockResolvedValue(upload);
  mocks.upload.mockResolvedValue(upload);
  mocks.preview.mockResolvedValue({
    count: 1,
    amount: 36000000,
    linkedCount: 0,
    effects: [
      {
        managerId: 31,
        managerName: 'Тестовый менеджер',
        month: '2026-11',
        before: { salesTotal: 0, commission: 0, fixed: 0, income: 0 },
        after: {
          salesTotal: 36000000,
          commission: 1800000,
          fixed: 0,
          income: 1800000,
        },
      },
    ],
  });
  mocks.commit.mockResolvedValue({
    count: 1,
    amount: 36000000,
    createdCount: 1,
    linkedCount: 0,
    saleIds: [71],
    effects: [],
  });
});

describe('Bank payments in existing sales', () => {
  it('identifies bank payments and permits cancellation without editing banking identity', () => {
    const sale = {
      id: 6,
      date: '2026-11-06',
      client: 'Тестовый покупатель',
      amount: 36000000,
      rate: 500,
      cancelled: false,
      source: 'bank_statement',
      base: 36000000,
      commission: 1800000,
    } as ManagerSale;
    render(
      <ManagerSales sales={[sale]} onEdit={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/Банковская выписка/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Изменить продажу № 6' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Отменить продажу № 6' }),
    ).toBeVisible();
  });
  it('retains a linked manual source while preventing edits to its confirmed payment identity', () => {
    const sale = {
      id: 7,
      date: '2026-11-06',
      client: 'Тестовый покупатель',
      amount: 36000000,
      rate: 500,
      cancelled: false,
      source: 'manual',
      bankOperationId: 11,
      base: 36000000,
      commission: 1800000,
    } as ManagerSale;
    render(
      <ManagerSales sales={[sale]} onEdit={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/Ручной ввод/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Изменить продажу № 7' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Отменить продажу № 7' }),
    ).toBeVisible();
  });
  it('offers a global import to administrators even when the displayed employee month is closed', async () => {
    render(<ManagerWorkspace />);
    expect(
      await screen.findByRole('button', { name: 'Загрузить выписку' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'История выписок' }),
    ).toBeVisible();
  });
  it('hides global bank tools from managers', async () => {
    mocks.admin = false;
    render(<ManagerWorkspace />);
    await screen.findByText('Тестовый менеджер');
    expect(
      screen.queryByRole('button', { name: 'Загрузить выписку' }),
    ).not.toBeInTheDocument();
  });
  it('previews only selected ready operations and retries an uncertain confirmation with the same key and content', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('Ответ потерян'));
    const changed = vi.fn();
    render(<BankImportContent userId={8} onChanged={changed} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Тестовая организация.*synthetic.xlsx/,
      }),
    );
    expect(await screen.findByText('Операции выписки')).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Выбрать оплату 2811' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Проверить итог перед добавлением' }),
    );
    const confirm = await screen.findByRole('button', {
      name: /Добавить 1 оплат на/,
    });
    expect(mocks.preview).toHaveBeenCalledWith([
      { operationId: 11, version: 2, fingerprint: 'synthetic-fingerprint' },
    ]);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(
      screen.getByRole('region', { name: 'Изменение вознаграждения' }),
    ).toHaveTextContent('Комиссия:');
    fireEvent.click(confirm);
    expect(await screen.findByText('Ответ потерян')).toBeVisible();
    const request = mocks.commit.mock.calls[0][0];
    expect(request).not.toHaveProperty('managerId');
    expect(
      JSON.parse(sessionStorage.getItem('smtechno-bank-confirm:8')!).request,
    ).toEqual(request);
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить подтверждение' }),
    );
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(2));
    expect(mocks.commit.mock.calls[1][0]).toEqual(request);
    await screen.findByText(/Добавлено продаж: 1/);
    expect(sessionStorage.getItem('smtechno-bank-confirm:8')).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('article', { name: 'Оплата 2811' }),
    ).toHaveTextContent('Клиент не найден');
  });
  it('sends manager account identity and the explicit effective date for a CRM assignment', async () => {
    const clientData = {
      clientId: 3,
      version: 4,
      assignment: null,
      history: [],
      payments: [],
      pending: {
        count: 1,
        amount: 36000000,
        periodStart: '2026-11-06',
        periodEnd: '2026-11-06',
      },
    };
    mocks.client.mockResolvedValue(clientData);
    mocks.assignment.mockResolvedValue(clientData);
    render(<ClientSalesPanel clientId={3} isAdmin />);
    await screen.findByText('Не назначен');
    fireEvent.click(screen.getByText('Назначить или изменить менеджера'));
    fireEvent.change(screen.getByLabelText('Менеджер по продажам'), {
      target: { value: '31' },
    });
    fireEvent.change(screen.getByLabelText('Дата начала закрепления'), {
      target: { value: '2026-11-01' },
    });
    expect(
      screen.getByRole('button', { name: 'Сохранить закрепление' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Причина изменения закрепления'), {
      target: { value: 'Первоначальное заполнение' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить закрепление' }),
    );
    await waitFor(() =>
      expect(mocks.assignment).toHaveBeenCalledWith(3, {
        version: 4,
        managerId: 31,
        startDate: '2026-11-01',
        reason: 'Первоначальное заполнение',
      }),
    );
    expect(screen.getByText(/Ожидающие оплаты:/)).toHaveTextContent('360');
  });
  it('does not load manager choices or offer assignment controls in a normal CRM card', async () => {
    mocks.client.mockResolvedValue({
      clientId: 3,
      version: 0,
      assignment: null,
      history: [],
      payments: [],
      pending: null,
    });
    render(<ClientSalesPanel clientId={3} isAdmin={false} />);
    await screen.findByText('Не назначен');
    expect(mocks.managers).not.toHaveBeenCalled();
    expect(screen.queryByText('История закреплений')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Дата начала закрепления'),
    ).not.toBeInTheDocument();
  });
});
