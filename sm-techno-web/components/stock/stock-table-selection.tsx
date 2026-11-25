'use client';

import { Table } from '@/components/ui/table';
import type { TableMapping, TableSelection } from '@/lib/stock-valuation-api';

function columnName(index: number): string {
  let name = '';
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

export function StockTableSelection({ preview, mappings, onChange, onApply, busy }: {
  preview: TableSelection; mappings: TableMapping[]; onChange: (value: TableMapping[]) => void;
  onApply: () => void; busy: boolean;
}) {
  const invalid = mappings.every(m => m.skip) || mappings.some(m => !m.skip && (
    !m.articleColumn || m.articleColumn === m.quantityColumn || !Number.isInteger(m.firstRow) ||
    !Number.isInteger(m.lastRow) || m.firstRow < 1 || m.lastRow < m.firstRow ||
    m.lastRow > (preview.sheets.find(s => s.sheetIndex === m.sheetIndex)?.lastSourceRow ?? 0)
  ));
  function update(index: number, patch: Partial<TableMapping>) { onChange(mappings.map((m, i) => i === index ? { ...m, ...patch } : m)); }
  return <section aria-label="Выбор столбцов таблицы" className="min-w-0 space-y-4 rounded-xl border border-slate-300 bg-slate-50 p-3 sm:p-4">
    <div><h3 className="font-semibold">Укажите столбцы по образцу</h3><p className="mt-1 text-sm text-slate-600">Не удалось уверенно определить структуру. Выберите артикулы и, если нужно, количество. Менять исходный файл не требуется.</p></div>
    {preview.sheets.map((sheet, index) => {
      const mapping = mappings[index];
      const columns = Array.from({ length: sheet.columnCount }, (_, i) => i + 1);
      const optionText = (column: number) => {
        const sample = sheet.sampleRows.map(r => r.cells[column - 1]).find(Boolean);
        return `${columnName(column)}${sample ? ` — ${sample.slice(0, 55)}` : ''}`;
      };
      return <fieldset key={sheet.sheetIndex} disabled={busy} className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <legend className="max-w-full break-words px-1 text-sm font-semibold">Лист: {sheet.name}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={!mapping.skip} onChange={e => update(index, { skip: !e.target.checked })} />Использовать этот лист</label>
        {!mapping.skip && <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm">Столбец артикулов<select aria-label={`Столбец артикулов, лист ${sheet.sheetIndex}`} value={mapping.articleColumn ?? ''} onChange={e => update(index, { articleColumn: e.target.value ? Number(e.target.value) : null })} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-white px-2"><option value="">Выберите столбец</option>{columns.map(c => <option key={c} value={c}>{optionText(c)}</option>)}</select></label>
            <label className="min-w-0 text-sm">Столбец количества<select aria-label={`Столбец количества, лист ${sheet.sheetIndex}`} value={mapping.quantityColumn ?? ''} onChange={e => update(index, { quantityColumn: e.target.value ? Number(e.target.value) : null })} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-white px-2"><option value="">Количество не указано</option>{columns.map(c => <option key={c} value={c}>{optionText(c)}</option>)}</select></label>
            <label className="text-sm">Первая строка с товарами<input aria-label={`Первая строка, лист ${sheet.sheetIndex}`} type="number" min={1} max={sheet.lastSourceRow} value={mapping.firstRow || ''} onChange={e => update(index, { firstRow: Number(e.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            <label className="text-sm">Последняя строка с товарами<input aria-label={`Последняя строка, лист ${sheet.sheetIndex}`} type="number" min={1} max={sheet.lastSourceRow} value={mapping.lastRow || ''} onChange={e => update(index, { lastRow: Number(e.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          </div>
          <div className="max-h-64 max-w-full overflow-auto rounded-lg border"><Table unstyled className="min-w-full text-left text-sm"><caption className="p-2 text-left text-xs text-slate-600">Образец первых и последних строк. Номера соответствуют исходному файлу.</caption><thead><tr><th className="p-2">Строка</th>{columns.map(c => <th key={c} className="p-2">{columnName(c)}</th>)}</tr></thead><tbody>{sheet.sampleRows.map(row => <tr key={row.sourceRow}><th scope="row" className="border-t p-2">{row.sourceRow}</th>{columns.map(c => <td key={c} className={`max-w-56 break-words border-t p-2 ${mapping.articleColumn === c ? 'bg-amber-50 font-semibold' : ''}`}>{row.cells[c - 1] || '—'}</td>)}</tr>)}</tbody></Table></div>
        </>}
      </fieldset>;
    })}
    {invalid && <p className="text-sm text-slate-600">Выберите разные столбцы для артикулов и количества и проверьте границы строк хотя бы на одном листе.</p>}
    <button type="button" disabled={busy || invalid} onClick={onApply} className="min-h-11 w-full rounded-lg bg-amber-400 px-4 py-2 font-semibold disabled:opacity-50 sm:w-auto">Применить столбцы</button>
  </section>;
}
