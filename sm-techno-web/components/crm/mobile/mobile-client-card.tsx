'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { GripVertical, Mail, Phone } from 'lucide-react';

import { MobileClientActions } from '@/components/crm/mobile/mobile-client-actions';
import { getSafeMailtoHref } from '@/components/crm/mobile/mobile-crm-utils';
import { MessengerLinks } from '@/components/crm/messenger-links';
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
  const mailtoHref = getSafeMailtoHref(client.email);

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
        <button
          type="button"
          onClick={() => onOpen(client)}
          disabled={dragControls !== undefined}
          className="min-w-0 flex-1 rounded-[8px] text-left outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:cursor-default"
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
          <p className="mt-2 text-[12px] font-semibold text-[var(--text-primary)]">
            {client.contactPerson || 'Контактное лицо не указано'}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)] [overflow-wrap:anywhere]">
            {[client.phone, client.email].filter(Boolean).join(' · ') ||
              'Телефон и почта не указаны'}
          </p>
          {nearestReminder ? (
            <p className="mt-2 rounded-[9px] bg-[#FFF9E8] px-2 py-1.5 text-[11px] font-semibold text-[#7A4A00]">
              Напомнить:{' '}
              <time dateTime={nearestReminder.dueAt}>
                {reminderDate.format(new Date(nearestReminder.dueAt))} МСК
              </time>
            </p>
          ) : null}
        </button>
      </div>

      {dragControls ||
      (!client.phone && !mailtoHref && !client.telegram && !client.maxLink && !canEditWorkspace) ? null : (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3">
          {client.phone ? (
            <a
              href={`tel:${client.phone}`}
              onClick={(event) => event.stopPropagation()}
              style={{ color: '#FFFFFF' }}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] bg-[var(--brand-dark)] px-3 text-[12px] font-bold text-white outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              <Phone aria-hidden="true" className="size-4" />
              Позвонить
            </a>
          ) : null}
          {mailtoHref ? (
            <a
              href={mailtoHref}
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
