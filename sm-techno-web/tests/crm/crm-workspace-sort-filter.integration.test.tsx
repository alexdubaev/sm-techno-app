import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CrmWorkspace } from '@/components/crm-workspace';
import * as api from '@/lib/api';
import type { CrmWorkspaceClient } from '@/lib/types';

const auth = vi.hoisted(() => ({
  user: { id: 7, username: 'operator', role: 'user' as const, fullName: 'Оператор', onecUsername: '', hasOnecPassword: false, isActive: true, createdAt: '', updatedAt: '' },
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: auth.user, isAdmin: false }),
}));

vi.mock('@/components/crm/mobile/mobile-crm-workspace', () => ({
  MobileCrmWorkspace: () => null,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogAction: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchCrmTabs: vi.fn(),
  fetchPrimaryCrmClients: vi.fn(),
  fetchCrmClients: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmSyncStatus: vi.fn(),
}));

function client(id: number, documentName: string): CrmWorkspaceClient {
  return {
    id, version: 1, name: documentName, documentName, fullName: '', inn: '', kpp: '', city: '', website: '', contactPerson: '', email: 'team@example.test', phone: '+79990000000', notes: '', linkedCounterpartyId: null, syncStatus: 'synced', syncError: '', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', assignment: null, workOwners: [],
  };
}

const clients = [client(8, 'Вега'), client(3, 'Альфа')];

beforeEach(() => {
  vi.mocked(api.fetchCrmTabs).mockResolvedValue([{ id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 }]);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({ ownerId: 7, items: clients, orderVersion: 0 });
  vi.mocked(api.fetchCrmClients).mockResolvedValue(clients);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({ status: 'synced', lastSyncAt: new Date().toISOString() });
});

function visibleCompanies() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.textContent);
}

describe('desktop CRM list controls', () => {
  test('sorts all workspace tabs locally, restores manual order, disables drag, and resets an empty result', async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);

    await screen.findByRole('table');
    expect(visibleCompanies()[0]).toContain('Вега');
    expect(screen.getAllByTitle('Переместить')).toHaveLength(4);

    await user.selectOptions(screen.getByLabelText('Сортировка'), 'name_asc');
    expect(visibleCompanies()[0]).toContain('Альфа');
    expect(screen.queryByTitle('Переместить')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'В работе' }));
    await waitFor(() => expect(visibleCompanies()[0]).toContain('Альфа'));
    expect(screen.queryByTitle('Переместить')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Сортировка'), 'manual');
    expect(visibleCompanies()[0]).toContain('Вега');

    await user.selectOptions(screen.getByLabelText('Телефон'), 'missing');
    expect(screen.getByText('Клиенты не найдены')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    await waitFor(() => expect(visibleCompanies()[0]).toContain('Вега'));
    expect(screen.getByLabelText('Сортировка')).toHaveValue('manual');
  });

  test('shows a position column and temporarily switches the selected contact details', async () => {
    const user = userEvent.setup();
    const contactClient = client(21, 'ООО Ромашка');
    contactClient.contactPerson = '';
    contactClient.phone = '';
    contactClient.email = '';
    contactClient.contacts = [
      { id: 51, name: 'Анна Петрова', position: 'Менеджер по закупкам', phone: '+71111111111', email: 'anna@example.test', isPrimary: false, createdAt: '', updatedAt: '' },
      { id: 52, name: 'Ирина Соколова', position: 'Коммерческий директор', phone: '+72222222222', email: 'irina@example.test', isPrimary: true, createdAt: '', updatedAt: '' },
    ];
    vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({ ownerId: 7, items: [contactClient], orderVersion: 0 });
    vi.mocked(api.fetchCrmClients).mockResolvedValue([contactClient]);

    render(<CrmWorkspace />);

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Должность' })).toBeVisible();
    const selector = within(table).getByRole('combobox', { name: 'Контактное лицо ООО Ромашка' });
    expect(selector).toHaveValue('contact:52');
    expect(within(table).getByText('Коммерческий директор')).toBeVisible();
    expect(within(table).getByRole('link', { name: 'Позвонить: +72222222222' })).toHaveAttribute('href', 'tel:+72222222222');
    expect(within(table).getByRole('link', { name: 'Написать: irina@example.test' })).toHaveAttribute('href', 'mailto:irina@example.test');

    await user.selectOptions(selector, 'contact:51');

    expect(within(table).getByText('Менеджер по закупкам')).toBeVisible();
    expect(within(table).getByRole('link', { name: 'Позвонить: +71111111111' })).toHaveAttribute('href', 'tel:+71111111111');
    expect(within(table).getByRole('link', { name: 'Написать: anna@example.test' })).toHaveAttribute('href', 'mailto:anna@example.test');
  });
});
