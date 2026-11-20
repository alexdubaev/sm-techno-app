import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { StockValuationPanel } from '@/components/stock/stock-valuation-panel';
import * as api from '@/lib/stock-valuation-api';
vi.mock('@/lib/stock-valuation-api', () => ({ intakeValuation: vi.fn(), resolveValuation: vi.fn() }));
it('reviews dropped articles and resolves the edited row without a client', async () => {
  vi.mocked(api.intakeValuation).mockResolvedValue({ rows: [{ article: '001', requestedQty: null, sourceRow: 1 }], warnings: [] });
  vi.mocked(api.resolveValuation).mockResolvedValue({ resolvedAt: 'now', articleResolution: [{ article: '001', requestedQty: '3', sourceRow: 1, status: 'matched', variants: [{ itemId: 1, warehouseId: 2, warehouseName: 'Склад', physicalStock: 5, price: 12 }] }], workbook: { filename: 'stock.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: '' }, offerWorkbook: null, offerExport: { includedRows: 0, excludedNoPriceRows: 1, warnings: ['Нет цены'] } });
  render(<StockValuationPanel />);
  const toggle = screen.getByRole('button', { name: 'Развернуть' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', {name: 'Вставить список'})).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', {name: 'Свернуть'})).toHaveAttribute('aria-expanded', 'true');
  const input = screen.getByLabelText('Выбрать файл или фото');
  fireEvent.drop(input.parentElement!.parentElement!, { dataTransfer: { files: [new File(['001'], 'list.txt')] } });
  expect(api.intakeValuation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Распознать' }));
  fireEvent.change(await screen.findByLabelText('Количество строки 1'), {target: {value: '3'}});
  fireEvent.click(screen.getByRole('button', { name: 'Проверить остатки' }));
  await waitFor(() => expect(api.resolveValuation).toHaveBeenCalledWith([{ article: '001', requestedQty: '3', sourceRow: 1 }], expect.any(AbortSignal)));
  expect(await screen.findByRole('cell', { name: 'Склад' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Скачать Excel' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Скачать Excel по шаблону КП' })).toBeDisabled();
  expect(screen.getByText('Нет цены')).toBeVisible();
});

it('validates pasted text and photos before explicit recognition, and clears stale rows', async () => {
  vi.mocked(api.intakeValuation).mockClear();
  vi.mocked(api.intakeValuation).mockResolvedValue({ rows: [{ article: 'A', requestedQty: null, sourceRow: 1 }], warnings: [] });
  render(<StockValuationPanel />);
  fireEvent.click(screen.getByRole('button', {name: 'Развернуть'}));
  fireEvent.click(screen.getByRole('button', {name: 'Вставить список'}));
  fireEvent.click(screen.getByRole('button', {name: 'Распознать'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Вставьте список');
  fireEvent.change(screen.getByLabelText('Список артикулов'), {target: {value: 'A\t2\nB\t3'}});
  expect(api.intakeValuation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Распознать'}));
  await screen.findByLabelText('Артикул строки 1');
  const file = vi.mocked(api.intakeValuation).mock.calls[0][0];
  expect(file.name).toBe('stock.txt');
  fireEvent.change(screen.getByLabelText('Выбрать файл или фото'), {target: {files: [new File(['image'], 'photo.jpg', {type: 'image/jpeg'})]}});
  expect(screen.queryByLabelText('Артикул строки 1')).not.toBeInTheDocument();
  expect(api.intakeValuation).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name: 'Распознать'}));
  await waitFor(() => expect(api.intakeValuation).toHaveBeenCalledTimes(2));
});

it('preserves the selected source and pasted list when collapsed and reopened', () => {
  render(<StockValuationPanel />);
  fireEvent.click(screen.getByRole('button', {name: 'Развернуть'}));
  fireEvent.change(screen.getByLabelText('Выбрать файл или фото'), {target: {files: [new File(['001'], 'list.txt')]}});
  expect(screen.getByText(/list.txt/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name: 'Свернуть'}));
  expect(screen.getByRole('button', {name: 'Развернуть'})).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', {name: 'Развернуть'}));
  expect(screen.getByText(/list.txt/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name: 'Вставить список'}));
  fireEvent.change(screen.getByLabelText('Список артикулов'), {target: {value: 'A\t2\nB'}});
  fireEvent.click(screen.getByRole('button', {name: 'Свернуть'}));
  fireEvent.click(screen.getByRole('button', {name: 'Развернуть'}));
  expect(screen.getByLabelText('Список артикулов')).toHaveValue('A\t2\nB');
});

it('chooses columns in place, keeps the choice when collapsed and reviews the original rows before lookup', async () => {
  vi.mocked(api.intakeValuation).mockReset();
  const preview: api.TableSelection = { fileSha256: 'a'.repeat(64),
    sheets: [{ sheetIndex: 1, name: 'Заявка', columnCount: 2, lastSourceRow: 3,
      sampleRows: [{ sourceRow: 1, cells: ['Код поставщика', 'Штук'] }, { sourceRow: 2, cells: ['00123', '2'] }, { sourceRow: 3, cells: ['R-7', '0'] }] }],
    mappings: [{ sheetIndex: 1, articleColumn: null, quantityColumn: null, firstRow: 1, lastRow: 3 }] };
  vi.mocked(api.intakeValuation).mockResolvedValueOnce({ rows: [], warnings: [], tableSelection: preview });
  vi.mocked(api.intakeValuation).mockRejectedValueOnce(Error('Повторите попытку'));
  vi.mocked(api.intakeValuation).mockResolvedValueOnce({ rows: [{ article: '00123', requestedQty: '2', sourceRow: 2 }], warnings: [] });
  render(<StockValuationPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
  const file = new File(['test'], 'articles.xlsx');
  fireEvent.change(screen.getByLabelText('Выбрать файл или фото'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Распознать' }));
  expect(await screen.findByRole('region', { name: 'Выбор столбцов таблицы' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Применить столбцы' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Проверить остатки' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Столбец артикулов, лист 1'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Столбец количества, лист 1'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Первая строка, лист 1'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
  expect(screen.getByLabelText('Столбец артикулов, лист 1')).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: 'Применить столбцы' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Повторите попытку');
  expect(screen.getByLabelText('Столбец количества, лист 1')).toHaveValue('2');
  fireEvent.click(screen.getByRole('button', { name: 'Применить столбцы' }));
  expect(await screen.findByLabelText('Артикул строки 2')).toHaveValue('00123');
  expect(screen.queryByRole('region', { name: 'Выбор столбцов таблицы' })).not.toBeInTheDocument();
  expect(vi.mocked(api.intakeValuation).mock.calls[2]).toEqual([file, expect.any(AbortSignal), {
    fileSha256: preview.fileSha256, sheets: [{ sheetIndex: 1, articleColumn: 1, quantityColumn: 2, firstRow: 2, lastRow: 3 }],
  }]);
});

it('discards a late table preview when a different file is selected', async () => {
  vi.mocked(api.intakeValuation).mockReset();
  let finish!: (value: Awaited<ReturnType<typeof api.intakeValuation>>) => void;
  vi.mocked(api.intakeValuation).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<StockValuationPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
  fireEvent.change(screen.getByLabelText('Выбрать файл или фото'), { target: { files: [new File(['old'], 'old.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Распознать' }));
  fireEvent.change(screen.getByLabelText('Выбрать файл или фото'), { target: { files: [new File(['new'], 'new.xlsx')] } });
  finish({ rows: [], warnings: [], tableSelection: { fileSha256: 'old', mappings: [], sheets: [] } });
  await waitFor(() => expect(screen.getByText(/new.xlsx/)).toBeVisible());
  expect(screen.queryByRole('region', { name: 'Выбор столбцов таблицы' })).not.toBeInTheDocument();
});
