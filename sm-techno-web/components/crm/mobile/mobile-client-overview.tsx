'use client';

import type { DetailController } from '@/components/crm/use-crm-client-detail';
import type { CrmContact } from '@/lib/types';
import { getSafeMailtoHref } from '@/components/crm/mobile/mobile-crm-utils';
import {
  mobileButton,
  mobilePanel,
} from '@/components/crm/mobile/mobile-sheets';

export function MobileClientOverview({
  controller,
  onEdit,
  onAddContact,
  onEditContact,
}: {
  controller: DetailController;
  onEdit: () => void;
  onAddContact: () => void;
  onEditContact: (contact: CrmContact) => void;
}) {
  const {
    currentClient: client,
    contacts,
    canEditWorkspace,
    isLoading,
    isSaving,
    contactPendingDelete,
    setContactPendingDelete,
    deleteContact,
  } = controller;
  const requisites = [
    [
      'Наименование для документов',
      client.documentName || client.fullName || client.name,
    ],
    ['Полное наименование', client.fullName],
    ['ИНН', client.inn],
    ['КПП', client.kpp],
    ['Город', client.city],
  ];
  return (
    <div className="grid gap-4">
      <section
        className={mobilePanel}
        aria-labelledby="mobile-requisites-heading"
      >
        <h2 id="mobile-requisites-heading" className="text-base font-bold">
          Реквизиты компании
        </h2>
        <dl className="mt-4 grid gap-4">
          {requisites.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
              <dd className="mt-1 break-words text-sm [overflow-wrap:anywhere]">
                {value || 'Не указано'}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <MobileContactLinks phone={client.phone} email={client.email} />
        </div>
        {canEditWorkspace ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={isLoading || isSaving !== null}
            className={`${mobileButton} mt-4 w-full`}
          >
            Изменить реквизиты
          </button>
        ) : null}
      </section>
      <section
        className={mobilePanel}
        aria-labelledby="mobile-contacts-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mobile-contacts-heading" className="text-base font-bold">
            Контакты
          </h2>
          {canEditWorkspace ? (
            <button
              type="button"
              onClick={onAddContact}
              disabled={isLoading || isSaving !== null}
              className={mobileButton}
            >
              + Контакт
            </button>
          ) : null}
        </div>
        {contacts.length > 0 ? (
          <ul className="mt-3 divide-y divide-[var(--border-color)]">
            {contacts.map((contact) => (
              <li key={contact.id} className="py-3">
                <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                  {contact.name}
                </p>
                {contact.position ? (
                  <p className="mt-1 break-words text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                    {contact.position}
                  </p>
                ) : null}
                {contact.isPrimary ? (
                  <span className="mt-1 inline-block rounded-md bg-[#FFF6D5] px-2 py-1 text-xs text-[#735100]">
                    Основной контакт
                  </span>
                ) : null}
                <MobileContactLinks
                  phone={contact.phone}
                  email={contact.email}
                />
                {canEditWorkspace ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onEditContact(contact)}
                      disabled={isLoading || isSaving !== null}
                      className={mobileButton}
                    >
                      Редактировать контакт
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactPendingDelete(contact)}
                      disabled={isLoading || isSaving !== null}
                      className={`${mobileButton} border-[#F9D4D4] bg-[#FEF2F2] text-[#B91C1C]`}
                    >
                      Удалить контакт
                    </button>
                  </div>
                ) : null}
                {contactPendingDelete?.id === contact.id ? (
                  <div
                    role="alertdialog"
                    aria-label="Подтверждение удаления контакта"
                    className="mt-3 rounded-xl border border-[#F9D4D4] bg-[#FEF2F2] p-3"
                  >
                    <p className="text-sm">
                      Удалить «{contact.name}» только из CRM? В 1С этот контакт
                      не изменится.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setContactPendingDelete(null)}
                        disabled={isSaving !== null}
                        className={mobileButton}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteContact()}
                        disabled={isSaving !== null}
                        className={`${mobileButton} border-transparent bg-[#B91C1C] text-white`}
                      >
                        {isSaving === 'contact-delete' ? 'Удаляем…' : 'Удалить'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {client.contactPerson
              ? `Контактное лицо: ${client.contactPerson}`
              : 'Контактов пока нет.'}
          </p>
        )}
      </section>
      {client.notes ? (
        <section className={mobilePanel}>
          <h2 className="text-base font-bold">Комментарий</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
            {client.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function MobileContactLinks({
  phone,
  email,
}: {
  phone: string;
  email: string;
}) {
  const mailtoHref = getSafeMailtoHref(email);
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label={`Позвонить: ${phone}`}
          className="flex min-h-11 items-center break-all text-[#174EA6] underline underline-offset-4"
        >
          {phone}
        </a>
      ) : null}
      {mailtoHref ? (
        <a
          href={mailtoHref}
          aria-label={`Написать: ${email}`}
          className="flex min-h-11 items-center break-all text-[#174EA6] underline underline-offset-4"
        >
          {email}
        </a>
      ) : email ? (
        <span className="break-all py-2">{email}</span>
      ) : null}
    </div>
  );
}
