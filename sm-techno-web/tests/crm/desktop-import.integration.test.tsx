import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CrmWorkspace } from '@/components/crm-workspace';
import { DesktopCrmImportDialog } from '@/components/crm/import/desktop-crm-import-dialog';
import * as api from '@/lib/api';
import type { CrmImportPreview, CrmImportResult, CrmTab } from '@/lib/types';

const auth = vi.hoisted(() => ({
  user: {
    id: 7,
    username: 'operator',
    role: 'user' as const,
    fullName: 'Оператор',
    onecUsername: '',
    hasOnecPassword: false,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({
    user: auth.user,
    isAdmin: false,
  }),
}));

vi.mock('@/components/crm/mobile/mobile-crm-workspace', () => ({
  MobileCrmWorkspace: () => null,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogAction: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
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
  previewCrmImport: vi.fn(),
  importCrmFile: vi.fn(),
  syncCrmWorkspace: vi.fn(),
}));

const tabs: CrmTab[] = [
  { id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 },
  { id: 8, name: 'Постоянные', systemKind: 'custom', sortOrder: 1 },
];

const preview: CrmImportPreview = {
  ownerId: 7,
  target: { tabId: 3, newTabName: null },
  clientsToCreate: 2,
  clientsToUpdate: 1,
  unchangedClients: 4,
  clientsToAssign: 1,
  contactsToCreate: 3,
  contactsToUpdate: 2,
  duplicateConflicts: 0,
  skippedOneCLinked: 1,
  errors: [],
};

function selectWorkbook() {
  return new File(['xlsx'], 'clients.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

beforeEach(() => {
  vi.mocked(api.previewCrmImport).mockResolvedValue(preview);
  vi.mocked(api.importCrmFile).mockResolvedValue({
    ...preview,
    targetTab: { id: 3, name: 'В работе', systemKind: 'work' },
  });
  vi.mocked(api.fetchCrmTabs).mockResolvedValue(tabs);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({
    ownerId: 7,
    items: [],
    orderVersion: 0,
  });
  vi.mocked(api.fetchCrmClients).mockResolvedValue([]);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({
    status: 'synced',
    lastSyncAt: new Date().toISOString(),
  });
  vi.mocked(api.syncCrmWorkspace).mockResolvedValue({
    status: 'ok',
    counterparties: 0,
  });
});

describe('desktop CRM Excel import', () => {
  test('previews and imports the selected workbook into an existing tab', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={tabs}
        onClose={vi.fn()}
        onImported={onImported}
      />,
    );

    const workbook = selectWorkbook();
    await user.upload(screen.getByLabelText('Excel-файл'), workbook);
    await user.selectOptions(screen.getByLabelText('Вкладка для импорта'), '8');
    expect(
      screen.getByLabelText('Включить существующих клиентов'),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Проверить файл' }));

    await waitFor(() =>
      expect(api.previewCrmImport).toHaveBeenCalledWith({
        file: workbook,
        ownerId: 7,
        targetTabId: 8,
        newTabName: null,
        includeExistingClients: true,
      }),
    );
    expect(screen.getByText('Будет создано клиентов: 2')).toBeVisible();
    expect(screen.getByText('Будет обновлено контактов: 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Импортировать' }));
    await waitFor(() =>
      expect(api.importCrmFile).toHaveBeenCalledWith({
        file: workbook,
        ownerId: 7,
        targetTabId: 8,
        newTabName: null,
        includeExistingClients: true,
      }),
    );
    expect(onImported).toHaveBeenCalledWith(3);
  });

  test('uses a new tab name without creating it during preview', async () => {
    const user = userEvent.setup();
    render(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={tabs}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    const workbook = selectWorkbook();
    await user.upload(screen.getByLabelText('Excel-файл'), workbook);
    await user.click(screen.getByLabelText('Новая вкладка'));
    await user.type(
      screen.getByLabelText('Название новой вкладки'),
      'Сентябрь',
    );
    await user.click(screen.getByRole('button', { name: 'Проверить файл' }));

    await waitFor(() =>
      expect(api.previewCrmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          file: workbook,
          ownerId: 7,
          targetTabId: null,
          newTabName: 'Сентябрь',
        }),
      ),
    );
    expect(api.importCrmFile).not.toHaveBeenCalled();
  });

  test('freezes preview inputs and imports the exact validated snapshot after a delayed preview', async () => {
    const user = userEvent.setup();
    let resolvePreview: (value: CrmImportPreview) => void;
    vi.mocked(api.previewCrmImport).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    render(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={tabs}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    const workbook = selectWorkbook();
    await user.upload(screen.getByLabelText('Excel-файл'), workbook);
    await user.click(screen.getByRole('button', { name: 'Проверить файл' }));
    await waitFor(() =>
      expect(api.previewCrmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          file: workbook,
          targetTabId: 3,
          includeExistingClients: true,
        }),
      ),
    );

    expect(screen.getByLabelText('Excel-файл')).toBeDisabled();
    expect(screen.getByLabelText('Вкладка для импорта')).toBeDisabled();
    expect(screen.getByLabelText('Новая вкладка')).toBeDisabled();
    expect(
      screen.getByLabelText('Включить существующих клиентов'),
    ).toBeDisabled();
    resolvePreview!(preview);

    await user.click(
      await screen.findByRole('button', { name: 'Импортировать' }),
    );
    await waitFor(() =>
      expect(api.importCrmFile).toHaveBeenCalledWith({
        file: workbook,
        ownerId: 7,
        targetTabId: 3,
        newTabName: null,
        includeExistingClients: true,
      }),
    );
  });

  test('selects a real target when tabs arrive after the dialog opens', async () => {
    const user = userEvent.setup();
    const view = render(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={[]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    view.rerender(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={tabs}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Вкладка для импорта')).toHaveValue('3'),
    );
    await user.upload(screen.getByLabelText('Excel-файл'), selectWorkbook());
    await user.click(screen.getByRole('button', { name: 'Проверить файл' }));

    await waitFor(() =>
      expect(api.previewCrmImport).toHaveBeenCalledWith(
        expect.objectContaining({ targetTabId: 3, newTabName: null }),
      ),
    );
  });

  test('keeps final import blocked when preview reports errors or duplicate conflicts', async () => {
    const user = userEvent.setup();
    vi.mocked(api.previewCrmImport).mockResolvedValue({
      ...preview,
      duplicateConflicts: 1,
      errors: [
        {
          sheet: 'Клиенты',
          row: 4,
          field: 'ИНН',
          code: 'ambiguous_client',
          message: 'Несколько совпадений',
        },
      ],
    });
    render(
      <DesktopCrmImportDialog
        ownerId={7}
        tabs={tabs}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText('Excel-файл'), selectWorkbook());
    await user.click(screen.getByRole('button', { name: 'Проверить файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Несколько совпадений',
    );
    expect(screen.getByText('Конфликтов-дубликатов: 1')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Импортировать' }),
    ).toBeDisabled();
    expect(api.importCrmFile).not.toHaveBeenCalled();
  });

  test('keeps post-import target activation local when freshness becomes stale', async () => {
    const user = userEvent.setup();
    const result: CrmImportResult = {
      ...preview,
      target: { tabId: null, newTabName: 'Сентябрь' },
      targetTab: { id: 12, name: 'Сентябрь', systemKind: 'custom' },
    };
    let importFinished = false;
    vi.mocked(api.importCrmFile).mockImplementation(async () => {
      importFinished = true;
      return result;
    });
    vi.mocked(api.fetchCrmTabs).mockResolvedValue([
      ...tabs,
      { id: 12, name: 'Сентябрь', systemKind: 'custom', sortOrder: 2 },
    ]);
    vi.mocked(api.fetchCrmSyncStatus).mockImplementation(async () => ({
      status: 'synced',
      lastSyncAt: importFinished
        ? '2020-01-01T00:00:00.000Z'
        : new Date().toISOString(),
    }));

    render(<CrmWorkspace />);
    await screen.findByRole('button', { name: 'Загрузить клиентов' });
    await user.click(
      screen.getByRole('button', { name: 'Загрузить клиентов' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Загрузка клиентов из Excel',
    });
    await user.upload(
      within(dialog).getByLabelText('Excel-файл'),
      selectWorkbook(),
    );
    await user.click(within(dialog).getByLabelText('Новая вкладка'));
    await user.type(
      within(dialog).getByLabelText('Название новой вкладки'),
      'Сентябрь',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Проверить файл' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Импортировать' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сентябрь' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    await waitFor(() =>
      expect(api.fetchCrmClients).toHaveBeenCalledWith(
        { ownerId: 7, tabId: 12 },
        { bypassCache: true },
      ),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(api.fetchCrmSyncStatus).toHaveBeenCalledTimes(1);
    expect(api.syncCrmWorkspace).not.toHaveBeenCalled();
  });

  test('moves focus into the modal and restores the import launcher after Escape', async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);
    const launcher = await screen.findByRole('button', {
      name: 'Загрузить клиентов',
    });
    await user.click(launcher);
    const dialog = screen.getByRole('dialog', {
      name: 'Загрузка клиентов из Excel',
    });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    for (let index = 0; index < 8; index += 1) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Загрузка клиентов из Excel' }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
  });
});
