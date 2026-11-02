"use client";

import { useId, useState } from 'react';
import { setWarehouseClientPrice } from '@/lib/api';
import type { Warehouse } from '@/lib/types';

export function WarehouseClientPriceToggle({ warehouse, disabled, onBusyChange, onSaved }: {
  warehouse: Warehouse;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: (warehouse: Warehouse) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const included = warehouse.includeInClientPrice ?? true;
  async function save(include: boolean) {
    setBusy(true);
    setError(null);
    onBusyChange(true);
    try {
      const updated = await setWarehouseClientPrice(warehouse.id, include);
      onSaved(updated);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Не удалось сохранить настройку склада.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return <div className="mt-1 min-w-0" aria-busy={busy}>
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[11px] leading-4 text-[var(--text-primary)]">
      <input type="checkbox" checked={included} aria-disabled={disabled || busy}
        aria-label={`Включать в клиентский прайс: ${warehouse.name}`}
        aria-describedby={`${id}-status${error ? ` ${id}-error` : ''}`}
        className="h-4 w-4 shrink-0 accent-[var(--brand-yellow)] aria-disabled:cursor-wait"
        onChange={(event) => { if (!disabled && !busy) void save(event.target.checked); }} />
      <span>Включать в клиентский прайс</span>
    </label>
    <output id={`${id}-status`} className="block text-[10px] leading-4 text-[var(--text-secondary)]">
      {busy ? 'Сохраняется…' : included ? 'Включён в клиентский прайс' : 'Исключён из клиентского прайса'}
    </output>
    {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] leading-4 text-red-700">{error}</p> : null}
  </div>;
}
