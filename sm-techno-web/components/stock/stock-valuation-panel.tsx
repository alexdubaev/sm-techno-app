'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { validateStockFile, textStockFile } from '@/lib/stock-intake-source';
import { intakeValuation, resolveValuation, type ValuationRow, type ValuationResult, type Workbook } from '@/lib/stock-valuation-api';

const statuses = { matched: 'Найдено', not_found: 'Не найдено', ambiguous: 'Неоднозначно', zero_stock: 'Нет остатка', duplicate: 'Дубликат' };
export function StockValuationPanel({ receivedSource, receivedError, onInteraction }: { receivedSource?: File | null; receivedError?: string; onInteraction?: () => void }) {
  const panelId = useId();
  const [open, setOpen] = useState(Boolean(receivedSource || receivedError));
  const [source, setSource] = useState<File | null>(receivedSource ?? null);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const [rows, setRows] = useState<ValuationRow[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [error, setError] = useState(receivedError ?? '');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  function cancel() { generation.current++; controller.current?.abort(); controller.current = null; setBusy(false); }
  function reset() { cancel(); setRows([]); setResult(null); setWarnings([]); setError(''); }
  function select(files: FileList | File[]) { onInteraction?.(); reset(); setSource(null); setText(''); setShowText(false); if (files.length !== 1) { setError('Выберите один файл.'); return; } try { setSource(validateStockFile(files[0])); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выбрать файл.'); } }
  function close() { onInteraction?.(); cancel(); setOpen(false); }
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
  function download(workbook: Workbook) {
    const bytes = Uint8Array.from(atob(workbook.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: workbook.mediaType}));
    const link = document.createElement('a'); link.href = url; link.download = workbook.filename; link.click(); URL.revokeObjectURL(url);
  }
  return <><div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Расценка артикулов</h2><button type="button" aria-expanded={open} aria-controls={panelId} className="min-h-11 shrink-0 px-2 underline" onClick={() => open ? close() : setOpen(true)}>{open ? "Свернуть" : "Развернуть"}</button></div>
    <section id={panelId} aria-label="Расценка артикулов" hidden={!open} className="space-y-3">
      {open && <>
      <p className="text-sm text-slate-600">Загрузите список, проверьте артикулы и получите остатки и цены по складам. Подборка не сохраняется.</p>
      <div className="rounded-xl border-2 border-dashed border-slate-300 p-4" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); select(e.dataTransfer.files); }}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="flex h-14 items-center justify-center rounded border px-2 text-center text-sm leading-tight" onClick={() => { onInteraction?.(); reset(); setSource(null); setText(''); setShowText(true); }}>Вставить список</button>
          <label className="flex h-14 cursor-pointer items-center justify-center rounded border px-2 text-center text-sm leading-tight has-[:focus-visible]:outline has-[:focus-visible]:outline-2">Фото / скриншот<input aria-label="Фото / скриншот" type="file" accept="image/png,image/jpeg,image/webp,image/tiff,image/heic,image/heif" className="sr-only" onChange={e => { if (e.target.files?.length) select(e.target.files); e.target.value = ''; }} /></label>
          <label className="flex h-14 cursor-pointer items-center justify-center rounded border px-2 text-center text-sm leading-tight has-[:focus-visible]:outline has-[:focus-visible]:outline-2">Выбрать файл<input aria-label="Выбрать файл с артикулами" type="file" className="sr-only" accept=".docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.heif" onChange={e => { if (e.target.files?.length) select(e.target.files); e.target.value = ''; }} /></label>
        </div>
        <p className="mt-2 text-sm">Или перетащите один файл сюда (до 25 МиБ).</p>
        {showText && <label className="mt-3 block">Список артикулов<textarea aria-label="Список артикулов" className="mt-1 block min-h-32 w-full rounded border p-2" value={text} onChange={e => { onInteraction?.(); reset(); setText(e.target.value); }} /></label>}
        {source && <p className="mt-3 break-all">{source.name} · {(source.size / 1024).toFixed(1)} КиБ</p>}
        {(source || showText) && <button type="button" disabled={busy} className="mt-3 min-h-11 rounded bg-amber-400 px-4 font-semibold disabled:opacity-50" onClick={() => { try { void upload(source ?? textStockFile(text)); } catch (e) { setError(e instanceof Error ? e.message : 'Проверьте список.'); } }}>Распознать</button>}
      </div>
      {busy && <output>Обработка файла…</output>}{error && <p role="alert" className="text-red-700">{error}</p>}{warnings.map((w, i) => <p key={i} className="text-sm">{w}</p>)}
      {rows.length > 0 && <><h3 className="font-semibold">Проверьте распознанные строки</h3><div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Строка</th><th>Артикул</th><th>Количество (необязательно)</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{row.sourceRow}</td><td><input aria-label={`Артикул строки ${row.sourceRow}`} className="w-full rounded border p-1" value={row.article} onChange={e => { setRows(old => old.map((r, j) => j === i ? {...r, article: e.target.value} : r)); setResult(null); }} /></td><td><input aria-label={`Количество строки ${row.sourceRow}`} className="w-full rounded border p-1" value={row.requestedQty ?? ''} onChange={e => { setRows(old => old.map((r, j) => j === i ? {...r, requestedQty: e.target.value || null} : r)); setResult(null); }} /></td></tr>)}</tbody></table></div><button type="button" disabled={busy} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold disabled:opacity-50" onClick={() => void resolve()}>Проверить остатки</button></>}
      {result && <><h3 className="font-semibold">Результаты</h3><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Артикул</th><th>Статус</th><th>Склад</th><th>Остаток</th><th>Цена</th></tr></thead><tbody>{result.articleResolution.flatMap((row, i) => row.variants.length ? row.variants.map((v, j) => <tr key={`${i}-${j}`}><td>{row.article}</td><td>{statuses[row.status]}</td><td>{v.warehouseName}</td><td>{v.physicalStock}</td><td>{v.price}</td></tr>) : [<tr key={i}><td>{row.article}</td><td>{statuses[row.status]}</td><td>—</td><td>—</td><td>—</td></tr>])}</tbody></table></div><button type="button" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold" onClick={() => download(result.workbook)}>Скачать Excel</button><div className="mt-2 flex flex-wrap items-center gap-3"><button type="button" disabled={!result.offerWorkbook} className="rounded-lg border border-slate-400 px-4 py-2 font-semibold disabled:opacity-50" onClick={() => { if (result.offerWorkbook) download(result.offerWorkbook); }}>Скачать Excel по шаблону КП</button><output className="text-sm">{result.offerWorkbook ? `Позиций в файле: ${result.offerExport.includedRows}` : 'Нет позиций с остатком и положительной ценой для файла по шаблону КП.'}</output></div>{result.offerExport.warnings.map((warning, i) => <output key={i} className="block text-sm">{warning}</output>)}</>}
      </>}
    </section>
  </div></>;
}
