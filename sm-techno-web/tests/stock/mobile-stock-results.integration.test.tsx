import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MobileStockResults } from '@/components/stock-page';
import type { StockItem } from '@/lib/types';

const item: StockItem = {
  id: 1,
  sku: 'SJ21033',
  name: 'Насос гидравлический',
  printName: 'Насос гидравлический',
  categoryName: '',
  groupName: '',
  createdAt: '',
  quantity: 2,
  price: 48500,
  onecKey: '',
  unitKey: '',
  unitName: 'шт.',
  hasStock: true,
  isLinkedToOneC: true,
  warehouseCount: 1,
  topWarehouseName: 'Санкт-Петербург',
  warehouseSummary: 'Санкт-Петербург',
  catalogRowKey: '1:1',
  rowWarehouseId: 1,
  rowWarehouseName: 'Санкт-Петербург',
  rowQuantity: 2,
  rowRack: 'Стеллаж 3',
  rowCell: 'Ячейка 11',
  rowLocationLabel: 'Стеллаж 3 · Ячейка 11',
  warehouses: [],
};

describe('MobileStockResults', () => {
  test('shows the warehouse, quantity and storage location before opening the item', async () => {
    const onOpenItem = vi.fn();
    render(<MobileStockResults catalog={[item]} onOpenItem={onOpenItem} />);

    expect(screen.getByText('SJ21033')).toBeVisible();
    expect(screen.getByText('Насос гидравлический')).toBeVisible();
    expect(screen.getByText('Санкт-Петербург')).toBeVisible();
    expect(screen.getByText('2 шт.')).toBeVisible();
    expect(screen.getByText('Стеллаж 3 · Ячейка 11')).toBeVisible();
    expect(
      screen.getByText(
        (content) => content.replace(/\u00a0/g, ' ') === '48 500,00 ₽',
      ),
    ).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /SJ21033/i }));
    expect(onOpenItem).toHaveBeenCalledWith(item);
  });

  test('labels zero stock without rendering an empty location row', () => {
    render(
      <MobileStockResults
        catalog={[{ ...item, rowQuantity: 0, rowLocationLabel: '' }]}
        onOpenItem={vi.fn()}
      />,
    );

    expect(screen.getByText('Нет в наличии')).toBeVisible();
    expect(screen.queryByText('Стеллаж 3 · Ячейка 11')).not.toBeInTheDocument();
  });
});
