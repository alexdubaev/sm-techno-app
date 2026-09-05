export function sortCatalogForExactSku<T extends { sku: string }>(
  items: T[],
  search: string,
) {
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  if (!normalizedSearch) {
    return items;
  }

  return [...items].sort((left, right) => {
    const leftIsExact =
      left.sku.trim().toLocaleLowerCase('ru-RU') === normalizedSearch;
    const rightIsExact =
      right.sku.trim().toLocaleLowerCase('ru-RU') === normalizedSearch;
    return Number(rightIsExact) - Number(leftIsExact);
  });
}

export function mergeCatalogPage<T>(
  current: T[],
  nextPage: T[],
  getKey: (item: T) => string,
) {
  const seen = new Set(current.map(getKey));
  return [...current, ...nextPage.filter((item) => !seen.has(getKey(item)))];
}

export function ensureStockItemDetail<T>(item: T | null) {
  if (!item) {
    throw new Error('Товар больше не доступен.');
  }
  return item;
}

export function createLatestRequestTracker() {
  let currentRequest = 0;

  return {
    begin() {
      currentRequest += 1;
      return currentRequest;
    },
    isCurrent(requestId: number) {
      return requestId === currentRequest;
    },
  };
}
