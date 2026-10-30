'use client';
import { useEffect, useRef, useState } from 'react';
import { intakeValuation, resolveValuation, type ValuationRow, type ValuationResult } from '@/lib/stock-valuation-api';

const statuses = { matched: 'Найдено', not_found: 'Не найдено', ambiguous: 'Неоднозначно', zero_stock: 'Нет остатка', duplicate: 'Дубликат' };
export function StockValuationPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ValuationRow[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  function cancel() { generation.current++; controller.current?.abort(); controller.current = null; setBusy(false); }
  function close() { cancel(); setOpen(false); setRows([]); setResult(null); setError(''); setWarnings([]); }
  async function upload(file: File) {
    cancel(); const id = generation.current; const c = new AbortController(); controller.current = c;
    setBusy(true); setError(''); setResult(null);
    try { const data = await intakeValuation(file, c.signal); if (id === generation.current) { setRows(data.rows); setWarnings(data.warnings); } }
    catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : 'Не удалось распознать файл.'); }
    finally { if (id === generation.current) setBusy(false); }
  }
  async function resolve() {
    cancel(); const id = generation.current; const c = new AbortController(); controller.current = c; setBusy(true); setError(''); setResult(null);
    try { const data = await resolveValuation(rows, c.signal); if (id === generation.current) setResult(data); }
    catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : 'Не удалось получить остатки.'); }
    finally { if (id === generation.current) setBusy(false); }
  }
  function download() {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.workbook.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: result.workbook.mediaType}));
    const link = document.createElement('a'); link.href = url; link.download = result.workbook.filename; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
    {!open ? <button type="button" className="font-semibold underline" onClick={() => setOpen(true)}>Расценить список артикулов</button> : <section aria-label="Расценка артикулов" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Расценка артикулов</h2><button type="button" onClick={close}>Закрыть</button></div>
      <p className="text-sm text-slate-600">Загрузите список, проверьте артикулы и получите остатки и цены по складам. Подборка не сохраняется.</p>
      <div className="rounded-xl border-2 border-dashed border-slate-300 p-4" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
        <label className="block cursor-pointer font-medium">Перетащите файл сюда или выберите файл<input aria-label="Выбрать файл с артикулами" type="file" className="mt-2 block text-sm" accept=".docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.heif" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} /></label>
      </div>
      {busy && <output>Обработка файла…</output>}{error && <p role="alert" className="text-red-700">{error}</p>}{warnings.map((w, i) => <p key={i} className="text-sm">{w}</p>)}
      {rows.length > 0 && <><h3 className="font-semibold">Проверьте распознанные строки</h3><div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Строка</th><th>Артикул</th><th>Количество (необязательно)</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{row.sourceRow}</td><td><input aria-label={`Артикул строки ${row.sourceRow}`} className="w-full rounded border p-1" value={row.article} onChange={e => { setRows(old => old.map((r, j) => j === i ? {...r, article: e.target.value} : r)); setResult(null); }} /></td><td><input aria-label={`Количество строки ${row.sourceRow}`} className="w-full rounded border p-1" value={row.requestedQty ?? ''} onChange={e => { setRows(old => old.map((r, j) => j === i ? {...r, requestedQty: e.target.value || null} : r)); setResult(null); }} /></td></tr>)}</tbody></table></div><button type="button" disabled={busy} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold disabled:opacity-50" onClick={() => void resolve()}>Проверить остатки</button></>}
      {result && <><h3 className="font-semibold">Результаты</h3><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Артикул</th><th>Статус</th><th>Склад</th><th>Остаток</th><th>Цена</th></tr></thead><tbody>{result.articleResolution.flatMap((row, i) => row.variants.length ? row.variants.map((v, j) => <tr key={`${i}-${j}`}><td>{row.article}</td><td>{statuses[row.status]}</td><td>{v.warehouseName}</td><td>{v.physicalStock}</td><td>{v.price}</td></tr>) : [<tr key={i}><td>{row.article}</td><td>{statuses[row.status]}</td><td>—</td><td>—</td><td>—</td></tr>])}</tbody></table></div><button type="button" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold" onClick={download}>Скачать Excel</button></>}
    </section>}
  </div>;
}
