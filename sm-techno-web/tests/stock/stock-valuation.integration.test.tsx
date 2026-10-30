import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { StockValuationPanel } from '@/components/stock/stock-valuation-panel';
import * as api from '@/lib/stock-valuation-api';
vi.mock('@/lib/stock-valuation-api', () => ({ intakeValuation: vi.fn(), resolveValuation: vi.fn() }));
it('reviews dropped articles and resolves the edited row without a client', async () => {
  vi.mocked(api.intakeValuation).mockResolvedValue({ rows: [{ article: '001', requestedQty: null, sourceRow: 1 }], warnings: [] });
  vi.mocked(api.resolveValuation).mockResolvedValue({ resolvedAt: 'now', articleResolution: [{ article: '001', requestedQty: '3', sourceRow: 1, status: 'matched', variants: [{ itemId: 1, warehouseId: 2, warehouseName: 'Склад', physicalStock: 5, price: 12 }] }], workbook: { filename: 'stock.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: '' } });
  render(<StockValuationPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Расценить список артикулов' }));
  const input = screen.getByLabelText('Выбрать файл с артикулами');
  fireEvent.drop(input.parentElement!.parentElement!, { dataTransfer: { files: [new File(['001'], 'list.txt')] } });
  fireEvent.change(await screen.findByLabelText('Количество строки 1'), {target: {value: '3'}});
  fireEvent.click(screen.getByRole('button', { name: 'Проверить остатки' }));
  await waitFor(() => expect(api.resolveValuation).toHaveBeenCalledWith([{ article: '001', requestedQty: '3', sourceRow: 1 }], expect.any(AbortSignal)));
  expect(await screen.findByRole('cell', { name: 'Склад' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Скачать Excel' })).toBeVisible();
});
