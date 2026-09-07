import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CrmWorkspace } from '@/components/crm-workspace';
import * as api from '@/lib/api';
import type { CrmWorkspaceClient } from '@/lib/types';

const auth = vi.hoisted(() => ({
  user: { id: 7, username: 'operator', role: 'user', fullName: 'Оператор' },
  isAdmin: false,
}));
vi.mock('@/components/auth-provider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchCrmTabs: vi.fn(),
  fetchPrimaryCrmClients: vi.fn(),
  fetchCrmClients: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmSyncStatus: vi.fn(),
  reorderPrimaryCrmClients: vi.fn(),
  reorderCrmTabClients: vi.fn(),
}));

function client(
  id: number,
  documentName: string,
  overrides: Partial<CrmWorkspaceClient> = {},
): CrmWorkspaceClient {
  return {
    id,
    version: 1,
    name: documentName,
    documentName,
    fullName: '',
    inn: '',
    kpp: '',
    city: '',
    website: '',
    contactPerson: '',
    email: '',
    phone: '',
    notes: '',
    linkedCounterpartyId: null,
    syncStatus: 'synced',
    syncError: '',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    assignment: null,
    workOwners: [],
    ...overrides,
  };
}
const clients = [
  client(8, 'Вега', { phone: '+79990000000', email: 'v@example.test' }),
  client(3, 'Альфа', {
    phone: '  ',
    email: 'a@example.test',
    createdAt: '2026-09-03T09:00:00.000Z',
    workOwners: [{ userId: 7, fullName: 'Оператор' }],
  }),
  client(5, 'Бета', {
    phone: '123',
    email: '  ',
    syncStatus: 'local',
    createdAt: '2026-09-02T09:00:00.000Z',
  }),
];

const viewportListeners = new Set<() => void>();
function viewport(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });
    viewportListeners.forEach((listener) => listener());
    window.dispatchEvent(new Event('resize'));
  });
}
beforeEach(() => {
  viewportListeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: window.innerWidth < 768,
      addEventListener: (_: string, listener: () => void) =>
        viewportListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        viewportListeners.delete(listener),
    })),
  );
  viewport(375);
  vi.mocked(api.fetchCrmTabs).mockResolvedValue([
    { id: 3, name: 'В работе', systemKind: 'work', sortOrder: 0 },
  ]);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({
    ownerId: 7,
    items: clients,
    orderVersion: 0,
  });
  vi.mocked(api.fetchCrmClients).mockResolvedValue(clients);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({
    status: 'synced',
    lastSyncAt: new Date().toISOString(),
  });
});
function mobile() {
  return within(
    document.querySelector('[data-mobile-crm-workspace]') as HTMLElement,
  );
}
function cardNames() {
  return mobile()
    .queryAllByRole('article')
    .map((card) => within(card).getByRole('heading').textContent);
}
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    mobile().getByRole('button', { name: /Фильтры и сортировка/ }),
  );
  return within(
    await screen.findByRole('dialog', { name: 'Фильтры и сортировка' }),
  );
}
async function ready() {
  render(<CrmWorkspace />);
  await waitFor(() => expect(cardNames()).toEqual(['Вега', 'Альфа', 'Бета']));
}

describe('shared desktop and mobile CRM list controls', () => {
  test('draft changes preview the real count and apply only on confirmation; closing discards changes', async () => {
    const user = userEvent.setup();
    await ready();
    const sheet = await openSheet(user);
    await user.click(sheet.getByRole('radio', { name: 'Сначала новые' }));
    await user.click(
      within(sheet.getByRole('group', { name: 'Телефон' })).getByRole('radio', {
        name: 'Есть',
      }),
    );
    await user.click(
      within(sheet.getByRole('group', { name: 'Почта' })).getByRole('radio', {
        name: 'Нет',
      }),
    );
    expect(
      sheet.getByRole('button', { name: 'Показать 1 клиента' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Сортировка')).toHaveValue('manual');
    await user.click(sheet.getByRole('button', { name: 'Закрыть форму' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(cardNames()).toEqual(['Вега', 'Альфа', 'Бета']);
    const reopened = await openSheet(user);
    expect(
      reopened.getByRole('radio', { name: 'Ручной порядок' }),
    ).toBeChecked();
    await user.click(reopened.getByRole('radio', { name: 'Сначала новые' }));
    await user.click(
      within(reopened.getByRole('group', { name: 'Телефон' })).getByRole(
        'radio',
        { name: 'Нет' },
      ),
    );
    await user.click(
      reopened.getByRole('button', { name: 'Показать 1 клиента' }),
    );
    await waitFor(() => expect(cardNames()).toEqual(['Альфа']));
    expect(
      mobile().getByRole('button', { name: 'Фильтры и сортировка: 2' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Сортировка')).toHaveValue('newest');
    expect(screen.getByLabelText('Телефон')).toHaveValue('missing');
  });

  test.each([
    ['manual', 'Ручной порядок', ['Вега', 'Альфа', 'Бета']],
    ['name_asc', 'По названию: А–Я', ['Альфа', 'Бета', 'Вега']],
    ['name_desc', 'По названию: Я–А', ['Вега', 'Бета', 'Альфа']],
    ['newest', 'Сначала новые', ['Альфа', 'Бета', 'Вега']],
    ['oldest', 'Сначала старые', ['Вега', 'Бета', 'Альфа']],
    ['free_first', 'Сначала свободные', ['Вега', 'Бета', 'Альфа']],
    ['busy_first', 'Сначала занятые', ['Альфа', 'Вега', 'Бета']],
  ])(
    'desktop %s survives resizing and is represented truthfully on mobile',
    async (mode, label, names) => {
      const user = userEvent.setup();
      viewport(1280);
      await ready();
      await user.selectOptions(screen.getByLabelText('Сортировка'), mode);
      viewport(375);
      expect(cardNames()).toEqual(names);
      const sheet = await openSheet(user);
      expect(sheet.getByRole('radio', { name: label as string })).toBeChecked();
      expect(
        sheet
          .getAllByRole('radio')
          .filter((radio) => (radio as HTMLInputElement).checked),
      ).toHaveLength(3);
      await user.click(
        sheet.getByRole('button', { name: 'Показать 3 клиентов' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      await user.click(mobile().getByLabelText('Ещё действия CRM'));
      if (mode !== 'manual') {
        expect(
          mobile().getByRole('button', { name: 'Изменить порядок' }),
        ).toBeDisabled();
        expect(
          mobile().getByText(/Выберите.*Ручной порядок/),
        ).toBeInTheDocument();
      }
      expect(api.reorderPrimaryCrmClients).not.toHaveBeenCalled();
      expect(api.reorderCrmTabClients).not.toHaveBeenCalled();
    },
  );

  test('contact state crosses layouts, draft reset restores raw clients and reset preserves search and tab', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(mobile().getByRole('button', { name: 'В работе' }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-mobile-crm-workspace]'),
      ).toHaveAttribute('data-active-tab', '3'),
    );
    await user.type(mobile().getByRole('searchbox'), 'а');
    viewport(1280);
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'busy_first');
    await user.selectOptions(screen.getByLabelText('Телефон'), 'missing');
    await user.selectOptions(screen.getByLabelText('Почта'), 'missing');
    viewport(375);
    expect(mobile().getByText('Клиенты не найдены')).toBeInTheDocument();
    const sheet = await openSheet(user);
    expect(
      within(sheet.getByRole('group', { name: 'Телефон' })).getByRole('radio', {
        name: 'Нет',
      }),
    ).toBeChecked();
    expect(
      within(sheet.getByRole('group', { name: 'Почта' })).getByRole('radio', {
        name: 'Нет',
      }),
    ).toBeChecked();
    expect(
      sheet.getByRole('button', { name: 'Показать 0 клиентов' }),
    ).toBeInTheDocument();
    await user.click(sheet.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(
      sheet.getByRole('button', { name: 'Показать 3 клиентов' }),
    ).toBeInTheDocument();
    await user.click(
      sheet.getByRole('button', { name: 'Показать 3 клиентов' }),
    );
    await waitFor(() => expect(cardNames()).toEqual(['Вега', 'Альфа', 'Бета']));
    expect(mobile().getByRole('searchbox')).toHaveValue('а');
    expect(mobile().getByRole('button', { name: 'В работе' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      mobile().getByRole('button', { name: 'Фильтры и сортировка' }),
    ).toBeInTheDocument();
    viewport(1280);
    expect(screen.getByLabelText('Сортировка')).toHaveValue('manual');
    expect(screen.getByLabelText('Телефон')).toHaveValue('all');
    expect(screen.getByLabelText('Почта')).toHaveValue('all');
  });

  test('every mobile sort choice applies to a personal tab and survives switching back to primary', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(mobile().getByRole('button', { name: 'В работе' }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-mobile-crm-workspace]'),
      ).toHaveAttribute('data-active-tab', '3'),
    );
    for (const [label, names] of [
      ['По названию: А–Я', ['Альфа', 'Бета', 'Вега']],
      ['По названию: Я–А', ['Вега', 'Бета', 'Альфа']],
      ['Сначала новые', ['Альфа', 'Бета', 'Вега']],
      ['Сначала старые', ['Вега', 'Бета', 'Альфа']],
      ['Сначала свободные', ['Вега', 'Бета', 'Альфа']],
      ['Сначала занятые', ['Альфа', 'Вега', 'Бета']],
      ['Ручной порядок', ['Вега', 'Альфа', 'Бета']],
    ] as const) {
      const sheet = await openSheet(user);
      await user.click(sheet.getByRole('radio', { name: label }));
      await user.click(
        sheet.getByRole('button', { name: 'Показать 3 клиентов' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(cardNames()).toEqual(names);
    }
    const sheet = await openSheet(user);
    await user.click(sheet.getByRole('radio', { name: 'Сначала занятые' }));
    await user.click(
      sheet.getByRole('button', { name: 'Показать 3 клиентов' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(mobile().getByRole('button', { name: 'Клиенты 1С' }));
    await waitFor(() => expect(cardNames()).toEqual(['Альфа', 'Вега', 'Бета']));
    expect(screen.getByLabelText('Сортировка')).toHaveValue('busy_first');
    expect(api.reorderPrimaryCrmClients).not.toHaveBeenCalled();
    expect(api.reorderCrmTabClients).not.toHaveBeenCalled();
  });

  test('empty-list reset uses the shared state and preserves search and sync constraints', async () => {
    const user = userEvent.setup();
    await ready();
    await user.type(mobile().getByRole('searchbox'), 'Вега');
    await user.selectOptions(screen.getByLabelText('Телефон'), 'missing');
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'oldest');
    expect(mobile().getByText('Клиенты не найдены')).toBeInTheDocument();
    await user.click(
      mobile().getByRole('button', { name: 'Сбросить фильтры' }),
    );
    expect(cardNames()).toEqual(['Вега']);
    expect(mobile().getByRole('searchbox')).toHaveValue('Вега');
    fireEvent.change(mobile().getByRole('searchbox'), {
      target: { value: '' },
    });
    await user.click(mobile().getByLabelText('Ещё действия CRM'));
    await user.selectOptions(mobile().getByLabelText('Синхронизация'), 'local');
    const sheet = await openSheet(user);
    expect(
      sheet.getByRole('button', { name: 'Показать 1 клиента' }),
    ).toBeInTheDocument();
    await user.click(
      within(sheet.getByRole('group', { name: 'Почта' })).getByRole('radio', {
        name: 'Есть',
      }),
    );
    expect(
      sheet.getByRole('button', { name: 'Показать 0 клиентов' }),
    ).toBeInTheDocument();
    await user.click(sheet.getByRole('button', { name: 'Сбросить фильтры' }));
    await user.click(sheet.getByRole('button', { name: 'Показать 1 клиента' }));
    await waitFor(() => expect(cardNames()).toEqual(['Бета']));
    expect(mobile().getByLabelText('Синхронизация')).toHaveValue('local');
  });
});
