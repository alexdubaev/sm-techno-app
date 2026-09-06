'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Search, X } from 'lucide-react';

import {
  MobileClientCard,
  type MobileDragControls,
} from '@/components/crm/mobile/mobile-client-card';
import {
  MobileCrmHeader,
  type MobilePrimaryOrderMode,
  type MobileSyncFilter,
} from '@/components/crm/mobile/mobile-crm-header';
import { MobileCrmTabs } from '@/components/crm/mobile/mobile-crm-tabs';
import type { ImportantReminder } from '@/components/crm/mobile/mobile-crm-utils';
import { MobileReminderSummary } from '@/components/crm/mobile/mobile-reminder-summary';
import type { MobileDetailSection } from '@/components/crm/mobile/types';
import type {
  AppUser,
  CrmReminder,
  CrmTab,
  CrmWorkspaceClient,
} from '@/lib/types';

type ActiveTab = 'primary' | number;

export type MobileCrmWorkspaceProps = {
  activeTab: ActiveTab;
  canEditWorkspace: boolean;
  clients: CrmWorkspaceClient[];
  initialDetailSection: MobileDetailSection;
  importantReminders: ImportantReminder[];
  isAdmin: boolean;
  isExporting: boolean;
  isLoading: boolean;
  isLoadingReminders: boolean;
  isRefreshing: boolean;
  manualOrderAvailable: boolean;
  nearestReminderByClient: ReadonlyMap<number, CrmReminder>;
  notice: string | null;
  ownerId: number;
  ownerName: string;
  owners: AppUser[];
  primaryOrderMode: MobilePrimaryOrderMode;
  reminderError: string | null;
  search: string;
  selectedClient: CrmWorkspaceClient | null;
  syncFilter: MobileSyncFilter;
  tabs: CrmTab[];
  totalClientCount: number;
  workspaceError: string | null;
  onAddClient: () => void;
  onCloseClient: () => void;
  onColorClient: (client: CrmWorkspaceClient, color: string | null) => void;
  onCreateTab: () => void;
  onDeleteTab: (tab: CrmTab) => void;
  onDetailChanged: (ownerId: number, activeTab: ActiveTab) => void;
  onExport: (scope: 'all' | 'tab') => void;
  onMoveClient: (client: CrmWorkspaceClient, tabId: number) => void;
  onOpenClient: (
    client: CrmWorkspaceClient,
    initialSection?: MobileDetailSection,
  ) => void;
  onOpenReminder: (reminder: CrmReminder) => void;
  onOwnerChange: (ownerId: number) => void;
  onPrimaryOrderModeChange: (mode: MobilePrimaryOrderMode) => void;
  onRefresh: () => void;
  onRenameTab: (tab: CrmTab) => void;
  onReorder: (clientId: number, insertionIndex: number) => void;
  onSearchChange: (value: string) => void;
  onSyncFilterChange: (filter: MobileSyncFilter) => void;
  onTabChange: (tab: ActiveTab) => void;
};

type DragState = { clientId: number; insertionIndex: number };

export function MobileCrmWorkspace({
  activeTab,
  canEditWorkspace,
  clients,
  initialDetailSection,
  importantReminders,
  isAdmin,
  isExporting,
  isLoading,
  isLoadingReminders,
  isRefreshing,
  manualOrderAvailable,
  nearestReminderByClient,
  notice,
  ownerId,
  ownerName,
  owners,
  primaryOrderMode,
  reminderError,
  search,
  selectedClient,
  syncFilter,
  tabs,
  totalClientCount,
  workspaceError,
  onAddClient,
  onCloseClient,
  onColorClient,
  onCreateTab,
  onDeleteTab,
  onExport,
  onMoveClient,
  onOpenClient,
  onOpenReminder,
  onOwnerChange,
  onPrimaryOrderModeChange,
  onRefresh,
  onRenameTab,
  onReorder,
  onSearchChange,
  onSyncFilterChange,
  onTabChange,
}: MobileCrmWorkspaceProps) {
  const [requestedReorderMode, setRequestedReorderMode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const reorderMode = requestedReorderMode && manualOrderAvailable;
  const hasFilters = search.trim().length > 0 || syncFilter !== 'all';
  const reorderUnavailableReason = manualOrderAvailable
    ? null
    : activeTab === 'primary' && primaryOrderMode !== 'manual'
      ? 'Выберите порядок «Мой порядок» и сбросьте поиск и фильтры.'
      : 'Сбросьте поиск и фильтры, чтобы изменить порядок.';
  const reorderActionLabel = reorderMode ? 'Готово' : 'Изменить порядок';

  const toggleReorder = () => {
    if (!reorderMode && !manualOrderAvailable) return;
    setDrag(null);
    setRequestedReorderMode((current) => !current);
  };

  const startDrag = (clientId: number) => {
    setDrag({
      clientId,
      insertionIndex: clients.findIndex((client) => client.id === clientId),
    });
  };

  const cancelDrag = () => setDrag(null);

  const finishDrag = () => {
    if (!drag) return;
    const completed = drag;
    setDrag(null);
    if (
      completed.insertionIndex !==
      clients.findIndex((client) => client.id === completed.clientId)
    ) {
      onReorder(completed.clientId, completed.insertionIndex);
    }
  };

  const updatePointerTarget = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const card = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-mobile-crm-card-id]');
    const clientId = Number(card?.dataset.mobileCrmCardId);
    const targetIndex = clients.findIndex((client) => client.id === clientId);
    if (!card || targetIndex < 0) return;
    const insertionIndex =
      targetIndex +
      (event.clientY >
      card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2
        ? 1
        : 0);
    setDrag((current) =>
      current && current.insertionIndex !== insertionIndex
        ? { ...current, insertionIndex }
        : current,
    );
  };

  const moveByKeyboard = (
    clientId: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === 'Escape' && drag?.clientId === clientId) {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (drag?.clientId === clientId) finishDrag();
      else startDrag(clientId);
      return;
    }
    if (
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
      drag?.clientId !== clientId
    )
      return;
    event.preventDefault();
    const currentOrder = moveClientInList(
      clients,
      clientId,
      drag.insertionIndex,
    );
    const currentIndex = currentOrder.findIndex(
      (client) => client.id === clientId,
    );
    const nextIndex = Math.max(
      0,
      Math.min(
        currentOrder.length - 1,
        currentIndex + (event.key === 'ArrowUp' ? -1 : 1),
      ),
    );
    setDrag((current) =>
      current
        ? {
            ...current,
            insertionIndex: insertionIndexForPosition(
              clients,
              clientId,
              nextIndex,
            ),
          }
        : current,
    );
  };

  const dragControlsFor = (
    client: CrmWorkspaceClient,
  ): MobileDragControls | undefined =>
    reorderMode
      ? {
          isGrabbed: drag?.clientId === client.id,
          onPointerDown: (event) => {
            if (
              !event.isPrimary ||
              (event.pointerType === 'mouse' && event.button !== 0)
            )
              return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            startDrag(client.id);
          },
          onPointerMove: updatePointerTarget,
          onPointerUp: finishDrag,
          onPointerCancel: cancelDrag,
          onKeyDown: (event) => moveByKeyboard(client.id, event),
        }
      : undefined;

  const clearFilters = () => {
    onSearchChange('');
    onSyncFilterChange('all');
  };

  return (
    <div
      data-mobile-crm-workspace=""
      data-active-tab={activeTab}
      data-client-count={clients.length}
      data-reminder-count={importantReminders.length}
      data-search={search}
      data-tab-count={tabs.length}
      aria-busy={isLoading || isLoadingReminders}
      className="min-h-dvh bg-[#F7F9FC] px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--text-primary)]"
    >
      {selectedClient ? (
        <section
          data-mobile-crm-detail=""
          data-initial-section={initialDetailSection}
          aria-label="Карточка клиента"
        >
          <button type="button" onClick={onCloseClient} className="sr-only">
            Назад к списку клиентов
          </button>
          <h2 className="sr-only">
            {selectedClient.documentName ||
              selectedClient.fullName ||
              selectedClient.name}
          </h2>
        </section>
      ) : (
        <div data-mobile-crm-list="">
          <MobileCrmHeader
            activeTab={activeTab}
            canEditWorkspace={canEditWorkspace}
            isAdmin={isAdmin}
            isExporting={isExporting}
            isRefreshing={isRefreshing}
            ownerId={ownerId}
            ownerName={ownerName}
            owners={owners}
            primaryOrderMode={primaryOrderMode}
            reorderActionLabel={reorderActionLabel}
            reorderMode={reorderMode}
            reorderUnavailableReason={reorderUnavailableReason}
            syncFilter={syncFilter}
            tabs={tabs}
            onAddClient={onAddClient}
            onCreateTab={onCreateTab}
            onDeleteTab={onDeleteTab}
            onExport={onExport}
            onOwnerChange={onOwnerChange}
            onPrimaryOrderModeChange={onPrimaryOrderModeChange}
            onRefresh={onRefresh}
            onRenameTab={onRenameTab}
            onSyncFilterChange={onSyncFilterChange}
            onToggleReorder={toggleReorder}
          />

          <MobileCrmTabs
            activeTab={activeTab}
            disabled={reorderMode}
            tabs={tabs}
            onTabChange={onTabChange}
          />

          {isRefreshing ? (
            <output className="mb-3 block rounded-[11px] border border-[#B9D8FF] bg-[#EFF6FF] px-3 py-2 text-[11px] font-semibold text-[#174EA6]">
              Обновляем из 1С… Сохранённые карточки остаются доступны.
            </output>
          ) : null}
          {workspaceError ? (
            <div
              role="alert"
              className="mb-3 rounded-[13px] border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-[#B42318]"
            >
              <p className="text-[12px] font-bold">Не удалось обновить CRM</p>
              <p className="mt-1 text-[11px] leading-4">
                {workspaceError}{' '}
                {totalClientCount > 0 ? 'Показаны сохранённые данные.' : ''}
              </p>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="mt-2 min-h-11 rounded-[10px] bg-white px-3 text-[11px] font-bold text-[#8A1C13] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B42318] disabled:opacity-50"
              >
                Повторить
              </button>
            </div>
          ) : null}
          {reminderError ? (
            <p
              role="alert"
              className="mb-3 rounded-[11px] border border-[#F0D98A] bg-[#FFF9E8] px-3 py-2 text-[11px] text-[#7A4A00]"
            >
              {reminderError}
            </p>
          ) : null}
          {notice ? (
            <output className="mb-3 block rounded-[11px] border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[11px] font-semibold text-[#067647]">
              {notice}
            </output>
          ) : null}

          <MobileReminderSummary
            reminders={importantReminders}
            onOpenReminder={onOpenReminder}
          />

          <label className="relative mt-3 block">
            <span className="sr-only">Поиск клиента</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#64748B]"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              disabled={reorderMode}
              placeholder="Поиск клиента"
              className="h-12 w-full rounded-[14px] border border-[var(--border-color)] bg-white pl-10 pr-12 text-[16px] outline-none placeholder:text-[#64748B] focus:border-[var(--brand-yellow)] focus:ring-4 focus:ring-[rgba(255,196,0,0.14)] disabled:opacity-60"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Очистить поиск"
                className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-[#526174] outline-offset-2 hover:bg-[#F1F5F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            ) : null}
          </label>

          {reorderMode ? (
            <p
              id="mobile-crm-reorder-help"
              aria-live="polite"
              className="mt-3 rounded-[11px] bg-[#FFF9E8] px-3 py-2 text-[11px] leading-4 text-[#7A4A00]"
            >
              {drag
                ? 'Перемещение активно. Стрелки меняют позицию, Enter сохраняет, Escape отменяет.'
                : 'Перетяните карточку за ручку. С клавиатуры нажмите Enter, используйте стрелки и снова Enter.'}
            </p>
          ) : null}

          {isLoading && totalClientCount === 0 ? (
            <MobileClientSkeletons />
          ) : clients.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {clients.map((client, index) => (
                <div key={client.id}>
                  {drag?.insertionIndex === index ? <InsertionMarker /> : null}
                  <MobileClientCard
                    canEditWorkspace={canEditWorkspace}
                    client={client}
                    color={
                      activeTab === 'primary'
                        ? (client.primaryRowPreference?.colorKey ?? null)
                        : (client.rowPreference?.colorKey ?? null)
                    }
                    dragControls={dragControlsFor(client)}
                    nearestReminder={nearestReminderByClient.get(client.id)}
                    tabs={tabs}
                    onColor={onColorClient}
                    onMove={onMoveClient}
                    onOpen={onOpenClient}
                  />
                </div>
              ))}
              {drag?.insertionIndex === clients.length ? (
                <InsertionMarker />
              ) : null}
            </div>
          ) : hasFilters || totalClientCount > 0 ? (
            <MobileEmptyState
              title="Ничего не найдено"
              description="Измените запрос или сбросьте фильтр синхронизации."
              action="Очистить поиск и фильтры"
              onAction={clearFilters}
            />
          ) : (
            <MobileEmptyState
              title="Клиентов пока нет"
              description={
                canEditWorkspace
                  ? 'Добавьте локального клиента — он появится во вкладке «В работе».'
                  : 'В выбранном рабочем пространстве пока нет клиентов.'
              }
              action={canEditWorkspace ? 'Добавить клиента' : undefined}
              onAction={canEditWorkspace ? onAddClient : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MobileClientSkeletons() {
  return (
    <div className="mt-3 grid gap-3" aria-label="Загрузка клиентов">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-[16px] border border-[var(--border-color)] bg-white shadow-[0_8px_22px_rgba(7,22,46,0.04)] motion-reduce:animate-none"
        >
          <div className="h-full rounded-[16px] bg-gradient-to-r from-transparent via-[#F1F5F9] to-transparent" />
        </div>
      ))}
    </div>
  );
}

function MobileEmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-3 rounded-[18px] border border-dashed border-[#CBD5E1] bg-white px-5 py-10 text-center">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-[30rem] text-[12px] leading-5 text-[var(--text-secondary)]">
        {description}
      </p>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 min-h-11 rounded-[11px] bg-[var(--brand-yellow)] px-4 text-[12px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function InsertionMarker() {
  return (
    <div
      aria-hidden="true"
      className="mb-2 h-1 rounded-full bg-[var(--brand-yellow)] shadow-[0_0_0_2px_rgba(255,196,0,0.2)]"
    />
  );
}

function moveClientInList(
  clients: CrmWorkspaceClient[],
  clientId: number,
  insertionIndex: number,
) {
  const sourceIndex = clients.findIndex((client) => client.id === clientId);
  if (sourceIndex < 0) return clients;
  const withoutSource = clients.filter((client) => client.id !== clientId);
  const targetIndex = Math.max(
    0,
    Math.min(
      withoutSource.length,
      insertionIndex - (sourceIndex < insertionIndex ? 1 : 0),
    ),
  );
  return [
    ...withoutSource.slice(0, targetIndex),
    clients[sourceIndex],
    ...withoutSource.slice(targetIndex),
  ];
}

function insertionIndexForPosition(
  clients: CrmWorkspaceClient[],
  clientId: number,
  desiredIndex: number,
) {
  for (
    let insertionIndex = 0;
    insertionIndex <= clients.length;
    insertionIndex += 1
  ) {
    if (
      moveClientInList(clients, clientId, insertionIndex).findIndex(
        (client) => client.id === clientId,
      ) === desiredIndex
    )
      return insertionIndex;
  }
  return 0;
}
