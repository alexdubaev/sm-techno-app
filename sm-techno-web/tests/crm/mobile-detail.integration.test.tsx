import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import * as api from '@/lib/api';
import { MobileClientActions } from '@/components/crm/mobile/mobile-client-actions';
import { MobileClientCard } from '@/components/crm/mobile/mobile-client-card';
import { MobileClientDetail } from '@/components/crm/mobile/mobile-client-detail';
import { getReminderPresetValue } from '@/components/crm/mobile/mobile-client-reminders';
import type { CrmReminder, CrmWorkspaceClient } from '@/lib/types';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchCrmContacts: vi.fn(),
  fetchCrmEvents: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmAudit: vi.fn(),
  fetchCrmLinkCandidates: vi.fn(),
  fetchCrmSyncConflicts: vi.fn(),
  createCrmContact: vi.fn(),
  createCrmEvent: vi.fn(),
  createCrmReminder: vi.fn(),
  rescheduleCrmReminder: vi.fn(),
  completeCrmReminder: vi.fn(),
  cancelCrmReminder: vi.fn(),
  updateCrmClient: vi.fn(),
}));

const client: CrmWorkspaceClient = {
  id: 42,
  version: 7,
  name: 'Короткое',
  documentName: 'ООО Документ',
  fullName: 'Полное наименование',
  inn: '7700000000',
  kpp: '770001001',
  city: 'Москва',
  website: '',
  contactPerson: 'Ирина',
  email: 'office@example.test',
  phone: '+79990000000',
  notes: 'Важный клиент',
  linkedCounterpartyId: null,
  syncStatus: 'local',
  syncError: '',
  createdAt: '',
  updatedAt: '',
  assignment: null,
  workOwners: [],
};
const reminder: CrmReminder = {
  id: 11,
  clientId: 42,
  dueAt: '2026-09-05T10:00:00.000Z',
  status: 'active',
  createdAt: '',
  completedAt: '',
  cancelledAt: '',
  updatedAt: '2026-09-04T10:00:00.000Z',
};
const props = {
  client,
  ownerId: 7,
  activeTab: 3 as const,
  ownerName: 'Менеджер',
  isAdmin: false,
  canEditWorkspace: true,
  canManageReminders: true,
  canResolveSyncConflicts: true,
  onClose: vi.fn(),
  onDetailChanged: vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  for (const fn of [
    api.fetchCrmContacts,
    api.fetchCrmEvents,
    api.fetchCrmReminders,
    api.fetchCrmAudit,
    api.fetchCrmLinkCandidates,
    api.fetchCrmSyncConflicts,
  ])
    vi.mocked(fn).mockResolvedValue([]);
  vi.mocked(api.createCrmContact).mockImplementation(async (_id, payload) => ({
    ...payload,
    id: 8,
    createdAt: '',
    updatedAt: '',
  }));
  vi.mocked(api.createCrmEvent).mockImplementation(async (_id, payload) => ({
    ...payload,
    id: 9,
    authorUserId: 7,
    createdAt: '2026-09-06T11:00:00Z',
    updatedAt: '',
  }));
  vi.mocked(api.createCrmReminder).mockImplementation(async (_id, payload) => ({
    ...reminder,
    dueAt: payload.dueAt,
  }));
  vi.mocked(api.rescheduleCrmReminder).mockResolvedValue(reminder);
  vi.mocked(api.completeCrmReminder).mockResolvedValue({
    ...reminder,
    status: 'completed',
  });
  vi.mocked(api.cancelCrmReminder).mockResolvedValue({
    ...reminder,
    status: 'cancelled',
  });
  vi.mocked(api.updateCrmClient).mockImplementation(async (_id, payload) => ({
    ...client,
    ...payload,
    version: 8,
  }));
});

async function openDetail(extra = {}) {
  const view = render(<MobileClientDetail {...props} {...extra} />);
  await waitFor(() =>
    expect(screen.queryByText('Загрузка карточки…')).not.toBeInTheDocument(),
  );
  return view;
}

function ClientActionsHarness() {
  const [openClientId, setOpenClientId] = useState<number | null>(null);
  const clients = [
    { ...client, id: 101, documentName: 'Первый клиент' },
    { ...client, id: 102, documentName: 'Второй клиент' },
  ];

  return (
    <>
      {clients.map((item) => (
        <MobileClientActions
          key={item.id}
          client={item}
          color={null}
          isOpen={openClientId === item.id}
          tabs={[]}
          onColor={vi.fn()}
          onMove={vi.fn()}
          onOpenChange={(open) => setOpenClientId(open ? item.id : null)}
        />
      ))}
    </>
  );
}

describe('mobile detail daily actions', () => {
  it('does not open a mobile dialog or load mobile detail at the desktop boundary', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 768,
    });
    render(<MobileClientDetail {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.fetchCrmContacts).not.toHaveBeenCalled();
  });

  it('keeps one client action menu open and closes it from its backdrop', () => {
    render(<ClientActionsHarness />);

    fireEvent.click(screen.getByLabelText('Ещё действия: Первый клиент'));
    expect(screen.getByRole('dialog', { name: 'Действия клиента' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ещё действия: Второй клиент'));
    expect(screen.getAllByRole('dialog', { name: 'Действия клиента' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть меню действий' }));
    expect(screen.queryByRole('dialog', { name: 'Действия клиента' })).not.toBeInTheDocument();
  });

  it('does not request link candidates for a client already linked to 1C', async () => {
    await openDetail({
      client: {
        ...client,
        linkedCounterpartyId: 91,
        syncStatus: 'synced',
      },
    });

    expect(api.fetchCrmLinkCandidates).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds a primary contact, keeps clickable channels, and refreshes the owner workspace', async () => {
    await openDetail();
    expect(
      screen.getAllByRole('link', { name: /Позвонить/ })[0],
    ).toHaveAttribute('href', 'tel:+79990000000');
    fireEvent.click(screen.getByRole('button', { name: '+ Контакт' }));
    const sheet = screen.getByRole('dialog', { name: 'Новый контакт' });
    fireEvent.change(within(sheet).getByLabelText('Имя контакта'), {
      target: { value: '  Елена  ' },
    });
    fireEvent.change(within(sheet).getByLabelText('Телефон'), {
      target: { value: '+79991234567' },
    });
    fireEvent.click(within(sheet).getByLabelText('Основной контакт'));
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить контакт' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Новый контакт' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Елена')).toBeInTheDocument();
    expect(api.createCrmContact).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        name: 'Елена',
        phone: '+79991234567',
        isPrimary: true,
      }),
      7,
    );
    expect(props.onDetailChanged).toHaveBeenCalledWith(7, 3);
  });

  it('renders the client-card call action with white text on green', () => {
    render(
      <MobileClientCard
        activeActionsClientId={null}
        canEditWorkspace={false}
        client={client}
        color={null}
        tabs={[]}
        onColor={vi.fn()}
        onActionsOpenChange={vi.fn()}
        onMove={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Позвонить' })).toHaveStyle({
      color: '#ffffff',
      backgroundColor: '#16a34a',
    });
  });

  it('renders a selected card color as a clear card surface', () => {
    render(
      <MobileClientCard
        activeActionsClientId={null}
        canEditWorkspace={false}
        client={client}
        color="blue"
        tabs={[]}
        onColor={vi.fn()}
        onActionsOpenChange={vi.fn()}
        onMove={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const card = document.querySelector<HTMLElement>(
      `[data-mobile-crm-card-id="${client.id}"]`,
    );
    if (!card) {
      throw new Error('Окрашенная карточка клиента не отрисована.');
    }

    expect(card.style.backgroundColor).toBe('rgb(219, 234, 254)');
    expect(card.style.borderTopColor).toBe('rgb(147, 197, 253)');
    expect(card.style.borderLeftColor).toBe('rgb(37, 99, 235)');
  });

  it('uses a newly saved primary contact for detail quick actions', async () => {
    vi.mocked(api.fetchCrmContacts).mockResolvedValue([
      {
        id: 4,
        name: 'Старый основной',
        phone: '+79990000000',
        email: 'old@example.test',
        isPrimary: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: '+ Контакт' }));
    const sheet = screen.getByRole('dialog', { name: 'Новый контакт' });
    fireEvent.change(within(sheet).getByLabelText('Имя контакта'), {
      target: { value: 'Новый основной' },
    });
    fireEvent.change(within(sheet).getByLabelText('Телефон'), {
      target: { value: '+79991234567' },
    });
    fireEvent.click(within(sheet).getByLabelText('Основной контакт'));
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить контакт' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Новый контакт' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole('link', { name: /Позвонить/ })[0],
    ).toHaveAttribute('href', 'tel:+79991234567');
  });

  it('submits the selected event kind and non-empty body, showing newest events first', async () => {
    vi.mocked(api.fetchCrmEvents).mockResolvedValue([
      {
        id: 1,
        kind: 'call',
        body: 'Старый звонок',
        authorUserId: 7,
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '',
      },
      {
        id: 2,
        kind: 'email',
        body: 'Новое письмо',
        authorUserId: 7,
        createdAt: '2026-09-05T10:00:00Z',
        updatedAt: '',
      },
    ]);
    await openDetail({ initialSection: 'history' });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Новое письмо');
    expect(items[1]).toHaveTextContent('Старый звонок');
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить событие' }));
    const sheet = screen.getByRole('dialog', { name: 'Добавить событие' });
    expect(
      within(sheet).getByRole('button', { name: 'Сохранить событие' }),
    ).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Тип события'), {
      target: { value: 'meeting' },
    });
    fireEvent.change(within(sheet).getByLabelText('Описание'), {
      target: { value: '  Встреча назначена  ' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить событие' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Добавить событие' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      'Встреча назначена',
    );
    expect(api.createCrmEvent).toHaveBeenCalledWith(
      42,
      { kind: 'meeting', body: 'Встреча назначена' },
      7,
    );
    expect(props.onDetailChanged).toHaveBeenCalledWith(7, 3);
  });

  it('saves company version and keeps the chosen detail section on a same-client update', async () => {
    const view = await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить реквизиты' }));
    const sheet = screen.getByRole('dialog', { name: 'Реквизиты компании' });
    fireEvent.change(
      within(sheet).getByLabelText('Наименование для документов'),
      { target: { value: 'ООО Новое имя' } },
    );
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить реквизиты' }),
    );
    await waitFor(() =>
      expect(api.updateCrmClient).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          documentName: 'ООО Новое имя',
          expectedVersion: 7,
        }),
        7,
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Реквизиты компании' }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'История' }));
    view.rerender(
      <MobileClientDetail
        {...props}
        client={{ ...client, version: 8 }}
        initialSection="reminders"
      />,
    );
    expect(screen.getByRole('tab', { name: 'История' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    view.rerender(
      <MobileClientDetail
        {...props}
        client={{ ...client, id: 43 }}
        initialSection="reminders"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Напоминания' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('creates and reschedules in Moscow time with owner and concurrency fields', async () => {
    vi.mocked(api.fetchCrmReminders).mockResolvedValue([reminder]);
    await openDetail({ initialSection: 'reminders' });
    fireEvent.click(screen.getByRole('button', { name: '+ Напоминание' }));
    let sheet = screen.getByRole('dialog', { name: 'Новое напоминание' });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Завтра утром' }),
    );
    expect(
      within(sheet).getByLabelText('Дата и время (Москва)'),
    ).not.toHaveValue('');
    fireEvent.change(within(sheet).getByLabelText('Дата и время (Москва)'), {
      target: { value: '2026-09-07T09:00' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Создать напоминание' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Новое напоминание' }),
      ).not.toBeInTheDocument(),
    );
    expect(api.createCrmReminder).toHaveBeenCalledWith(
      42,
      { dueAt: '2026-09-07T06:00:00.000Z' },
      7,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Перенести' })[0]);
    sheet = screen.getByRole('dialog', { name: 'Перенести напоминание' });
    fireEvent.change(within(sheet).getByLabelText('Дата и время (Москва)'), {
      target: { value: '2026-09-08T14:00' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить перенос' }),
    );
    await waitFor(() =>
      expect(api.rescheduleCrmReminder).toHaveBeenCalledWith(
        11,
        {
          dueAt: '2026-09-08T11:00:00.000Z',
          expectedUpdatedAt: reminder.updatedAt,
        },
        7,
      ),
    );
    expect(props.onDetailChanged).toHaveBeenCalledWith(7, 3);
  });

  it('closes a successful reschedule sheet and retains its returned concurrency value when refresh fails', async () => {
    const rescheduledReminder = {
      ...reminder,
      dueAt: '2026-09-08T11:00:00.000Z',
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    vi.mocked(api.fetchCrmReminders)
      .mockResolvedValueOnce([reminder])
      .mockRejectedValueOnce(new Error('Обновление списка недоступно'));
    vi.mocked(api.rescheduleCrmReminder).mockResolvedValue(rescheduledReminder);
    await openDetail({ initialSection: 'reminders' });
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));
    let sheet = screen.getByRole('dialog', { name: 'Перенести напоминание' });
    fireEvent.change(within(sheet).getByLabelText('Дата и время (Москва)'), {
      target: { value: '2026-09-08T14:00' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить перенос' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Перенести напоминание' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Напоминание перенесено, но не удалось обновить карточку.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));
    sheet = screen.getByRole('dialog', { name: 'Перенести напоминание' });
    fireEvent.change(within(sheet).getByLabelText('Дата и время (Москва)'), {
      target: { value: '2026-09-09T14:00' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить перенос' }),
    );
    await waitFor(() =>
      expect(api.rescheduleCrmReminder).toHaveBeenLastCalledWith(
        11,
        {
          dueAt: '2026-09-09T11:00:00.000Z',
          expectedUpdatedAt: '2026-09-06T12:00:00.000Z',
        },
        7,
      ),
    );
  });

  it.each(['Выполнено', 'Отменить'])(
    'transitions reminders via %s with their concurrency field',
    async (action) => {
      vi.mocked(api.fetchCrmReminders)
        .mockResolvedValueOnce([reminder])
        .mockResolvedValue([]);
      await openDetail({ initialSection: 'reminders' });
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() =>
        expect(
          screen.getByText('Активных напоминаний нет'),
        ).toBeInTheDocument(),
      );
      expect(
        action === 'Выполнено'
          ? api.completeCrmReminder
          : api.cancelCrmReminder,
      ).toHaveBeenCalledWith(11, reminder.updatedAt, 7);
      expect(props.onDetailChanged).toHaveBeenCalledWith(7, 3);
    },
  );

  it('keeps failed contact input and announces its error in the open sheet', async () => {
    vi.mocked(api.createCrmContact).mockRejectedValue(
      new Error('Нет соединения'),
    );
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: '+ Контакт' }));
    const sheet = screen.getByRole('dialog', { name: 'Новый контакт' });
    fireEvent.change(within(sheet).getByLabelText('Имя контакта'), {
      target: { value: 'Елена' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Сохранить контакт' }),
    );
    await waitFor(() =>
      expect(within(sheet).getByRole('alert')).toHaveTextContent(
        'Нет соединения',
      ),
    );
    expect(within(sheet).getByLabelText('Имя контакта')).toHaveValue('Елена');
    expect(props.onDetailChanged).not.toHaveBeenCalled();
  });

  it('shows requisites and contact channels while hiding mutations for another owner', async () => {
    vi.mocked(api.fetchCrmReminders).mockResolvedValue([reminder]);
    await openDetail({ canEditWorkspace: false, canManageReminders: false });
    expect(screen.getByText('7700000000')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ Контакт' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Изменить реквизиты' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Напоминания' }));
    expect(
      screen.queryByRole('button', { name: 'Перенести' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Выполнено' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      section: 'history',
      open: '+ Добавить событие',
      title: 'Добавить событие',
      label: 'Описание',
      value: 'Повторить звонок',
      save: 'Сохранить событие',
      request: api.createCrmEvent,
    },
    {
      section: 'overview',
      open: 'Изменить реквизиты',
      title: 'Реквизиты компании',
      label: 'Наименование для документов',
      value: 'ООО Изменено',
      save: 'Сохранить реквизиты',
      request: api.updateCrmClient,
    },
    {
      section: 'reminders',
      open: '+ Напоминание',
      title: 'Новое напоминание',
      label: 'Дата и время (Москва)',
      value: '2026-09-08T14:00',
      save: 'Создать напоминание',
      request: api.createCrmReminder,
    },
    {
      section: 'reminders',
      open: 'Перенести',
      title: 'Перенести напоминание',
      label: 'Дата и время (Москва)',
      value: '2026-09-08T14:00',
      save: 'Сохранить перенос',
      request: api.rescheduleCrmReminder,
    },
  ] as const)(
    'retains the $title sheet and input after its API fails',
    async (scenario) => {
      vi.mocked(scenario.request).mockRejectedValue(
        new Error('Изменение не сохранено'),
      );
      vi.mocked(api.fetchCrmReminders).mockResolvedValue([reminder]);
      await openDetail({ initialSection: scenario.section });
      fireEvent.click(screen.getByRole('button', { name: scenario.open }));
      const sheet = screen.getByRole('dialog', { name: scenario.title });
      fireEvent.change(within(sheet).getByLabelText(scenario.label), {
        target: { value: scenario.value },
      });
      fireEvent.click(
        within(sheet).getByRole('button', { name: scenario.save }),
      );
      await waitFor(() =>
        expect(within(sheet).getByRole('alert')).toHaveTextContent(
          'Изменение не сохранено',
        ),
      );
      expect(within(sheet).getByLabelText(scenario.label)).toHaveValue(
        scenario.value,
      );
      expect(props.onDetailChanged).not.toHaveBeenCalled();
    },
  );
});

it('calculates quick reminder choices from the Moscow day across a month boundary', () => {
  const now = new Date('2026-09-30T20:30:00.000Z');
  expect(getReminderPresetValue('hour', now)).toBe('2026-10-01T00:30');
  expect(getReminderPresetValue('evening', now)).toBe('2026-09-30T18:00');
  expect(getReminderPresetValue('morning', now)).toBe('2026-10-01T09:00');
  expect(getReminderPresetValue('afternoon', now)).toBe('2026-10-01T14:00');
});
