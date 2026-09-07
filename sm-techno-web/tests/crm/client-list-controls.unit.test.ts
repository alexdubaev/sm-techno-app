import { describe, expect, test } from 'vitest';

import {
  filterAndSortCrmClients,
  type CrmSortMode,
  type PresenceFilter,
} from '@/components/crm/crm-client-list-controls';
import type { CrmWorkspaceClient } from '@/lib/types';

function client(
  id: number,
  values: Partial<CrmWorkspaceClient> = {},
): CrmWorkspaceClient {
  return {
    id,
    version: 1,
    name: `Клиент ${id}`,
    documentName: `Клиент ${id}`,
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
    ...values,
  };
}

function ids(clients: CrmWorkspaceClient[]) {
  return clients.map((item) => item.id);
}

describe('filterAndSortCrmClients', () => {
  test('keeps the original manual order without mutating the loaded clients', () => {
    const clients = [client(8), client(3), client(12)];

    const result = filterAndSortCrmClients(clients, { sortMode: 'manual' });

    expect(ids(result)).toEqual([8, 3, 12]);
    expect(result).not.toBe(clients);
    expect(ids(clients)).toEqual([8, 3, 12]);
  });

  test.each<[CrmSortMode, number[]]>([
    ['name_asc', [2, 1, 3]],
    ['name_desc', [3, 1, 2]],
  ])('sorts client display names in %s order', (sortMode, expected) => {
    const clients = [
      client(1, { name: 'Бета', documentName: 'Бета' }),
      client(2, { name: 'Альфа', documentName: '' }),
      client(3, { name: 'Вега', documentName: 'Вега' }),
    ];

    expect(ids(filterAndSortCrmClients(clients, { sortMode }))).toEqual(
      expected,
    );
  });

  test.each<[CrmSortMode, number[]]>([
    ['newest', [1, 9, 3, 7]],
    ['oldest', [3, 7, 9, 1]],
  ])(
    'sorts created dates in %s order and resolves equal dates by id',
    (sortMode, expected) => {
      const clients = [
        client(9, { createdAt: '2026-09-02T09:00:00.000Z' }),
        client(7, { createdAt: '2026-09-01T09:00:00.000Z' }),
        client(3, { createdAt: '2026-09-01T09:00:00.000Z' }),
        client(1, { createdAt: '2026-09-03T09:00:00.000Z' }),
      ];

      expect(ids(filterAndSortCrmClients(clients, { sortMode }))).toEqual(
        expected,
      );
    },
  );

  test.each<[CrmSortMode, number[]]>([
    ['free_first', [3, 1, 10, 7]],
    ['busy_first', [10, 7, 3, 1]],
  ])(
    'sorts free and busy clients in %s order while preserving each group order',
    (sortMode, expected) => {
      const busy = [{ userId: 7, fullName: 'Оператор' }];
      const clients = [
        client(10, { workOwners: busy }),
        client(3),
        client(7, { workOwners: busy }),
        client(1),
      ];

      expect(ids(filterAndSortCrmClients(clients, { sortMode }))).toEqual(
        expected,
      );
    },
  );

  test.each<['phoneFilter' | 'emailFilter', PresenceFilter, number[]]>([
    ['phoneFilter', 'present', [2]],
    ['phoneFilter', 'missing', [1, 3]],
    ['emailFilter', 'present', [3]],
    ['emailFilter', 'missing', [1, 2]],
  ])('filters %s by trimmed contact presence', (key, value, expected) => {
    const clients = [
      client(1, { phone: '', email: '' }),
      client(2, { phone: '  +7 495 000-00-00  ', email: '   ' }),
      client(3, { phone: '\t', email: 'team@example.test' }),
    ];

    expect(ids(filterAndSortCrmClients(clients, { [key]: value }))).toEqual(
      expected,
    );
  });

  test('combines text, sync, phone, and email filters before a busy sort', () => {
    const clients = [
      client(1, {
        documentName: 'Нужный свободный',
        phone: '+7 495 000-00-01',
        email: 'one@example.test',
        workOwners: [],
      }),
      client(2, {
        documentName: 'Нужный занятый',
        phone: '+7 495 000-00-02',
        email: 'two@example.test',
        syncStatus: 'pending',
        workOwners: [{ userId: 7, fullName: 'Оператор' }],
      }),
      client(3, {
        documentName: 'Нужный занятый',
        phone: '+7 495 000-00-03',
        email: 'three@example.test',
        workOwners: [{ userId: 7, fullName: 'Оператор' }],
      }),
      client(4, {
        documentName: 'Другой клиент',
        phone: '+7 495 000-00-04',
        email: 'four@example.test',
        workOwners: [{ userId: 7, fullName: 'Оператор' }],
      }),
      client(5, {
        documentName: 'Нужный без почты',
        phone: '+7 495 000-00-05',
        email: ' ',
        workOwners: [{ userId: 7, fullName: 'Оператор' }],
      }),
    ];

    expect(
      ids(
        filterAndSortCrmClients(clients, {
          search: 'нужный',
          syncFilter: 'synced',
          phoneFilter: 'present',
          emailFilter: 'present',
          sortMode: 'busy_first',
        }),
      ),
    ).toEqual([3, 1]);
  });

  test('keeps equal display-name ordering stable and restores it after an automatic sort', () => {
    const clients = [
      client(12, { documentName: 'Одинаково' }),
      client(4, { documentName: 'Одинаково' }),
      client(9, { documentName: 'Альфа' }),
    ];

    expect(
      ids(filterAndSortCrmClients(clients, { sortMode: 'name_asc' })),
    ).toEqual([9, 12, 4]);
    expect(
      ids(filterAndSortCrmClients(clients, { sortMode: 'manual' })),
    ).toEqual([12, 4, 9]);
    expect(ids(clients)).toEqual([12, 4, 9]);
  });

  test('does not mutate the loaded manual order while automatically sorting', () => {
    const clients = [
      client(8, { documentName: 'Вега' }),
      client(3, { documentName: 'Альфа' }),
    ];

    expect(ids(filterAndSortCrmClients(clients, { sortMode: 'name_asc' }))).toEqual([3, 8]);
    expect(ids(clients)).toEqual([8, 3]);
  });
});
