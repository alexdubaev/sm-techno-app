"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiRequestError,
  fetchCurrentUser,
  invalidateApiCache,
  loginAppUser,
  logoutAppUser,
} from "@/lib/api";
import { bootstrapAuthSession } from "@/lib/auth-session";
import type { AppUser } from "@/lib/types";
import {
  clearAuthSessionFromStorage,
  clearCurrentUserSessionData,
  loadAuthSessionFromStorage,
  saveAuthSessionToStorage,
  type StoredAuthSession,
} from "@/lib/storage";

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

  const resetSession = useCallback((message?: string) => {
    invalidateApiCache();
    clearCurrentUserSessionData();
    clearAuthSessionFromStorage();
    setSession(null);
    setLoginError(message ?? null);
  }, []);

  useEffect(() => {
    let isActive = true;

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
          isActive: () => isActive,
          resetSession,
          savedSession,
          saveAuthSession: saveAuthSessionToStorage,
          setSession,
        });
      } finally {
        if (isActive) {
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
    if (typeof window === "undefined") {
      return;
    }

    const handleExpired = () => {
      resetSession("Сессия завершилась. Войдите заново.");
    };

    window.addEventListener("sm-techno-auth-expired", handleExpired as EventListener);
    return () => {
      window.removeEventListener("sm-techno-auth-expired", handleExpired as EventListener);
    };
  }, [resetSession]);

  const handleLogin = useCallback(async (username: string, password: string) => {
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const nextSession = await loginAppUser({ username, password });
      saveAuthSessionToStorage(nextSession);
      setSession(nextSession);
    } catch (error: unknown) {
      setLoginError(
        error instanceof ApiRequestError
          ? error.message
          : "Сервис временно недоступен. Проверьте, что компьютер включён и приложение запущено, затем повторите вход.",
      );
      throw error;
    } finally {
      setIsSubmitting(false);
      setIsBooting(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logoutAppUser();
    } catch {
      // Even if the server session is already gone, we still clear the local state.
    } finally {
      resetSession();
    }
  }, [resetSession]);

  const refreshUser = useCallback(async () => {
    const current = loadAuthSessionFromStorage();
    if (!current) {
      resetSession();
      return;
    }

    const user = await fetchCurrentUser();
    const nextSession: StoredAuthSession = {
      ...current,
      user,
    };
    saveAuthSessionToStorage(nextSession);
    setSession(nextSession);
  }, [resetSession]);

  const value = useMemo<AuthContextValue | null>(() => {
    if (!session?.user) {
      return null;
    }

    return {
      user: session.user,
      isAdmin: session.user.role === "admin",
      logout: handleLogout,
      refreshUser,
    };
  }, [handleLogout, refreshUser, session]);

  if (isBooting) {
    return <BootScreen />;
  }

  if (!value) {
    return <LoginScreen isSubmitting={isSubmitting} error={loginError} onLogin={handleLogin} />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4">
      <div className="flex w-full max-w-[420px] flex-col items-center rounded-[24px] border border-[var(--border-color)] bg-white px-6 py-8 text-center shadow-[0_18px_46px_rgba(7,22,46,0.08)]">
        <Image src="/logo.png" alt="СМ Техно" width={196} height={84} className="h-auto w-[196px]" priority />
        <div className="mt-5 h-9 w-9 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-[var(--brand-yellow)]" />
        <h1 className="mt-4 text-[18px] font-[650] text-[var(--text-primary)]">Подключаем рабочее место</h1>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
          Проверяем сохраненную сессию и подготавливаем приложение к работе.
        </p>
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setLocalError("Введите логин и пароль.");
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
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4 py-6">
      <div className="grid w-full max-w-[980px] gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] bg-[linear-gradient(145deg,#07162E_0%,#10264A_100%)] px-7 py-8 text-white shadow-[0_24px_60px_rgba(7,22,46,0.18)]">
          <Image src="/logo.png" alt="СМ Техно" width={248} height={106} className="h-auto w-[248px]" priority />
          <div className="mt-7 max-w-[28rem]">
            <h1 className="text-[30px] font-[700] leading-[1.04] tracking-[-0.05em]">Локальный прайс и заказы</h1>
            <p className="mt-3 text-[14px] leading-6 text-white/72">
              Вход в рабочее приложение СМ ТЕХНО. Здесь менеджеры оформляют счета, а администратор управляет каталогом, пользователями и настройками 1С.
            </p>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <FeatureCard title="Остатки" text="Быстрый поиск по локальному прайсу и добавление в счет." />
            <FeatureCard title="Счета" text="Отправка заказа в 1С от своего пользователя." />
            <FeatureCard title="Права" text="Разделение доступа для администратора и сотрудников." />
          </div>
        </section>

        <section className="rounded-[28px] border border-[var(--border-color)] bg-white px-6 py-7 shadow-[0_18px_46px_rgba(7,22,46,0.08)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Вход в систему</p>
            <h2 className="mt-2 text-[24px] font-[650] tracking-[-0.04em] text-[var(--text-primary)]">Добро пожаловать</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              Используйте свой логин приложения. Если это первый вход, администратор сможет выдать вам учетную запись в разделе настроек.
            </p>
          </div>

          {error || localError ? (
            <div className="mt-5 rounded-[14px] border border-[#F9D4D4] bg-[#FEF2F2] px-4 py-3 text-[12px] leading-5 text-[var(--stock-empty)]">
              {error || localError}
            </div>
          ) : null}

          <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Логин</span>
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Пароль</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
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
                  {showPassword ? "Скрыть" : "Показать"}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="app-action-button mt-1 h-[50px] rounded-[16px] px-5 text-[14px]"
            >
              {isSubmitting ? "Входим..." : "Войти в приложение"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-sm">
      <div className="text-[13px] font-semibold text-white">{title}</div>
      <div className="mt-2 text-[12px] leading-5 text-white/70">{text}</div>
    </div>
  );
}
