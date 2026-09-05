'use client';

import Image from 'next/image';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiRequestError,
  fetchCurrentUser,
  invalidateApiCache,
  loginAppUser,
  logoutAppUser,
} from '@/lib/api';
import { bootstrapAuthSession } from '@/lib/auth-session';
import type { AppUser } from '@/lib/types';
import {
  AUTH_SESSION_STORAGE_KEY,
  clearAuthSessionFromStorage,
  clearCurrentUserSessionData,
  loadAuthSessionFromStorage,
  saveAuthSessionToStorage,
  type StoredAuthSession,
} from '@/lib/storage';

type AuthContextValue = {
  user: AppUser;
  isAdmin: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const sessionRevisionRef = useRef(0);

  const resetSession = useCallback((message?: string) => {
    sessionRevisionRef.current += 1;
    invalidateApiCache();
    clearCurrentUserSessionData();
    clearAuthSessionFromStorage();
    setSession(null);
    setIsBooting(false);
    setLoginError(message ?? null);
  }, []);

  useEffect(() => {
    let isActive = true;
    const revision = sessionRevisionRef.current + 1;
    sessionRevisionRef.current = revision;

    async function bootstrapSession() {
      const savedSession = loadAuthSessionFromStorage();
      if (!savedSession) {
        if (isActive) {
          setIsBooting(false);
        }
        return;
      }

      try {
        await bootstrapAuthSession({
          fetchCurrentUser,
          isActive: () => isActive && sessionRevisionRef.current === revision,
          resetSession,
          savedSession,
          saveAuthSession: saveAuthSessionToStorage,
          setSession,
        });
      } finally {
        if (isActive && sessionRevisionRef.current === revision) {
          setIsBooting(false);
        }
      }
    }

    void bootstrapSession();
    return () => {
      isActive = false;
    };
  }, [resetSession]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isActive = true;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SESSION_STORAGE_KEY) {
        return;
      }

      const revision = sessionRevisionRef.current + 1;
      sessionRevisionRef.current = revision;
      invalidateApiCache();
      const savedSession = loadAuthSessionFromStorage();

      if (!savedSession) {
        clearCurrentUserSessionData();
        setSession(null);
        setLoginError(null);
        setIsBooting(false);
        return;
      }

      setIsBooting(true);
      setLoginError(null);
      void bootstrapAuthSession({
        fetchCurrentUser,
        isActive: () => isActive && sessionRevisionRef.current === revision,
        resetSession,
        savedSession,
        saveAuthSession: saveAuthSessionToStorage,
        setSession,
      }).finally(() => {
        if (isActive && sessionRevisionRef.current === revision) {
          setIsBooting(false);
        }
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      isActive = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [resetSession]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleExpired = () => {
      resetSession('Сессия завершилась. Войдите заново.');
    };

    window.addEventListener(
      'sm-techno-auth-expired',
      handleExpired as EventListener,
    );
    return () => {
      window.removeEventListener(
        'sm-techno-auth-expired',
        handleExpired as EventListener,
      );
    };
  }, [resetSession]);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      const revision = sessionRevisionRef.current;
      let completedCurrentLogin = false;
      setIsSubmitting(true);
      setLoginError(null);
      try {
        const nextSession = await loginAppUser({ username, password });
        if (sessionRevisionRef.current !== revision) {
          return;
        }
        completedCurrentLogin = true;
        sessionRevisionRef.current += 1;
        saveAuthSessionToStorage(nextSession);
        setSession(nextSession);
      } catch (error: unknown) {
        if (
          sessionRevisionRef.current === revision ||
          loadAuthSessionFromStorage() === null
        ) {
          setLoginError(
            error instanceof ApiRequestError
              ? error.message
              : 'Сервис временно недоступен. Проверьте, что компьютер включён и приложение запущено, затем повторите вход.',
          );
        }
        throw error;
      } finally {
        setIsSubmitting(false);
        if (completedCurrentLogin || sessionRevisionRef.current === revision) {
          setIsBooting(false);
        }
      }
    },
    [],
  );

  const handleLogout = async () => {
    const revision = sessionRevisionRef.current;
    try {
      await logoutAppUser();
    } catch {
      // Even if the server session is already gone, we still clear the local state.
    } finally {
      if (sessionRevisionRef.current === revision) {
        resetSession();
      }
    }
  };

  const refreshUser = async () => {
    const current = loadAuthSessionFromStorage();
    if (!current) {
      resetSession();
      return;
    }

    const revision = sessionRevisionRef.current;
    const user = await fetchCurrentUser();
    if (
      sessionRevisionRef.current !== revision ||
      loadAuthSessionFromStorage()?.token !== current.token
    ) {
      return;
    }
    const nextSession: StoredAuthSession = {
      ...current,
      user,
    };
    saveAuthSessionToStorage(nextSession);
    setSession(nextSession);
  };

  if (isBooting) {
    return <BootScreen />;
  }

  if (!session?.user) {
    return (
      <LoginScreen
        isSubmitting={isSubmitting}
        error={loginError}
        onLogin={handleLogin}
      />
    );
  }

  const value: AuthContextValue = {
    user: session.user,
    isAdmin: session.user.role === 'admin',
    logout: handleLogout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07162E] px-5">
      <div className="flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="СМ Техно"
          width={196}
          height={131}
          priority
        />
        <div className="mt-7 h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-[var(--brand-yellow)]" />
      </div>
    </div>
  );
}

function LoginScreen({
  isSubmitting,
  error,
  onLogin,
}: {
  isSubmitting: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setLocalError('Введите логин и пароль.');
      return;
    }

    setLocalError(null);
    try {
      await onLogin(username.trim(), password);
    } catch {
      // The main error is already shown above the form.
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07162E] px-5 py-8">
      <div className="flex w-full max-w-[360px] flex-col items-center">
        <Image
          src="/logo.png"
          alt="СМ Техно"
          width={214}
          height={143}
          priority
        />
        <section className="mt-7 w-full rounded-[24px] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.22)] sm:px-6">
          {error || localError ? (
            <div className="mt-5 rounded-[14px] border border-[#F9D4D4] bg-[#FEF2F2] px-4 py-3 text-[12px] leading-5 text-[var(--stock-empty)]">
              {error || localError}
            </div>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={submit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                Логин
              </span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Введите логин"
                className="h-[48px] rounded-[16px] border border-[var(--border-color)] bg-white px-4 text-[14px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_4px_rgba(255,196,0,0.12)]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                Пароль
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                  className="h-[48px] w-full rounded-[16px] border border-[var(--border-color)] bg-white px-4 pr-16 text-[14px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_4px_rgba(255,196,0,0.12)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:bg-[#F8FAFD] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? 'Скрыть' : 'Показать'}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="app-action-button mt-1 h-[50px] rounded-[16px] px-5 text-[14px]"
            >
              {isSubmitting ? 'Входим...' : 'Войти'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
