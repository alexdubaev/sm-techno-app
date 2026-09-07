'use client';

import {
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SubmitEvent,
} from 'react';
import { Search, X } from 'lucide-react';

import {
  MobileClientCard,
  type MobileDragControls,
} from '@/components/crm/mobile/mobile-client-card';
import {
  MobileCrmHeader,
  type MobileSyncFilter,
} from '@/components/crm/mobile/mobile-crm-header';
import { MobileCrmImportSheet } from '@/components/crm/mobile/mobile-crm-import-sheet';
import {
  MobileCrmFilterSheet,
  type CrmListControlValues,
} from '@/components/crm/mobile/mobile-crm-filter-sheet';
import { MobileCrmTabs } from '@/components/crm/mobile/mobile-crm-tabs';
import {
  MobileClientDetail,
  MobilePrimaryArchiveDetail,
} from '@/components/crm/mobile/mobile-client-detail';
import { MobileClientMore } from '@/components/crm/mobile/mobile-client-more';
import type { ImportantReminder } from '@/components/crm/mobile/mobile-crm-utils';
import { MobileReminderSummary } from '@/components/crm/mobile/mobile-reminder-summary';
import {
  MobileNewClientSheet,
  type MobileNewClientForm,
} from '@/components/crm/mobile/mobile-sheets';
import type { MobileDetailSection } from '@/components/crm/mobile/types';
import type {
  AppUser,
  CrmPrimaryArchiveClient,
  CrmPrimaryArchiveResponse,
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
  isAdding: boolean;
  isSavingClient: boolean;
  importantReminders: ImportantReminder[];
  isAdmin: boolean;
  isExporting: boolean;
  isLoading: boolean;
  isLoadingReminders: boolean;
  isRefreshing: boolean;
  manualOrderAvailable: boolean;
  nearestReminderByClient: ReadonlyMap<number, CrmReminder>;
  notice: string | null;
  newClientError: string | null;
  newClientForm: MobileNewClientForm;
  ownerId: number;
  ownerName: string;
  owners: AppUser[];
  listControls: CrmListControlValues;
  allClients: CrmWorkspaceClient[];
  reminderError: string | null;
  search: string;
  selectedClient: CrmWorkspaceClient | null;
  selectedArchivedClient?: CrmPrimaryArchiveClient | null;
  primaryArchive?: CrmPrimaryArchiveResponse | null;
  primaryArchiveMode?: 'active' | 'archive';
  isPrimaryArchiveLoading?: boolean;
  primaryArchiveError?: string | null;
  syncFilter: MobileSyncFilter;
  syncStatusText: string | null;
  tabs: CrmTab[];
  totalClientCount: number;
  workspaceError: string | null;
  onAddClient: () => void;
  onChangeClientForm: (form: MobileNewClientForm) => void;
  onCloseArchivedClient?: () => void;
  onCloseClient: () => void;
  onCloseNewClient: () => void;
  onColorClient: (client: CrmWorkspaceClient, color: string | null) => void;
  onCreateTab: () => void;
  onDeleteTab: (tab: CrmTab) => void;
  onDetailChanged: (ownerId: number, activeTab: ActiveTab) => void;
  onExport: (scope: 'all' | 'tab') => void;
  onImportCompleted: (targetTabId: number) => void;
  onMoveClient: (client: CrmWorkspaceClient, tabId: number) => void;
  onOpenClient: (
    client: CrmWorkspaceClient,
    initialSection?: MobileDetailSection,
  ) => void;
  onOpenArchivedClient?: (client: CrmPrimaryArchiveClient) => void;
  onOpenReminder: (reminder: CrmReminder) => void;
  onOwnerChange: (ownerId: number) => void;
  onListControlsChange: (values: CrmListControlValues) => void;
  onResetListControls: () => void;
  onRefresh: () => void;
  onPrimaryArchiveChanged?: () => void | Promise<void>;
  onPrimaryArchiveModeChange?: (mode: 'active' | 'archive') => void;
  onRenameTab: (tab: CrmTab) => void;
  onReorder: (clientId: number, insertionIndex: number) => void;
  onSearchChange: (value: string) => void;
  onSubmitClient: (event: SubmitEvent<HTMLFormElement>) => void;
  onSyncFilterChange: (filter: MobileSyncFilter) => void;
  onTabChange: (tab: ActiveTab) => void;
};

type DragState = { clientId: number; insertionIndex: number };

export function MobileCrmWorkspace({
  activeTab,
  canEditWorkspace,
  clients,
  initialDetailSection,
  isAdding,
  isSavingClient,
  importantReminders,
  isAdmin,
  isExporting,
  isLoading,
  isLoadingReminders,
  isRefreshing,
  manualOrderAvailable,
  nearestReminderByClient,
  notice,
  newClientError,
  newClientForm,
  ownerId,
  ownerName,
  owners,
  listControls,
  allClients,
  reminderError,
  search,
  selectedClient,
  selectedArchivedClient = null,
  primaryArchive = null,
  primaryArchiveMode = 'active',
  isPrimaryArchiveLoading = false,
  primaryArchiveError = null,
  syncFilter,
  syncStatusText,
  tabs,
  totalClientCount,
  workspaceError,
  onAddClient,
  onChangeClientForm,
  onCloseArchivedClient = ignoreMobileArchiveAction,
  onCloseClient,
  onCloseNewClient,
  onColorClient,
  onCreateTab,
  onDeleteTab,
  onDetailChanged,
  onExport,
  onImportCompleted,
  onMoveClient,
  onOpenClient,
  onOpenArchivedClient = ignoreMobileArchiveClient,
  onOpenReminder,
  onOwnerChange,
  onListControlsChange,
  onResetListControls,
  onRefresh,
  onPrimaryArchiveChanged = ignoreMobileArchiveAction,
  onPrimaryArchiveModeChange = ignoreMobileArchiveMode,
  onRenameTab,
  onReorder,
  onSearchChange,
  onSubmitClient,
  onSyncFilterChange,
  onTabChange,
}: MobileCrmWorkspaceProps) {
  const [requestedReorderMode, setRequestedReorderMode] = useState(false);
  const [activeActionsClientId, setActiveActionsClientId] =
    useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const activeControlCount =
    Number(listControls.sortMode !== 'manual') +
    Number(listControls.phoneFilter !== 'all') +
    Number(listControls.emailFilter !== 'all');
  const reorderMode = requestedReorderMode && manualOrderAvailable;
  const hasFilters =
    search.trim().length > 0 ||
    syncFilter !== 'all' ||
    activeControlCount > 0;
  const reorderUnavailableReason = manualOrderAvailable
    ? null
    : listControls.sortMode !== 'manual'
      ? 'Выберите «Ручной порядок» и сбросьте поиск и фильтры.'
      : 'Сбросьте поиск и фильтры, чтобы изменить порядок.';
  const reorderActionLabel = reorderMode ? 'Готово' : 'Изменить порядок';
  const isPrimaryArchiveView =
    isAdmin && activeTab === 'primary' && primaryArchiveMode === 'archive';

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

  return (
    <div
      data-mobile-crm-workspace=""
      data-active-tab={activeTab}
      data-client-count={clients.length}
      data-reminder-count={importantReminders.length}
      data-search={search}
      data-tab-count={tabs.length}
      aria-busy={isLoading || isLoadingReminders || isPrimaryArchiveLoading}
      className="min-h-dvh bg-[#F7F9FC] px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--text-primary)]"
    >
      {selectedArchivedClient ? (
        <MobilePrimaryArchiveDetail
          client={selectedArchivedClient}
          ownerId={ownerId}
          ownerName={ownerName}
          isAdmin={isAdmin}
          onClose={onCloseArchivedClient}
          onPrimaryArchiveChanged={onPrimaryArchiveChanged}
        />
      ) : selectedClient ? (
        <MobileClientDetail
          client={selectedClient}
          ownerId={ownerId}
          activeTab={activeTab}
          ownerName={ownerName}
          isAdmin={isAdmin}
          canEditWorkspace={canEditWorkspace}
          canManageReminders={canEditWorkspace}
          canResolveSyncConflicts={isAdmin || canEditWorkspace}
          initialSection={initialDetailSection}
          onDetailChanged={onDetailChanged}
          onPrimaryArchiveChanged={onPrimaryArchiveChanged}
          onClose={onCloseClient}
          renderMore={(controller) => (
            <MobileClientMore
              controller={controller}
              tabs={tabs}
              color={
                activeTab === 'primary'
                  ? (selectedClient.primaryRowPreference?.colorKey ?? null)
                  : (selectedClient.rowPreference?.colorKey ?? null)
              }
              onColor={onColorClient}
              onMove={onMoveClient}
            />
          )}
        />
      ) : (
        <div data-mobile-crm-list="">
          <MobileCrmHeader
            activeTab={activeTab}
            archiveMode={isPrimaryArchiveView}
            canEditWorkspace={canEditWorkspace && !isPrimaryArchiveView}
            isAdmin={isAdmin}
            isExporting={isExporting}
            isRefreshing={isRefreshing}
            ownerId={ownerId}
            ownerName={ownerName}
            owners={owners}
            activeControlCount={activeControlCount}
            onOpenFilters={() => setIsFiltering(true)}
            reorderActionLabel={reorderActionLabel}
            reorderMode={reorderMode && !isPrimaryArchiveView}
            reorderUnavailableReason={reorderUnavailableReason}
            syncFilter={syncFilter}
            syncStatusText={syncStatusText}
            tabs={tabs}
            onAddClient={onAddClient}
            onCreateTab={onCreateTab}
            onDeleteTab={onDeleteTab}
            onExport={onExport}
            onImport={() => setIsImporting(true)}
            onOwnerChange={onOwnerChange}
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

          {isAdmin && activeTab === 'primary' ? (
            <MobilePrimaryArchiveSwitch
              activeCount={primaryArchive?.activeCount ?? totalClientCount}
              archivedCount={primaryArchive?.archivedCount ?? 0}
              mode={primaryArchiveMode}
              disabled={isPrimaryArchiveLoading}
              onChange={(mode) => {
                setRequestedReorderMode(false);
                setDrag(null);
                onPrimaryArchiveModeChange(mode);
              }}
            />
          ) : null}

          {isRefreshing && !isPrimaryArchiveView ? (
            <output className="mb-3 block rounded-[11px] border border-[#B9D8FF] bg-[#EFF6FF] px-3 py-2 text-[11px] font-semibold text-[#174EA6]">
              Обновляем из 1С… Сохранённые карточки остаются доступны.
            </output>
          ) : null}
          {workspaceError && !isPrimaryArchiveView ? (
            <div
              role="alert"
              className="mb-3 rounded-[13px] border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-[#B42318]"
            >
              <p className="text-[12px] font-bold">Не удалось обновить CRM</p>
              <p className="mt-1 text-[11px] leading-4">{workspaceError}</p>
              {workspaceError === 'Не удалось обновить данные из 1С. Показаны сохранённые данные.' ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="mt-2 min-h-11 rounded-[10px] bg-white px-3 text-[11px] font-bold text-[#8A1C13] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B42318] disabled:opacity-50"
                >
                  Повторить
                </button>
              ) : null}
            </div>
          ) : null}
          {reminderError && !isPrimaryArchiveView ? (
            <p
              role="alert"
              className="mb-3 rounded-[11px] border border-[#F0D98A] bg-[#FFF9E8] px-3 py-2 text-[11px] text-[#7A4A00]"
            >
              {reminderError}
            </p>
          ) : null}
          {notice && !isPrimaryArchiveView ? (
            <output className="mb-3 block rounded-[11px] border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[11px] font-semibold text-[#067647]">
              {notice}
            </output>
          ) : null}

          {isPrimaryArchiveView ? (
            <>
              {primaryArchiveError ? (
                <p
                  role="alert"
                  className="mb-3 rounded-[13px] border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]"
                >
                  {primaryArchiveError}
                </p>
              ) : null}
              <MobilePrimaryArchiveList
                clients={primaryArchive?.items ?? []}
                isLoading={isPrimaryArchiveLoading}
                onOpenClient={onOpenArchivedClient}
              />
            </>
          ) : (
            <>
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
                    activeActionsClientId={activeActionsClientId}
                    activeTab={activeTab}
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
                    onActionsOpenChange={setActiveActionsClientId}
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
              title="Клиенты не найдены"
              description="Измените запрос или сбросьте фильтры."
              action="Сбросить фильтры"
              onAction={onResetListControls}
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
            </>
          )}
        </div>
      )}
      {isFiltering && !isPrimaryArchiveView ? (
        <MobileCrmFilterSheet
          values={listControls}
          clients={allClients}
          search={search}
          syncFilter={syncFilter}
          onApply={onListControlsChange}
          onClose={() => setIsFiltering(false)}
        />
      ) : null}
      {isAdding && !isPrimaryArchiveView ? (
        <MobileNewClientSheet
          form={newClientForm}
          isSaving={isSavingClient}
          error={newClientError}
          onChange={onChangeClientForm}
          onClose={onCloseNewClient}
          onSubmit={onSubmitClient}
        />
      ) : null}
      {isImporting && !isPrimaryArchiveView ? (
        <MobileCrmImportSheet
          ownerId={ownerId}
          ownerName={ownerName}
          tabs={tabs}
          onClose={() => setIsImporting(false)}
          onImported={(result) => onImportCompleted(result.targetTab.id)}
        />
      ) : null}
    </div>
  );
}

function MobilePrimaryArchiveSwitch({
  activeCount,
  archivedCount,
  mode,
  disabled,
  onChange,
}: {
  activeCount: number;
  archivedCount: number;
  mode: 'active' | 'archive';
  disabled: boolean;
  onChange: (mode: 'active' | 'archive') => void;
}) {
  return (
    <fieldset
      className="mb-3 grid grid-cols-2 gap-1 rounded-[14px] bg-[#E9EEF5] p-1"
    >
      <legend className="sr-only">Режим основной CRM</legend>
      <button
        type="button"
        aria-pressed={mode === 'active'}
        disabled={disabled}
        onClick={() => onChange('active')}
        className={`min-h-11 rounded-[11px] px-3 text-[13px] font-bold transition-colors disabled:opacity-60 ${mode === 'active' ? 'bg-white text-[var(--text-primary)] shadow-[0_2px_8px_rgba(7,22,46,0.08)]' : 'text-[var(--text-secondary)]'}`}
      >
        Активные {activeCount}
      </button>
      <button
        type="button"
        aria-pressed={mode === 'archive'}
        disabled={disabled}
        onClick={() => onChange('archive')}
        className={`min-h-11 rounded-[11px] px-3 text-[13px] font-bold transition-colors disabled:opacity-60 ${mode === 'archive' ? 'bg-white text-[var(--text-primary)] shadow-[0_2px_8px_rgba(7,22,46,0.08)]' : 'text-[var(--text-secondary)]'}`}
      >
        Архив {archivedCount}
      </button>
    </fieldset>
  );
}

function MobilePrimaryArchiveList({
  clients,
  isLoading,
  onOpenClient,
}: {
  clients: CrmPrimaryArchiveClient[];
  isLoading: boolean;
  onOpenClient: (client: CrmPrimaryArchiveClient) => void;
}) {
  if (isLoading && clients.length === 0) {
    return <MobileClientSkeletons />;
  }
  if (clients.length === 0) {
    return (
      <MobileEmptyState
        title="Архив пуст"
        description="Здесь появятся клиенты, архивированные из основной CRM."
      />
    );
  }
  return (
    <div className="grid gap-3">
      {clients.map((client) => (
        <article
          key={client.id}
          aria-label={client.documentName || client.fullName || client.name}
          className="rounded-[16px] border border-[var(--border-color)] bg-white p-4 shadow-[0_8px_22px_rgba(7,22,46,0.04)]"
        >
          <h2 className="break-words text-[15px] font-bold leading-5">
            {client.documentName || client.fullName || client.name}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {client.city || 'Город не указан'} · ИНН {client.inn || 'не указан'}
          </p>
          <dl className="mt-4 grid gap-3 text-[12px]">
            <div>
              <dt className="font-semibold text-[var(--text-secondary)]">
                В архиве с
              </dt>
              <dd className="mt-0.5">
                <time dateTime={client.archivedAt}>
                  {formatArchiveDate(client.archivedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--text-secondary)]">
                Архивировал
              </dt>
              <dd className="mt-0.5 break-words">
                {client.archivedByFullName || 'Неизвестно'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--text-secondary)]">
                Причина
              </dt>
              <dd className="mt-0.5 break-words">
                {client.archiveReason || 'Без причины'}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            aria-label="Открыть архивную карточку"
            onClick={() => onOpenClient(client)}
            className="mt-4 min-h-11 w-full rounded-[11px] bg-[var(--brand-yellow)] px-4 text-[13px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
          >
            Открыть и восстановить
          </button>
        </article>
      ))}
    </div>
  );
}

function formatArchiveDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ignoreMobileArchiveAction() {}
function ignoreMobileArchiveClient(_client: CrmPrimaryArchiveClient) {}
function ignoreMobileArchiveMode(_mode: 'active' | 'archive') {}

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
