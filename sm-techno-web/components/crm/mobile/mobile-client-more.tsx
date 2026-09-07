'use client';

import type { DetailController } from '@/components/crm/use-crm-client-detail';
import {
  mobileButton,
  mobilePanel,
} from '@/components/crm/mobile/mobile-sheets';
import type { CrmTab, CrmWorkspaceClient } from '@/lib/types';

const rowColors = [
  ['blue', 'Синий', '#2563EB'],
  ['cyan', 'Бирюзовый', '#0891B2'],
  ['teal', 'Тёмно-бирюзовый', '#0F766E'],
  ['green', 'Зелёный', '#16A34A'],
  ['lime', 'Лаймовый', '#65A30D'],
  ['yellow', 'Жёлтый', '#CA8A04'],
  ['amber', 'Янтарный', '#D97706'],
  ['orange', 'Оранжевый', '#EA580C'],
  ['red', 'Красный', '#DC2626'],
  ['pink', 'Розовый', '#DB2777'],
  ['purple', 'Фиолетовый', '#7E22CE'],
  ['gray', 'Серый', '#475569'],
] as const;

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

export function MobileClientMore({
  controller,
  tabs,
  color,
  onColor,
  onMove,
}: {
  controller: DetailController;
  tabs: CrmTab[];
  color: string | null;
  onColor: (client: CrmWorkspaceClient, color: string | null) => void;
  onMove: (client: CrmWorkspaceClient, tabId: number) => void;
}) {
  const {
    currentClient,
    audit,
    archiveReason,
    canConfirmExistingLink,
    canEditWorkspace,
    canManageLocalClient,
    canRemoveAssignment,
    canResolveSyncConflicts,
    isArchiveConfirmationOpen,
    isLoading,
    isRemoveAssignmentConfirmationOpen,
    isSaving,
    linkCandidate,
    linkCandidates,
    ownerName,
    setArchiveReason,
    setIsArchiveConfirmationOpen,
    setIsRemoveAssignmentConfirmationOpen,
    setLinkCandidate,
    setSyncConflictResolution,
    syncConflictResolution,
    syncConflicts,
    archiveLocalClient,
    confirmExistingLink,
    removeAssignment,
    resolveSyncConflict,
    restoreLocalClient,
  } = controller;
  const busy = isLoading || isSaving !== null;
  const availableTabs = tabs.filter(
    (tab) => tab.id !== currentClient.assignment?.tabId,
  );
  const clientLabel =
    currentClient.documentName || currentClient.fullName || currentClient.name;

  return (
    <div className="grid gap-4">
      <section className={mobilePanel}>
        <h2 className="text-base font-bold">Карточка и синхронизация</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Статус: {statusLabels[currentClient.syncStatus]}
        </p>
        {currentClient.syncError ? (
          <p className="mt-2 break-words text-sm text-[#B42318]">
            {currentClient.syncError}
          </p>
        ) : null}
        {canEditWorkspace ? (
          <>
            <p className="mt-4 text-sm font-semibold">Вкладка</p>
            <div className="mt-2 grid gap-2">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(currentClient, tab.id)}
                  className={`${mobileButton} text-left`}
                >
                  {currentClient.assignment ? 'Переместить' : 'Добавить'} во
                  вкладку «{tab.name}»
                </button>
              ))}
              {availableTabs.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Других вкладок нет.
                </p>
              ) : null}
            </div>
            <p className="mt-4 text-sm font-semibold">Цвет карточки</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {rowColors.map(([key, label, swatch]) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => onColor(currentClient, key)}
                  aria-label={`Цвет карточки: ${label}`}
                  aria-pressed={color === key}
                  title={label}
                  style={{ backgroundColor: swatch }}
                  className="size-11 rounded-xl border border-black/10 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)] disabled:opacity-50"
                />
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onColor(currentClient, null)}
              aria-pressed={color === null}
              className={`${mobileButton} mt-2 w-full`}
            >
              Сбросить цвет
            </button>
          </>
        ) : null}
      </section>

      {canConfirmExistingLink ? (
        <section className={mobilePanel}>
          <h2 className="text-base font-bold">Найденные в 1С совпадения</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Точные совпадения по ИНН и КПП требуют явного подтверждения.
          </p>
          <div className="mt-3 grid gap-3">
            {linkCandidates.length ? (
              linkCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-xl bg-[#F7F9FC] p-3">
                  <p className="break-words text-sm font-semibold">
                    {candidate.name}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    ИНН {candidate.inn}
                    {candidate.kpp ? ` · КПП ${candidate.kpp}` : ''}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setLinkCandidate(candidate)}
                    className={`${mobileButton} mt-3 w-full`}
                  >
                    Проверить и подтвердить
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Точных совпадений пока нет.
              </p>
            )}
          </div>
          {linkCandidate ? (
            <div className="mt-3 rounded-xl border border-[#F0D98A] bg-[#FFF9E8] p-3">
              <p className="text-sm">
                Связать «{clientLabel}» с контрагентом 1С «{linkCandidate.name}
                »?
              </p>
              <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">
                ИНН {linkCandidate.inn}
                {linkCandidate.kpp ? ` · КПП ${linkCandidate.kpp}` : ''} · Ключ
                1С {linkCandidate.onecKey}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLinkCandidate(null)}
                  className={mobileButton}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmExistingLink()}
                  className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
                >
                  {isSaving === 'link'
                    ? 'Связываем…'
                    : 'Подтвердить связь с 1С'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={mobilePanel}>
        <h2 className="text-base font-bold">Конфликты синхронизации</h2>
        <div className="mt-3 grid gap-3">
          {syncConflicts.length ? (
            syncConflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-xl bg-[#FFF9E8] p-3">
                <p className="text-sm font-semibold">{conflict.fieldName}</p>
                <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">
                  CRM: {formatConflictValue(conflict.localValue)}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                  1С: {formatConflictValue(conflict.remoteValue)}
                </p>
                {canResolveSyncConflicts ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setSyncConflictResolution({ conflict, choice: 'local' })
                      }
                      className={mobileButton}
                    >
                      Оставить локальное
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setSyncConflictResolution({
                          conflict,
                          choice: 'remote',
                        })
                      }
                      className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
                    >
                      Принять из 1С
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Открытых конфликтов синхронизации нет.
            </p>
          )}
        </div>
        {syncConflictResolution ? (
          <div className="mt-3 rounded-xl border border-[#F0D98A] bg-[#FFF9E8] p-3">
            <p className="text-sm">
              Выбор необратимо разрешит этот конфликт. Подтвердить?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSyncConflictResolution(null)}
                className={mobileButton}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resolveSyncConflict()}
                className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
              >
                {isSaving === 'resolve' ? 'Разрешаем…' : 'Подтвердить'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {canManageLocalClient || canRemoveAssignment ? (
        <section className={mobilePanel}>
          <h2 className="text-base font-bold">Административные действия</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            CRM сотрудника: {ownerName}
          </p>
          {canManageLocalClient ? (
            currentClient.syncStatus === 'archived' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void restoreLocalClient()}
                className={`${mobileButton} mt-3 w-full border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
              >
                {isSaving === 'restore'
                  ? 'Восстанавливаем…'
                  : 'Восстановить локального клиента'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setIsArchiveConfirmationOpen(true)}
                  className={`${mobileButton} mt-3 w-full border-[#F9D4D4] bg-[#FEF2F2] text-[#B91C1C]`}
                >
                  Архивировать локального клиента
                </button>
                {isArchiveConfirmationOpen ? (
                  <div className="mt-3 rounded-xl border border-[#F9D4D4] bg-[#FEF2F2] p-3">
                    <p className="text-sm">
                      Архивировать «{clientLabel}»? Активные напоминания будут
                      отменены, история сохранится.
                    </p>
                    <label className="mt-3 grid gap-1.5 text-sm font-medium">
                      <span>Причина</span>
                      <textarea
                        value={archiveReason}
                        onChange={(event) =>
                          setArchiveReason(event.target.value)
                        }
                        className="min-h-24 rounded-xl border border-[#F4B9B9] bg-white p-3 text-base outline-none focus:border-[#B91C1C] focus:ring-2 focus:ring-[#F9D4D4]"
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsArchiveConfirmationOpen(false)}
                        className={mobileButton}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void archiveLocalClient()}
                        className={`${mobileButton} border-transparent bg-[#B91C1C] text-white`}
                      >
                        {isSaving === 'archive'
                          ? 'Архивируем…'
                          : 'Подтвердить архивирование'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )
          ) : null}
          {canRemoveAssignment ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsRemoveAssignmentConfirmationOpen(true)}
                className={`${mobileButton} mt-3 w-full border-[#F0D98A] bg-[#FFF9E8] text-[#92400E]`}
              >
                Оставить только в основной вкладке
              </button>
              {isRemoveAssignmentConfirmationOpen ? (
                <div className="mt-3 rounded-xl border border-[#F0D98A] bg-[#FFF9E8] p-3">
                  <p className="text-sm">
                    Оставить «{clientLabel}» только в основной вкладке «Клиенты
                    1С»? История и напоминания сохранятся.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setIsRemoveAssignmentConfirmationOpen(false)
                      }
                      className={mobileButton}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeAssignment()}
                      className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}
                    >
                      {isSaving === 'remove' ? 'Удаляем…' : 'Подтвердить'}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className={mobilePanel}>
        <h2 className="text-base font-bold">Журнал действий</h2>
        <div className="mt-3 grid gap-2">
          {audit.length ? (
            audit.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#F7F9FC] p-3">
                <p className="text-sm font-semibold">
                  {auditLabel(item.action)}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                  {item.reason || 'Без комментария'}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Административных действий пока нет.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function formatConflictValue(value: unknown) {
  if (value === null || value === undefined || value === '')
    return 'Не указано';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function auditLabel(action: string) {
  return (
    (
      {
        archive_primary_client: 'Клиент архивирован из CRM',
        restore_primary_client: 'Клиент восстановлен в CRM',
        archive_local_client: 'Локальный клиент архивирован',
        restore_local_client: 'Локальный клиент восстановлен',
        archive_assignment: 'Назначение архивировано',
        restore_assignment: 'Назначение восстановлено',
        remove_assignment: 'Оставлен только в основной вкладке',
      } as Record<string, string>
    )[action] ?? action
  );
}
