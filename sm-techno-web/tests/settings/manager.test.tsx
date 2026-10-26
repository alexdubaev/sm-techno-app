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
});
