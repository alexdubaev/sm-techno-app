'use client';

import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { OneCSettings } from '@/components/settings/onec/onec-settings';
import {
  fetchOrganizations,
  fetchSystemSettings,
  saveSystemSettings,
  testOneCAccess,
} from '@/lib/api';
import { SettingsAccessDenied } from '../settings-access';

const testSavedOneCConnection = () => testOneCAccess();

export default function OneCSettingsPage() {
  const { isAdmin } = useAuth();

  return (
    <AppShell>
      {isAdmin ? (
        <OneCSettings
          loadSettings={fetchSystemSettings}
          loadOrganizations={fetchOrganizations}
          saveSettings={saveSystemSettings}
          testConnection={testSavedOneCConnection}
        />
      ) : (
        <SettingsAccessDenied />
      )}
    </AppShell>
  );
}
