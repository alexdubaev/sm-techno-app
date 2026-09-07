"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { SettingsFeedback } from "@/components/settings/shared/settings-feedback";
import { SettingsLanding } from "@/components/settings/shared/settings-landing";
import { SettingsShell } from "@/components/settings/shared/settings-shell";
import { fetchUsers } from "@/lib/api";
import { SettingsAccessDenied } from "./settings-access";

type UserCounts = {
  total: number;
  active: number;
};

export default function SettingsPage() {
  const { isAdmin } = useAuth();

  return <AppShell>{isAdmin ? <AdminSettingsLanding /> : <SettingsAccessDenied />}</AppShell>;
}

function AdminSettingsLanding() {
  const [counts, setCounts] = useState<UserCounts>({ total: 0, active: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void fetchUsers()
      .then((users) => {
        if (!isActive) return;
        setCounts({
          total: users.length,
          active: users.filter((user) => user.isActive).length,
        });
      })
      .catch((requestError: unknown) => {
        if (!isActive) return;
        setError(
          requestError instanceof Error && requestError.message.trim()
            ? requestError.message.trim()
            : "Не удалось загрузить сведения о пользователях.",
        );
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SettingsShell
      title="Настройки"
      description="Управление учетными записями и параметрами интеграции."
    >
      <div className="mb-5">
        <SettingsFeedback
          message={error ?? (isLoading ? "Загружаем сведения о пользователях…" : undefined)}
          tone={error ? "error" : "info"}
        />
      </div>
      <SettingsLanding
        totalUsersCount={counts.total}
        activeUsersCount={counts.active}
        usersHref="/settings/users"
        onecHref="/settings/onec"
      />
    </SettingsShell>
  );
}
