import { ApiRequestError } from "@/lib/api";
import type { AppUser } from "@/lib/types";
import type { StoredAuthSession } from "@/lib/storage";

type BootstrapAuthSessionOptions = {
  fetchCurrentUser: () => Promise<AppUser>;
  isActive: () => boolean;
  resetSession: (message: string) => void;
  savedSession: StoredAuthSession;
  saveAuthSession: (session: StoredAuthSession) => void;
  setSession: (session: StoredAuthSession) => void;
};

export async function bootstrapAuthSession({
  fetchCurrentUser,
  isActive,
  resetSession,
  savedSession,
  saveAuthSession,
  setSession,
}: BootstrapAuthSessionOptions): Promise<void> {
  if (!isActive()) {
    return;
  }

  setSession(savedSession);

  try {
    const user = await fetchCurrentUser();
    if (!isActive()) {
      return;
    }

    const nextSession: StoredAuthSession = {
      ...savedSession,
      user,
    };
    saveAuthSession(nextSession);
    setSession(nextSession);
  } catch (error: unknown) {
    if (
      isActive()
      && error instanceof ApiRequestError
      && (error.status === 0 || error.status === 401)
    ) {
      resetSession("Не удалось проверить сохраненную сессию. Войдите заново.");
    }
  }
}
