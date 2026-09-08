'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, ChevronDown, GripVertical, Mail, Phone } from 'lucide-react';

import { MobileClientActions } from '@/components/crm/mobile/mobile-client-actions';
import {
  getCrmContactSelectionRevision,
  getCrmDisplayContacts,
  resolveCrmDisplayContact,
} from '@/components/crm/crm-contact-selection';
import { getSafeMailtoHref } from '@/components/crm/mobile/mobile-crm-utils';
import { MobileSheet } from '@/components/crm/mobile/mobile-sheets';
import { MessengerLinks } from '@/components/crm/messenger-links';
import { WorkOwnersStatus } from '@/components/crm/work-owners-status';
import type { CrmReminder, CrmTab, CrmWorkspaceClient } from '@/lib/types';

const cardThemeByColor: Record<
  string,
  { accent: string; border: string; surface: string }
> = {
  blue: { accent: '#2563EB', border: '#93C5FD', surface: '#DBEAFE' },
  cyan: { accent: '#0891B2', border: '#67E8F9', surface: '#CFFAFE' },
  teal: { accent: '#0F766E', border: '#5EEAD4', surface: '#CCFBF1' },
  green: { accent: '#16A34A', border: '#86EFAC', surface: '#DCFCE7' },
  lime: { accent: '#65A30D', border: '#BEF264', surface: '#ECFCCB' },
  yellow: { accent: '#CA8A04', border: '#FDE047', surface: '#FEF9C3' },
  amber: { accent: '#D97706', border: '#FCD34D', surface: '#FEF3C7' },
  orange: { accent: '#EA580C', border: '#FDBA74', surface: '#FFEDD5' },
  red: { accent: '#DC2626', border: '#FCA5A5', surface: '#FEE2E2' },
  pink: { accent: '#DB2777', border: '#F9A8D4', surface: '#FCE7F3' },
  purple: { accent: '#7E22CE', border: '#D8B4FE', surface: '#F3E8FF' },
  gray: { accent: '#475569', border: '#CBD5E1', surface: '#F1F5F9' },
};

const reminderDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export type MobileDragControls = {
  isGrabbed: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
};

type MobileClientCardProps = {
  activeActionsClientId: number | null;
  activeTab: 'primary' | number;
  canEditWorkspace: boolean;
  client: CrmWorkspaceClient;
  color: string | null;
  dragControls?: MobileDragControls;
  nearestReminder?: CrmReminder;
  tabs: CrmTab[];
  onColor: (client: CrmWorkspaceClient, color: string | null) => void;
  onActionsOpenChange: (clientId: number | null) => void;
  onMove: (client: CrmWorkspaceClient, tabId: number) => void;
  onOpen: (client: CrmWorkspaceClient) => void;
};

export function MobileClientCard({
  activeActionsClientId,
  activeTab,
  canEditWorkspace,
  client,
  color,
  dragControls,
  nearestReminder,
  tabs,
  onColor,
  onActionsOpenChange,
  onMove,
  onOpen,
}: MobileClientCardProps) {
  const companyName = client.documentName || client.fullName || client.name;
  const colorTheme = color ? cardThemeByColor[color] : undefined;
  const [contactSelection, setContactSelection] = useState<{
    revision: string;
    key: string;
  } | null>(null);
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const contactOptions = getCrmDisplayContacts(client);
  const contactRevision = getCrmContactSelectionRevision(contactOptions);
  const selectedContactKey =
    contactSelection?.revision === contactRevision ? contactSelection.key : null;
  const selectedContact = resolveCrmDisplayContact(contactOptions, selectedContactKey);
  const selectedPhone = selectedContact?.phone ?? '';
  const selectedEmail = selectedContact?.email ?? '';
  const mailtoHref = getSafeMailtoHref(selectedEmail);

  return (
    <article
      data-mobile-crm-card-id={client.id}
      style={
        colorTheme
          ? {
              backgroundColor: colorTheme.surface,
              borderColor: colorTheme.border,
              borderLeftColor: colorTheme.accent,
            }
          : undefined
      }
      className={`rounded-[16px] border border-l-[7px] border-[var(--border-color)] bg-white p-3 shadow-[0_8px_22px_rgba(7,22,46,0.045)] ${dragControls?.isGrabbed ? 'ring-2 ring-[var(--brand-yellow)]' : ''}`}
    >
      <div className="flex items-start gap-2">
        {dragControls ? (
          <button
            type="button"
            aria-label={`Переместить ${companyName}`}
            aria-pressed={dragControls.isGrabbed}
            aria-describedby="mobile-crm-reorder-help"
            onPointerDown={dragControls.onPointerDown}
            onPointerMove={dragControls.onPointerMove}
            onPointerUp={dragControls.onPointerUp}
            onPointerCancel={dragControls.onPointerCancel}
            onKeyDown={dragControls.onKeyDown}
            className="flex size-11 shrink-0 touch-none items-center justify-center rounded-[11px] bg-[#F1F5F9] text-[var(--text-secondary)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
            title="Переместить"
          >
            <GripVertical aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(client)}
            disabled={dragControls !== undefined}
            className="w-full min-w-0 rounded-[8px] text-left outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:cursor-default"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--text-primary)] [overflow-wrap:anywhere]">
                {companyName}
              </h2>
              <StatusBadge status={client.syncStatus} />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
              {[
                client.city || 'Город не указан',
                client.inn ? `ИНН ${client.inn}` : 'ИНН не указан',
              ].join(' · ')}
            </p>
          </button>
          {activeTab === 'primary' ? (
            <div className="mt-2 min-w-0 rounded-[9px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1.5 text-[11px] font-semibold leading-4 text-[#0F766E] [overflow-wrap:anywhere]">
              <WorkOwnersStatus owners={client.workOwners} variant="mobile" />
            </div>
          ) : null}
          <div className="mt-2 min-w-0 rounded-[11px] bg-[#F7F9FC] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Контактное лицо</p>
            {contactOptions.length > 1 ? (
              <button
                type="button"
                aria-label="Выбрать контактное лицо"
                aria-haspopup="dialog"
                aria-expanded={isContactSheetOpen}
                onClick={() => setIsContactSheetOpen(true)}
                disabled={dragControls !== undefined}
                className="mt-1 flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[9px] text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:cursor-default"
              >
                <span className="min-w-0 break-words text-[13px] font-bold text-[var(--text-primary)] [overflow-wrap:anywhere]">{selectedContact?.name || 'Контактное лицо не указано'}</span>
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-[var(--text-secondary)]" />
              </button>
            ) : (
              <p className="mt-1 break-words text-[13px] font-bold text-[var(--text-primary)] [overflow-wrap:anywhere]">{selectedContact?.name || 'Контактное лицо не указано'}</p>
            )}
            {selectedContact?.position ? <p className="mt-0.5 break-words text-[12px] leading-4 text-[var(--text-secondary)] [overflow-wrap:anywhere]">{selectedContact.position}</p> : null}
            {selectedPhone ? <p className="mt-2 break-all text-[12px] text-[var(--text-primary)]">{selectedPhone}</p> : null}
            {selectedEmail ? <p className="mt-1 break-all text-[12px] text-[var(--text-primary)]">{selectedEmail}</p> : null}
            {!selectedPhone && !selectedEmail ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Телефон и почта не указаны</p> : null}
          </div>
          {nearestReminder ? (
            <button
              type="button"
              onClick={() => onOpen(client)}
              disabled={dragControls !== undefined}
              className="mt-2 w-full rounded-[9px] bg-[#FFF9E8] px-2 py-1.5 text-left text-[11px] font-semibold text-[#7A4A00] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              Напомнить: <time dateTime={nearestReminder.dueAt}>{reminderDate.format(new Date(nearestReminder.dueAt))} МСК</time>
            </button>
          ) : null}
        </div>
      </div>

      {dragControls ||
      (!selectedPhone &&
        !mailtoHref &&
        !client.telegram &&
        !client.maxLink &&
        !canEditWorkspace) ? null : (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3">
          {selectedPhone ? (
            <a
              href={`tel:${selectedPhone}`}
              aria-label="Позвонить"
              title={selectedPhone}
              onClick={(event) => event.stopPropagation()}
              style={{ color: '#FFFFFF', backgroundColor: '#16A34A' }}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] px-3 text-[12px] font-bold text-white outline-offset-2 hover:bg-[#15803D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              <Phone aria-hidden="true" className="size-4" />
              Позвонить
            </a>
          ) : null}
          {mailtoHref ? (
            <a
              href={mailtoHref}
              aria-label="Написать"
              title={selectedEmail}
              onClick={(event) => event.stopPropagation()}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              <Mail aria-hidden="true" className="size-4" />
              Написать
            </a>
          ) : null}
          <MessengerLinks telegram={client.telegram} maxLink={client.maxLink} />
          {canEditWorkspace ? (
            <MobileClientActions
              client={client}
              color={color}
              isOpen={activeActionsClientId === client.id}
              tabs={tabs}
              onColor={onColor}
              onMove={onMove}
              onOpenChange={(isOpen) =>
                onActionsOpenChange(isOpen ? client.id : null)
              }
            />
          ) : null}
        </div>
      )}
      {isContactSheetOpen ? (
        <MobileSheet
          title={`Контактные лица ${companyName}`}
          description="Выбор действует только на этой странице."
          onClose={() => setIsContactSheetOpen(false)}
        >
          <ul className="divide-y divide-[var(--border-color)]">
            {contactOptions.map((contact) => {
              const isSelected = contact.key === selectedContact?.key;
              const accessibleName = [
                contact.name,
                contact.position,
                contact.isPrimary ? 'основной контакт' : '',
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <li key={contact.key}>
                  <button
                    type="button"
                    aria-label={accessibleName}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setContactSelection({
                        revision: contactRevision,
                        key: contact.key,
                      });
                      setIsContactSheetOpen(false);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 py-3 text-left outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-[14px] font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere]">
                          {contact.name}
                        </span>
                        {contact.isPrimary ? (
                          <span className="rounded-[6px] bg-[#FFF6D5] px-2 py-1 text-[10px] font-semibold text-[#735100]">
                            Основной
                          </span>
                        ) : null}
                      </span>
                      {contact.position ? (
                        <span className="mt-1 block break-words text-[12px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                          {contact.position}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check
                        aria-hidden="true"
                        className="size-5 shrink-0 text-[#067647]"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </MobileSheet>
      ) : null}
    </article>
  );
}

function StatusBadge({ status }: { status: CrmWorkspaceClient['syncStatus'] }) {
  const labels: Record<CrmWorkspaceClient['syncStatus'], string> = {
    synced: '1С',
    local: 'Локальный',
    pending: 'Ожидает',
    blocked_capability: 'Заблокирован',
    blocked_credentials: 'Нет доступа 1С',
    conflict: 'Конфликт',
    sync_error: 'Ошибка',
    archived: 'Архив',
  };
  const tone =
    status === 'synced'
      ? 'bg-[#067647] text-white'
      : status === 'pending'
        ? 'bg-[#FBBF24] text-[#422006]'
        : status === 'conflict' ||
            status === 'sync_error' ||
            status === 'blocked_capability' ||
            status === 'blocked_credentials'
          ? 'bg-[#B42318] text-white'
          : 'bg-[#334155] text-white';
  return (
    <span
      className={`shrink-0 rounded-[7px] px-2 py-1 text-[9px] font-bold ${tone}`}
    >
      {labels[status]}
    </span>
  );
}
