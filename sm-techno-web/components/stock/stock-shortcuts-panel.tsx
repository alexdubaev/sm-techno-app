'use client';
import { useRef, useState } from 'react';
import { createShortcutDevice, listShortcutDevices, revokeShortcutDevice, type ShortcutDevice } from '@/lib/stock-shortcuts-api';

export function StockShortcutsPanel() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('iPhone');
  const [devices, setDevices] = useState<ShortcutDevice[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const panelGeneration = useRef(0);
  async function refresh() { const result = await listShortcutDevices(); setDevices(result.devices); }
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); } finally { setBusy(false); } }
  function close() { panelGeneration.current += 1; setCode(''); setOpen(false); }
  return <section className="mb-3 rounded-2xl bg-white p-3 shadow-sm" aria-label="Команды iPhone">
    {!open ? <button type="button" className="font-semibold underline" onClick={() => { setOpen(true); void run(refresh); }}>Команды iPhone</button> : <div className="space-y-3">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">Команды iPhone</h2><button type="button" onClick={close}>Закрыть</button></div>
      <p className="text-sm">Создайте личное подключение и введите код при настройке команды. Код показывается один раз.</p>
      <label className="block text-sm">Название устройства<input className="mt-1 block w-full rounded border p-2" value={label} maxLength={100} onChange={e => setLabel(e.target.value)} /></label>
      <button type="button" disabled={busy || !label.trim()} className="rounded-lg bg-amber-400 px-4 py-2 disabled:opacity-50" onClick={() => { const generation = panelGeneration.current; void run(async () => { const result = await createShortcutDevice(label.trim()); if (generation === panelGeneration.current) setCode(result.credential); await refresh(); }); }}>Создать подключение</button>
      {code && <div className="rounded border p-3"><label className="block text-sm">Личный код подключения<input readOnly value={code} className="mt-1 block w-full rounded border p-2" onFocus={e => e.currentTarget.select()} /></label><button type="button" className="mt-2 underline" onClick={() => void navigator.clipboard.writeText(code).catch(() => setError('Скопируйте код вручную из поля.'))}>Копировать код</button><p className="text-sm">После закрытия панели код больше не будет показан.</p></div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <ul className="space-y-2">{devices.map(device => <li key={device.id} className="rounded border p-2 text-sm"><strong>{device.label}</strong><p>Последнее использование: {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString('ru-RU') : 'ещё не использовалось'}</p><p>Действует до: {new Date(device.idleExpiresAt).toLocaleDateString('ru-RU')}</p>{device.revokedAt ? <span>Отозвано</span> : <button disabled={busy} className="underline" type="button" onClick={() => void run(async () => { await revokeShortcutDevice(device.id); setCode(''); await refresh(); })}>Отозвать {device.label}</button>}</li>)}</ul>
    </div>}
  </section>;
}
