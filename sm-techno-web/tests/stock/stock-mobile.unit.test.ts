import { describe, expect, test } from 'vitest';

import {
  createLatestRequestTracker,
  ensureStockItemDetail,
  mergeCatalogPage,
  sortCatalogForExactSku,
} from '@/lib/stock-mobile';

describe('sortCatalogForExactSku', () => {
  test('moves an exact article match ahead of other search results', () => {
    const items = [
      { sku: 'SJ21033-ALT', name: 'Альтернативный насос' },
      { sku: 'SJ21033', name: 'Насос гидравлический' },
      { sku: 'SJ21033-2', name: 'Ремкомплект' },
    ];

    expect(
      sortCatalogForExactSku(items, 'sj21033').map((item) => item.sku),
    ).toEqual(['SJ21033', 'SJ21033-ALT', 'SJ21033-2']);
  });
});

describe('mergeCatalogPage', () => {
  test('keeps already visible rows when the next catalog page arrives', () => {
    expect(
      mergeCatalogPage(
        [{ catalogRowKey: '1:1', sku: 'SJ21033' }],
        [{ catalogRowKey: '2:1', sku: 'RE504836' }],
        (item) => item.catalogRowKey,
      ),
    ).toEqual([
      { catalogRowKey: '1:1', sku: 'SJ21033' },
      { catalogRowKey: '2:1', sku: 'RE504836' },
    ]);
  });

  test('uses the caller fallback key when catalog row keys are blank', () => {
    expect(
      mergeCatalogPage(
        [{ id: 1, rowWarehouseId: 1, catalogRowKey: '' }],
        [{ id: 2, rowWarehouseId: 1, catalogRowKey: '' }],
        (item) => item.catalogRowKey || `${item.id}:${item.rowWarehouseId}`,
      ),
    ).toHaveLength(2);
  });
});

describe('ensureStockItemDetail', () => {
  test('fails when the detail endpoint reports that the item no longer exists', () => {
    expect(() => ensureStockItemDetail(null)).toThrow(
      'Товар больше не доступен.',
    );
  });
});

describe('createLatestRequestTracker', () => {
  test('rejects a late result after a newer item request begins', () => {
    const tracker = createLatestRequestTracker();
    const firstRequest = tracker.begin();
    const secondRequest = tracker.begin();

    expect(tracker.isCurrent(firstRequest)).toBe(false);
    expect(tracker.isCurrent(secondRequest)).toBe(true);
  });
});
