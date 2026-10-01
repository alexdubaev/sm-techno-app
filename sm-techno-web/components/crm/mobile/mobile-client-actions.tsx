'use client';

import { MoreHorizontal } from 'lucide-react';

import {
  Dialog,
  DialogBackdrop,
  DialogPortal,
  DialogPopup,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CrmTab, CrmWorkspaceClient } from '@/lib/types';

const ROW_COLORS = [
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

type MobileClientActionsProps = {
  client: CrmWorkspaceClient;
  color: string | null;
  isOpen: boolean;
  tabs: CrmTab[];
  onColor: (client: CrmWorkspaceClient, color: string | null) => void;
  onMove: (client: CrmWorkspaceClient, tabId: number) => void;
  onOpenChange: (isOpen: boolean) => void;
};

export function MobileClientActions({
  client,
  color,
  isOpen,
  tabs,
  onColor,
  onMove,
  onOpenChange,
}: MobileClientActionsProps) {
  const availableTabs = tabs.filter(
    (tab) => tab.id !== client.assignment?.tabId,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => onOpenChange(open)}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[11px] border border-[var(--border-color)] bg-white text-[var(--text-secondary)] outline-offset-2 hover:bg-[#F6F8FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            aria-label={`Ещё действия: ${client.documentName || client.fullName || client.name}`}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-40" />
        <DialogPopup
          aria-label="Действия клиента"
          data-mobile-client-actions-sheet=""
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 max-h-[min(72dvh,38rem)] overflow-y-auto overscroll-contain rounded-[20px] border border-[var(--border-color)] bg-white p-3 shadow-[0_24px_64px_rgba(7,22,46,0.24)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {client.assignment ? 'Переместить во вкладку' : 'Добавить во вкладку'}
          </p>
          <div className="mt-1 grid gap-1">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onMove(client, tab.id);
                  onOpenChange(false);
                }}
                className="min-h-11 rounded-[9px] px-2 text-left text-[12px] font-semibold hover:bg-[#F6F8FB]"
              >
                {tab.name}
              </button>
            ))}
            {availableTabs.length === 0 ? (
              <p className="py-2 text-[11px] text-[var(--text-secondary)]">
                Других вкладок нет.
              </p>
            ) : null}
          </div>
          <div className="mt-2 border-t border-[var(--border-color)] pt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Цвет карточки
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {ROW_COLORS.map(([key, label, swatch]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onColor(client, key);
                    onOpenChange(false);
                  }}
                  aria-label={`Цвет карточки: ${label}`}
                  aria-pressed={color === key}
                  title={label}
                  style={{ backgroundColor: swatch }}
                  className="size-11 rounded-[9px] border border-black/10 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                onColor(client, null);
                onOpenChange(false);
              }}
              aria-pressed={color === null}
              className="mt-2 min-h-11 w-full rounded-[9px] bg-[#F6F8FB] px-2 text-[11px] font-semibold"
            >
              Сбросить цвет
            </button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
