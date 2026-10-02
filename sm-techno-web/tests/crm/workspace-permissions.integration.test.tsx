import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, SubmitEvent } from 'react';
import { CrmWorkspace } from '@/components/crm-workspace';
import type { MobileCrmWorkspace } from '@/components/crm/mobile/mobile-crm-workspace';
import { useCrmClientDetailController, type CrmClientDetailControllerOptions } from '@/components/crm/use-crm-client-detail';
import * as api from '@/lib/api';
import type { AppUser, CrmWorkspaceClient, CrmSyncConflict } from '@/lib/types';

const harness = vi.hoisted(() => ({ mobile: null as ComponentProps<typeof MobileCrmWorkspace> | null }));
const admin: AppUser = { id: 7, username: 'admin', fullName: 'Admin', role: 'admin', isActive: true, onecUsername: '', hasOnecPassword: false, hasRecoverableAppPassword: false, createdAt: '', updatedAt: '' };
const colleague: AppUser = { ...admin, id: 8, username: 'colleague', fullName: 'Colleague', role: 'user' };
vi.mock('@/components/auth-provider', () => ({ useAuth: () => ({ user: admin, isAdmin: true }) }));
// Capture shared workspace callbacks to test their guards independently of button visibility.
vi.mock('@/components/crm/mobile/mobile-crm-workspace', () => ({ MobileCrmWorkspace: (props: ComponentProps<typeof MobileCrmWorkspace>) => { harness.mobile = props; return null; } }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchUsers: vi.fn(), fetchCrmTabs: vi.fn(), fetchCrmClients: vi.fn(), fetchPrimaryCrmClients: vi.fn(), fetchPrimaryCrmArchive: vi.fn(), fetchCrmSyncStatus: vi.fn(),
  fetchCrmContacts: vi.fn(), fetchCrmEvents: vi.fn(), fetchCrmClientNote: vi.fn(), fetchCrmReminders: vi.fn(), fetchCrmAudit: vi.fn(), fetchCrmLinkCandidates: vi.fn(), fetchCrmSyncConflicts: vi.fn(),
  createCrmClient: vi.fn(), createCrmTab: vi.fn(), moveCrmClient: vi.fn(), reorderPrimaryCrmClients: vi.fn(), reorderCrmTabClients: vi.fn(), saveCrmPrimaryRowPreference: vi.fn(), saveCrmRowPreference: vi.fn(),
  createCrmContact: vi.fn(), createCrmEvent: vi.fn(), createCrmReminder: vi.fn(), saveCrmClientNote: vi.fn(), updateCrmClient: vi.fn(), confirmCrmExistingLink: vi.fn(),
  archiveLocalCrmClient: vi.fn(), restoreLocalCrmClient: vi.fn(), removeCrmAssignment: vi.fn(), resolveCrmSyncConflict: vi.fn(), archivePrimaryCrmClient: vi.fn(), restorePrimaryCrmClient: vi.fn(),
}));
const client: CrmWorkspaceClient = {
  id: 42, version: 3, name: 'Short', documentName: 'ООО Документ', fullName: 'Full', inn: '7700000000', kpp: '', city: 'Москва', website: '', contactPerson: '', phone: '', email: '', notes: '',
  linkedCounterpartyId: null, syncStatus: 'local', syncError: '', createdAt: '', updatedAt: '', assignment: null, workOwners: [],
};
const submit = () => ({ preventDefault: vi.fn() }) as unknown as SubmitEvent<HTMLFormElement>;
const options = (extra: Partial<CrmClientDetailControllerOptions> = {}): CrmClientDetailControllerOptions => ({ client, ownerId: 7, activeTab: 3, ownerName: 'Admin', isAdmin: true, canEditWorkspace: true, canManageReminders: true, canResolveSyncConflicts: true, onChanged: vi.fn(), ...extra });

beforeEach(() => {
  window.localStorage.clear();
  harness.mobile = null;
  vi.mocked(api.fetchUsers).mockResolvedValue([admin, colleague]);
  vi.mocked(api.fetchCrmTabs).mockResolvedValue([{ id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 }]);
  vi.mocked(api.fetchPrimaryCrmClients).mockImplementation(async (ownerId) => ({ ownerId, items: [client, { ...client, id: 43, documentName: 'Другой клиент' }], orderVersion: 2 }));
  vi.mocked(api.fetchCrmClients).mockResolvedValue([client]);
  vi.mocked(api.fetchPrimaryCrmArchive).mockResolvedValue({ items: [], activeCount: 1, archivedCount: 0 });
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({ status: 'synced', lastSyncAt: new Date().toISOString() });
  for (const fn of [api.fetchCrmContacts, api.fetchCrmEvents, api.fetchCrmReminders, api.fetchCrmAudit, api.fetchCrmLinkCandidates, api.fetchCrmSyncConflicts]) vi.mocked(fn).mockResolvedValue([]);
  vi.mocked(api.fetchCrmClientNote).mockResolvedValue(null);
  vi.mocked(api.createCrmEvent).mockImplementation(async (_id, payload) => ({ ...payload, id: 1, authorUserId: 7, createdAt: '', updatedAt: '' }));
  vi.mocked(api.archiveLocalCrmClient).mockResolvedValue({ version: 4 });
  vi.mocked(api.restoreLocalCrmClient).mockResolvedValue({ version: 5 });
  vi.mocked(api.removeCrmAssignment).mockResolvedValue({ ok: true });
  vi.mocked(api.resolveCrmSyncConflict).mockResolvedValue(client);
  vi.mocked(api.archivePrimaryCrmClient).mockResolvedValue({ ok: true });
  vi.mocked(api.restorePrimaryCrmClient).mockResolvedValue({ ok: true });
});

describe('desktop workspace and shared write permissions', () => {
  it('creates a call through the desktop controller and reloads the correct owner', async () => {
    render(<CrmWorkspace />);
    const row = await screen.findByRole('row', { name: /ООО Документ/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Открыть' }));
    const detail = await screen.findByRole('dialog', { name: 'ООО Документ' });
    const save = await within(detail).findByRole('button', { name: 'Сохранить результат звонка' });
    fireEvent.click(save);
    expect(api.createCrmEvent).not.toHaveBeenCalled();
    expect(await within(detail).findByText('Введите описание события.')).toBeVisible();
    fireEvent.change(within(detail).getByPlaceholderText('Что обсудили и о чём договорились?'), { target: { value: '  Согласованы сроки  ' } });
    const reads = vi.mocked(api.fetchPrimaryCrmClients).mock.calls.length;
    fireEvent.click(save);
    await waitFor(() => expect(api.createCrmEvent).toHaveBeenCalledWith(42, { kind: 'call', body: 'Согласованы сроки' }, 7));
    await waitFor(() => expect(api.fetchPrimaryCrmClients).toHaveBeenCalledTimes(reads + 1));
    expect(api.fetchPrimaryCrmClients).toHaveBeenLastCalledWith(7, { bypassCache: true });
  });

  it('allows desktop owner move and shared reorder with concurrency fields', async () => {
    vi.mocked(api.moveCrmClient).mockResolvedValue({ id: 1, tabId: 3, tabName: 'В работе', archivedAt: null });
    vi.mocked(api.reorderPrimaryCrmClients).mockResolvedValue({ clientIds: [43, 42], orderVersion: 3 });
    render(<CrmWorkspace />);
    await screen.findByRole('row', { name: /ООО Документ/ });
    await act(async () => { harness.mobile!.onReorder(42, 2); });
    await waitFor(() => expect(api.reorderPrimaryCrmClients).toHaveBeenCalledWith({ clientId: 42, beforeClientId: null, afterClientId: 43, expectedOrderVersion: 2 }, 7));
    fireEvent.change(within(screen.getByRole('row', { name: /ООО Документ/ })).getByRole('combobox', { name: 'Добавить ООО Документ во вкладку' }), { target: { value: '3' } });
    await waitFor(() => expect(api.moveCrmClient).toHaveBeenCalledWith(42, 3, 7));
  });

  it('creates a client for the current owner using the desktop form', async () => {
    vi.mocked(api.createCrmClient).mockResolvedValue(client);
    render(<CrmWorkspace />);
    await screen.findByRole('row', { name: /ООО Документ/ });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить клиента' }));
    fireEvent.change(screen.getByLabelText('Наименование компании *'), { target: { value: '  Новый клиент  ' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Новый локальный клиент' })).getByRole('button', { name: 'Добавить клиента' }));
    await waitFor(() => expect(api.createCrmClient).toHaveBeenCalledWith(expect.objectContaining({ documentName: 'Новый клиент' }), 7));
    await waitFor(() => expect(api.fetchCrmClients).toHaveBeenCalledWith({ ownerId: 7, tabId: 3 }, { bypassCache: true }));
  });

  it('ignores a detail refresh from the prior owner after a desktop owner switch', async () => {
    let finishOldRead!: (value: Awaited<ReturnType<typeof api.fetchPrimaryCrmClients>>) => void;
    render(<CrmWorkspace />);
    await screen.findByRole('row', { name: /ООО Документ/ });
    const oldCallbacks = harness.mobile!;
    vi.mocked(api.fetchPrimaryCrmClients).mockImplementationOnce(() => new Promise((resolve) => { finishOldRead = resolve; }));
    act(() => { oldCallbacks.onDetailChanged(7, 'primary'); });
    await waitFor(() => expect(finishOldRead).toBeTypeOf('function'));
    await screen.findByRole('option', { name: 'Colleague' });
    fireEvent.change(screen.getByRole('combobox', { name: 'CRM сотрудника' }), { target: { value: '8' } });
    await waitFor(() => expect(harness.mobile!.ownerId).toBe(8));
    await waitFor(() => expect(api.fetchPrimaryCrmClients).toHaveBeenLastCalledWith(8, { bypassCache: true }));
    await act(async () => { finishOldRead({ ownerId: 7, items: [{ ...client, documentName: 'Stale owner result' }], orderVersion: 99 }); });
    expect(screen.queryByText('Stale owner result')).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /ООО Документ/ })).toBeInTheDocument();
  });

  it('switches to a foreign owner and blocks shared add, move, color and reorder callbacks', async () => {
    render(<CrmWorkspace />);
    await screen.findByRole('row', { name: /ООО Документ/ });
    // Client rows settle before the owner list does; the switch below is only
    // meaningful once the colleague option exists.
    await screen.findByRole('option', { name: 'Colleague' });
    expect(screen.getByRole('button', { name: 'Добавить клиента' })).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'CRM сотрудника' }), { target: { value: '8' } });
    await waitFor(() => expect(api.fetchPrimaryCrmClients).toHaveBeenLastCalledWith(8, { bypassCache: true }));
    expect(screen.queryByRole('button', { name: 'Добавить клиента' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить клиентов' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Новая вкладка' })).not.toBeInTheDocument();
    // Supply valid input: absence of a request must be due to permission, not validation.
    act(() => harness.mobile!.onChangeClientForm({ ...harness.mobile!.newClientForm, documentName: 'Valid foreign client' }));
    const callbacks = harness.mobile!;
    expect(callbacks.canEditWorkspace).toBe(false);
    await act(async () => {
      callbacks.onSubmitClient(submit());
      callbacks.onMoveClient(client, 3);
      callbacks.onColorClient(client, 'blue');
      callbacks.onReorder(42, 2);
    });
    for (const fn of [api.createCrmClient, api.moveCrmClient, api.saveCrmPrimaryRowPreference, api.reorderPrimaryCrmClients]) expect(fn).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('row', { name: /ООО Документ/ })).getByRole('button', { name: 'Открыть' }));
    const detail = await screen.findByRole('dialog', { name: 'ООО Документ' });
    expect(await within(detail).findByText('История звонков доступна только для просмотра.')).toBeVisible();
    expect(api.fetchCrmEvents).toHaveBeenLastCalledWith(42, 8);
    expect(within(detail).queryByRole('button', { name: 'Сохранить результат звонка' })).not.toBeInTheDocument();
    // Lifecycle management is an intentional admin exception even for a foreign workspace.
    expect(within(detail).getByRole('button', { name: 'Архивировать локального клиента' })).toBeVisible();
  });

  it('ignores an owner switch while the owner list has not loaded instead of loading owner 0', async () => {
    vi.mocked(api.fetchUsers).mockImplementation(() => new Promise(() => undefined));
    const reads = vi.mocked(api.fetchPrimaryCrmClients).mock.calls.length;
    render(<CrmWorkspace />);
    await screen.findByRole('row', { name: /ООО Документ/ });
    const ownerSelect = screen.getByRole('combobox', { name: 'CRM сотрудника' }) as HTMLSelectElement;
    expect(ownerSelect.options).toHaveLength(0);
    // jsdom coerces the missing option to an empty value, which Number() maps to 0.
    fireEvent.change(ownerSelect, { target: { value: '8' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Добавить клиента' })).toBeVisible());
    expect(vi.mocked(api.fetchPrimaryCrmClients).mock.calls.slice(reads).map((call) => call[0])).not.toContain(0);
    expect(screen.getByRole('row', { name: /ООО Документ/ })).toBeInTheDocument();
  });

  it.each(['foreign', 'archive'] as const)('rejects normal controller writes in %s mode even if handlers are invoked', async (mode) => {
    const config = options(mode === 'foreign' ? { ownerId: 8, canEditWorkspace: false, canManageReminders: false } : { primaryArchiveMode: true });
    const { result } = renderHook(() => useCrmClientDetailController(config));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      result.current.setEventForm({ kind: 'call', body: 'Valid call' });
      result.current.setContactForm({ name: 'Contact', position: '', phone: '', email: '', isPrimary: false });
      result.current.setReminderDueAt('2026-10-02T10:00');
    });
    await act(async () => {
      await result.current.saveEvent(submit());
      await result.current.saveContact(submit());
      await result.current.saveClientNote('Valid note');
      await result.current.saveReminder(submit());
      await result.current.saveCompanyRequisites(submit());
      await result.current.confirmExistingLink();
    });
    for (const fn of [api.createCrmEvent, api.createCrmContact, api.saveCrmClientNote, api.createCrmReminder, api.updateCrmClient, api.confirmCrmExistingLink]) expect(fn).not.toHaveBeenCalled();
    expect(config.onChanged).not.toHaveBeenCalled();
  });

  it('refreshes the current owner after an owner change when saving a call', async () => {
    const changed = vi.fn();
    const { result, rerender } = renderHook(({ ownerId }) => useCrmClientDetailController(options({ ownerId, onChanged: changed })), { initialProps: { ownerId: 7 } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ ownerId: 8 });
    await waitFor(() => expect(api.fetchCrmEvents).toHaveBeenLastCalledWith(42, 8));
    await act(async () => result.current.setEventForm({ kind: 'call', body: 'Call for current owner' }));
    await act(async () => { await result.current.saveEvent(submit()); });
    expect(api.createCrmEvent).toHaveBeenLastCalledWith(42, { kind: 'call', body: 'Call for current owner' }, 8);
    expect(changed).toHaveBeenCalledExactlyOnceWith(8, 3);
  });

  it('preserves admin local lifecycle and conflict exceptions in a foreign workspace', async () => {
    const config = options({ ownerId: 8, canEditWorkspace: false, canManageReminders: false });
    const { result } = renderHook(() => useCrmClientDetailController(config));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManageLocalClient).toBe(true);
    expect(result.current.canResolveSyncConflicts).toBe(true);
    await act(async () => { await result.current.archiveLocalClient(); });
    expect(api.archiveLocalCrmClient).toHaveBeenCalledWith(42, { reason: '', expectedVersion: 3 }, 8);
    await act(async () => { await result.current.restoreLocalClient(); });
    expect(api.restoreLocalCrmClient).toHaveBeenCalledWith(42, { expectedVersion: 4 }, 8);
    await act(async () => result.current.setSyncConflictResolution({ conflict: { id: 9, updatedAt: 'version' } as CrmSyncConflict, choice: 'remote' }));
    await act(async () => { await result.current.resolveSyncConflict(); });
    expect(api.resolveCrmSyncConflict).toHaveBeenCalledWith(42, 9, { choice: 'remote', expectedUpdatedAt: 'version' }, 8);
    expect(config.onChanged).toHaveBeenCalledWith(8, 3);
  });

  it('allows an administrator to remove a foreign personal assignment without editing client data', async () => {
    const config = options({ ownerId: 8, canEditWorkspace: false, client: { ...client, linkedCounterpartyId: 1042, assignment: { id: 9, tabId: 3, tabName: 'В работе', archivedAt: null } } });
    const { result } = renderHook(() => useCrmClientDetailController(config));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canRemoveAssignment).toBe(true);
    await act(async () => { await result.current.removeAssignment(); });
    expect(api.removeCrmAssignment).toHaveBeenCalledWith(42, 8);
    expect(api.updateCrmClient).not.toHaveBeenCalled();
    expect(config.onChanged).toHaveBeenCalledWith(8, 3);
  });

  it.each([false, true])('guards primary archive operations for admin=%s', async (isAdmin) => {
    const config = options({ isAdmin, activeTab: 'primary', client: { ...client, linkedCounterpartyId: 1042 }, onPrimaryArchiveChanged: vi.fn() });
    const { result, rerender } = renderHook(({ archive }) => useCrmClientDetailController({ ...config, primaryArchiveMode: archive }), { initialProps: { archive: false } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.restorePrimaryClient(); await result.current.archivePrimaryClient(); });
    expect(api.restorePrimaryCrmClient).not.toHaveBeenCalled();
    expect(api.archivePrimaryCrmClient).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    rerender({ archive: true });
    await act(async () => { await result.current.archivePrimaryClient(); await result.current.restorePrimaryClient(); });
    expect(api.archivePrimaryCrmClient).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    expect(api.restorePrimaryCrmClient).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    expect(config.onPrimaryArchiveChanged).toHaveBeenCalledTimes(isAdmin ? 2 : 0);
  });
});
