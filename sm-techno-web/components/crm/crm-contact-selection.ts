import type { CrmWorkspaceClient } from '@/lib/types';

export type CrmDisplayContact = {
  key: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  isFromOneC: boolean;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function getCrmDisplayContacts(
  client: CrmWorkspaceClient,
): CrmDisplayContact[] {
  const localContacts = [...(client.contacts ?? [])]
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
    .map((contact) => ({
      key: `contact:${contact.id}`,
      name: contact.name,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      isPrimary: contact.isPrimary,
      isFromOneC: false,
    }));
  const hasLegacyContact = Boolean(
    client.contactPerson.trim() || client.phone.trim() || client.email.trim(),
  );
  const legacyIsDuplicate = localContacts.some(
    (contact) =>
      client.contactPerson.trim() &&
      normalized(contact.name) === normalized(client.contactPerson),
  );
  const legacyContact: CrmDisplayContact | null =
    hasLegacyContact && !legacyIsDuplicate
      ? {
          key: `onec:${client.id}`,
          name: client.contactPerson || 'Контакт из 1С',
          position: '',
          phone: client.phone,
          email: client.email,
          isPrimary: false,
          isFromOneC: true,
        }
      : null;
  const primaryContact = localContacts.find((contact) => contact.isPrimary);
  if (primaryContact) {
    return [
      primaryContact,
      ...localContacts.filter((contact) => contact.key !== primaryContact.key),
      ...(legacyContact ? [legacyContact] : []),
    ];
  }
  return [...(legacyContact ? [legacyContact] : []), ...localContacts];
}

export function resolveCrmDisplayContact(
  contacts: readonly CrmDisplayContact[],
  selectedKey: string | null,
) {
  return (
    contacts.find((contact) => contact.key === selectedKey) ??
    contacts[0] ??
    null
  );
}


export function getCrmContactSelectionRevision(
  contacts: readonly CrmDisplayContact[],
) {
  return contacts
    .map((contact) => `${contact.key}:${contact.isPrimary ? 'primary' : 'regular'}`)
    .join('|');
}
