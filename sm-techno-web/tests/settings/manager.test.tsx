import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';
const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  managers: vi.fn(),
  preview: vi.fn(),
  change: vi.fn(),
  admin: false,
}));
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: { id: 1 }, isAdmin: mocks.admin }),
}));
vi.mock('next/dynamic', () => ({
  default: () => () => <div>График продаж</div>,
}));
vi.mock('@/lib/api', () => ({
  fetchManagerDashboard: mocks.dashboard,
  fetchManagers: mocks.managers,
  previewManagerChange: mocks.preview,
  saveManagerChange: mocks.change,
}));
const data = {
  account: {
    id: 1,
    userId: 1,
    name: 'Анна Иванова',
    avatarVersion: 0,
    hasAvatar: false,
  },
  month: '2026-10',
  version: 1,
  closed: false,
  terms: { plan: 100000000, fixed: 5000000, rate: 500, mode: 'plan' },
  summary: {
    salesTotal: 120000000,
    fixed: 5000000,
    commission: 1000000,
    income: 6000000,
    above: 20000000,
    remaining: 0,
    count: 1,
  },
  sales: [],
  daily: [],
  total: 0,
  page: 1,
  pages: 1,
};
describe('Manager cabinet', () => {
  it('loads private metrics and hides admin actions', async () => {
    mocks.admin = false;
    mocks.dashboard.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    expect(await screen.findByText('Анна Иванова')).toBeVisible();
    expect(screen.getByText('Итого начислено')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Добавить продажу' }),
    ).not.toBeInTheDocument();
  });
  it('shows request failure with retry', async () => {
    mocks.admin = false;
    mocks.dashboard.mockRejectedValue(new Error('Сервер недоступен'));
    render(<ManagerWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервер недоступен',
    );
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });
  it('requires server preview before admin save', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(data);
    mocks.managers.mockResolvedValue([
      { id: 1, name: 'Анна Иванова', userId: 1 },
    ]);
    mocks.preview.mockResolvedValue(data);
    mocks.change.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Настроить условия' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Сохранить изменения' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Новый план' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Рассчитать изменения' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Сохранить изменения' }),
    ).toBeVisible();
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить изменения' }),
    );
    await waitFor(() => expect(mocks.change).toHaveBeenCalledOnce());
  });
  it('saves a new manual sale with invoice details and no correction reason', async () => {
    mocks.preview.mockClear();
    mocks.change.mockClear();
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue({
      ...data,
      terms: { plan: 0, fixed: 0, rate: 800, mode: 'always' },
    });
    mocks.managers.mockResolvedValue([
      { id: 1, name: 'Анна Иванова', userId: 1 },
    ]);
    mocks.change.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить продажу' }));
    expect(screen.queryByLabelText('Причина изменения')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Процент начисляется со всей суммы продаж/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Наименование клиента для документов'), {
      target: { value: 'ООО «Тест»' },
    });
    fireEvent.change(screen.getByLabelText('Сумма продажи, ₽'), {
      target: { value: '16200' },
    });
    fireEvent.change(screen.getByLabelText('Номер счёта'), {
      target: { value: '001/26' },
    });
    fireEvent.change(screen.getByLabelText('Дата счёта'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledOnce());
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.change.mock.calls[0]?.[0]).not.toHaveProperty('reason');
    expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'sale',
        client: 'ООО «Тест»',
        amount: 1620000,
        invoiceNumber: '001/26',
        invoiceDate: '2026-10-20',
      }),
    );
  });

  it('configures percent-only compensation without a plan', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(data);
    mocks.managers.mockResolvedValue([
      { id: 1, name: 'Анна Иванова', userId: 1 },
    ]);
    mocks.preview.mockResolvedValue(data);
    mocks.change.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Настроить условия' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('План начисления'), {
      target: { value: 'percent' },
    });
    expect(screen.queryByLabelText('План продаж, ₽')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Фиксированная часть, ₽')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Когда начислять фикс')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ставка для новых продаж, %'), {
      target: { value: '8' },
    });
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Удалённый менеджер' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
    expect(mocks.preview.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ plan: 0, mode: 'always', fixed: 0, rate: 800 }),
    );
    expect(dialog).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 0, mode: 'always', fixed: 0, rate: 800 }),
    ));
  });

  it('configures guaranteed minimum compensation and previews MAX(minimum, commission)', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue({ ...data, terms: null, summary: { ...data.summary, salesTotal: 0, fixed: null, commission: null, income: null, count: 0 } });
    mocks.managers.mockResolvedValue([{ id: 1, name: 'Анна Иванова', userId: 1 }]);
    mocks.preview.mockResolvedValue({ ...data, summary: { ...data.summary, fixed: 2500000, commission: 500000, income: 2500000 } });
    mocks.change.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    expect(screen.getByLabelText('План начисления')).toHaveValue('minimum');
    expect(screen.queryByLabelText('План продаж, ₽')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Минимальная зарплата, ₽')).toHaveValue('0');
    fireEvent.change(screen.getByLabelText('Минимальная зарплата, ₽'), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Ставка для новых продаж, %'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Причина изменения'), { target: { value: 'Минимальная зарплата' } });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ plan: 0, fixed: 2500000, rate: 500, mode: 'minimum' })));
    expect(await screen.findByText(/минимальная зарплата или проценты с продаж/i)).toBeVisible();
  });

  it('keeps the fixed-accrual choice valid when changing a new month to a plan', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue({ ...data, terms: null });
    mocks.managers.mockResolvedValue([{ id: 1, name: 'Анна Иванова', userId: 1 }]);
    mocks.preview.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('План начисления'), { target: { value: 'plan' } });
    expect(screen.getByLabelText('Когда начислять фикс')).toHaveValue('plan');
    fireEvent.change(screen.getByLabelText('План продаж, ₽'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('Фиксированная часть, ₽'), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Причина изменения'), { target: { value: 'План месяца' } });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ plan: 10000000, fixed: 2500000, mode: 'plan' })));
    expect(dialog).toBeInTheDocument();
  });

  it('restores copied guaranteed-minimum conditions without changing their mode', async () => {
    mocks.admin = true;
    const previous = { ...data, month: '2026-09', terms: { plan: 0, fixed: 2500000, rate: 500, mode: 'minimum' as const } };
    mocks.dashboard.mockImplementation((month: string) => Promise.resolve(month === '2026-09' ? previous : data));
    mocks.managers.mockResolvedValue([{ id: 1, name: 'Анна Иванова', userId: 1 }]);
    mocks.preview.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать из предыдущего месяца' }));
    await waitFor(() => expect(screen.getByLabelText('План начисления')).toHaveValue('minimum'));
    expect(screen.getByLabelText('Минимальная зарплата, ₽')).toHaveValue('25000');
    expect(screen.queryByLabelText('План продаж, ₽')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Причина изменения'), { target: { value: 'Скопированы условия' } });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ plan: 0, fixed: 2500000, rate: 500, mode: 'minimum' })));
    fireEvent.change(screen.getByLabelText('План начисления'), { target: { value: 'plan' } });
    expect(screen.getByLabelText('Когда начислять фикс')).toHaveValue('plan');
    fireEvent.change(screen.getByLabelText('План продаж, ₽'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 10000000, fixed: 2500000, rate: 500, mode: 'plan' })));
  });

  it('labels the guaranteed minimum as a floor rather than additive fixed pay', async () => {
    mocks.admin = false;
    mocks.dashboard.mockResolvedValue({
      ...data,
      terms: { plan: 0, fixed: 2500000, rate: 500, mode: 'minimum' },
      summary: { ...data.summary, salesTotal: 10000000, fixed: 2500000, commission: 500000, income: 2500000 },
    });
    render(<ManagerWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Минимальная зарплата' })).toBeVisible();
    expect(screen.getByText(/Начисляется большая сумма: минимальная зарплата или проценты с продаж/)).toBeVisible();
    expect(screen.getByText('Не меньше минимальной зарплаты · до налогов')).toBeVisible();
    expect(screen.queryByText('Фикс + комиссия · до налогов')).not.toBeInTheDocument();
  });

  it('keeps copied legacy no-plan fixed pay selectable and in the preview', async () => {
    mocks.admin = true;
    const previous = {
      ...data,
      month: '2026-09',
      terms: { plan: 0, fixed: 2500000, rate: 500, mode: 'always' as const },
    };
    mocks.dashboard.mockImplementation((month: string) =>
      Promise.resolve(month === '2026-09' ? previous : data),
    );
    mocks.managers.mockResolvedValue([
      { id: 1, name: 'Анна Иванова', userId: 1 },
    ]);
    mocks.preview.mockResolvedValue(data);
    render(<ManagerWorkspace />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Настроить условия' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Скопировать из предыдущего месяца' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('План начисления')).toHaveValue('legacy'),
    );
    expect(screen.getByRole('option', { name: 'Фикс + процент без плана' })).toBeInTheDocument();
    expect(screen.getByLabelText('Фиксированная часть, ₽')).toHaveValue('25000');
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Скопированы прежние условия' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
    expect(mocks.preview.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ plan: 0, fixed: 2500000, rate: 500, mode: 'always' }),
    );
  });

  it('describes a zero-plan cabinet without goal progress', async () => {
    mocks.admin = false;
    mocks.dashboard.mockResolvedValue({
      ...data,
      terms: { plan: 0, fixed: 0, rate: 800, mode: 'always' },
      summary: {
        salesTotal: 1620000,
        fixed: 0,
        commission: 129600,
        income: 129600,
        above: 1620000,
        remaining: 0,
        count: 1,
      },
    });
    render(<ManagerWorkspace />);
    await screen.findByRole('heading', { name: 'Анна Иванова' });
    expect(screen.getByText('Без плана')).toBeVisible();
    expect(screen.queryByText('План на месяц')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Комиссия с продаж' })).toBeVisible();
    expect(screen.getByText(/Процент начисляется со всей суммы продаж/)).toBeVisible();
  });
});
