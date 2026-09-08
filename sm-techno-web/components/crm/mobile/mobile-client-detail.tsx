'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BellPlus,
  Mail,
  MessageSquarePlus,
  MoreHorizontal,
  Phone,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useCrmClientDetailController,
  type CrmClientDetailControllerOptions,
  type DetailController,
} from '@/components/crm/use-crm-client-detail';
import { MobileClientOverview } from '@/components/crm/mobile/mobile-client-overview';
import { MobileClientNote } from '@/components/crm/mobile/mobile-client-note';
import {
  MobileClientHistory,
  MobileEventSheet,
} from '@/components/crm/mobile/mobile-client-history';
import {
  MobileClientReminders,
  MobileReminderSheet,
} from '@/components/crm/mobile/mobile-client-reminders';
import {
  MobileContactSheet,
  MobileRequisitesSheet,
  mobileButton,
} from '@/components/crm/mobile/mobile-sheets';
import { getSafeMailtoHref } from '@/components/crm/mobile/mobile-crm-utils';
import { MessengerLinks } from '@/components/crm/messenger-links';
import type { MobileDetailSection } from '@/components/crm/mobile/types';
import type {
  CrmPrimaryArchiveClient,
  CrmReminder,
  CrmWorkspaceClient,
} from '@/lib/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type MobileClientDetailProps = Omit<
  CrmClientDetailControllerOptions,
  'onChanged'
> & {
  initialSection?: MobileDetailSection;
  onClose: () => void;
  onDetailChanged: CrmClientDetailControllerOptions['onChanged'];
  renderMore?: (controller: DetailController) => ReactNode;
};
type ActiveSheet =
  | { kind: 'contact' | 'event' | 'requisites' }
  | { kind: 'reminder'; reminder?: CrmReminder }
  | null;
const sections: [MobileDetailSection, string][] = [
  ['note', 'О клиенте'],
  ['overview', 'Обзор'],
  ['history', 'История'],
  ['reminders', 'Напоминания'],
  ['more', 'Ещё'],
];
const statusLabels: Record<CrmWorkspaceClient['syncStatus'], string> = {
  local: 'Локальный',
  synced: 'Связан с 1С',
  sync_error: 'Ошибка синхронизации',
  pending: 'Ожидает синхронизации',
  blocked_capability: 'Синхронизация заблокирована',
  blocked_credentials: 'Нужны данные 1С',
  conflict: 'Конфликт',
  archived: 'В архиве',
};

export function MobileClientDetail(props: MobileClientDetailProps) {
  const isMobile = useIsMobile();
  // A client refresh must retain the selected section and any open sheet.
  return isMobile ? (
    <MobileClientDetailContent
      key={`${props.ownerId}:${props.client.id}`}
      {...props}
    />
  ) : null;
}

export function MobilePrimaryArchiveDetail({
  client,
  ownerId,
  ownerName,
  isAdmin,
  onClose,
  onPrimaryArchiveChanged,
}: {
  client: CrmPrimaryArchiveClient;
  ownerId: number;
  ownerName: string;
  isAdmin: boolean;
  onClose: () => void;
  onPrimaryArchiveChanged: () => void | Promise<void>;
}) {
  const isMobile = useIsMobile();
  const controller = useCrmClientDetailController({
    client,
    ownerId,
    activeTab: 'primary',
    ownerName,
    isAdmin,
    canEditWorkspace: false,
    canManageReminders: false,
    canResolveSyncConflicts: false,
    primaryArchiveMode: true,
    onChanged: ignoreDetailChange,
    onPrimaryArchiveChanged,
  });
  if (!isMobile) return null;

  const title = client.documentName || client.fullName || client.name;
  const busy = controller.isSaving !== null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-mobile-primary-archive-detail=""
        className="data-[side=bottom]:h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden border-0 bg-[#F7F9FC] pt-[env(safe-area-inset-top)] text-[var(--text-primary)]"
      >
        <header className="shrink-0 border-b border-[var(--border-color)] bg-white px-3 pb-3">
          <div className="flex items-start gap-2 py-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Назад к архиву"
              className={`${mobileButton} flex size-11 shrink-0 items-center justify-center px-0`}
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
            </button>
            <SheetTitle
              title={title}
              className="line-clamp-2 min-w-0 flex-1 break-words py-2 text-base font-bold leading-6 text-[var(--text-primary)] [overflow-wrap:anywhere]"
            >
              {title}
            </SheetTitle>
          </div>
          <SheetDescription className="break-words text-xs text-[var(--text-secondary)]">
            {client.city || 'Город не указан'} · ИНН {client.inn || 'не указан'}
          </SheetDescription>
          <p className="mt-2 inline-flex rounded-md bg-[#EEF2F7] px-2 py-1 text-xs font-semibold text-[#334155]">
            Архивная карточка · Только просмотр
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {controller.error ? (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
            >
              {controller.error}
            </p>
          ) : null}
          <section className="rounded-2xl border border-[var(--border-color)] bg-white p-4">
            <h2 className="text-base font-bold">Данные клиента</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <ArchiveDetailRow
                label="Полное наименование"
                value={client.fullName || 'Не указано'}
              />
              <ArchiveDetailRow
                label="ИНН / КПП"
                value={
                  [client.inn, client.kpp].filter(Boolean).join(' / ') ||
                  'Не указано'
                }
              />
              <ArchiveDetailRow
                label="Город"
                value={client.city || 'Не указано'}
              />
              <ArchiveDetailRow
                label="Телефон / почта"
                value={
                  [client.phone, client.email].filter(Boolean).join(' / ') ||
                  'Не указано'
                }
              />
            </dl>
          </section>

          <section className="mt-3 rounded-2xl border border-[var(--border-color)] bg-white p-4">
            <h2 className="text-base font-bold">Архив</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <ArchiveDetailRow
                label="В архиве с"
                value={formatArchiveDetailDate(client.archivedAt)}
              />
              <ArchiveDetailRow
                label="Архивировал"
                value={client.archivedByFullName || 'Неизвестно'}
              />
              <ArchiveDetailRow
                label="Причина"
                value={client.archiveReason || 'Без причины'}
              />
            </dl>
            {controller.canRestorePrimaryClient ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    controller.setIsPrimaryRestoreConfirmationOpen(true)
                  }
                  className={`${mobileButton} mt-4 w-full border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
                >
                  {controller.isSaving === 'restore'
                    ? 'Восстанавливаем…'
                    : 'Восстановить'}
                </button>
                {controller.isPrimaryRestoreConfirmationOpen ? (
                  <div
                    role="alertdialog"
                    aria-label="Подтверждение восстановления"
                    className="mt-3 rounded-xl border border-[#F0D98A] bg-[#FFF9E8] p-3"
                  >
                    <p className="text-sm">
                      Восстановить клиента в активной CRM для всех
                      пользователей?
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          controller.setIsPrimaryRestoreConfirmationOpen(false)
                        }
                        className={mobileButton}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void controller.restorePrimaryClient()}
                        className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
                      >
                        {controller.isSaving === 'restore'
                          ? 'Восстанавливаем…'
                          : 'Подтвердить восстановление'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ArchiveDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 break-words [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function formatArchiveDetailDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function ignoreDetailChange() {}

function MobileClientDetailContent({
  initialSection = 'note',
  onClose,
  onDetailChanged,
  renderMore,
  ...options
}: MobileClientDetailProps) {
  const controller = useCrmClientDetailController({
    ...options,
    onChanged: onDetailChanged,
  });
  const {
    currentClient: client,
    canEditWorkspace,
    canManageReminders,
    isLoading,
    isSaving,
    error,
    notice,
  } = controller;
  const [section, setSection] = useState<MobileDetailSection>(initialSection);
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const callResultAfterReturn = useRef(false);
  const closeSheet = () => setSheet(null);
  const primaryContact = controller.contacts.find(
    (contact) => contact.isPrimary,
  );
  const phone = primaryContact?.phone || client.phone;
  const email = primaryContact?.email || client.email;
  const mailtoHref = getSafeMailtoHref(email);
  const busy = isLoading || isSaving !== null;
  const openEvent = () => {
    callResultAfterReturn.current = false;
    setSheet({ kind: 'event' });
  };
  const openReminder = () => setSheet({ kind: 'reminder' });
  const title = client.documentName || client.fullName || client.name;

  useEffect(() => {
    const openResultAfterCall = () => {
      if (callResultAfterReturn.current && document.visibilityState === 'visible') {
        callResultAfterReturn.current = false;
        setSheet({ kind: 'event' });
      }
    };
    document.addEventListener('visibilitychange', openResultAfterCall);
    return () => document.removeEventListener('visibilitychange', openResultAfterCall);
  }, []);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-mobile-crm-detail=""
        data-initial-section={initialSection}
        className="data-[side=bottom]:h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden border-0 bg-[#F7F9FC] pt-[env(safe-area-inset-top)] text-[var(--text-primary)]"
      >
        <header className="shrink-0 border-b border-[var(--border-color)] bg-white px-3 pb-3">
          <div className="flex items-start gap-2 py-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Назад к списку клиентов"
              className={`${mobileButton} flex size-11 shrink-0 items-center justify-center px-0`}
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
            </button>
            <SheetTitle
              title={title}
              className="line-clamp-2 min-w-0 flex-1 break-words py-2 text-base font-bold leading-6 text-[var(--text-primary)] [overflow-wrap:anywhere]"
            >
              {title}
            </SheetTitle>
            <button
              type="button"
              onClick={() => setSection('more')}
              aria-label="Ещё действия с клиентом"
              className={`${mobileButton} flex size-11 shrink-0 items-center justify-center px-0`}
            >
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </button>
          </div>
          <SheetDescription className="break-words text-xs text-[var(--text-secondary)]">
            {client.city || 'Город не указан'} · ИНН {client.inn || 'не указан'}
          </SheetDescription>
          <p className="mt-2 inline-block rounded-md bg-[#EEF2F7] px-2 py-1 text-xs font-medium text-[#334155]">
            {statusLabels[client.syncStatus]}
          </p>
          {!canEditWorkspace ? (
            <p className="mt-2 break-words text-xs text-[var(--text-secondary)]">
              Рабочее пространство: {options.ownerName} · Только просмотр
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {phone ? (
              <a
                href={`tel:${phone}`}
                onClick={() => { callResultAfterReturn.current = true; }}
                className={`${mobileButton} flex items-center justify-center gap-2`}
              >
                <Phone aria-hidden="true" className="size-4 shrink-0" />
                Позвонить
              </a>
            ) : null}
            {mailtoHref ? (
              <a
                href={mailtoHref}
                className={`${mobileButton} flex items-center justify-center gap-2`}
              >
                <Mail aria-hidden="true" className="size-4 shrink-0" />
                Написать
              </a>
            ) : null}
            <MessengerLinks
              telegram={client.telegram}
              maxLink={client.maxLink}
              className="col-span-2 justify-center"
            />
            {canEditWorkspace ? (
              <button
                type="button"
                onClick={openEvent}
                disabled={busy}
                className={`${mobileButton} flex items-center justify-center gap-2`}
              >
                <MessageSquarePlus
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                Результат звонка
              </button>
            ) : null}
            {canEditWorkspace && canManageReminders ? (
              <button
                type="button"
                onClick={openReminder}
                disabled={busy}
                className={cn(
                  mobileButton,
                  'flex items-center justify-center gap-2 bg-[var(--brand-yellow)]',
                )}
              >
                <BellPlus aria-hidden="true" className="size-4 shrink-0" />
                Напомнить
              </button>
            ) : null}
          </div>
        </header>
        <div
          role="tablist"
          aria-label="Разделы карточки клиента"
          className="flex shrink-0 overflow-x-auto border-b border-[var(--border-color)] bg-white px-2"
        >
          {sections.map(([key, label], index) => (
            <button
              type="button"
              key={key}
              role="tab"
              id={`mobile-detail-tab-${key}`}
              aria-controls={`mobile-detail-panel-${key}`}
              aria-selected={section === key}
              tabIndex={section === key ? 0 : -1}
              onClick={() => setSection(key)}
              onKeyDown={(event) => {
                const nextIndex =
                  event.key === 'ArrowRight'
                    ? (index + 1) % sections.length
                    : event.key === 'ArrowLeft'
                      ? (index + sections.length - 1) % sections.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? sections.length - 1
                          : null;
                if (nextIndex === null) return;
                event.preventDefault();
                setSection(sections[nextIndex][0]);
                (
                  event.currentTarget.parentElement?.children[nextIndex] as
                    | HTMLButtonElement
                    | undefined
                )?.focus();
              }}
              className={`min-h-12 shrink-0 border-b-[3px] px-3 text-sm font-semibold outline-offset-[-4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)] ${section === key ? 'border-[var(--brand-yellow)] text-[var(--brand-dark)]' : 'border-transparent text-[var(--text-secondary)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {error && !sheet ? (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <output className="mb-3 block rounded-xl bg-green-50 p-3 text-sm text-green-800">
              {notice}
            </output>
          ) : null}
          {isLoading ? (
            <output className="mb-3 block text-sm text-[var(--text-secondary)]">
              Загрузка карточки…
            </output>
          ) : null}
          <div
            role="tabpanel"
            id={`mobile-detail-panel-${section}`}
            aria-labelledby={`mobile-detail-tab-${section}`}
            tabIndex={0}
          >
            {section === 'note' ? <MobileClientNote controller={controller} /> : null}
            {section === 'overview' ? (
              <MobileClientOverview
                controller={controller}
                onEdit={() => setSheet({ kind: 'requisites' })}
                onAddContact={() => {
                  controller.setContactEditor(null);
                  controller.setContactForm({
                    name: '',
                    position: '',
                    phone: '',
                    email: '',
                    isPrimary: false,
                  });
                  setSheet({ kind: 'contact' });
                }}
                onEditContact={(contact) => {
                  controller.editContact(contact);
                  setSheet({ kind: 'contact' });
                }}
              />
            ) : null}
            {section === 'history' ? (
              <MobileClientHistory
                controller={controller}
                onAddEvent={openEvent}
              />
            ) : null}
            {section === 'reminders' ? (
              <MobileClientReminders
                controller={controller}
                onCreate={openReminder}
                onReschedule={(reminder) =>
                  setSheet({ kind: 'reminder', reminder })
                }
              />
            ) : null}
            {section === 'more'
              ? (renderMore?.(controller) ?? (
                  <p className="rounded-2xl bg-white p-4 text-sm text-[var(--text-secondary)]">
                    Дополнительные действия с клиентом.
                  </p>
                ))
              : null}
          </div>
        </div>
        {sheet?.kind === 'contact' ? (
          <MobileContactSheet controller={controller} onClose={closeSheet} />
        ) : null}
        {sheet?.kind === 'requisites' ? (
          <MobileRequisitesSheet controller={controller} onClose={closeSheet} />
        ) : null}
        {sheet?.kind === 'event' ? (
          <MobileEventSheet controller={controller} onClose={closeSheet} />
        ) : null}
        {sheet?.kind === 'reminder' ? (
          <MobileReminderSheet
            controller={controller}
            reminder={sheet.reminder}
            onClose={closeSheet}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
