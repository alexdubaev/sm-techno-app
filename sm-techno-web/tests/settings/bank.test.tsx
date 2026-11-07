import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerSales } from '@/components/manager/manager-sales';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';
import { ManagerHistory } from '@/components/manager/manager-history';
import { BankImportContent } from '@/components/manager/bank-import';
import { BankOperationCard } from '@/components/manager/bank-operation-card';
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
  cancelCompany: vi.fn(),
  client: vi.fn(),
  assignment: vi.fn(),
  history: vi.fn(),
  snapshots: vi.fn(),
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
  cancelBankCompanyPayment: mocks.cancelCompany,
  fetchBankClient: mocks.client,
  saveClientSalesManager: mocks.assignment,
  fetchManagerHistory: mocks.history,
  fetchManagerSnapshots: mocks.snapshots,
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
  metadata: { bik: '044525225', openingBalance: null, closingBalance: null },
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
  mocks.cancelCompany.mockResolvedValue(operation);
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
  it('reads a file without loading or confirming organization accounts and preserves payment selection', async () => {
    mocks.accounts.mockResolvedValue({ organizations: [], accounts: [] });
    render(<BankImportContent userId={8} onChanged={() => {}} />);
    const read = screen.getByRole('button', { name: 'Прочитать выписку' });
    expect(read).toBeDisabled();
    expect(screen.queryByLabelText('Организация и счёт')).not.toBeInTheDocument();
    expect(screen.queryByText('Подтвердить счёт организации для импорта')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ИНН владельца счёта')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Расчётный счёт')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('БИК банка')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Основание подтверждения счёта')).not.toBeInTheDocument();
    const file = new File(['synthetic'], 'synthetic.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(screen.getByLabelText('Файл выписки XLSX'), file);
    expect(read).toBeEnabled();
    fireEvent.submit(read.closest('form')!);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(null, file));
    const result = await screen.findByRole('region', { name: 'Результат чтения выписки' });
    expect(result).toHaveTextContent('Тестовая организация');
    expect(result).toHaveTextContent('00000000000000000001');
    expect(result).toHaveTextContent('БИК 044525225');
    expect(result).toHaveTextContent('01.11.2026');
    expect(screen.getByRole('checkbox', { name: 'Выбрать оплату 2810' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Выбрать оплату 2811' })).toBeDisabled();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить итог перед добавлением' }));
    expect(await screen.findByRole('button', { name: 'Подтвердить 1 оплат' })).toBeEnabled();
    expect(mocks.preview).toHaveBeenCalledWith([
      { operationId: 11, version: 2, fingerprint: 'synthetic-fingerprint' },
    ]);
  });
  it('confirms company sales without a manager and explains the pending manager posting', async () => {
    const companyOnly = { ...operation, managerId: null, managerName: null, status: 'manager_missing' as const, companyCanConfirm: true };
    mocks.detail.mockResolvedValue({ ...upload, operations: [companyOnly] });
    mocks.preview.mockResolvedValue({ count: 1, amount: operation.amount, companyCount: 1, companyAmount: operation.amount, managerCount: 0, pendingManagerCount: 1, linkedCount: 0, effects: [] });
    mocks.commit.mockResolvedValue({ companyCount: 1, companyAmount: operation.amount, managerCount: 0, pendingManagerCount: 1, createdCount: 0, linkedCount: 0 });
    render(<BankImportContent userId={8} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Тестовая организация.*synthetic.xlsx/ }));
    expect(await screen.findByRole('checkbox', { name: 'Выбрать оплату 2810' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить итог перед добавлением' }));
    expect(await screen.findByText(/Изменение общих продаж: 1/)).toHaveTextContent('360');
    expect(screen.getByText(/Не начислено менеджерам: 1/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить 1 оплат' }));
    expect(await screen.findByText(/Изменение общих продаж: 1.*Менеджерам: 0/)).toBeVisible();
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ items: [{ operationId: 11, version: 2, fingerprint: 'synthetic-fingerprint' }] }));
  });
  it('shows zero company addition when a confirmed company receipt becomes ready for its manager', async () => {
    mocks.detail.mockResolvedValue({ ...upload, operations: [{ ...operation, companyAccounted: true }] });
    mocks.preview.mockResolvedValue({ count: 1, amount: operation.amount, companyCount: 0, companyAmount: 0, managerCount: 1, pendingManagerCount: 0, linkedCount: 0, effects: [] });
    render(<BankImportContent userId={8} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Тестовая организация.*synthetic.xlsx/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Проверить итог перед добавлением' }));
    expect(await screen.findByText(/Изменение общих продаж: 0/)).toHaveTextContent('0 ₽');
    expect(screen.getByText('Начисление менеджерам: 1 оплат.')).toBeVisible();
    expect(screen.queryByText('Проверить и изменить решение')).not.toBeInTheDocument();
  });
  it('requires a reason to cancel an unallocated company receipt and refreshes it', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<BankOperationCard operation={{ ...operation, status: 'manager_missing', companyAccounted: true }} selected={false} disabled={false} onSelect={() => {}} onSaved={saved} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByText('Проверить и изменить решение')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Отменить учёт в общих продажах'));
    const cancel = screen.getByRole('button', { name: 'Отменить общую продажу' });
    expect(cancel).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Причина отмены общей продажи'), { target: { value: 'Ошибочное подтверждение' } });
    fireEvent.click(cancel);
    await waitFor(() => expect(mocks.cancelCompany).toHaveBeenCalledWith(11, { version: 2, reason: 'Ошибочное подтверждение' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });
  it('shows the negative company delta when linking two previously counted receipts', async () => {
    mocks.detail.mockResolvedValue({ ...upload, operations: [{ ...operation, companyAccounted: true }] });
    mocks.preview.mockResolvedValue({ count: 1, amount: operation.amount, companyCount: -1, companyAmount: -operation.amount!, managerCount: 1, pendingManagerCount: 0, linkedCount: 1, effects: [] });
    render(<BankImportContent userId={8} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Тестовая организация.*synthetic.xlsx/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Проверить итог перед добавлением' }));
    const delta = await screen.findByText(/Изменение общих продаж: -1/);
    expect(delta.textContent?.replace(/\s/g, '')).toContain('-360000₽');
    expect(screen.getByRole('button', { name: 'Подтвердить 1 оплат' })).toBeEnabled();
  });
  it('keeps cancelled company receipts unselectable and explains their state', () => {
    render(<BankOperationCard operation={{ ...operation, companyAccounted: true, companyCanConfirm: true, companyCancelled: true }} selected={false} disabled={false} onSelect={() => {}} onSaved={async () => {}} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText('Общая продажа отменена')).toBeVisible();
    expect(screen.queryByText('Отменить учёт в общих продажах')).not.toBeInTheDocument();
  });
  it('resolves a later duplicate of a company receipt without changing its frozen identity', async () => {
    mocks.decision.mockResolvedValue(operation);
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<BankOperationCard operation={{ ...operation, companyAccounted: true, status: 'possible_duplicate', candidateSales: [{ id: 71, date: '2026-11-06', client: 'Тестовый клиент', amount: 36000000, managerId: 31, managerName: 'Тестовый менеджер', source: 'manual', invoiceNumber: null }] }} selected={false} disabled={false} onSelect={() => {}} onSaved={saved} />);
    fireEvent.click(screen.getByText('Разрешить возможный дубль'));
    expect(screen.queryByLabelText('Тип поступления')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Выбранный клиент')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Номер счёта на оплату')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Решение по возможному дублю'), { target: { value: 'link' } });
    fireEvent.change(screen.getByLabelText('Существующая продажа'), { target: { value: '71' } });
    fireEvent.change(screen.getByLabelText('Причина решения по дублю'), { target: { value: 'Оплата подтверждает ручную продажу' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить решение по дублю' }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith(11, { version: 2, duplicateAction: 'link', linkSaleId: 71, reason: 'Оплата подтверждает ручную продажу' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });
  it('retains invalid source rows for inspection while requiring corrected XLSX for critical bank fields', () => {
    render(
      <BankOperationCard
        operation={{
          ...operation,
          id: -43,
          date: null,
          amount: null,
          status: 'data_error',
          explanation: 'Дата операции содержит формулу',
          errors: ['Дата операции содержит формулу'],
        }}
        selected={false}
        disabled={false}
        onSelect={() => {}}
        onSaved={async () => {}}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Выбрать оплату 2810' }),
    ).toBeDisabled();
    expect(
      screen.queryByText('Проверить и изменить решение'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Исправьте исходные данные в XLSX/)).toBeVisible();
    expect(screen.getByText('Назначение и банковские реквизиты')).toBeVisible();
  });
  it('applies a matching INN client without asking for a reason and refreshes attribution', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<BankOperationCard operation={{ ...operation, clientId: null, clientName: null,
      managerId: null, managerName: null, status: 'multiple_clients', candidateClients: [
        { id: 42, name: 'Полное название клиента', inn: operation.inn, kpp: null },
      ] }} selected={false} disabled={false} onSelect={() => {}} onSaved={saved} />);
    fireEvent.click(screen.getByText('Проверить и изменить решение'));
    expect(screen.queryByLabelText('Причина решения')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Выбранный клиент'), { target: { value: '42' } });
    expect(screen.getByText(/Клиент выбран, но ещё не применён/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Применить клиента' }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith(operation.id, expect.objectContaining({
      clientId: 42, version: operation.version,
      reason: 'Выбран клиент CRM с совпадающими ИНН и КПП',
    })));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });
  it.each(['inn', 'kpp'] as const)('requires a reason for a different client %s', async (field) => {
    render(<BankOperationCard operation={{ ...operation, kpp: '000001001', candidateClients: [
      { id: 42, name: 'Другой клиент', inn: operation.inn, kpp: '000001001',
        [field]: field === 'inn' ? '7700000010' : '000002001' },
    ] }} selected={false} disabled={false} onSelect={() => {}} onSaved={async () => {}} />);
    fireEvent.click(screen.getByText('Проверить и изменить решение'));
    fireEvent.change(screen.getByLabelText('Выбранный клиент'), { target: { value: '42' } });
    expect(screen.getByLabelText('Причина решения')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Применить клиента' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Причина решения'), { target: { value: 'Оплата за выбранного клиента' } });
    fireEvent.click(screen.getByRole('button', { name: 'Применить клиента' }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith(operation.id, expect.objectContaining({
      clientId: 42, reason: 'Оплата за выбранного клиента',
    })));
  });
  it('keeps a reason required when a matching client selection also changes classification', () => {
    render(<BankOperationCard operation={{ ...operation, clientId: null, candidateClients: [
      { id: 42, name: 'Клиент', inn: operation.inn, kpp: null },
    ] }} selected={false} disabled={false} onSelect={() => {}} onSaved={async () => {}} />);
    fireEvent.click(screen.getByText('Проверить и изменить решение'));
    fireEvent.change(screen.getByLabelText('Выбранный клиент'), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('Тип поступления'), { target: { value: 'excluded' } });
    expect(screen.getByLabelText('Причина решения')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Применить клиента' })).toBeDisabled();
  });
  it('explains bank confirmation of an existing sale in manager audit history', async () => {
    const data = await mocks.dashboard();
    const state = {
      terms: data.terms,
      summary: data.summary,
      closed: false,
      version: 1,
      sale: null,
    };
    mocks.history.mockResolvedValue({
      items: [
        {
          id: 1,
          actor_name: 'Тестовый администратор',
          at: '2026-11-07T12:00:00Z',
          kind: 'bank_link',
          reason: 'Оплата подтверждает существующую продажу',
          before: state,
          after: state,
        },
      ],
      total: 1,
    });
    mocks.snapshots.mockResolvedValue([]);
    render(<ManagerHistory data={data} onClose={() => {}} />);
    expect(
      await screen.findByText(/Подтверждение банковским платежом/),
    ).toBeVisible();
    expect(
      screen.getByText(/Оплата подтверждает существующую продажу/),
    ).toBeVisible();
  });
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
      name: 'Подтвердить 1 оплат',
    });
    expect(mocks.preview).toHaveBeenCalledWith([
      { operationId: 11, version: 2, fingerprint: 'synthetic-fingerprint' },
    ]);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(
      screen.getByRole('region', { name: 'Изменение продаж и вознаграждения' }),
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
    await screen.findByText(/Изменение общих продаж: 1.*Менеджерам:/);
    expect(sessionStorage.getItem('smtechno-bank-confirm:8')).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('article', { name: 'Оплата 2811' }),
    ).toHaveTextContent('Клиент не найден');
  });
  it('assigns a manager initially with an automatic reason and requires the manager and date', async () => {
    const clientData = { clientId: 3, version: 0, assignment: null, history: [], payments: [], pending: null };
    mocks.client.mockResolvedValue(clientData);
    mocks.assignment.mockResolvedValue(clientData);
    render(<ClientSalesPanel clientId={3} isAdmin />);
    await screen.findByText('Не назначен');
    fireEvent.click(screen.getByText('Назначить или изменить менеджера'));
    expect(screen.queryByLabelText('Причина изменения закрепления')).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Сохранить закрепление' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Менеджер по продажам'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('Дата начала закрепления'), { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Дата начала закрепления'), { target: { value: '2026-11-01' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.assignment).toHaveBeenCalledWith(3, {
      version: 0, managerId: 31, startDate: '2026-11-01',
      reason: 'Первичное закрепление менеджера по продажам',
    }));
  });
  it('requires an explicit reason for a previously changed CRM assignment and sends the manager account identity and date', async () => {
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
  it('explains company-only payments separately from the missing manager in the admin CRM card', async () => {
    mocks.client.mockResolvedValue({ clientId: 3, version: 0, assignment: null, history: [], pending: null,
      payments: [{ id: 11, date: '2026-11-06', amount: 36000000, managerId: null, managerName: null, invoiceNumber: null, invoiceDate: null, status: 'manager_missing', saleId: null, cancelled: false, companyAccounted: true, companyCancelled: false }] });
    render(<ClientSalesPanel clientId={3} isAdmin />);
    expect(await screen.findByText('Учтено в общих продажах')).toBeVisible();
    expect(screen.getByText('Не начислено менеджеру')).toBeVisible();
    expect(screen.getByText('Менеджер не назначен')).toBeVisible();
  });
});
