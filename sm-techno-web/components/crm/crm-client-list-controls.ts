import type { CrmWorkspaceClient } from '@/lib/types';

export type CrmSortMode =
  | 'manual'
  | 'name_asc'
  | 'name_desc'
  | 'newest'
  | 'oldest'
  | 'free_first'
  | 'busy_first';

export type PresenceFilter = 'all' | 'present' | 'missing';

export type CrmClientListOptions = {
  search?: string;
  syncFilter?: CrmWorkspaceClient['syncStatus'] | 'all';
  phoneFilter?: PresenceFilter;
  emailFilter?: PresenceFilter;
  sortMode?: CrmSortMode;
};

function hasValue(value: string) {
  return value.trim().length > 0;
}

function matchesPresenceFilter(value: string, filter: PresenceFilter) {
  if (filter === 'all') return true;
  return filter === 'present' ? hasValue(value) : !hasValue(value);
}

function contactValues(client: CrmWorkspaceClient, key: 'phone' | 'email') {
  return [client[key], ...(client.contacts ?? []).map((contact) => contact[key])]
    .filter(hasValue)
    .join(' ');
}

function displayName(client: CrmWorkspaceClient) {
  return client.documentName || client.name;
}

function createdAtValue(client: CrmWorkspaceClient) {
  const value = Date.parse(client.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export function filterAndSortCrmClients(
  clients: readonly CrmWorkspaceClient[],
  {
    search = '',
    syncFilter = 'all',
    phoneFilter = 'all',
    emailFilter = 'all',
    sortMode = 'manual',
  }: CrmClientListOptions = {},
): CrmWorkspaceClient[] {
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  const filtered = clients.filter((client) => {
    if (syncFilter !== 'all' && client.syncStatus !== syncFilter) return false;
    if (!matchesPresenceFilter(contactValues(client, 'phone'), phoneFilter)) return false;
    if (!matchesPresenceFilter(contactValues(client, 'email'), emailFilter)) return false;
    if (!needle) return true;
    return [
      client.name,
      client.documentName,
      client.fullName,
      client.contactPerson,
      client.inn,
      client.email,
      client.phone,
      ...(client.contacts ?? []).flatMap((contact) => [
        contact.name,
        contact.position,
        contact.email,
        contact.phone,
      ]),
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(needle);
  });

  if (sortMode === 'manual') return filtered;

  return filtered
    .map((client, index) => ({ client, index }))
    .sort((left, right) => {
      if (sortMode === 'name_asc' || sortMode === 'name_desc') {
        const comparison = displayName(left.client).localeCompare(
          displayName(right.client),
          'ru',
        );
        return comparison === 0
          ? left.index - right.index
          : sortMode === 'name_asc'
            ? comparison
            : -comparison;
      }

      if (sortMode === 'newest' || sortMode === 'oldest') {
        const comparison =
          createdAtValue(left.client) - createdAtValue(right.client);
        if (comparison !== 0)
          return sortMode === 'newest' ? -comparison : comparison;
        return left.client.id - right.client.id || left.index - right.index;
      }

      const leftIsBusy = left.client.workOwners.length > 0;
      const rightIsBusy = right.client.workOwners.length > 0;
      if (leftIsBusy === rightIsBusy) return left.index - right.index;
      if (sortMode === 'free_first') return leftIsBusy ? 1 : -1;
      return leftIsBusy ? -1 : 1;
    })
    .map(({ client }) => client);
}
