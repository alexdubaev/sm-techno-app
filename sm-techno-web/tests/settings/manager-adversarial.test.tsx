import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  managers: vi.fn(),
  preview: vi.fn(),
  change: vi.fn(),
  avatar: vi.fn(),
  upload: vi.fn(),
  history: vi.fn(),
  snapshots: vi.fn(),
  snapshot: vi.fn(),
  userId: 1,
  admin: false,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: { id: mocks.userId }, isAdmin: mocks.admin }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div>График продаж</div> }));
vi.mock('@/lib/api', () => ({
  fetchManagerDashboard: mocks.dashboard,
  fetchManagers: mocks.managers,
  previewManagerChange: mocks.preview,
  saveManagerChange: mocks.change,
  fetchManagerAvatar: mocks.avatar,
  uploadManagerAvatar: mocks.upload,
  fetchManagerHistory: mocks.history,
  fetchManagerSnapshots: mocks.snapshots,
  fetchManagerSnapshot: mocks.snapshot,
}));

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.userId = 1;
  mocks.admin = false;
  mocks.dashboard.mockReset();
  mocks.managers.mockReset().mockResolvedValue([]);
  mocks.preview.mockReset();
  mocks.change.mockReset();
  mocks.avatar.mockReset();
  mocks.upload.mockReset();
  mocks.history.mockReset();
  mocks.snapshots.mockReset().mockResolvedValue([]);
  mocks.snapshot.mockReset();
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('manager cabinet async interactions', () => {
  it('does not let a previous month response replace the currently selected month', async () => {
    const october = deferred<ReturnType<typeof dashboard>>();
    const november = deferred<ReturnType<typeof dashboard>>();
    mocks.dashboard.mockImplementation((month: string) =>
      month === '2026-10' ? october.promise : november.promise,
    );
    render(<ManagerWorkspace />);

    const month = await screen.findByLabelText('Месяц');
    fireEvent.change(month, { target: { value: '2026-11' } });
    await act(async () => november.resolve(dashboard({ month: '2026-11' })));
    expect(await screen.findByText('ноябрь 2026 г.')).toBeVisible();

    await act(async () => october.resolve(dashboard()));
    expect(screen.getByText('ноябрь 2026 г.')).toBeVisible();
    expect(screen.queryByText('октябрь 2026 г.')).not.toBeInTheDocument();
  });

  it('does not let the previous employee response replace a new authenticated user', async () => {
    const anna = deferred<ReturnType<typeof dashboard>>();
    const boris = deferred<ReturnType<typeof dashboard>>();
    mocks.dashboard.mockImplementation((_month: string, managerId?: number) =>
      managerId === undefined ? (mocks.userId === 1 ? anna.promise : boris.promise) : Promise.resolve(dashboard()),
    );
    const view = render(<ManagerWorkspace />);
    mocks.userId = 2;
    view.rerender(<ManagerWorkspace />);
    await act(async () => boris.resolve(dashboard({ account: { ...dashboard().account, id: 2, userId: 2, name: 'Борис Сидоров' } })));
    expect(await screen.findByText('Борис Сидоров')).toBeVisible();
    await act(async () => anna.resolve(dashboard()));
    expect(screen.getByText('Борис Сидоров')).toBeVisible();
    expect(screen.queryByText('Анна Иванова')).not.toBeInTheDocument();
  });

  it('does not let a late self response replace the selected employee cabinet', async () => {
    mocks.admin = true;
    const own = deferred<ReturnType<typeof dashboard>>();
    const employee = deferred<ReturnType<typeof dashboard>>();
    mocks.managers.mockResolvedValue([{ id: 2, userId: 22, name: 'Борис Сидоров', active: true }]);
    mocks.dashboard.mockImplementation((_month: string, managerId?: number) =>
      managerId === 2 ? employee.promise : own.promise,
    );
    render(<ManagerWorkspace />);

    const picker = await screen.findByLabelText('Кабинет сотрудника');
    await screen.findByRole('option', { name: 'Борис Сидоров' });
    fireEvent.change(picker, { target: { value: '2' } });
    await act(async () => employee.resolve(dashboard({ account: { ...dashboard().account, id: 2, userId: 22, name: 'Борис Сидоров' } })));
    expect(await screen.findByRole('heading', { name: 'Борис Сидоров' })).toBeVisible();
    await act(async () => own.resolve(dashboard()));
    expect(screen.getByRole('heading', { name: 'Борис Сидоров' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Анна Иванова' })).not.toBeInTheDocument();
  });

  it('keeps a rejected search recoverable and repeats the same query and page', async () => {
    const failure = new Error('Поиск временно недоступен');
    mocks.dashboard
      .mockResolvedValueOnce(dashboard())
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(dashboard());
    render(<ManagerWorkspace />);
    await screen.findByText('Анна Иванова');

    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по клиенту или номеру' }), {
      target: { value: 'ООО Ромашка' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure.message);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить поиск' }));

    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(3));
    expect(mocks.dashboard).toHaveBeenLastCalledWith(
      '2026-10',
      1,
      'ООО Ромашка',
      1,
    );
    expect(await screen.findByText('Найдено: 0')).toBeVisible();
  });

  it('accepts a server-clamped page after concurrent deletions shrink the result set', async () => {
    mocks.dashboard
      .mockResolvedValueOnce(dashboard({ total: 20, pages: 2 }))
      .mockResolvedValueOnce(dashboard({ total: 19, pages: 1, page: 1 }));
    render(<ManagerWorkspace />);
    await screen.findByText('Анна Иванова');
    const next = screen.getByRole('button', { name: 'Далее' });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(await screen.findByText('Найдено: 19')).toBeVisible();
    expect(screen.getByText('1 / 1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
    expect(mocks.dashboard).toHaveBeenLastCalledWith('2026-10', 1, '', 2);
  });

  it('invalidates a calculated preview as soon as an input changes', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    mocks.preview.mockResolvedValue(dashboard());
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Первичная причина' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    expect(await screen.findByRole('button', { name: 'Сохранить изменения' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Обновлённая причина' },
    });
    expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).not.toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it('rejects negative, exponent-form, and over-precision money before preview', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Проверка ввода' },
    });
    const plan = screen.getByLabelText('План продаж, ₽');
    for (const invalid of ['-1', '1e6', '1.234']) {
      fireEvent.change(plan, { target: { value: invalid } });
      fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('неотрицательное число');
      expect(mocks.preview).not.toHaveBeenCalled();
    }
  });

  it('rejects a rate above 100 before showing a successful preview', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    mocks.preview.mockResolvedValue(dashboard());
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Проверка ставки' },
    });
    const rate = screen.getByLabelText(/Ставка для новых продаж/);
    fireEvent.change(rate, { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать изменения' }));
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/ставк|процент/i);
  });

  it('asks before discarding edits and lets the user resume editing', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Несохранённое изменение' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(await screen.findByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    expect(screen.getByLabelText('Причина изменения')).toHaveValue('Несохранённое изменение');
    expect(screen.queryByRole('heading', { name: 'Есть несохранённые изменения' })).not.toBeInTheDocument();
  });

  it('routes Escape through the unsaved-edits confirmation', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Изменённая причина' },
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
  });

  it('intercepts in-app navigation while the editor has unsaved changes', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    const view = render(<ManagerWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить условия' }));
    fireEvent.change(screen.getByLabelText('Причина изменения'), {
      target: { value: 'Несохранённое изменение' },
    });
    const link = document.createElement('a');
    link.href = '/stock';
    link.textContent = 'Склад';
    document.body.append(link);
    try {
      fireEvent.click(link);
      expect(await screen.findByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
    } finally {
      link.remove();
      view.unmount();
    }
  });

  it('does not resurrect an avatar request after its employee view unmounts', async () => {
    const pending = deferred<Blob>();
    mocks.avatar.mockReturnValue(pending.promise);
    mocks.dashboard.mockResolvedValue(
      dashboard({ account: { ...dashboard().account, hasAvatar: true } }),
    );
    const createObjectURL = vi.fn(() => 'blob:manager-photo');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const view = render(<ManagerWorkspace />);
    await screen.findByText('Анна Иванова');
    view.unmount();

    await act(async () => pending.resolve(new Blob(['photo'], { type: 'image/png' })));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('offers retry after history loading fails', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    mocks.history
      .mockRejectedValueOnce(new Error('История временно недоступна'))
      .mockResolvedValueOnce({ items: [], total: 0 });
    mocks.snapshots.mockResolvedValue([]);
    render(<ManagerWorkspace />);
    await screen.findByText('Анна Иванова');
    fireEvent.click(screen.getByRole('button', { name: 'История изменений' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('История временно недоступна');
    fireEvent.click(screen.getByRole('button', { name: /Повторить/ }));
    expect(await screen.findByText('Изменений пока нет.')).toBeVisible();
    expect(mocks.history).toHaveBeenCalledTimes(2);
  });

  it('offers retry when the administrator employee list fails to load', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    mocks.managers
      .mockRejectedValueOnce(new Error('Список сотрудников недоступен'))
      .mockResolvedValueOnce([{ id: 2, userId: 22, name: 'Борис Сидоров', active: true }]);
    render(<ManagerWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Список сотрудников недоступен');
    fireEvent.click(screen.getByRole('button', { name: /Повторить/ }));
    expect(await screen.findByRole('option', { name: 'Борис Сидоров' })).toBeVisible();
    expect(mocks.managers).toHaveBeenCalledTimes(2);
  });

  it('loads snapshot details only when expanded, then retries and paginates sales', async () => {
    mocks.admin = true;
    mocks.dashboard.mockResolvedValue(dashboard());
    mocks.history.mockResolvedValue({ items: [], total: 0 });
    mocks.snapshots.mockResolvedValue([
      { id: 41, at: '2026-10-28T12:00:00Z', actor: 'Администратор', version: 7 },
    ]);
    mocks.snapshot
      .mockRejectedValueOnce(new Error('Снимок временно недоступен'))
      .mockResolvedValueOnce({
        id: 41,
        at: '2026-10-28T12:00:00Z',
        actor: 'Администратор',
        version: 7,
        data: dashboard({ page: 1, pages: 2, total: 25 }),
      })
      .mockResolvedValueOnce({
        id: 41,
        at: '2026-10-28T12:00:00Z',
        actor: 'Администратор',
        version: 7,
        data: dashboard({ page: 2, pages: 2, total: 25 }),
      });
    render(<ManagerWorkspace />);
    await screen.findByText('Анна Иванова');
    fireEvent.click(screen.getByRole('button', { name: 'История изменений' }));
    const summary = await screen.findByText(/Администратор · версия 7/);
    expect(mocks.snapshot).not.toHaveBeenCalled();

    fireEvent.click(summary);
    expect(await screen.findByRole('alert')).toHaveTextContent('Снимок временно недоступен');
    expect(mocks.snapshot).toHaveBeenCalledWith(41, 1);
    fireEvent.click(screen.getByRole('button', { name: /Повторить загрузку снимка/ }));
    expect(await screen.findByText('1 / 2')).toBeVisible();
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Следующие продажи' }));
    expect(await screen.findByText('2 / 2')).toBeVisible();
    expect(mocks.snapshot).toHaveBeenLastCalledWith(41, 2);
  });
});
