// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UsersSettings,
  type SettingsUser,
  type UsersSettingsProps,
} from '../../components/settings/users/users-settings';

const users: SettingsUser[] = [
  {
    id: 1,
    username: 'ivan',
    fullName: 'Иван Иванов',
    role: 'admin',
    isActive: true,
    onecUsername: 'ivan_1c',
    hasOnecPassword: true,
    hasRecoverableAppPassword: true,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 2,
    username: 'anna',
    fullName: 'Анна Петрова',
    role: 'user',
    isActive: false,
    onecUsername: '',
    hasOnecPassword: false,
    hasRecoverableAppPassword: false,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
];

function setup(overrides: Partial<UsersSettingsProps> = {}) {
  const props: UsersSettingsProps = {
    loadUsers: vi.fn().mockResolvedValue(users),
    createUser: vi.fn().mockImplementation(async (value) => ({
      ...users[1],
      ...value,
      id: 3,
      isActive: true,
    })),
    updateUser: vi.fn().mockImplementation(async (id, value) => ({
      ...users.find((user) => user.id === id),
      ...value,
    })),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    revealAppPassword: vi
      .fn()
      .mockResolvedValue({ available: true, password: 'app-secret' }),
    revealOnecPassword: vi
      .fn()
      .mockResolvedValue({ available: true, password: 'onec-secret' }),
    onBack: vi.fn(),
    ...overrides,
  };
  render(<UsersSettings {...props} />);
  return props;
}

async function selectIvan() {
  fireEvent.click(
    await screen.findByRole('button', { name: /Иван Иванов ivan/ }),
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Users settings', () => {
  it('starts with a searchable list and selection placeholder; refresh loads current users', async () => {
    const props = setup();
    expect(
      await screen.findByText('Выберите пользователя'),
    ).toBeInTheDocument();
    expect(screen.getByText('Всего: 2 · Активных: 1')).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Поиск пользователей' }),
      { target: { value: 'АННА' } },
    );
    expect(
      screen.queryByRole('button', { name: /Иван Иванов ivan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Анна Петрова anna/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список' }));
    await waitFor(() => expect(props.loadUsers).toHaveBeenCalledTimes(2));
  });

  it('shows separate desktop detail sections and saves one exact update payload', async () => {
    const props = setup();
    await selectIvan();
    for (const name of ['Основное', 'Доступ в СМ ТЕХНО', 'Доступ к 1С'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Анна Петрова anna/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Иван Новиков' },
    });
    fireEvent.change(screen.getByLabelText('Роль'), {
      target: { value: 'user' },
    });
    fireEvent.click(screen.getByLabelText('Пользователь активен'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить изменения' }),
    );
    await waitFor(() =>
      expect(props.updateUser).toHaveBeenCalledWith(1, {
        fullName: 'Иван Новиков',
        role: 'user',
        isActive: false,
        onecUsername: 'ivan_1c',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Изменения сохранены',
    );
  });

  it('uses independent reveal callbacks, hides manually and expires after 45 seconds', async () => {
    const props = setup();
    await selectIvan();
    vi.useFakeTimers();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
      ),
    );
    expect(screen.getByText('app-secret')).toBeInTheDocument();
    expect(props.revealAppPassword).toHaveBeenCalledWith(1);
    expect(props.revealOnecPassword).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Показать пароль 1С' }),
      ),
    );
    expect(screen.getByText('onec-secret')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Скрыть пароль СМ ТЕХНО' }),
    );
    expect(screen.queryByText('app-secret')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(screen.queryByText('onec-secret')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain('secret');
  });

  it('clears reveals on user switch and never resurrects a late response', async () => {
    let resolve!: (value: {
      available: boolean;
      password: string | null;
    }) => void;
    setup({
      revealAppPassword: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Анна Петрова anna/ }));
    await act(async () =>
      resolve({ available: true, password: 'late-secret' }),
    );
    await selectIvan();
    expect(screen.queryByText('late-secret')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    ).toBeInTheDocument();
  });

  it('explains unavailable legacy passwords without sending a reveal request', async () => {
    const props = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: /Анна Петрова anna/ }),
    );
    expect(
      screen.getByText(/Пароль недоступен для просмотра/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    ).toBeDisabled();
    expect(props.revealAppPassword).not.toHaveBeenCalled();
  });

  it('requires matching password confirmation and stages it until unified save', async () => {
    const props = setup();
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Изменить пароль СМ ТЕХНО' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Новый пароль'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(within(dialog).getByLabelText('Повторите пароль'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Изменить пароль' }),
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Пароли не совпадают',
    );
    fireEvent.change(within(dialog).getByLabelText('Повторите пароль'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Изменить пароль' }),
    );
    expect(props.updateUser).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить изменения' }),
    );
    await waitFor(() =>
      expect(props.updateUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ appPassword: 'new-password' }),
      ),
    );
    expect(props.updateUser).toHaveBeenCalledTimes(1);
  });

  it.each(['selection', 'refresh', 'back', 'link'])(
    'protects dirty edits during %s with an explicit discard choice',
    async (action) => {
      const props = setup();
      await selectIvan();
      fireEvent.change(screen.getByLabelText('ФИО'), {
        target: { value: 'Не сохранено' },
      });
      if (action === 'selection')
        fireEvent.click(
          screen.getByRole('button', { name: /Анна Петрова anna/ }),
        );
      if (action === 'refresh')
        fireEvent.click(
          screen.getByRole('button', { name: 'Обновить список' }),
        );
      if (action === 'back')
        fireEvent.click(screen.getByRole('button', { name: 'К настройкам' }));
      if (action === 'link') {
        const link = document.createElement('a');
        link.href = '/other';
        link.textContent = 'Other';
        document.body.append(link);
        fireEvent.click(link);
        link.remove();
      }
      const dialog = screen.getByRole('dialog', {
        name: 'Несохранённые изменения',
      });
      expect(props.onBack).not.toHaveBeenCalled();
      expect(props.loadUsers).toHaveBeenCalledTimes(1);
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Продолжить редактирование',
        }),
      );
      expect(screen.getByLabelText('ФИО')).toHaveValue('Не сохранено');
      fireEvent.click(
        screen.getByRole('button', { name: /Анна Петрова anna/ }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Не сохранять' }));
      expect(screen.getByLabelText('ФИО')).toHaveValue('Анна Петрова');
    },
  );

  it('prevents browser refresh/close when form has changes', async () => {
    setup();
    await selectIvan();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Не сохранено' },
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('intercepts browser back before the route changes, then traverses only after discard', async () => {
    const navigation = new EventTarget();
    const traverseTo = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: Object.assign(navigation, { traverseTo }),
    });
    setup();
    await selectIvan();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Черновик' },
    });
    const event = new Event('navigate', { cancelable: true });
    Object.assign(event, {
      navigationType: 'traverse',
      destination: { key: 'previous-route', sameDocument: true },
    });
    act(() => {
      navigation.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Не сохранять' }));
    expect(traverseTo).toHaveBeenCalledWith('previous-route');
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: undefined,
    });
  });

  it('warns on legacy browser back and restores history when cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const go = vi
      .spyOn(window.history, 'go')
      .mockImplementation(() => undefined);
    setup();
    await selectIvan();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Черновик' },
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText('ФИО')).toHaveValue('Черновик');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('clears visible secrets when detail closes', async () => {
    setup();
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    );
    expect(await screen.findByText('app-secret')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await selectIvan();
    expect(screen.queryByText('app-secret')).not.toBeInTheDocument();
  });

  it('stages a separate 1C password without changing the application password', async () => {
    const props = setup();
    await selectIvan();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль 1С' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Новый пароль'), {
      target: { value: 'replacement-onec' },
    });
    fireEvent.change(within(dialog).getByLabelText('Повторите пароль'), {
      target: { value: 'replacement-onec' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Изменить пароль' }),
    );
    expect(props.updateUser).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить изменения' }),
    );
    await waitFor(() =>
      expect(props.updateUser).toHaveBeenCalledWith(1, {
        fullName: 'Иван Иванов',
        role: 'admin',
        isActive: true,
        onecUsername: 'ivan_1c',
        onecPassword: 'replacement-onec',
      }),
    );
  });

  it('protects partially entered passwords from dialog dismissal and browser unload', async () => {
    setup();
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Изменить пароль СМ ТЕХНО' }),
    );
    fireEvent.change(screen.getByLabelText('Новый пароль'), {
      target: { value: 'unfinished-password' },
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(
      screen.getByRole('dialog', { name: 'Несохранённые изменения' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Продолжить редактирование' }),
    );
    expect(screen.getByLabelText('Новый пароль')).toHaveValue(
      'unfinished-password',
    );
  });

  it('shows a safe unavailable response and leaves no secret in storage', async () => {
    setup({
      revealAppPassword: vi
        .fn()
        .mockResolvedValue({ available: false, password: null }),
    });
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    );
    expect(
      await screen.findByText(/Пароль недоступен для просмотра/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать пароль СМ ТЕХНО' }),
    ).toBeDisabled();
  });

  it('switches mobile between list, detail and a separate create screen', async () => {
    vi.mocked(window.matchMedia).mockImplementation(
      () =>
        ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const props = setup();
    await selectIvan();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Назад к пользователям' }),
    );
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Новый пользователь',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Новый пользователь' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Новый Сотрудник' },
    });
    fireEvent.change(screen.getByLabelText('Логин'), {
      target: { value: 'new-user' },
    });
    fireEvent.change(screen.getByLabelText('Пароль СМ ТЕХНО'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Логин 1С'), {
      target: { value: 'new-1c' },
    });
    fireEvent.change(screen.getByLabelText('Пароль 1С'), {
      target: { value: 'new-onec-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Создать пользователя' }),
    );
    await waitFor(() =>
      expect(props.createUser).toHaveBeenCalledWith({
        fullName: 'Новый Сотрудник',
        username: 'new-user',
        password: 'new-password',
        appPassword: 'new-password',
        role: 'user',
        onecUsername: 'new-1c',
        onecPassword: 'new-onec-password',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Доступ в СМ ТЕХНО' }),
    ).toBeInTheDocument();
  });

  it('requires explicit delete confirmation and removes only the confirmed user', async () => {
    const props = setup();
    await selectIvan();
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить пользователя' }),
    );
    expect(props.deleteUser).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', {
      name: 'Удалить пользователя?',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(props.deleteUser).toHaveBeenCalledWith(1));
    expect(
      await screen.findByText('Выберите пользователя'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Иван Иванов ivan/ }),
    ).not.toBeInTheDocument();
  });

  it('protects own active admin account and reports server errors without discarding drafts', async () => {
    setup({
      currentUserId: 1,
      updateUser: vi
        .fn()
        .mockRejectedValue(
          new Error('Нельзя отключить последнего администратора'),
        ),
    });
    await selectIvan();
    expect(
      screen.getByRole('button', { name: 'Удалить пользователя' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Пользователь активен')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('ФИО'), {
      target: { value: 'Черновик' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить изменения' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить изменения',
    );
    expect(screen.getByLabelText('ФИО')).toHaveValue('Черновик');
  });
});
