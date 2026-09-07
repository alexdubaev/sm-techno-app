import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isAdmin: true,
  refreshUser: vi.fn(async () => undefined),
  push: vi.fn(),
  usersProps: null as Record<string, unknown> | null,
  onecProps: null as Record<string, unknown> | null,
}));

const api = vi.hoisted(() => ({
  fetchUsers: vi.fn(async () => []),
  createAppUser: vi.fn(),
  updateAppUser: vi.fn(async (id: number) => ({ id })),
  deleteAppUser: vi.fn(),
  revealAppPassword: vi.fn(),
  revealOneCPassword: vi.fn(),
  fetchSystemSettings: vi.fn(),
  fetchOrganizations: vi.fn(async () => []),
  saveSystemSettings: vi.fn(),
  testOneCAccess: vi.fn(async () => ({ counterparties: 1, organizations: 1 })),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({
    isAdmin: state.isAdmin,
    user: { id: 7 },
    refreshUser: state.refreshUser,
  }),
}));
vi.mock('@/components/settings/users/users-settings', () => ({
  UsersSettings: (props: Record<string, unknown>) => {
    state.usersProps = props;
    return <div>users-screen</div>;
  },
}));
vi.mock('@/components/settings/onec/onec-settings', () => ({
  OneCSettings: (props: Record<string, unknown>) => {
    state.onecProps = props;
    return <div>onec-screen</div>;
  },
}));
vi.mock('@/lib/api', () => api);

import OneCSettingsPage from '@/app/settings/onec/page';
import UsersSettingsPage from '@/app/settings/users/page';

describe('Settings route wiring', () => {
  beforeEach(() => {
    state.isAdmin = true;
    state.usersProps = null;
    state.onecProps = null;
    vi.clearAllMocks();
  });

  test('wires Users callbacks and refreshes auth after editing the current account', async () => {
    render(<UsersSettingsPage />);

    expect(screen.getByText('users-screen')).toBeInTheDocument();
    expect(state.usersProps).toMatchObject({
      loadUsers: api.fetchUsers,
      createUser: api.createAppUser,
      deleteUser: api.deleteAppUser,
      revealAppPassword: api.revealAppPassword,
      revealOnecPassword: api.revealOneCPassword,
      currentUserId: 7,
    });

    const updateUser = state.usersProps?.updateUser as (
      id: number,
      payload: Record<string, unknown>,
    ) => Promise<unknown>;
    await updateUser(7, { fullName: 'Администратор' });
    expect(api.updateAppUser).toHaveBeenCalledWith(7, {
      fullName: 'Администратор',
    });
    expect(state.refreshUser).toHaveBeenCalledTimes(1);

    const onBack = state.usersProps?.onBack as () => void;
    onBack();
    expect(state.push).toHaveBeenCalledWith('/settings');
  });

  test('wires global 1C settings and tests the existing saved connection without a payload', async () => {
    render(<OneCSettingsPage />);

    expect(screen.getByText('onec-screen')).toBeInTheDocument();
    expect(state.onecProps).toMatchObject({
      loadSettings: api.fetchSystemSettings,
      loadOrganizations: api.fetchOrganizations,
      saveSettings: api.saveSystemSettings,
    });
    const testConnection = state.onecProps
      ?.testConnection as () => Promise<unknown>;
    await testConnection();
    expect(api.testOneCAccess).toHaveBeenCalledWith();
  });

  test('keeps both child screens behind the admin gate', () => {
    state.isAdmin = false;
    const users = render(<UsersSettingsPage />);
    expect(
      screen.getByText(/доступен только администратору/i),
    ).toBeInTheDocument();
    expect(state.usersProps).toBeNull();
    users.unmount();

    render(<OneCSettingsPage />);
    expect(
      screen.getByText(/доступен только администратору/i),
    ).toBeInTheDocument();
    expect(state.onecProps).toBeNull();
  });
});
