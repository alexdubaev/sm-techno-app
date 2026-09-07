'use client';

import {
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

import type { AppUser, CrmTab } from '@/lib/types';

export type MobileSyncFilter =
  | 'all'
  | 'synced'
  | 'local'
  | 'pending'
  | 'blocked_capability'
  | 'blocked_credentials'
  | 'conflict'
  | 'sync_error';

type ActiveTab = 'primary' | number;

type MobileCrmHeaderProps = {
  activeTab: ActiveTab;
  archiveMode: boolean;
  canEditWorkspace: boolean;
  isAdmin: boolean;
  isExporting: boolean;
  isRefreshing: boolean;
  ownerId: number;
  ownerName: string;
  owners: AppUser[];
  activeControlCount: number;
  onOpenFilters: () => void;
  reorderActionLabel: string;
  reorderMode: boolean;
  reorderUnavailableReason: string | null;
  syncFilter: MobileSyncFilter;
  syncStatusText: string | null;
  tabs: CrmTab[];
  onAddClient: () => void;
  onCreateTab: () => void;
  onDeleteTab: (tab: CrmTab) => void;
  onExport: (scope: 'all' | 'tab') => void;
  onImport: () => void;
  onOwnerChange: (ownerId: number) => void;
  onRefresh: () => void;
  onRenameTab: (tab: CrmTab) => void;
  onSyncFilterChange: (filter: MobileSyncFilter) => void;
  onToggleReorder: () => void;
};

export function MobileCrmHeader({
  activeTab,
  archiveMode,
  canEditWorkspace,
  isAdmin,
  isExporting,
  isRefreshing,
  ownerId,
  ownerName,
  owners,
  activeControlCount,
  onOpenFilters,
  reorderActionLabel,
  reorderMode,
  reorderUnavailableReason,
  syncFilter,
  syncStatusText,
  tabs,
  onAddClient,
  onCreateTab,
  onDeleteTab,
  onExport,
  onImport,
  onOwnerChange,
  onRefresh,
  onRenameTab,
  onSyncFilterChange,
  onToggleReorder,
}: MobileCrmHeaderProps) {
  return (
    <header className="sticky top-0 z-30 -mx-3 border-b border-[var(--border-color)] bg-white/95 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_8px_24px_rgba(7,22,46,0.05)] backdrop-blur">
      <div className="flex min-h-11 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Рабочее пространство
          </p>
          <h1 className="truncate text-[20px] font-bold tracking-[-0.035em] text-[var(--text-primary)]">
            {archiveMode
              ? 'CRM · Архив'
              : canEditWorkspace
                ? 'CRM'
                : `CRM: ${ownerName}`}
          </h1>
          {syncStatusText ? (
            <p className="truncate text-[10px] text-[var(--text-secondary)]">
              {syncStatusText}
            </p>
          ) : null}
        </div>

        {reorderMode ? (
          <button
            type="button"
            onClick={onToggleReorder}
            className="h-11 rounded-[12px] bg-[var(--brand-dark)] px-4 text-[13px] font-bold text-white outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
          >
            {reorderActionLabel}
          </button>
        ) : (
          <>
            {!archiveMode ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label={
                  isRefreshing
                    ? 'CRM обновляется из 1С'
                    : 'Обновить CRM из 1С'
                }
                className="flex size-11 items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)] outline-offset-2 transition-colors hover:bg-[#F6F8FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:opacity-55"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`size-5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
            ) : null}
            {canEditWorkspace ? (
              <button
                type="button"
                onClick={onAddClient}
                aria-label="Добавить клиента"
                className="flex size-11 items-center justify-center rounded-[12px] bg-[var(--brand-yellow)] text-[var(--brand-dark)] outline-offset-2 transition-colors hover:bg-[#FFD447] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
              </button>
            ) : null}
            <details className="group relative">
              <summary
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)] outline-offset-2 transition-colors hover:bg-[#F6F8FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
                aria-label="Ещё действия CRM"
              >
                <MoreHorizontal aria-hidden="true" className="size-5" />
              </summary>
              <div className="absolute right-0 z-40 mt-2 max-h-[min(70dvh,34rem)] w-[min(calc(100vw-1.5rem),22rem)] overflow-y-auto overscroll-contain rounded-[18px] border border-[var(--border-color)] bg-white p-3 shadow-[0_20px_48px_rgba(7,22,46,0.2)]">
                {isAdmin ? (
                  <label className="grid gap-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>CRM сотрудника</span>
                    <select
                      value={ownerId}
                      onChange={(event) =>
                        onOwnerChange(Number(event.target.value))
                      }
                      className="h-11 rounded-[11px] border border-[var(--border-color)] bg-white px-3 text-[13px] font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]"
                    >
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.fullName || owner.username}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!archiveMode ? (
                  <div className="mt-3 grid gap-3 border-t border-[var(--border-color)] pt-3">
                  <label className="grid gap-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>Синхронизация</span>
                    <select
                      value={syncFilter}
                      onChange={(event) =>
                        onSyncFilterChange(
                          event.target.value as MobileSyncFilter,
                        )
                      }
                      className="h-11 rounded-[11px] border border-[var(--border-color)] bg-white px-3 text-[13px] font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]"
                    >
                      <option value="all">Все</option>
                      <option value="synced">Связанные с 1С</option>
                      <option value="local">Локальные</option>
                      <option value="pending">Ожидают отправки</option>
                      <option value="blocked_capability">
                        Отправка заблокирована
                      </option>
                      <option value="blocked_credentials">
                        Нужны учётные данные 1С
                      </option>
                      <option value="conflict">Конфликт</option>
                      <option value="sync_error">С ошибкой</option>
                    </select>
                  </label>
                  {canEditWorkspace ? (
                    <div>
                      <button
                        type="button"
                        onClick={onToggleReorder}
                        disabled={reorderUnavailableReason !== null}
                        className="h-11 w-full rounded-[11px] border border-[var(--border-color)] bg-[#F8FAFC] px-3 text-left text-[13px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reorderActionLabel}
                      </button>
                      {reorderUnavailableReason ? (
                        <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-secondary)]">
                          {reorderUnavailableReason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                ) : null}

                {!archiveMode ? (
                  <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Выгрузка Excel
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => onExport('all')}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-color)] px-2 text-[12px] font-semibold disabled:opacity-50"
                    >
                      <Download aria-hidden="true" className="size-4" />
                      Все клиенты
                    </button>
                    <button
                      type="button"
                      disabled={isExporting || activeTab === 'primary'}
                      onClick={() => onExport('tab')}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-color)] px-2 text-[12px] font-semibold disabled:opacity-50"
                    >
                      <Download aria-hidden="true" className="size-4" />
                      Эта вкладка
                    </button>
                  </div>
                  </div>
                ) : null}

                {canEditWorkspace ? (
                  <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                    <button
                      type="button"
                      onClick={onImport}
                      className="h-11 w-full rounded-[11px] bg-[var(--brand-yellow)] px-3 text-left text-[13px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
                    >
                      Загрузить клиентов
                    </button>
                  </div>
                ) : null}

                {canEditWorkspace ? (
                  <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Личные вкладки
                      </p>
                      <button
                        type="button"
                        onClick={onCreateTab}
                        className="min-h-11 rounded-[10px] px-2 text-[11px] font-bold text-[var(--brand-dark)] hover:bg-[#F6F8FB]"
                      >
                        + Новая
                      </button>
                    </div>
                    <div className="mt-1 grid gap-1">
                      {tabs
                        .filter((tab) => tab.systemKind === 'custom')
                        .map((tab) => (
                          <div
                            key={tab.id}
                            className="flex min-h-12 items-center gap-1 rounded-[10px] bg-[#F7F9FC] pl-3"
                          >
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                              {tab.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRenameTab(tab)}
                              aria-label={`Переименовать вкладку ${tab.name}`}
                              className="flex size-11 items-center justify-center rounded-[9px] text-[var(--text-secondary)] hover:bg-white"
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteTab(tab)}
                              aria-label={`Удалить вкладку ${tab.name}`}
                              className="flex size-11 items-center justify-center rounded-[9px] text-[#B42318] hover:bg-white"
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </button>
                          </div>
                        ))}
                      {tabs.every((tab) => tab.systemKind !== 'custom') ? (
                        <p className="py-2 text-[11px] text-[var(--text-secondary)]">
                          Личных вкладок пока нет.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </>
        )}
      </div>
      {!archiveMode ? (
        <button
          type="button"
          onClick={onOpenFilters}
          disabled={reorderMode}
          aria-label={
            activeControlCount
              ? `Фильтры и сортировка: ${activeControlCount}`
              : 'Фильтры и сортировка'
          }
          aria-haspopup="dialog"
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[#F7F9FC] px-3 text-[12px] font-semibold outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:opacity-50"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Фильтры и сортировка
          {activeControlCount > 0 ? (
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-yellow)] text-[var(--brand-dark)]"
            >
              {activeControlCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </header>
  );
}
