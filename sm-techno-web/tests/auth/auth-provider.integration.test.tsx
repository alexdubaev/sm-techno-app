import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { AuthProvider, useAuth } from '@/components/auth-provider';
import { fetchOrders } from '@/lib/api';
import {
  AUTH_SESSION_STORAGE_KEY,
  loadAuthSessionFromStorage,
  saveAuthSessionToStorage,
  type StoredAuthSession,
} from '@/lib/storage';
import type { AppUser } from '@/lib/types';
import { server } from './server';

function account(
  id: number,
  username: string,
  role: AppUser['role'] = 'user',
): AppUser {
  return {
    id,
    username,
    role,
    fullName: username,
    onecUsername: '',
    hasOnecPassword: false,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

function session(token: string, user: AppUser): StoredAuthSession {
  return { token, user };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Identity({ onActionDone }: { onActionDone?: () => void } = {}) {
  const { logout, refreshUser, user } = useAuth();
  const [forbiddenSeen, setForbiddenSeen] = useState(false);

  return (
    <div>
      <span>{`${user.username}:${user.role}`}</span>
      <button
        type="button"
        onClick={() => void logout().finally(() => onActionDone?.())}
      >
        Выйти
      </button>
      <button
        type="button"
        onClick={() => void refreshUser().finally(() => onActionDone?.())}
      >
        Обновить пользователя
      </button>
      <button
        type="button"
        onClick={() => {
          void fetchOrders().catch((error: unknown) => {
            if (
              typeof error === 'object' &&
              error &&
              'status' in error &&
              error.status === 403
            ) {
              setForbiddenSeen(true);
            }
          });
        }}
      >
        Запросить заказы
      </button>
      {forbiddenSeen ? (
        <span>Доступ запрещён без завершения сессии</span>
      ) : null}
    </div>
  );
}

describe('AuthProvider', () => {
  test('renders a compact login without marketing copy', async () => {
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole('button', { name: /^Войти$/ }),
    ).toBeVisible();
    expect(
      screen.queryByText('Локальный прайс и заказы'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Добро пожаловать')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Подключаем рабочее место'),
    ).not.toBeInTheDocument();
  });

  test('shows an invalid-login error, then stores a successful session', async () => {
    const admin = account(1, 'admin', 'admin');
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        const body = (await request.json()) as { password: string };
        if (body.password !== 'correct-password') {
          return HttpResponse.json(
            { detail: 'Неверный логин или пароль.' },
            { status: 401 },
          );
        }
        return HttpResponse.json(session('admin-token', admin));
      }),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText('Логин'), ' admin ');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^Войти$/ }));
    expect(await screen.findByText('Неверный логин или пароль.')).toBeVisible();

    await user.clear(screen.getByLabelText('Пароль'));
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: /^Войти$/ }));

    expect(await screen.findByText('admin:admin')).toBeVisible();
    expect(loadAuthSessionFromStorage()).toEqual(session('admin-token', admin));
  });

  test("verifies a saved session and uses the server's current role", async () => {
    const stored = account(1, 'operator', 'user');
    const current = account(1, 'operator', 'admin');
    saveAuthSessionToStorage(session('operator-token', stored));
    server.use(
      http.get('/api/auth/me', ({ request }) => {
        expect(request.headers.get('authorization')).toBe(
          'Bearer operator-token',
        );
        return HttpResponse.json({ user: current });
      }),
    );

    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    expect(screen.getByAltText('СМ Техно')).toBeVisible();
    expect(await screen.findByText('operator:admin')).toBeVisible();
    expect(screen.queryByText('operator:user')).not.toBeInTheDocument();
    expect(loadAuthSessionFromStorage()?.user.role).toBe('admin');
  });

  test('a current 401 logs out, while a 403 keeps the session', async () => {
    const operator = account(2, 'operator');
    saveAuthSessionToStorage(session('operator-token', operator));
    let orderStatus = 403;
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ user: operator })),
      http.get('/api/orders', () =>
        HttpResponse.json(
          {
            detail:
              orderStatus === 401
                ? 'Сессия недействительна.'
                : 'Доступ запрещён.',
          },
          { status: orderStatus },
        ),
      ),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );
    await screen.findByText('operator:user');

    await user.click(screen.getByRole('button', { name: 'Запросить заказы' }));
    expect(
      await screen.findByText('Доступ запрещён без завершения сессии'),
    ).toBeVisible();
    expect(screen.getByText('operator:user')).toBeVisible();

    orderStatus = 401;
    await user.click(screen.getByRole('button', { name: 'Запросить заказы' }));
    expect(
      await screen.findByRole('button', { name: /^Войти$/ }),
    ).toBeVisible();
    expect(loadAuthSessionFromStorage()).toBeNull();
  });

  test('logout clears local auth even when the server request fails', async () => {
    const operator = account(2, 'operator');
    saveAuthSessionToStorage(session('operator-token', operator));
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ user: operator })),
      http.post('/api/auth/logout', () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );
    await screen.findByText('operator:user');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(
      await screen.findByRole('button', { name: /^Войти$/ }),
    ).toBeVisible();
    expect(loadAuthSessionFromStorage()).toBeNull();
  });

  test('an external-tab logout immediately clears the rendered session', async () => {
    const operatorSession = session('operator-token', account(2, 'operator'));
    saveAuthSessionToStorage(operatorSession);
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ user: operatorSession.user }),
      ),
    );
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );
    await screen.findByText('operator:user');

    const oldValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_SESSION_STORAGE_KEY,
        oldValue,
        newValue: null,
      }),
    );

    expect(
      await screen.findByRole('button', { name: /^Войти$/ }),
    ).toBeVisible();
  });

  test('a delayed verification from account A cannot overwrite an external switch to B', async () => {
    const accountA = session('token-a', account(1, 'account-a'));
    const accountB = session('token-b', account(2, 'account-b', 'admin'));
    const aStarted = deferred<void>();
    const releaseA = deferred<void>();
    saveAuthSessionToStorage(accountA);
    server.use(
      http.get('/api/auth/me', async ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer token-a') {
          aStarted.resolve();
          await releaseA.promise;
          return HttpResponse.json({ user: accountA.user });
        }
        return HttpResponse.json({ user: accountB.user });
      }),
    );
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );
    await aStarted.promise;

    const oldValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    const newValue = JSON.stringify(accountB);
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, newValue);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_SESSION_STORAGE_KEY,
        oldValue,
        newValue,
      }),
    );
    releaseA.resolve();

    expect(await screen.findByText('account-b:admin')).toBeVisible();
    expect(screen.queryByText('account-a:user')).not.toBeInTheDocument();
    expect(loadAuthSessionFromStorage()).toEqual(accountB);
  });

  test('a delayed login for A cannot overwrite an external switch to B', async () => {
    const accountA = session('token-a', account(1, 'account-a'));
    const accountB = session('token-b', account(2, 'account-b', 'admin'));
    const loginStarted = deferred<void>();
    const releaseLogin = deferred<void>();
    const loginResponded = deferred<void>();
    server.use(
      http.post('/api/auth/login', async () => {
        loginStarted.resolve();
        await releaseLogin.promise;
        loginResponded.resolve();
        return HttpResponse.json(accountA);
      }),
      http.get('/api/auth/me', ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer token-b');
        return HttpResponse.json({ user: accountB.user });
      }),
    );
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    await userEvent.type(screen.getByLabelText('Логин'), 'account-a');
    await userEvent.type(screen.getByLabelText('Пароль'), 'account-a-password');
    await userEvent.click(screen.getByRole('button', { name: /^Войти$/ }));
    await loginStarted.promise;

    await act(async () => {
      const oldValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      saveAuthSessionToStorage(accountB);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_SESSION_STORAGE_KEY,
          oldValue,
          newValue: JSON.stringify(accountB),
        }),
      );
    });
    expect(await screen.findByText('account-b:admin')).toBeVisible();

    await act(async () => {
      releaseLogin.resolve();
      await loginResponded.promise;
    });
    expect(screen.getByText('account-b:admin')).toBeVisible();
    expect(screen.queryByText('account-a:user')).not.toBeInTheDocument();
    expect(loadAuthSessionFromStorage()).toEqual(accountB);
  });

  test('a delayed manual refresh from A cannot restore A after an external switch to B', async () => {
    const accountA = session('token-a', account(1, 'account-a', 'admin'));
    const accountB = session('token-b', account(2, 'account-b'));
    const refreshStarted = deferred<void>();
    const releaseRefresh = deferred<void>();
    const refreshDone = deferred<void>();
    let accountACalls = 0;
    saveAuthSessionToStorage(accountA);
    server.use(
      http.get('/api/auth/me', async ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer token-a') {
          accountACalls += 1;
          if (accountACalls === 2) {
            refreshStarted.resolve();
            await releaseRefresh.promise;
          }
          return HttpResponse.json({ user: accountA.user });
        }
        return HttpResponse.json({ user: accountB.user });
      }),
    );
    render(
      <AuthProvider>
        <Identity onActionDone={refreshDone.resolve} />
      </AuthProvider>,
    );
    await screen.findByText('account-a:admin');

    await userEvent.click(
      screen.getByRole('button', { name: 'Обновить пользователя' }),
    );
    await refreshStarted.promise;
    await act(async () => {
      const oldValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      saveAuthSessionToStorage(accountB);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_SESSION_STORAGE_KEY,
          oldValue,
          newValue: JSON.stringify(accountB),
        }),
      );
    });
    await screen.findByText('account-b:user');

    await act(async () => {
      releaseRefresh.resolve();
      await refreshDone.promise;
    });
    expect(loadAuthSessionFromStorage()).toEqual(accountB);
    expect(screen.getByText('account-b:user')).toBeVisible();
  });

  test('a delayed logout from A cannot delete an externally established B session', async () => {
    const accountA = session('token-a', account(1, 'account-a', 'admin'));
    const accountB = session('token-b', account(2, 'account-b'));
    const logoutStarted = deferred<void>();
    const releaseLogout = deferred<void>();
    const logoutDone = deferred<void>();
    saveAuthSessionToStorage(accountA);
    server.use(
      http.get('/api/auth/me', ({ request }) =>
        HttpResponse.json({
          user:
            request.headers.get('authorization') === 'Bearer token-a'
              ? accountA.user
              : accountB.user,
        }),
      ),
      http.post('/api/auth/logout', async () => {
        logoutStarted.resolve();
        await releaseLogout.promise;
        return HttpResponse.json({ ok: true });
      }),
    );
    render(
      <AuthProvider>
        <Identity onActionDone={logoutDone.resolve} />
      </AuthProvider>,
    );
    await screen.findByText('account-a:admin');

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await logoutStarted.promise;
    await act(async () => {
      const oldValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      saveAuthSessionToStorage(accountB);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_SESSION_STORAGE_KEY,
          oldValue,
          newValue: JSON.stringify(accountB),
        }),
      );
    });
    await screen.findByText('account-b:user');

    await act(async () => {
      releaseLogout.resolve();
      await logoutDone.promise;
    });
    expect(loadAuthSessionFromStorage()).toEqual(accountB);
    expect(screen.getByText('account-b:user')).toBeVisible();
  });
});
