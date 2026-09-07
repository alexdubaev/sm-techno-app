"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { UsersSettings } from "@/components/settings/users/users-settings";
import {
  createAppUser,
  deleteAppUser,
  fetchUsers,
  revealAppPassword,
  revealOneCPassword,
  updateAppUser,
  type AppUserUpdatePayload,
} from "@/lib/api";
import { SettingsAccessDenied } from "../settings-access";

export default function UsersSettingsPage() {
  const router = useRouter();
  const { isAdmin, refreshUser, user } = useAuth();

  const updateUser = useCallback(
    async (userId: number, payload: AppUserUpdatePayload) => {
      const updated = await updateAppUser(userId, payload);
      if (updated.id === user.id) {
        await refreshUser();
      }
      return updated;
    },
    [refreshUser, user.id],
  );
  const returnToSettings = useCallback(() => router.push("/settings"), [router]);

  return (
    <AppShell>
      {isAdmin ? (
        <UsersSettings
          loadUsers={fetchUsers}
          createUser={createAppUser}
          updateUser={updateUser}
          deleteUser={deleteAppUser}
          revealAppPassword={revealAppPassword}
          revealOnecPassword={revealOneCPassword}
          currentUserId={user.id}
          onBack={returnToSettings}
        />
      ) : (
        <SettingsAccessDenied />
      )}
    </AppShell>
  );
}
