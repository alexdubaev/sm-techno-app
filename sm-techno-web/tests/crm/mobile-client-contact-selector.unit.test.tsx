import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MobileClientCard } from '@/components/crm/mobile/mobile-client-card';
import type { CrmWorkspaceClient } from '@/lib/types';

function client(): CrmWorkspaceClient {
  return {
    id: 17,
    version: 1,
    name: 'ООО Ромашка',
    documentName: 'ООО Ромашка',
    fullName: '',
    inn: '7700000000',
    kpp: '',
    city: 'Москва',
    website: '',
    contactPerson: 'Контакт из 1С',
    email: 'onec@example.test',
    phone: '+70000000000',
    notes: '',
    linkedCounterpartyId: 901,
    syncStatus: 'synced',
    syncError: '',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    assignment: null,
    workOwners: [],
    contacts: [
      {
        id: 31,
        name: 'Анна Петрова',
        position: 'Менеджер по закупкам',
        phone: '+71111111111',
        email: 'anna@example.test',
        isPrimary: false,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 32,
        name: 'Ирина Соколова',
        position: 'Коммерческий директор',
        phone: '+72222222222',
        email: 'irina@example.test',
        isPrimary: true,
        createdAt: '',
        updatedAt: '',
      },
    ],
  };
}

describe('MobileClientCard contact selector', () => {
  test('shows the primary contact and temporarily switches call and mail actions from a bottom sheet', async () => {
    const user = userEvent.setup();
    render(
      <MobileClientCard
        activeActionsClientId={null}
        activeTab="primary"
        canEditWorkspace
        client={client()}
        color={null}
        tabs={[]}
        onColor={vi.fn()}
        onActionsOpenChange={vi.fn()}
        onMove={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Ирина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Коммерческий директор')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Позвонить' })).toHaveAttribute(
      'href',
      'tel:+72222222222',
    );
    expect(screen.getByRole('link', { name: 'Написать' })).toHaveAttribute(
      'href',
      'mailto:irina@example.test',
    );

    await user.click(screen.getByRole('button', { name: 'Выбрать контактное лицо' }));
    const sheet = screen.getByRole('dialog', { name: 'Контактные лица ООО Ромашка' });
    expect(sheet).toHaveTextContent('Анна Петрова');
    expect(sheet).toHaveTextContent('Менеджер по закупкам');
    expect(sheet).toHaveTextContent('Ирина Соколова');
    expect(sheet).toHaveTextContent('Основной');

    await user.click(screen.getByRole('button', { name: 'Анна Петрова, Менеджер по закупкам' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Позвонить' })).toHaveAttribute(
      'href',
      'tel:+71111111111',
    );
    expect(screen.getByRole('link', { name: 'Написать' })).toHaveAttribute(
      'href',
      'mailto:anna@example.test',
    );
  });

  test('returns to the new primary contact when the contact collection changes', async () => {
    const user = userEvent.setup();
    const initialClient = client();
    const props = {
      activeActionsClientId: null,
      activeTab: 'primary' as const,
      canEditWorkspace: true,
      color: null,
      tabs: [],
      onColor: vi.fn(),
      onActionsOpenChange: vi.fn(),
      onMove: vi.fn(),
      onOpen: vi.fn(),
    };
    const view = render(<MobileClientCard {...props} client={initialClient} />);

    await user.click(screen.getByRole('button', { name: 'Выбрать контактное лицо' }));
    await user.click(
      screen.getByRole('button', {
        name: 'Анна Петрова, Менеджер по закупкам',
      }),
    );
    expect(screen.getByText('Анна Петрова')).toBeInTheDocument();

    const refreshedClient = client();
    refreshedClient.contacts = [
      ...(refreshedClient.contacts ?? []).map((contact) => ({
        ...contact,
        isPrimary: false,
      })),
      {
        id: 33,
        name: 'Мария Орлова',
        position: 'Директор',
        phone: '+73333333333',
        email: 'maria@example.test',
        isPrimary: true,
        createdAt: '',
        updatedAt: '',
      },
    ];
    view.rerender(<MobileClientCard {...props} client={refreshedClient} />);

    expect(screen.getByText('Мария Орлова')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Позвонить' })).toHaveAttribute(
      'href',
      'tel:+73333333333',
    );
  });
});
