import { requestJsonWithInit } from '@/lib/api';
export type ValuationRow = { article: string; requestedQty: string | null; sourceRow: number };
export type Resolution = ValuationRow & { status: 'matched' | 'not_found' | 'ambiguous' | 'zero_stock' | 'duplicate'; variants: { itemId: number; warehouseId: number; warehouseName: string; physicalStock: number; price: number }[] };
export type ValuationResult = { resolvedAt: string; articleResolution: Resolution[]; workbook: { filename: string; mediaType: string; base64: string } };
export function intakeValuation(file: File, signal: AbortSignal) {
 const data = new FormData(); data.append('file', file);
 return requestJsonWithInit<{rows: ValuationRow[]; warnings: string[]}>('/api/stock/valuation/intake', { method: 'POST', body: data, signal }, 'Не удалось распознать файл.', { timeoutMs: 360000 });
}
export function resolveValuation(rows: ValuationRow[], signal: AbortSignal) {
 return requestJsonWithInit<ValuationResult>('/api/stock/valuation/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({rows}), signal }, 'Не удалось получить остатки.', { timeoutMs: 60000 });
}
