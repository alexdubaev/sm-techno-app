'use client';

import { useId, useMemo, useState } from 'react';
import {
  filterAndSortCrmClients,
  type CrmSortMode,
  type PresenceFilter,
} from '@/components/crm/crm-client-list-controls';
import {
  MobileSheet,
  mobileButton,
} from '@/components/crm/mobile/mobile-sheets';
import type { MobileSyncFilter } from '@/components/crm/mobile/mobile-crm-header';
import type { CrmWorkspaceClient } from '@/lib/types';

export type CrmListControlValues = {
  sortMode: CrmSortMode;
  phoneFilter: PresenceFilter;
  emailFilter: PresenceFilter;
};

const sortChoices: { value: CrmSortMode; label: string }[] = [
  { value: 'manual', label: 'Ручной порядок' },
  { value: 'name_asc', label: 'По названию: А–Я' },
  { value: 'name_desc', label: 'По названию: Я–А' },
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
  { value: 'free_first', label: 'Сначала свободные' },
  { value: 'busy_first', label: 'Сначала занятые' },
];
const presenceChoices: { value: PresenceFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'present', label: 'Есть' },
  { value: 'missing', label: 'Нет' },
];

export function MobileCrmFilterSheet({
  values,
  clients,
  search,
  syncFilter,
  onApply,
  onClose,
}: {
  values: CrmListControlValues;
  clients: CrmWorkspaceClient[];
  search: string;
  syncFilter: MobileSyncFilter;
  onApply: (values: CrmListControlValues) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(values);
  const id = useId();
  const count = useMemo(
    () =>
      filterAndSortCrmClients(clients, { ...draft, search, syncFilter }).length,
    [clients, draft, search, syncFilter],
  );
  const countLabel =
    count % 10 === 1 && count % 100 !== 11 ? 'клиента' : 'клиентов';

  return (
    <MobileSheet
      title="Фильтры и сортировка"
      description="Настройте список клиентов текущей вкладки."
      onClose={onClose}
    >
      <fieldset className="grid gap-1">
        <legend className="mb-2 text-sm font-bold">Сортировка</legend>
        {sortChoices.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm has-[:checked]:bg-white has-[:checked]:font-semibold"
          >
            <input
              type="radio"
              name={`${id}-sort`}
              value={value}
              checked={draft.sortMode === value}
              onChange={() =>
                setDraft((current) => ({ ...current, sortMode: value }))
              }
              className="size-4 accent-[var(--brand-dark)]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {(
        [
          { key: 'phoneFilter', label: 'Телефон' },
          { key: 'emailFilter', label: 'Почта' },
        ] as const
      ).map(({ key, label }) => (
        <fieldset key={key} className="mt-4">
          <legend className="mb-2 text-sm font-bold">{label}</legend>
          <div className="grid grid-cols-3 gap-2">
            {presenceChoices.map(({ value, label: choiceLabel }) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-white px-2 text-sm has-[:checked]:border-[var(--brand-dark)] has-[:checked]:bg-[var(--brand-dark)] has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              >
                <input
                  type="radio"
                  name={`${id}-${key}`}
                  value={value}
                  checked={draft[key] === value}
                  onChange={() =>
                    setDraft((current) => ({ ...current, [key]: value }))
                  }
                  className="sr-only"
                />
                {choiceLabel}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 mt-5 grid gap-2 bg-[#F7F9FC] pt-3">
        <button
          type="button"
          className={mobileButton}
          onClick={() =>
            setDraft({
              sortMode: 'manual',
              phoneFilter: 'all',
              emailFilter: 'all',
            })
          }
        >
          Сбросить фильтры
        </button>
        <button
          type="button"
          className={`${mobileButton} border-transparent bg-[var(--brand-yellow)]`}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          <span aria-live="polite">
            Показать {count} {countLabel}
          </span>
        </button>
      </div>
    </MobileSheet>
  );
}
