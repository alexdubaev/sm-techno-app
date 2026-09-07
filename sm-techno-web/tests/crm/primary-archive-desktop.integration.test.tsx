import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CrmWorkspace } from '@/components/crm-workspace';
import * as api from '@/lib/api';
import type {
  AppUser,
  CrmPrimaryArchiveClient,
  CrmWorkspaceClient,
} from '@/lib/types';

const auth = vi.hoisted(() => ({
  isAdmin: true,
  user: {
    id: 7,
    username: 'admin',
    role: 'admin' as const,
    fullName: 'Администратор',
    onecUsername: '',
    hasOnecPassword: false,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  } as AppUser,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: auth.user, isAdmin: auth.isAdmin }),
}));

vi.mock('@/components/crm/mobile/mobile-crm-workspace', () => ({
  MobileCrmWorkspace: () => null,
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  archivePrimaryCrmClient: vi.fn(),
  fetchCrmAudit: vi.fn(),
  fetchCrmContacts: vi.fn(),
  fetchCrmEvents: vi.fn(),
  fetchCrmLinkCandidates: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmSyncConflicts: vi.fn(),
  fetchCrmSyncStatus: vi.fn(),
  fetchCrmTabs: vi.fn(),
  fetchPrimaryCrmArchive: vi.fn(),
  fetchPrimaryCrmClients: vi.fn(),
  fetchUsers: vi.fn(),
  restorePrimaryCrmClient: vi.fn(),
}));

const activeClient: CrmWorkspaceClient = {
  id: 42,
  version: 3,
  name: 'Агроснаб',
  documentName: 'ООО «Агроснаб»',
  fullName: 'Общество с ограниченной ответственностью «Агроснаб»',
  inn: '7700123456',
  kpp: '770001001',
  city: 'Москва',
  website: '',
  contactPerson: 'Ирина',
  email: 'office@example.test',
  phone: '+79990000000',
  notes: 'Ключевой клиент',
  linkedCounterpartyId: 1042,
  syncStatus: 'synced',
  syncError: '',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-05T09:00:00.000Z',
  assignment: null,
  workOwners: [],
};

const archivedClient: CrmPrimaryArchiveClient = {
  ...activeClient,
  id: 43,
  documentName: 'ООО «Север»',
  name: 'Север',
  inn: '7800123456',
  city: 'Санкт-Петербург',
  archivedAt: '2026-09-07T08:30:00.000Z',
  archivedByUserId: 7,
  archivedByFullName: 'Елена Администратор',
  archiveReason: 'Компания закрылась',
};

beforeEach(() => {
  auth.isAdmin = true;
  auth.user = { ...auth.user, role: 'admin' };
  window.localStorage.clear();
  vi.mocked(api.archivePrimaryCrmClient).mockResolvedValue({ ok: true });
  vi.mocked(api.restorePrimaryCrmClient).mockResolvedValue({ ok: true });
  vi.mocked(api.fetchCrmTabs).mockResolvedValue([
    { id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 },
  ]);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({
    ownerId: 7,
    items: [activeClient],
    orderVersion: 2,
  });
  vi.mocked(api.fetchPrimaryCrmArchive).mockResolvedValue({
    items: [archivedClient],
    activeCount: 1,
    archivedCount: 1,
  });
  vi.mocked(api.fetchUsers).mockResolvedValue([auth.user]);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmContacts).mockResolvedValue([]);
  vi.mocked(api.fetchCrmEvents).mockResolvedValue([]);
  vi.mocked(api.fetchCrmAudit).mockResolvedValue([]);
  vi.mocked(api.fetchCrmLinkCandidates).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncConflicts).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({
    status: 'synced',
    lastSyncAt: new Date().toISOString(),
  });
});

describe('desktop primary client archive', () => {
  it('keeps the server-backed archive control invisible to non-admin users', async () => {
    auth.isAdmin = false;
    auth.user = { ...auth.user, role: 'user' };

    render(<CrmWorkspace />);

    expect(await screen.findByRole('table')).toHaveTextContent('ООО «Агроснаб»');
    expect(screen.queryByRole('button', { name: /Архив \d+/ })).not.toBeInTheDocument();
    expect(api.fetchPrimaryCrmArchive).not.toHaveBeenCalled();
  });

  it('shows archive metadata, suppresses active actions, and restores with fresh primary data', async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);

    await user.click(await screen.findByRole('button', { name: 'Архив 1' }));
    const row = screen.getByRole('row', { name: /ООО «Север»/ });
    expect(row).toHaveTextContent('7800123456');
    expect(row).toHaveTextContent('Санкт-Петербург');
    expect(row).toHaveTextContent('Елена Администратор');
    expect(row).toHaveTextContent('Компания закрылась');
    expect(screen.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить клиента' })).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Открыть' }));
    const detail = screen.getByRole('dialog', { name: 'ООО «Север»' });
    expect(detail).toHaveTextContent('Только просмотр');
    expect(within(detail).queryByRole('button', { name: 'Изменить реквизиты' })).not.toBeInTheDocument();
    expect(within(detail).queryByText('Найденные в 1С совпадения')).not.toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: 'Восстановить' }));
    expect(within(detail).getByText('Восстановить клиента в активной CRM для всех пользователей?')).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Подтвердить восстановление' }));

    await waitFor(() => expect(api.restorePrimaryCrmClient).toHaveBeenCalledWith(43));
    await waitFor(() => expect(api.fetchPrimaryCrmArchive).toHaveBeenCalledTimes(2));
    expect(api.fetchPrimaryCrmClients).toHaveBeenLastCalledWith(7, { bypassCache: true });
  });

  it('archives an active primary client only after the exact warning and optional reason', async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);

    const row = await screen.findByRole('row', { name: /ООО «Агроснаб»/ });
    await user.click(within(row).getByRole('button', { name: 'Открыть' }));
    const detail = screen.getByRole('dialog', { name: 'ООО «Агроснаб»' });
    await user.click(within(detail).getByRole('button', { name: 'Архивировать' }));
    expect(
      within(detail).getByText(
        'Клиент будет скрыт от всех пользователей CRM. Архивация не влияет на данные в 1С.',
      ),
    ).toBeVisible();
    await user.type(within(detail).getByLabelText('Причина (необязательно)'), '  Дубликат  ');
    await user.click(within(detail).getByRole('button', { name: 'Подтвердить архивирование' }));

    await waitFor(() => expect(api.archivePrimaryCrmClient).toHaveBeenCalledWith(42, 'Дубликат'));
    await waitFor(() => expect(api.fetchPrimaryCrmArchive).toHaveBeenCalledTimes(2));
    expect(api.fetchPrimaryCrmClients).toHaveBeenLastCalledWith(7, { bypassCache: true });
  });
});
