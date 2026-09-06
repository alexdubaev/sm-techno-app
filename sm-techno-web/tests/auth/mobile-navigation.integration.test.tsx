import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isAdmin: true,
  logout: vi.fn(async () => undefined),
  pathname: '/',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 7,
      username: 'alexander',
      fullName: 'Александр',
      role: state.isAdmin ? 'admin' : 'user',
      onecUsername: '',
      hasOnecPassword: false,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    isAdmin: state.isAdmin,
    logout: state.logout,
    refreshUser: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchCurrentUserDueCrmReminders: vi.fn(async () => []),
}));

import { AppShell } from '@/components/app-shell';

function renderShell({ isAdmin }: { isAdmin: boolean }, pathname: string) {
  state.isAdmin = isAdmin;
  state.pathname = pathname;
  state.logout.mockClear();
  render(
    <AppShell>
      <p>Содержимое страницы</p>
    </AppShell>,
  );
  return { logout: state.logout };
}

describe('responsive AppShell navigation', () => {
  beforeEach(() => {
    state.isAdmin = true;
    state.pathname = '/';
    state.logout.mockClear();
  });

  it('shows four primary items for an administrator and marks CRM current', () => {
    renderShell({ isAdmin: true }, '/crm');

    const navigation = screen.getByLabelText('Основная навигация');
    expect(within(navigation).getAllByRole('link')).toHaveLength(3);
    expect(
      within(navigation).getByRole('button', { name: 'Ещё' }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('link', { name: 'CRM' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(navigation).toHaveAttribute('data-item-count', '4');
  });

  it('omits settings instead of leaving an empty primary slot for a user', () => {
    renderShell({ isAdmin: false }, '/');

    const navigation = screen.getByLabelText('Основная навигация');
    expect(
      within(navigation).queryByRole('link', { name: 'Настройки' }),
    ).not.toBeInTheDocument();
    expect(navigation).toHaveAttribute('data-item-count', '3');
  });

  it('does not duplicate the administrator settings link in the More drawer', async () => {
    const user = userEvent.setup();
    renderShell({ isAdmin: true }, '/settings');

    const navigation = screen.getByLabelText('Основная навигация');
    expect(
      within(navigation).getByRole('link', { name: 'Настройки' }),
    ).toBeInTheDocument();

    await user.click(within(navigation).getByRole('button', { name: 'Ещё' }));
    const drawer = screen.getByRole('dialog', { name: 'Ещё' });
    expect(
      within(drawer).queryByRole('link', { name: 'Настройки' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['/', 'Остатки'],
    ['/crm', 'CRM'],
    ['/settings', 'Настройки'],
    ['/orders/42', 'Ещё'],
  ])('marks %s as %s', (pathname, expectedLabel) => {
    renderShell({ isAdmin: true }, pathname);

    const current = screen
      .getByLabelText('Основная навигация')
      .querySelector('[aria-current="page"]');
    expect(current).toHaveAccessibleName(expectedLabel);
  });

  it('opens grouped secondary links, hides the admin price action for a user, and closes after selection', async () => {
    const user = userEvent.setup();
    renderShell({ isAdmin: false }, '/orders');

    await user.click(screen.getByRole('button', { name: 'Ещё' }));
    const drawer = screen.getByRole('dialog', { name: 'Ещё' });
    expect(within(drawer).getByText('Прайсы')).toBeInTheDocument();
    expect(
      within(drawer).queryByRole('link', { name: 'Работа с прайсом' }),
    ).not.toBeInTheDocument();

    await user.click(within(drawer).getByRole('link', { name: 'Заказы' }));
    expect(
      screen.queryByRole('dialog', { name: 'Ещё' }),
    ).not.toBeInTheDocument();
  });

  it('removes the legacy horizontal group controls', () => {
    renderShell({ isAdmin: true }, '/');

    const header = screen.getByTestId('mobile-shell-header');
    expect(
      within(header).queryByRole('button', { name: 'Прайсы' }),
    ).not.toBeInTheDocument();
  });

  it('uses the existing logout action from the drawer footer', async () => {
    const user = userEvent.setup();
    const { logout } = renderShell({ isAdmin: true }, '/orders');

    await user.click(screen.getByRole('button', { name: 'Ещё' }));
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
