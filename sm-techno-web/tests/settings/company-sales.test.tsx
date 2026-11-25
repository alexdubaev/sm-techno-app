import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanySales } from '@/components/admin-dashboard/company-sales';

const api = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), preview: vi.fn(), save: vi.fn(), managers: vi.fn(), searchClients: vi.fn(),
  listeners:new Set<(reason:'data'|'session')=>void>(),
}));
vi.mock('@/components/auth-provider', () => ({useAuth:()=>({user:{id:1,role:'admin'},isAdmin:true})}));
vi.mock('@/lib/api', () => ({
  fetchCompanySales: api.list,
  fetchCompanySale: api.detail,
  previewCompanySaleManager: api.preview,
  assignCompanySaleManager: api.save,
  fetchManagers: api.managers,
  fetchCachedManagers: api.managers,
  searchBankClients: api.searchClients,
  getApiCacheGeneration:()=>0,
  subscribeApiCacheInvalidation:(listener:(reason:'data'|'session')=>void)=>{api.listeners.add(listener);return ()=>{api.listeners.delete(listener);};},
  invalidateApiCache:(reason:'data'|'session'='session')=>api.listeners.forEach(listener=>listener(reason)),
}));

const sale = {
  kind: 'bank' as const, id: 77, date: '2026-11-18', clientName: 'ООО Тест', amount: 14800000,
  source: 'bank_statement' as const, crmClientId: 12, managerId: null, managerName: null,
  rate: null, invoiceNumber: '41', invoiceDate: '2026-08-28', canAssignManager: true,
};
const detail = { ...sale, purpose: 'Оплата по счёту № 41', documentNumber: '1', issue: null };
const preview = {
  token: 'proposal-v1', managerId: 9, month: '2026-11', rate: 500, canSave: true, problem: null,
  paymentDate: sale.date, assignment: { managerId: 9, managerName: 'Менеджер Тест', startDate: sale.date, endDate: null },
  effects: [{ managerId: 9, managerName: 'Менеджер Тест', month: '2026-11',
    before: { salesTotal: 0, count: 0, commission: 0, fixed: 0, income: 0 },
    after: { salesTotal: 14800000, count: 1, commission: 740000, fixed: 0, income: 740000 } }],
};

beforeEach(() => {
  api.list.mockResolvedValue({ items: [sale], page: 1, pages: 1, total: 1 });
  api.detail.mockResolvedValue(detail);
  api.preview.mockResolvedValue(preview);
  api.save.mockResolvedValue(detail);
  api.managers.mockResolvedValue([{ id: 9, userId: 42, name: 'Менеджер Тест', active: true, archived: false }]);
  api.searchClients.mockResolvedValue({ items: [{ id: 21, name: 'ООО CRM', inn: '1234567890', kpp: '123456789' }] });
});
afterEach(() => api.listeners.forEach(listener=>listener('session')));

it('lists paged sales, previews assignment and saves once without asking for a reason', async () => {
  const user = userEvent.setup();
  const { container } = render(<CompanySales period="month" date="2026-11-18" />);
  expect(await screen.findByText('ООО Тест')).toBeVisible();
  expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  await user.click(screen.getByRole('button', { name: /18\.11\.2026.*ООО Тест/ }));
  const dialog = await screen.findByRole('dialog');
  await user.selectOptions(screen.getByLabelText('Менеджер'), '9');
  expect(await screen.findByText(/Клиент закрепится/)).toBeVisible();
  expect(api.preview).toHaveBeenCalledWith('bank', 77, { managerId: 9 });
  expect(screen.queryByLabelText(/Причина/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Зачислить и закрепить клиента' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith('bank', 77, expect.objectContaining({ managerId: 9, proposalToken: 'proposal-v1', idempotencyKey: expect.any(String) })));
  expect(await screen.findByText('Менеджер назначен, клиент закреплён.')).toBeVisible();
  expect(window.dispatchEvent).toBeDefined();
  expect(container).toBeTruthy();
  expect(dialog).toBeVisible();
});

it('keeps conflicting assignment visible and allows refreshing proposal', async () => {
  const user = userEvent.setup();
  render(<CompanySales period="month" date="2026-11-18" />);
  await screen.findByText('ООО Тест');
  await user.click(screen.getByRole('button', { name: /18\.11\.2026.*ООО Тест/ }));
  api.preview.mockRejectedValueOnce(Object.assign(new Error('Данные изменились'), { status: 409 }));
  await user.selectOptions(await screen.findByLabelText('Менеджер'), '9');
  expect(await screen.findByText(/обновите детали и расчёт/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Обновить расчёт' })).toBeEnabled();
  expect(api.save).not.toHaveBeenCalled();
});

it('searches and filters unassigned sales', async () => {
  const user = userEvent.setup();
  render(<CompanySales period="month" date="2026-11-18" />);
  await screen.findByText('ООО Тест');
  fireEvent.change(screen.getByLabelText('Поиск продаж'), { target: { value: 'Волга' } });
  await user.click(screen.getByRole('button', { name: 'Без менеджера' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Волга', unassigned: true })));
});

it('requires an explicit CRM client when transferring a legacy sale without a client link', async () => {
  const user = userEvent.setup();
  const legacySale = { ...sale, kind: 'manager' as const, managerId: 7, managerName: 'Старый менеджер', canAssignManager: true, crmClientId: null };
  api.list.mockResolvedValue({ items: [legacySale], page: 1, pages: 1, total: 1 });
  api.detail.mockResolvedValue({ ...legacySale, purpose: null, documentNumber: null, issue: null });
  render(<CompanySales period="month" date="2026-11-18" />);
  await screen.findByText('ООО Тест');
  await user.click(screen.getByRole('button', { name: /18\.11\.2026.*ООО Тест/ }));
  await user.selectOptions(await screen.findByLabelText('Менеджер'), '9');
  expect(api.preview).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Найти' }));
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Клиент CRM' }), '21');
  await waitFor(() => expect(api.preview).toHaveBeenCalledWith('manager', 77, { managerId: 9, clientId: 21 }));
  expect(await screen.findByText(/Клиент закрепится/)).toBeVisible();
});

it('discards an in-flight preview when the manager selection is cleared', async () => {
  const user = userEvent.setup();
  let resolvePreview!: (value: typeof preview) => void;
  api.preview.mockReturnValueOnce(new Promise<typeof preview>(resolve => { resolvePreview = resolve; }));
  render(<CompanySales period="month" date="2026-11-18" />);
  await screen.findByText('ООО Тест');
  await user.click(screen.getByRole('button', { name: /18\.11\.2026.*ООО Тест/ }));
  const manager = await screen.findByLabelText('Менеджер');
  await user.selectOptions(manager, '9');
  await user.selectOptions(manager, '');
  resolvePreview(preview);
  const saveButton = screen.getByRole('button', { name: 'Зачислить и закрепить клиента' });
  await waitFor(() => expect(saveButton).toBeDisabled());
  expect(screen.queryByText(/Клиент закрепится/)).not.toBeInTheDocument();
  expect(api.save).not.toHaveBeenCalled();
});

it('does not offer assignment from summary data if loading sale details fails', async () => {
  const user = userEvent.setup();
  api.detail.mockRejectedValueOnce(new Error('Временно недоступно'));
  render(<CompanySales period="month" date="2026-11-18" />);
  await screen.findByText('ООО Тест');
  await user.click(screen.getByRole('button', { name: /18\.11\.2026.*ООО Тест/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Временно недоступно');
  expect(screen.queryByLabelText('Менеджер')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByLabelText('Менеджер')).toBeVisible();
});
