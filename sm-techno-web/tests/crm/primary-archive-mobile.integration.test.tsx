import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileCrmWorkspace } from '@/components/crm/mobile/mobile-crm-workspace';
import * as api from '@/lib/api';
import type { CrmPrimaryArchiveClient, CrmWorkspaceClient } from '@/lib/types';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  archivePrimaryCrmClient: vi.fn(),
  fetchCrmAudit: vi.fn(),
  fetchCrmContacts: vi.fn(),
  fetchCrmEvents: vi.fn(),
  fetchCrmLinkCandidates: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmSyncConflicts: vi.fn(),
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
  name: 'Север',
  documentName: 'ООО «Север»',
  inn: '7800123456',
  city: 'Санкт-Петербург',
  archivedAt: '2026-09-07T08:30:00.000Z',
  archivedByUserId: 7,
  archivedByFullName: 'Елена Администратор',
  archiveReason: 'Компания закрылась',
};

function mobileProps(overrides: Record<string, unknown> = {}) {
  return {
    activeTab: 'primary',
    canEditWorkspace: true,
    clients: [activeClient],
    initialDetailSection: 'overview',
    isAdding: false,
    isSavingClient: false,
    importantReminders: [],
    isAdmin: true,
    isExporting: false,
    isLoading: false,
    isLoadingReminders: false,
    isRefreshing: false,
    manualOrderAvailable: true,
    nearestReminderByClient: new Map(),
    notice: null,
    newClientError: null,
    newClientForm: {
      documentName: '',
      city: '',
      contactPerson: '',
      phone: '',
      email: '',
      telegram: '',
      maxLink: '',
      notes: '',
    },
    ownerId: 7,
    ownerName: 'Администратор',
    owners: [],
    listControls: { sortMode: 'manual', phoneFilter: 'all', emailFilter: 'all' },
    allClients: [activeClient],
    reminderError: null,
    search: '',
    selectedClient: null,
    syncFilter: 'all',
    syncStatusText: null,
    tabs: [{ id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 }],
    totalClientCount: 1,
    workspaceError: null,
    primaryArchive: { items: [archivedClient], activeCount: 1, archivedCount: 1 },
    primaryArchiveMode: 'active',
    selectedArchivedClient: null,
    isPrimaryArchiveLoading: false,
    onPrimaryArchiveModeChange: vi.fn(),
    onOpenArchivedClient: vi.fn(),
    onPrimaryArchiveChanged: vi.fn(),
    onAddClient: vi.fn(),
    onChangeClientForm: vi.fn(),
    onCloseArchivedClient: vi.fn(),
    onCloseClient: vi.fn(),
    onCloseNewClient: vi.fn(),
    onColorClient: vi.fn(),
    onCreateTab: vi.fn(),
    onDeleteTab: vi.fn(),
    onDetailChanged: vi.fn(),
    onExport: vi.fn(),
    onImportCompleted: vi.fn(),
    onMoveClient: vi.fn(),
    onOpenClient: vi.fn(),
    onOpenReminder: vi.fn(),
    onOwnerChange: vi.fn(),
    onListControlsChange: vi.fn(),
    onResetListControls: vi.fn(),
    onRefresh: vi.fn(),
    onRenameTab: vi.fn(),
    onReorder: vi.fn(),
    onSearchChange: vi.fn(),
    onSubmitClient: vi.fn(),
    onSyncFilterChange: vi.fn(),
    onTabChange: vi.fn(),
    ...overrides,
  } as unknown as ComponentProps<typeof MobileCrmWorkspace>;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(api.archivePrimaryCrmClient).mockResolvedValue({ ok: true });
  vi.mocked(api.restorePrimaryCrmClient).mockResolvedValue({ ok: true });
  vi.mocked(api.fetchCrmContacts).mockResolvedValue([]);
  vi.mocked(api.fetchCrmEvents).mockResolvedValue([]);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmAudit).mockResolvedValue([]);
  vi.mocked(api.fetchCrmLinkCandidates).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncConflicts).mockResolvedValue([]);
});

describe('mobile primary client archive', () => {
  it('shows the system archive switch and metadata cards only to an admin', async () => {
    const onModeChange = vi.fn();
    const onOpenArchivedClient = vi.fn();
    const view = render(
      <MobileCrmWorkspace
        {...mobileProps({
          primaryArchiveMode: 'archive',
          onPrimaryArchiveModeChange: onModeChange,
          onOpenArchivedClient,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Активные 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Архив 1' })).toHaveAttribute('aria-pressed', 'true');
    const card = screen.getByRole('article', { name: 'ООО «Север»' });
    expect(card).toHaveTextContent('ИНН 7800123456');
    expect(card).toHaveTextContent('Санкт-Петербург');
    expect(card).toHaveTextContent('Елена Администратор');
    expect(card).toHaveTextContent('Компания закрылась');
    expect(screen.queryByPlaceholderText('Поиск клиента')).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Открыть архивную карточку' }));
    expect(onOpenArchivedClient).toHaveBeenCalledWith(archivedClient);

    view.rerender(<MobileCrmWorkspace {...mobileProps({ isAdmin: false })} />);
    expect(screen.queryByRole('button', { name: /Архив \d+/ })).not.toBeInTheDocument();
  });

  it('renders archive detail as read-only and restores only after confirmation', async () => {
    const user = userEvent.setup();
    const onPrimaryArchiveChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <MobileCrmWorkspace
        {...mobileProps({
          primaryArchiveMode: 'archive',
          selectedArchivedClient: archivedClient,
          onPrimaryArchiveChanged,
        })}
      />,
    );

    const detail = screen.getByRole('dialog', { name: 'ООО «Север»' });
    expect(detail).toHaveTextContent('Только просмотр');
    expect(within(detail).queryByRole('tab', { name: 'Напоминания' })).not.toBeInTheDocument();
    expect(within(detail).queryByText('Цвет карточки')).not.toBeInTheDocument();
    expect(within(detail).queryByText('Найденные в 1С совпадения')).not.toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Восстановить' }));
    await user.click(within(detail).getByRole('button', { name: 'Подтвердить восстановление' }));

    await waitFor(() => expect(api.restorePrimaryCrmClient).toHaveBeenCalledWith(43));
    expect(onPrimaryArchiveChanged).toHaveBeenCalledOnce();
  });

  it('puts confirmed primary archive in More then Administration', async () => {
    const user = userEvent.setup();
    const onPrimaryArchiveChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <MobileCrmWorkspace
        {...mobileProps({ selectedClient: activeClient, onPrimaryArchiveChanged })}
      />,
    );

    await waitFor(() => expect(screen.queryByText('Загрузка карточки…')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Ещё действия с клиентом' }));
    expect(screen.getByRole('heading', { name: 'Администрирование' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Архивировать' }));
    expect(
      screen.getByText('Клиент будет скрыт от всех пользователей CRM. Архивация не влияет на данные в 1С.'),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Причина (необязательно)'), '  Неактуальный  ');
    await user.click(screen.getByRole('button', { name: 'Подтвердить архивирование' }));

    await waitFor(() => expect(api.archivePrimaryCrmClient).toHaveBeenCalledWith(42, 'Неактуальный'));
    expect(onPrimaryArchiveChanged).toHaveBeenCalledOnce();
  });
});
