import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from '@/lib/api';
import { MobileCrmWorkspace } from '@/components/crm/mobile/mobile-crm-workspace';
import type { AppUser, CrmImportPreview, CrmImportResult, CrmTab } from '@/lib/types';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  previewCrmImport: vi.fn(),
  importCrmFile: vi.fn(),
}));

const owner: AppUser = {
  id: 7,
  username: 'manager',
  role: 'user',
  fullName: 'Менеджер',
  onecUsername: '',
  hasOnecPassword: false,
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const tabs: CrmTab[] = [
  { id: 8, name: 'В работе', systemKind: 'work', sortOrder: 0 },
  { id: 9, name: 'Приоритет', systemKind: 'custom', sortOrder: 1 },
];

const preview: CrmImportPreview = {
  ownerId: 7,
  target: { tabId: 8, newTabName: null },
  clientsToCreate: 2,
  clientsToUpdate: 1,
  unchangedClients: 0,
  clientsToAssign: 1,
  contactsToCreate: 3,
  contactsToUpdate: 0,
  duplicateConflicts: 0,
  skippedOneCLinked: 0,
  errors: [],
};

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof MobileCrmWorkspace>> = {}) {
  const callbacks = {
    onDetailChanged: vi.fn(),
    onImportCompleted: vi.fn(),
    onRefresh: vi.fn(),
  };
  render(
    <MobileCrmWorkspace
      activeTab="primary"
      canEditWorkspace
      clients={[]}
      initialDetailSection="overview"
      isAdding={false}
      isSavingClient={false}
      importantReminders={[]}
      isAdmin={false}
      isExporting={false}
      isLoading={false}
      isLoadingReminders={false}
      isRefreshing={false}
      manualOrderAvailable
      nearestReminderByClient={new Map()}
      notice={null}
      newClientError={null}
      newClientForm={{ documentName: '', city: '', contactPerson: '', phone: '', email: '', notes: '' }}
      ownerId={owner.id}
      ownerName={owner.fullName}
      owners={[owner]}
      primaryOrderMode="manual"
      reminderError={null}
      search=""
      selectedClient={null}
      syncFilter="all"
      syncStatusText={null}
      tabs={tabs}
      totalClientCount={0}
      workspaceError={null}
      onAddClient={vi.fn()}
      onChangeClientForm={vi.fn()}
      onCloseClient={vi.fn()}
      onCloseNewClient={vi.fn()}
      onColorClient={vi.fn()}
      onCreateTab={vi.fn()}
      onDeleteTab={vi.fn()}
      onDetailChanged={callbacks.onDetailChanged}
      onExport={vi.fn()}
      onImportCompleted={callbacks.onImportCompleted}
      onMoveClient={vi.fn()}
      onOpenClient={vi.fn()}
      onOpenReminder={vi.fn()}
      onOwnerChange={vi.fn()}
      onPrimaryOrderModeChange={vi.fn()}
      onRefresh={callbacks.onRefresh}
      onRenameTab={vi.fn()}
      onReorder={vi.fn()}
      onSearchChange={vi.fn()}
      onSubmitClient={vi.fn()}
      onSyncFilterChange={vi.fn()}
      onTabChange={vi.fn()}
      {...overrides}
    />,
  );
  return callbacks;
}

function openImport() {
  fireEvent.click(screen.getByLabelText('Ещё действия CRM'));
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить клиентов' }));
}

function selectFile() {
  const file = new File(['xlsx'], 'clients.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fireEvent.change(screen.getByLabelText('Выбрать Excel'), {
    target: { files: [file] },
  });
  return file;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('mobile CRM Excel import', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it('reports the returned existing tab through the dedicated local import callback without syncing', async () => {
    const result: CrmImportResult = { ...preview, targetTab: { id: 8, name: 'В работе', systemKind: 'work' } };
    vi.mocked(api.previewCrmImport).mockResolvedValue(preview);
    vi.mocked(api.importCrmFile).mockResolvedValue(result);
    const callbacks = renderWorkspace();

    openImport();
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить файл' }));
    await screen.findByText('Будет создано: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать 2 клиента' }));

    await waitFor(() => expect(callbacks.onImportCompleted).toHaveBeenCalledWith(8));
    expect(callbacks.onDetailChanged).not.toHaveBeenCalled();
    expect(callbacks.onRefresh).not.toHaveBeenCalled();
    expect(api.previewCrmImport).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, targetTabId: 8, includeExistingClients: true }));
    expect(api.importCrmFile).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, targetTabId: 8, includeExistingClients: true }));
  });

  it('uses a new tab target only when the user confirms the preview', async () => {
    vi.mocked(api.previewCrmImport).mockResolvedValue({ ...preview, target: { tabId: null, newTabName: 'Новые' } });
    vi.mocked(api.importCrmFile).mockResolvedValue({ ...preview, target: { tabId: null, newTabName: 'Новые' }, targetTab: { id: 12, name: 'Новые', systemKind: 'custom' } });
    const callbacks = renderWorkspace();

    openImport();
    selectFile();
    fireEvent.click(screen.getByLabelText('Новая вкладка'));
    fireEvent.change(screen.getByLabelText('Название новой вкладки'), { target: { value: 'Новые' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить файл' }));
    await screen.findByText('Цель: Новая вкладка «Новые»');
    expect(api.importCrmFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать 2 клиента' }));

    await waitFor(() => expect(callbacks.onImportCompleted).toHaveBeenCalledWith(12));
    expect(callbacks.onDetailChanged).not.toHaveBeenCalled();
    expect(api.importCrmFile).toHaveBeenCalledWith(expect.objectContaining({ newTabName: 'Новые', targetTabId: null }));
  });

  it('shows row errors from preview and prevents final import', async () => {
    vi.mocked(api.previewCrmImport).mockResolvedValue({
      ...preview,
      errors: [{ sheet: 'Клиенты', row: 4, field: 'ИНН', code: 'invalid_inn', message: 'ИНН указан неверно' }],
    });
    renderWorkspace();

    openImport();
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить файл' }));
    const sheet = await screen.findByRole('dialog', { name: 'Загрузить клиентов' });

    expect(within(sheet).getByText('Клиенты, строка 4: ИНН указан неверно')).toBeInTheDocument();
    expect(within(sheet).getByText('Без изменений: 0')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Импортировать/ })).not.toBeInTheDocument();
    expect(api.importCrmFile).not.toHaveBeenCalled();
  });

  it('keeps a deferred preview request immutable and imports its captured payload', async () => {
    const deferredPreview = createDeferred<CrmImportPreview>();
    const result: CrmImportResult = {
      ...preview,
      targetTab: { id: 8, name: 'В работе', systemKind: 'work' },
    };
    vi.mocked(api.previewCrmImport).mockReturnValue(deferredPreview.promise);
    vi.mocked(api.importCrmFile).mockResolvedValue(result);
    renderWorkspace();

    openImport();
    const file = selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить файл' }));
    await waitFor(() => expect(api.previewCrmImport).toHaveBeenCalledOnce());

    const fileInput = screen.getByLabelText('Выбрать Excel');
    const existingTarget = screen.getByRole('radio', { name: /Приоритет/ });
    const newTarget = screen.getByLabelText('Новая вкладка');
    const includeExisting = screen.getByLabelText('Добавить найденных клиентов в целевую вкладку');
    expect(fileInput).toBeDisabled();
    expect(existingTarget).toBeDisabled();
    expect(newTarget).toBeDisabled();
    expect(includeExisting).toBeDisabled();

    deferredPreview.resolve(preview);
    await screen.findByRole('button', { name: 'Импортировать 2 клиента' });
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать 2 клиента' }));

    await waitFor(() => expect(api.importCrmFile).toHaveBeenCalledWith({
      file,
      ownerId: 7,
      targetTabId: 8,
      newTabName: null,
      includeExistingClients: true,
    }));
  });

  it('ignores a stale deferred preview after its request inputs are reset', async () => {
    const deferredPreview = createDeferred<CrmImportPreview>();
    vi.mocked(api.previewCrmImport).mockReturnValue(deferredPreview.promise);
    renderWorkspace();

    openImport();
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить файл' }));
    await waitFor(() => expect(api.previewCrmImport).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('Выбрать Excel'), {
      target: { files: [new File(['replacement'], 'replacement.xlsx')] },
    });
    deferredPreview.resolve(preview);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Проверить файл' })).not.toBeDisabled());
    expect(screen.queryByRole('button', { name: /Импортировать/ })).not.toBeInTheDocument();
    expect(api.importCrmFile).not.toHaveBeenCalled();
  });

  it('does not expose the import action without workspace edit permission', () => {
    renderWorkspace({ canEditWorkspace: false });
    fireEvent.click(screen.getByLabelText('Ещё действия CRM'));
    expect(screen.queryByRole('button', { name: 'Загрузить клиентов' })).not.toBeInTheDocument();
  });
});
