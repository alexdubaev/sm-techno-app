import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isAdmin: true,
  pathname: '/',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 7, username: 'alexander', fullName: 'Александр', role: state.isAdmin ? 'admin' : 'user',
      onecUsername: '', hasOnecPassword: false, isActive: true, createdAt: '', updatedAt: '',
    },
    isAdmin: state.isAdmin,
    logout: vi.fn(async () => undefined),
    refreshUser: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchCurrentUserDueCrmReminders: vi.fn(async () => []),
}));

async function renderShell(pathname: string, isAdmin = true) {
  // The menu snapshot is module-level: a fresh module models a fresh page load.
  vi.resetModules();
  const { AppShell } = await import('@/components/app-shell');
  state.pathname = pathname;
  state.isAdmin = isAdmin;
  const shell = () => <AppShell><p>Страница</p></AppShell>;
  const view = render(shell());
  const sidebar = view.container.querySelector('aside.app-shell-sidebar') as HTMLElement;
  return { ...view, sidebar, rerenderShell: () => view.rerender(shell()) };
}

function groupButton(sidebar: HTMLElement, label: string) {
  return within(sidebar).getByRole('button', { name: label });
}

function collapseOf(button: HTMLElement) {
  return document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
}

describe('desktop sidebar menu', () => {
  beforeEach(() => {
    state.push.mockClear();
  });

  it('opens the route group on a fresh load and marks the current page', async () => {
    const { sidebar } = await renderShell('/stock');
    const prices = groupButton(sidebar, 'Прайсы');
    expect(prices).toHaveAttribute('aria-expanded', 'true');
    expect(prices.className).toContain('bg-[var(--brand-dark)]');
    expect(within(sidebar).getByRole('link', { name: 'Остатки' })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Заказы' })).not.toHaveAttribute('aria-current');
  });

  it('highlights and expands a clicked group at once without navigating', async () => {
    const user = userEvent.setup();
    const { sidebar } = await renderShell('/stock');
    const clients = groupButton(sidebar, 'Клиенты');
    const collapse = collapseOf(clients);
    expect(collapse).toHaveClass('app-nav-collapse');
    expect(collapse).toHaveAttribute('data-open', 'false');
    expect(collapse).toHaveAttribute('aria-hidden', 'true');
    expect(collapse).toHaveAttribute('inert');

    await user.click(clients);

    expect(clients.className).toContain('bg-[var(--brand-dark)]');
    expect(clients).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('data-open', 'true');
    expect(collapse).not.toHaveAttribute('inert');
    expect(collapse).not.toHaveAttribute('aria-hidden');
    expect(groupButton(sidebar, 'Прайсы').className).not.toContain('bg-[var(--brand-dark)]');
    expect(state.push).not.toHaveBeenCalled();
    expect(within(sidebar).getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/crm');

    await user.click(clients);
    expect(clients).toHaveAttribute('aria-expanded', 'false');
    expect(collapse).toHaveAttribute('inert');
  });

  it('renders a group with one visible item as a direct link', async () => {
    const { sidebar } = await renderShell('/stock', false);
    const cabinet = within(sidebar).getByRole('link', { name: 'Личный кабинет' });
    expect(cabinet).toHaveAttribute('href', '/manager');
    expect(within(sidebar).queryByRole('button', { name: 'Личный кабинет' })).not.toBeInTheDocument();
  });

  it('follows the address when the page changes by any route', async () => {
    const user = userEvent.setup();
    const { sidebar, rerenderShell } = await renderShell('/stock');
    await user.click(groupButton(sidebar, 'Клиенты'));

    state.pathname = '/documents/journal';
    rerenderShell();

    const documents = groupButton(sidebar, 'Документы');
    expect(documents.className).toContain('bg-[var(--brand-dark)]');
    expect(documents).toHaveAttribute('aria-expanded', 'true');
    expect(groupButton(sidebar, 'Клиенты').className).not.toContain('bg-[var(--brand-dark)]');
    expect(groupButton(sidebar, 'Клиенты')).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar).getByRole('link', { name: 'Журнал документов' })).toHaveAttribute('aria-current', 'page');
  });
});
