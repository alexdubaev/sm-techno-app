import { requestJsonWithInit } from '@/lib/api';
export type ValuationRow = { article: string; requestedQty: string | null; sourceRow: number };
export type Resolution = ValuationRow & { status: 'matched' | 'not_found' | 'ambiguous' | 'zero_stock' | 'duplicate'; variants: { itemId: number; warehouseId: number; warehouseName: string; physicalStock: number; price: number }[] };
export type Workbook = { filename: string; mediaType: string; base64: string };
export type ValuationResult = { resolvedAt: string; articleResolution: Resolution[]; workbook: Workbook; offerWorkbook: Workbook | null; offerExport: { includedRows: number; excludedNoPriceRows: number; warnings: string[] } };
export type TableMapping = { sheetIndex: number; articleColumn: number | null; quantityColumn: number | null; firstRow: number; lastRow: number; skip?: boolean };
export type TableSelection = { fileSha256: string; mappings: TableMapping[]; sheets: { sheetIndex: number; name: string; columnCount: number; lastSourceRow: number; sampleRows: { sourceRow: number; cells: string[] }[] }[] };
export function intakeValuation(file: File, signal: AbortSignal, selection?: { fileSha256: string; sheets: TableMapping[] }) {
 const data = new FormData(); data.append('file', file);
 const table = /\.(xlsx|xls|csv|tsv)$/i.test(file.name);
 if (selection) data.append('selection', JSON.stringify(selection));
 return requestJsonWithInit<{rows: ValuationRow[]; warnings: string[]; tableSelection?: TableSelection}>(table ? '/api/stock/valuation/table-intake' : '/api/stock/valuation/intake', { method: 'POST', body: data, signal }, 'Не удалось распознать файл.', { timeoutMs: 360000 });
}
export function resolveValuation(rows: ValuationRow[], signal: AbortSignal) {
 return requestJsonWithInit<ValuationResult>('/api/stock/valuation/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({rows}), signal }, 'Не удалось получить остатки.', { timeoutMs: 60000 });
}
