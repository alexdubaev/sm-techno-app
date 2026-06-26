"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import {
  downloadClientPriceFile,
  fetchMeta,
  fetchStockCatalog,
  fetchStockItem,
  fetchSystemSettings,
  fetchWarehouses,
} from "@/lib/api";
import {
  loadDraftLinesFromStorage,
  loadStockPageStateFromStorage,
  saveDraftLinesToStorage,
  saveStockPageStateToStorage,
  type StockPageViewState,
} from "@/lib/storage";
import type {
  AppMeta,
  DraftLine,
  StockItem,
  SystemSettings,
  Warehouse,
  WarehouseBalance,
} from "@/lib/types";
import { calculateAmountWithoutVat, calculateVatAmount, parseVatPercent } from "@/lib/vat";

const STOCK_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "sku", width: 116, minWidth: 88, compactMinWidth: 76, maxWidth: 180 },
  { key: "name", width: 264, minWidth: 178, compactMinWidth: 146, maxWidth: 440 },
  { key: "warehouse", width: 156, minWidth: 110, compactMinWidth: 88, maxWidth: 240 },
  { key: "category", width: 142, minWidth: 96, compactMinWidth: 82, maxWidth: 220 },
  { key: "stock", width: 88, minWidth: 70, compactMinWidth: 60, maxWidth: 130 },
  { key: "price", width: 96, minWidth: 78, compactMinWidth: 70, maxWidth: 150 },
  { key: "amount", width: 110, minWidth: 88, compactMinWidth: 78, maxWidth: 170 },
];

const DEFAULT_STATE: StockPageViewState = {
  searchInput: "",
  category: "",
  onlyInStock: false,
  activeWarehouseId: null,
  page: 1,
  pageSize: 20,
  selectedItemId: null,
  selectionCleared: false,
  selectedQuantityInput: "1",
};

const CLIENT_PRICE_LABEL = "\u041f\u0440\u0430\u0439\u0441 \u0434\u043b\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430";
const CLIENT_PRICE_LOADING_LABEL = "\u0413\u043e\u0442\u043e\u0432\u0438\u043c \u0444\u0430\u0439\u043b...";
const CLIENT_PRICE_EXPORT_ERROR =
  "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u0440\u0430\u0439\u0441 \u0434\u043b\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430.";

export function StockPage() {
  const router = useRouter();
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [catalog, setCatalog] = useState<StockItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(DEFAULT_STATE.page);
  const [pageSize, setPageSize] = useState(DEFAULT_STATE.pageSize);
  const [searchInput, setSearchInput] = useState(DEFAULT_STATE.searchInput);
  const [search, setSearch] = useState(DEFAULT_STATE.searchInput);
  const [category, setCategory] = useState(DEFAULT_STATE.category);
  const [onlyInStock, setOnlyInStock] = useState(DEFAULT_STATE.onlyInStock);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(
    DEFAULT_STATE.activeWarehouseId,
  );
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    DEFAULT_STATE.selectedItemId,
  );
  const [selectionCleared, setSelectionCleared] = useState(DEFAULT_STATE.selectionCleared);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedQuantityInput, setSelectedQuantityInput] = useState(
    DEFAULT_STATE.selectedQuantityInput,
  );
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingClientPrice, setIsExportingClientPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-stock-table-widths-v7",
    STOCK_TABLE_COLUMNS,
    { allowTightFit: true },
  );

  useEffect(() => {
    const savedDraft = loadDraftLinesFromStorage();
    if (savedDraft) {
      setDraftLines(sanitizeDraftLines(savedDraft));
    }

    const savedState = loadStockPageStateFromStorage();
    if (savedState) {
      if (typeof savedState.searchInput === "string") {
        setSearchInput(savedState.searchInput);
        setSearch(savedState.searchInput);
      }
      if (typeof savedState.category === "string") {
        setCategory(savedState.category);
      }
      if (typeof savedState.onlyInStock === "boolean") {
        setOnlyInStock(savedState.onlyInStock);
      }
      if (
        savedState.activeWarehouseId === null ||
        typeof savedState.activeWarehouseId === "number"
      ) {
        setActiveWarehouseId(savedState.activeWarehouseId ?? null);
      }
      if (typeof savedState.page === "number" && savedState.page > 0) {
        setPage(savedState.page);
      }
      if (typeof savedState.pageSize === "number" && savedState.pageSize > 0) {
        setPageSize(savedState.pageSize);
      }
      if (
        savedState.selectedItemId === null ||
        typeof savedState.selectedItemId === "number"
      ) {
        setSelectedItemId(savedState.selectedItemId ?? null);
      }
      if (typeof savedState.selectionCleared === "boolean") {
        setSelectionCleared(savedState.selectionCleared);
      }
      if (typeof savedState.selectedQuantityInput === "string") {
        setSelectedQuantityInput(savedState.selectedQuantityInput);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveDraftLinesToStorage(draftLines);
  }, [draftLines, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveStockPageStateToStorage({
      searchInput,
      category,
      onlyInStock,
      activeWarehouseId,
      page,
      pageSize,
      selectedItemId,
      selectionCleared,
      selectedQuantityInput,
    });
  }, [
    activeWarehouseId,
    category,
    isHydrated,
    onlyInStock,
    page,
    pageSize,
    searchInput,
    selectedItemId,
    selectedQuantityInput,
    selectionCleared,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void fetchMeta()
      .then(setMeta)
      .catch(() => {
        setError("Не удалось загрузить данные приложения.");
      });

    void fetchSystemSettings()
      .then(setSettings)
      .catch(() => {
        setSettings(null);
      });

    void fetchWarehouses()
      .then(setWarehouses)
      .catch(() => {
        setWarehouses([]);
      });
  }, []);

  useEffect(() => {
    if (activeWarehouseId === null) {
      return;
    }

    if (!warehouses.some((warehouse) => warehouse.id === activeWarehouseId)) {
      setActiveWarehouseId(null);
    }
  }, [activeWarehouseId, warehouses]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void fetchStockCatalog({
      search,
      category,
      warehouseId: activeWarehouseId,
      onlyInStock,
      page,
      pageSize,
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        setCatalog(response.items);
        setCategories(response.categories);
        setTotal(response.total);

        if (response.items.length === 0) {
          if (selectedItemId !== null) {
            const persisted = await fetchStockItem(selectedItemId);
            if (!cancelled) {
              setSelectedItem(persisted);
              if (!persisted) {
                setSelectedItemId(null);
              }
            }
          } else {
            setSelectedItem(null);
          }
          return;
        }

        if (selectedItemId === null) {
          if (selectionCleared) {
            setSelectedItem(null);
            return;
          }

          const firstItem = response.items[0];
          setSelectedItemId(firstItem.id);
          setSelectedItem(firstItem);
          return;
        }

        const matched = response.items.find((item) => item.id === selectedItemId);
        if (matched) {
          setSelectedItem(matched);
          void fetchStockItem(selectedItemId).then((detailedItem) => {
            if (!cancelled && detailedItem) {
              setSelectedItem(detailedItem);
            }
          });
          return;
        }

        const persisted = await fetchStockItem(selectedItemId);
        if (!cancelled) {
          setSelectedItem(persisted);
          if (!persisted) {
            setSelectedItemId(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось загрузить список остатков.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeWarehouseId,
    category,
    onlyInStock,
    page,
    pageSize,
    search,
    selectedItemId,
    selectionCleared,
  ]);

  const selectedWarehouseOptions = useMemo(
    () => getWarehouseOptions(selectedItem, activeWarehouseId),
    [activeWarehouseId, selectedItem],
  );

  useEffect(() => {
    if (!selectedItem) {
      setSelectedWarehouseId(null);
      return;
    }

    if (selectedWarehouseOptions.length === 0) {
      setSelectedWarehouseId(null);
      return;
    }

    if (
      selectedWarehouseId !== null &&
      selectedWarehouseOptions.some((warehouse) => warehouse.warehouseId === selectedWarehouseId)
    ) {
      return;
    }

    const draftMatch = draftLines.find(
      (line) =>
        line.itemId === selectedItem.id &&
        selectedWarehouseOptions.some((warehouse) => warehouse.warehouseId === line.warehouseId),
    );

    if (draftMatch) {
      setSelectedWarehouseId(draftMatch.warehouseId);
      return;
    }

    const preferredWarehouse = pickPreferredWarehouse(selectedItem, activeWarehouseId);
    setSelectedWarehouseId(
      preferredWarehouse?.warehouseId ?? selectedWarehouseOptions[0]?.warehouseId ?? null,
    );
  }, [
    activeWarehouseId,
    draftLines,
    selectedItem,
    selectedWarehouseId,
    selectedWarehouseOptions,
  ]);

  const selectedWarehouseBalance = useMemo(() => {
    if (!selectedItem || selectedWarehouseId === null) {
      return null;
    }

    return (
      selectedWarehouseOptions.find(
        (warehouse) => warehouse.warehouseId === selectedWarehouseId,
      ) ?? null
    );
  }, [selectedItem, selectedWarehouseId, selectedWarehouseOptions]);

  const selectedLineKey = useMemo(() => {
    if (!selectedItem || selectedWarehouseId === null) {
      return null;
    }

    return buildDraftLineKey(selectedItem.id, selectedWarehouseId);
  }, [selectedItem, selectedWarehouseId]);

  const selectedDraftLine = useMemo(() => {
    if (!selectedLineKey) {
      return null;
    }

    return draftLines.find((line) => line.lineId === selectedLineKey) ?? null;
  }, [draftLines, selectedLineKey]);

  useEffect(() => {
    if (!selectedItem) {
      setSelectedQuantityInput("1");
      return;
    }

    if (selectedDraftLine) {
      setSelectedQuantityInput(formatQuantityInput(selectedDraftLine.quantity));
      return;
    }

    const nextQuantity =
      getAvailableUnits(selectedWarehouseBalance?.quantity ?? 0) > 0 ? 1 : 0;
    setSelectedQuantityInput(formatQuantityInput(nextQuantity));
  }, [selectedDraftLine, selectedItem, selectedWarehouseBalance]);

  const vatPercent = useMemo(
    () => parseVatPercent(settings?.vat_percent),
    [settings?.vat_percent],
  );
  const pricesIncludeVat = settings
    ? settings.vat_included === "1" && settings.sum_includes_vat === "1"
    : true;

  const totals = useMemo(() => {
    const positions = draftLines.length;
    const quantity = draftLines.reduce((sum, line) => sum + line.quantity, 0);
    const grossAmount = draftLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const vatAmount = calculateVatAmount(grossAmount, vatPercent, {
      includedInPrice: pricesIncludeVat,
    });
    const amountWithoutVat = calculateAmountWithoutVat(grossAmount, vatPercent, {
      includedInPrice: pricesIncludeVat,
    });

    return {
      positions,
      quantity,
      grossAmount,
      vatAmount,
      amountWithoutVat,
    };
  }, [draftLines, pricesIncludeVat, vatPercent]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const catalogCount = meta?.catalogCount ?? total;
  const priceLoaded = Boolean(meta?.priceLoaded);
  const selectedAvailableQuantity = getAvailableUnits(selectedWarehouseBalance?.quantity ?? 0);
  const selectedQuantityParsed = parseQuantityInput(selectedQuantityInput);
  const selectedQuantityIsValid =
    Number.isFinite(selectedQuantityParsed) && selectedQuantityParsed > 0;
  const selectedQuantityWithinStock =
    selectedQuantityIsValid && selectedQuantityParsed <= selectedAvailableQuantity;
  const canAddSelectedItem =
    Boolean(selectedItem) &&
    Boolean(selectedWarehouseBalance) &&
    selectedAvailableQuantity > 0 &&
    selectedQuantityWithinStock;

  const selectedWarehouseName =
    selectedWarehouseBalance?.warehouseName ??
    (activeWarehouseId !== null
      ? warehouses.find((warehouse) => warehouse.id === activeWarehouseId)?.name ?? "Склад"
      : "Выберите склад");

  const activeWarehouseName = useMemo(() => {
    if (activeWarehouseId === null) {
      return "Все склады";
    }

    return (
      warehouses.find((warehouse) => warehouse.id === activeWarehouseId)?.name ??
      "Выбранный склад"
    );
  }, [activeWarehouseId, warehouses]);

  const handleClientPriceExport = async () => {
    if (!priceLoaded || isExportingClientPrice) {
      return;
    }

    setError(null);
    setIsExportingClientPrice(true);
    try {
      await downloadClientPriceFile({
        search,
        category,
        warehouseId: activeWarehouseId,
        onlyInStock,
      });
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : CLIENT_PRICE_EXPORT_ERROR);
    } finally {
      setIsExportingClientPrice(false);
    }
  };

  const setAndPersistDraftLines = (
    updater: DraftLine[] | ((previous: DraftLine[]) => DraftLine[]),
  ) => {
    setDraftLines((previous) => {
      const next =
        typeof updater === "function"
          ? (updater as (previous: DraftLine[]) => DraftLine[])(previous)
          : updater;
      saveDraftLinesToStorage(next);
      return next;
    });
  };

  const selectItem = (item: StockItem) => {
    setSelectedItemId(item.id);
    setSelectedItem(item);
    setSelectionCleared(false);

    void fetchStockItem(item.id).then((detailedItem) => {
      if (detailedItem) {
        setSelectedItem(detailedItem);
      }
    });
  };

  const clearSelection = () => {
    setSelectedItemId(null);
    setSelectedItem(null);
    setSelectedWarehouseId(null);
    setSelectedQuantityInput("1");
    setSelectionCleared(true);
  };

  const updateDraftLine = (
    item: StockItem,
    warehouse: WarehouseBalance,
    quantity: number | string,
  ) => {
    const safeQuantity = clampQuantity(quantity, warehouse.quantity);
    const lineId = buildDraftLineKey(item.id, warehouse.warehouseId);

    setAndPersistDraftLines((previous) => {
      if (safeQuantity <= 0) {
        return previous.filter((line) => line.lineId !== lineId);
      }

      const nextLine: DraftLine = {
        lineId,
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        categoryName: item.categoryName,
        price: item.price,
        quantity: safeQuantity,
        available: item.quantity,
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        availableOnWarehouse: warehouse.quantity,
      };

      const existing = previous.find((line) => line.lineId === lineId);
      if (existing) {
        return previous.map((line) => (line.lineId === lineId ? nextLine : line));
      }

      return [...previous, nextLine];
    });
  };

  const removeDraftLine = (lineId: string) => {
    setAndPersistDraftLines((previous) => previous.filter((line) => line.lineId !== lineId));
  };

  const selectedItemTotalInDraft = useMemo(() => {
    if (!selectedItem) {
      return 0;
    }

    return draftLines
      .filter((line) => line.itemId === selectedItem.id)
      .reduce((sum, line) => sum + line.quantity, 0);
  }, [draftLines, selectedItem]);

  const renderTableBody = () => {
    if (!priceLoaded) {
      return (
        <EmptyStateCard
          icon={<PackageIcon className="h-5 w-5 stroke-[1.8]" />}
          title="Прайс не загружен"
          description="Сначала загрузите локальный прайс. После этого здесь появятся позиции для быстрого поиска."
          actionLabel="Перейти к прайсу"
          onAction={() => router.push("/work-with-price")}
        />
      );
    }

    if (isLoading && catalog.length === 0) {
      return <TableSkeleton />;
    }

    if (!isLoading && catalog.length === 0) {
      return (
        <EmptyStateCard
          icon={<SearchIcon className="h-5 w-5 stroke-[1.8]" />}
          title="Ничего не найдено"
          description="Попробуйте изменить запрос, выбрать другую категорию или снять фильтр по наличию."
        />
      );
    }

    return (
      <table
        className="min-w-full table-fixed border-separate border-spacing-0"
        style={{ width: tableWidth }}
      >
        <colgroup>
          {STOCK_TABLE_COLUMNS.map((column) => (
            <col key={column.key} style={{ width: getWidth(column.key) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
            <ResizableTableHeader
              columnKey="sku"
              label="Артикул"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="name"
              label="Наименование"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="warehouse"
              label="Склад"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="category"
              label="Категория"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="stock"
              label="Остаток"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="price"
              label="Цена"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
            <ResizableTableHeader
              columnKey="amount"
              label="Сумма"
              onResizeStart={onResizeStart}
              className="px-3 py-2 font-semibold"
            />
          </tr>
        </thead>
        <tbody>
          {catalog.map((item) => {
            const isSelected = selectedItemId === item.id;
            const itemLineCount = draftLines.filter((line) => line.itemId === item.id).length;
            const itemDraftQuantity = draftLines
              .filter((line) => line.itemId === item.id)
              .reduce((sum, line) => sum + line.quantity, 0);
            const availableUnits = getAvailableUnits(item.quantity);
            const hasStock = availableUnits > 0;

            return (
              <tr
                key={item.id}
                aria-selected={isSelected}
                onClick={() => selectItem(item)}
                className={[
                  "cursor-pointer transition-colors duration-200",
                  isSelected
                    ? "bg-[#FFF8D9] shadow-[inset_3px_0_0_#FFC400]"
                    : itemLineCount > 0
                      ? "bg-[#F3FBF6] shadow-[inset_3px_0_0_#16A34A]"
                      : "bg-white hover:bg-[#F8FBFF]",
                ].join(" ")}
              >
                <td
                  className={[
                    "border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] font-semibold tabular-nums",
                    item.isLinkedToOneC
                      ? "text-[var(--stock-ok)]"
                      : "text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <SelectionMarker selected={isSelected} inDraft={itemLineCount > 0} />
                    <span className="truncate">{item.sku || "-"}</span>
                  </div>
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] text-[var(--text-primary)]">
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">
                      {item.name}
                    </div>
                    {itemLineCount > 0 ? (
                      <div className="mt-0.5 text-[10px] text-[var(--stock-ok)]">
                        Уже в счете: {itemDraftQuantity} шт.
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] text-[var(--text-secondary)]">
                  <span
                    className="line-clamp-2"
                    title={item.warehouseSummary || formatWarehouseLabel(item, activeWarehouseName, activeWarehouseId)}
                  >
                    {formatWarehouseLabel(item, activeWarehouseName, activeWarehouseId)}
                  </span>
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] text-[var(--text-secondary)]">
                  {item.categoryName || "-"}
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] font-semibold tabular-nums">
                  <span className={hasStock ? "text-[var(--stock-ok)]" : "text-[var(--stock-empty)]"}>
                    {formatStockUnits(availableUnits)}
                  </span>
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatMoney(item.price)}
                </td>
                <td className="border-t border-[var(--border-color)] px-3 py-1.5 align-middle text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatMoney(item.price * availableUnits)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-2.5">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-[38rem]">
            <h1 className="text-[22px] font-[650] leading-none tracking-[-0.05em] text-[var(--text-primary)]">
              Остатки
            </h1>
            <p className="mt-1 text-[11px] leading-[17px] text-[var(--text-secondary)]">
              Быстрый поиск по прайсу и добавление позиций в счет клиента без лишних переходов.
            </p>
          </div>

          <div className="inline-flex min-h-[34px] w-full items-center gap-2 rounded-[14px] border border-[var(--border-color)] bg-white px-3 py-1.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)] sm:w-auto sm:min-w-[196px]">
            <span
              className={`h-2 w-2 rounded-full ${
                priceLoaded ? "bg-[var(--stock-ok)]" : "bg-[var(--stock-empty)]"
              }`}
            />
            <div className="min-w-0 flex-1 text-[11px] font-semibold text-[var(--text-primary)]">
              {priceLoaded ? "Прайс загружен" : "Прайс не загружен"}
            </div>
            <div className="h-4 w-px bg-[var(--border-color)]" />
            <div className="text-[11px] tabular-nums text-[var(--text-secondary)]">
              {catalogCount} {pluralizeWord(catalogCount, "позиция", "позиции", "позиций")}
            </div>
          </div>
        </header>

        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_312px]">
          <div className="min-w-0 space-y-2.5">
            <section className="rounded-[16px] bg-white p-2.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(164px,210px)] lg:grid-cols-[minmax(0,1fr)_164px_132px_188px]">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                    <SearchIcon className="h-3.5 w-3.5 stroke-[2]" />
                  </span>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Поиск по артикулу или названию"
                    className="h-[36px] w-full rounded-[12px] border border-[var(--border-color)] bg-white pl-[38px] pr-3.5 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                  />
                </div>

                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(1);
                  }}
                  className="h-[36px] rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[10.5px] font-medium text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                >
                  <option value="">Все категории</option>
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <label className="flex h-[36px] items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-medium text-[var(--text-primary)] transition-all duration-200 focus-within:border-[var(--brand-yellow)] focus-within:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]">
                  <input
                    type="checkbox"
                    checked={onlyInStock}
                    onChange={(event) => {
                      setOnlyInStock(event.target.checked);
                      setPage(1);
                    }}
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)] accent-[var(--brand-yellow)]"
                  />
                  Только в наличии
                </label>

                <button
                  type="button"
                  onClick={() => {
                    void handleClientPriceExport();
                  }}
                  disabled={!priceLoaded || isExportingClientPrice}
                  className="inline-flex h-[36px] items-center justify-center gap-2 rounded-[12px] bg-[var(--brand-yellow)] px-3 text-[11px] font-semibold text-[var(--brand-dark)] transition-all duration-200 hover:bg-[var(--brand-yellow-hover)] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[var(--text-secondary)]"
                >
                  <DocumentIcon className="h-3.5 w-3.5 stroke-[2]" />
                  {isExportingClientPrice ? CLIENT_PRICE_LOADING_LABEL : CLIENT_PRICE_LABEL}
                </button>
              </div>
            </section>

            <section className="rounded-[16px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[var(--border-color)] pb-2">
                <WarehouseTab
                  active={activeWarehouseId === null}
                  onClick={() => {
                    setActiveWarehouseId(null);
                    setPage(1);
                  }}
                >
                  Общий
                </WarehouseTab>
                {warehouses.map((warehouse) => (
                  <WarehouseTab
                    key={warehouse.id}
                    active={activeWarehouseId === warehouse.id}
                    onClick={() => {
                      setActiveWarehouseId(warehouse.id);
                      setPage(1);
                    }}
                  >
                    {warehouse.name}
                  </WarehouseTab>
                ))}
              </div>

              <div
                ref={containerRef}
                className="max-h-[calc(100dvh-9rem)] overflow-auto rounded-[14px] border border-[var(--border-color)] bg-white"
              >
                {renderTableBody()}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)] min-[980px]:justify-between">
                <div>
                  Показано {catalog.length} из {total}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[var(--border-color)] bg-white text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    ‹
                  </button>
                  <div className="flex h-7 min-w-[30px] items-center justify-center rounded-[10px] bg-[var(--brand-dark)] px-2 text-[10px] font-semibold text-white">
                    {page}
                  </div>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[var(--border-color)] bg-white text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    ›
                  </button>
                </div>
                <label className="flex items-center gap-2">
                  <span>Строк на странице</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      const nextPageSize = Number.parseInt(event.target.value, 10);
                      setPageSize(nextPageSize);
                      setPage(1);
                    }}
                    className="h-7 rounded-[10px] border border-[var(--border-color)] bg-white px-2 text-[10px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                  >
                    {[10, 20, 30, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {error ? (
              <div className="rounded-[14px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[var(--stock-empty)]">
                {error}
              </div>
            ) : null}
          </div>

          <aside className="flex min-h-0 flex-col gap-2.5 xl:sticky xl:top-3 xl:max-h-[calc(100dvh-1.5rem)] xl:overflow-auto">
            <section className="rounded-[16px] bg-white p-2.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-[var(--text-secondary)]">
                    Выбранная позиция
                  </p>
                  <h2 className="mt-1 line-clamp-2 text-[13px] font-[650] leading-[1.15] text-[var(--text-primary)]">
                    {selectedItem ? selectedItem.name : "Выберите товар из списка"}
                  </h2>
                  <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                    {selectedItem
                      ? `Артикул: ${selectedItem.sku || "-"} · Категория: ${selectedItem.categoryName || "-"}`
                      : "Кликните по строке, чтобы открыть карточку товара."}
                  </p>
                </div>
                {selectedItem ? (
                  <StatusBadge tone={selectedItem.isLinkedToOneC ? "success" : "warning"}>
                    {selectedItem.isLinkedToOneC ? "Связана" : "Локальная"}
                  </StatusBadge>
                ) : null}
              </div>

              {selectedItem ? (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <MiniCard
                      title="В наличии"
                      value={formatStockUnits(selectedAvailableQuantity)}
                      tone={selectedAvailableQuantity > 0 ? "success" : "danger"}
                    />
                    <MiniCard title="Цена" value={formatMoney(selectedItem.price)} />
                  </div>

                  {selectedWarehouseOptions.length > 0 ? (
                    <div className="mt-2">
                      <label className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                        Склад для счета
                      </label>
                      <select
                        value={selectedWarehouseId ?? ""}
                        onChange={(event) => {
                          const nextValue = Number.parseInt(event.target.value, 10);
                          setSelectedWarehouseId(Number.isFinite(nextValue) ? nextValue : null);
                        }}
                        className="mt-1 h-[32px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                      >
                        {selectedWarehouseOptions.map((warehouse) => (
                          <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                            {warehouse.warehouseName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="mt-2 rounded-[12px] bg-[var(--panel-muted)] p-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                      Количество
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <QuantityButton
                        label="Уменьшить"
                        onClick={() => {
                          const nextValue = Math.max(
                            selectedAvailableQuantity > 0 ? 1 : 0,
                            (Number.isFinite(selectedQuantityParsed) ? selectedQuantityParsed : 1) - 1,
                          );
                          setSelectedQuantityInput(formatQuantityInput(nextValue));
                        }}
                        disabled={!selectedItem || selectedAvailableQuantity <= 0}
                      >
                        -
                      </QuantityButton>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={selectedQuantityInput}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (!/^\d*$/.test(nextValue)) {
                            return;
                          }
                          setSelectedQuantityInput(nextValue);
                        }}
                        onBlur={(event) => {
                          setSelectedQuantityInput(
                            formatQuantityInput(
                              clampQuantity(event.target.value, selectedWarehouseBalance?.quantity ?? 0),
                            ),
                          );
                        }}
                        className="h-[32px] min-w-0 flex-1 rounded-[10px] border border-transparent bg-white px-2 text-center text-[12px] font-semibold tabular-nums text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                      />
                      <QuantityButton
                        label="Увеличить"
                        onClick={() => {
                          const nextValue = Math.min(
                            selectedAvailableQuantity,
                            (Number.isFinite(selectedQuantityParsed) ? selectedQuantityParsed : 0) + 1,
                          );
                          setSelectedQuantityInput(formatQuantityInput(nextValue));
                        }}
                        disabled={!selectedItem || selectedAvailableQuantity <= 0}
                      >
                        +
                      </QuantityButton>
                    </div>

                    <button
                      type="button"
                      disabled={!canAddSelectedItem || !selectedWarehouseBalance}
                      onClick={() => {
                        if (!selectedItem || !selectedWarehouseBalance) {
                          return;
                        }
                        updateDraftLine(selectedItem, selectedWarehouseBalance, selectedQuantityParsed);
                      }}
                      className="mt-2 flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[12px] bg-[var(--brand-dark)] px-3 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                    >
                      <CartIcon className="h-3.5 w-3.5 stroke-[2]" />
                      Добавить в счет
                    </button>

                    <div className="mt-1.5 grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-1.5">
                      <button
                        type="button"
                        disabled={!selectedDraftLine}
                        onClick={() => {
                          if (selectedLineKey) {
                            removeDraftLine(selectedLineKey);
                          }
                        }}
                        className="flex h-[32px] min-w-0 items-center justify-center whitespace-nowrap rounded-[10px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-medium leading-none text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Убрать из счета
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="flex h-[32px] min-w-0 items-center justify-center whitespace-nowrap rounded-[10px] border border-[var(--border-color)] bg-white px-2 text-[10px] font-medium leading-none text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
                      >
                        Снять выбор
                      </button>
                    </div>

                    {!selectedItem ? null : selectedAvailableQuantity <= 0 ? (
                      <p className="mt-1.5 text-[10px] text-[var(--stock-empty)]">
                        На складе {selectedWarehouseName.toLowerCase()} остаток равен нулю.
                      </p>
                    ) : !selectedQuantityIsValid ? (
                      <p className="mt-1.5 text-[10px] text-[var(--stock-empty)]">
                        Введите целое количество больше нуля.
                      </p>
                    ) : !selectedQuantityWithinStock ? (
                      <p className="mt-1.5 text-[10px] text-[var(--stock-empty)]">
                        Доступно только {formatStockUnits(selectedAvailableQuantity)} на выбранном складе.
                      </p>
                    ) : selectedItemTotalInDraft > 0 ? (
                      <p className="mt-1.5 text-[10px] text-[var(--stock-ok)]">
                        Уже в счете: {selectedItemTotalInDraft} шт. Можно быстро убрать позицию или изменить количество.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-[var(--text-secondary)]">
                        Можно ввести любое целое количество в пределах остатка выбранного склада.
                      </p>
                    )}
                  </div>

                  <div className="mt-2 rounded-[12px] border border-[var(--border-color)] bg-[#FCFDFE] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                        Остатки по складам
                      </p>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Общий остаток:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {formatStockUnits(selectedItem.quantity)}
                        </span>
                      </span>
                    </div>

                    <div className="mt-1.5 space-y-1">
                      {selectedItem.warehouses.length > 0 ? (
                        selectedItem.warehouses.map((warehouse) => {
                          const isCurrent = selectedWarehouseId === warehouse.warehouseId;
                          return (
                            <button
                              key={warehouse.warehouseId}
                              type="button"
                              onClick={() => setSelectedWarehouseId(warehouse.warehouseId)}
                              className={[
                                "flex w-full items-center justify-between gap-2 rounded-[9px] border px-2.5 py-1.5 text-left text-[10px] transition-all duration-200",
                                isCurrent
                                  ? "border-[var(--brand-yellow)] bg-[#FFF8D9]"
                                  : "border-[var(--border-color)] bg-white hover:bg-[#F8FAFD]",
                              ].join(" ")}
                            >
                              <span className="truncate text-[var(--text-primary)]">
                                {warehouse.warehouseName}
                              </span>
                              <span className="font-semibold text-[var(--stock-ok)] tabular-nums">
                                {formatStockUnits(warehouse.quantity)}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-[9px] border border-dashed border-[var(--border-color)] bg-white px-2.5 py-2 text-[10px] text-[var(--text-secondary)]">
                          Остатки по складам пока не распределены.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2 rounded-[12px] border border-dashed border-[var(--border-color)] bg-[#FBFCFE] px-3 py-3 text-[10px] leading-[15px] text-[var(--text-secondary)]">
                  Выберите позицию в таблице слева. Здесь можно быстро подобрать склад и добавить товар в счет.
                </div>
              )}
            </section>

            <section className="rounded-[16px] bg-white p-2.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="flex items-end justify-between gap-2">
                <p className="text-[13px] font-[650] leading-tight text-[var(--text-primary)]">
                  Позиции в счете ({totals.positions})
                </p>
                {totals.quantity > 0 ? (
                  <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                    {totals.quantity} шт.
                  </span>
                ) : null}
              </div>

              <div className="mt-2 max-h-[220px] space-y-1.5 overflow-y-auto pr-0.5">
                {draftLines.length === 0 ? (
                  <div className="rounded-[12px] border border-dashed border-[var(--border-color)] bg-[#FBFCFE] px-2.5 py-3 text-[11px] leading-[17px] text-[var(--text-secondary)]">
                    Счет пока пуст. Добавьте позиции из таблицы слева.
                  </div>
                ) : (
                  draftLines.map((line) => (
                    <div
                      key={line.lineId}
                      className="rounded-[12px] border border-[var(--border-color)] bg-white px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-[var(--text-primary)]">
                            {line.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                            {line.sku || "-"} · {line.warehouseName}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Удалить ${line.name} из счета`}
                          onClick={() => removeDraftLine(line.lineId)}
                          className="text-[15px] leading-none text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--stock-empty)]"
                        >
                          ×
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="tabular-nums text-[var(--text-secondary)]">
                          x {line.quantity}
                        </span>
                        <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                          {formatMoney(line.price * line.quantity)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-2 rounded-[14px] border border-[var(--border-color)] bg-[#FCFDFE] p-2.5">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>Итого позиций</span>
                  <span className="tabular-nums">{totals.positions}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>Без НДС</span>
                  <span className="tabular-nums">{formatMoney(totals.amountWithoutVat)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>НДС {vatPercent}%</span>
                  <span className="tabular-nums">{formatMoney(totals.vatAmount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-[var(--border-color)] pt-2">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">Итого</span>
                  <span className="text-[18px] font-[650] leading-none tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">
                    {formatMoney(totals.grossAmount)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push("/work-with-invoice")}
                className="mt-2 flex h-[36px] w-full items-center justify-center gap-1.5 rounded-[12px] bg-[var(--brand-yellow)] px-3 text-[12px] font-semibold text-[var(--brand-dark)] transition-all duration-200 hover:bg-[var(--brand-yellow-hover)] active:scale-[0.985]"
              >
                <DocumentIcon className="h-3.5 w-3.5 stroke-[2]" />
                Перейти к счету
              </button>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function sanitizeDraftLines(lines: DraftLine[]) {
  return lines
    .map((line) => {
      if (
        typeof line.itemId !== "number" ||
        typeof line.warehouseId !== "number" ||
        !Number.isFinite(line.itemId) ||
        !Number.isFinite(line.warehouseId)
      ) {
        return null;
      }

      const availableOnWarehouse = Number.isFinite(line.availableOnWarehouse)
        ? line.availableOnWarehouse
        : line.available;
      const safeQuantity = clampQuantity(line.quantity, availableOnWarehouse);
      if (safeQuantity <= 0) {
        return null;
      }

      return {
        ...line,
        lineId: line.lineId || buildDraftLineKey(line.itemId, line.warehouseId),
        quantity: safeQuantity,
        availableOnWarehouse,
      };
    })
    .filter((line): line is DraftLine => line !== null);
}

function buildDraftLineKey(itemId: number, warehouseId: number) {
  return `${itemId}:${warehouseId}`;
}

function getWarehouseOptions(item: StockItem | null, activeWarehouseId: number | null) {
  if (!item) {
    return [];
  }

  if (activeWarehouseId !== null) {
    return item.warehouses.filter((warehouse) => warehouse.warehouseId === activeWarehouseId);
  }

  return item.warehouses;
}

function pickPreferredWarehouse(item: StockItem, activeWarehouseId: number | null) {
  const candidates = getWarehouseOptions(item, activeWarehouseId);
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => right.quantity - left.quantity)[0];
}

function getAvailableUnits(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function parseQuantityInput(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return Number.NaN;
  }

  return Number.parseInt(normalized, 10);
}

function clampQuantity(value: number | string, available: number) {
  const availableUnits = getAvailableUnits(available);
  if (availableUnits <= 0) {
    return 0;
  }

  const parsedValue =
    typeof value === "string" ? parseQuantityInput(value) : Math.trunc(value);

  if (!Number.isFinite(parsedValue)) {
    return 1;
  }

  return Math.min(availableUnits, Math.max(1, parsedValue));
}

function formatQuantityInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return String(Math.trunc(value));
}

function formatWarehouseLabel(
  item: StockItem,
  activeWarehouseName: string,
  activeWarehouseId: number | null,
) {
  if (activeWarehouseId !== null) {
    return activeWarehouseName;
  }

  const summary = item.warehouseSummary?.trim() || "";
  const primaryName = item.topWarehouseName?.trim() || "Основной склад";
  if ((item.warehouseCount || 0) <= 1) {
    return summary || primaryName;
  }

  return `${primaryName} +${item.warehouseCount - 1}`;
}

function formatMoney(value: number) {
  const rubleSign = "\u20BD";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${rubleSign}`;
}

function formatStockUnits(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(getAvailableUnits(value))} шт.`;
}

function pluralizeWord(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-[#D7F6E3] bg-[#EEFDF3] text-[var(--stock-ok)]"
      : "border-[#FCE7B2] bg-[#FFF8D9] text-[#A16207]";

  return (
    <span
      className={[
        "inline-flex h-[24px] items-center rounded-full border px-2 text-[10px] font-semibold",
        toneClass,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function SelectionMarker({
  selected,
  inDraft,
}: {
  selected: boolean;
  inDraft: boolean;
}) {
  if (selected) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-[var(--brand-yellow)] text-[var(--brand-dark)]">
        <CheckIcon className="h-3 w-3 stroke-[2.5]" />
      </span>
    );
  }

  if (inDraft) {
    return <span className="h-2.5 w-2.5 rounded-full bg-[var(--stock-ok)]" />;
  }

  return <span className="h-4 w-4 rounded-full border border-[var(--border-color)] bg-white" />;
}

function MiniCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--stock-ok)]"
      : tone === "danger"
        ? "text-[var(--stock-empty)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="rounded-[12px] border border-[var(--border-color)] bg-white p-2">
      <p className="text-[10px] font-medium text-[var(--text-secondary)]">{title}</p>
      <p className={`mt-1 text-[15px] font-[650] leading-none tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function QuantityButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border-color)] bg-white text-[15px] text-[var(--brand-dark)] transition-all duration-200 hover:bg-[#F8FAFD] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function WarehouseTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-[34px] items-center rounded-t-[12px] rounded-b-[4px] border px-4 text-[10px] font-semibold transition-all duration-200",
        active
          ? "border-[var(--border-color)] border-t-[2px] border-t-[var(--stock-ok)] bg-white text-[var(--brand-dark)] shadow-[0_10px_20px_rgba(7,22,46,0.06)]"
          : "border-[var(--border-color)] bg-[#F8FAFD] text-[var(--text-secondary)] hover:bg-white hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}

function EmptyStateCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--border-color)] bg-[#FBFCFE] px-4 py-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white text-[var(--brand-dark)] shadow-[0_8px_18px_rgba(7,22,46,0.06)]">
        {icon}
      </div>
      <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1.5 max-w-[30rem] text-[12px] leading-5 text-[var(--text-secondary)]">
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-[14px] bg-[var(--brand-yellow)] px-4 py-2 text-[12px] font-semibold text-[var(--brand-dark)] transition-all duration-200 hover:bg-[var(--brand-yellow-hover)] active:scale-[0.985]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border-color)] bg-white">
      <div className="grid grid-cols-[1fr_2fr_1.2fr_1fr_0.8fr_0.9fr_1fr_0.6fr] gap-3 border-b border-[var(--border-color)] bg-[#FAFBFD] px-4 py-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-3 w-16 animate-pulse rounded-full bg-[#E8EDF4]" />
        ))}
      </div>
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_2fr_1.2fr_1fr_0.8fr_0.9fr_1fr_0.6fr] items-center gap-3 border-t border-[var(--border-color)] px-4 py-2"
        >
          {Array.from({ length: 7 }).map((__, innerIndex) => (
            <div
              key={innerIndex}
              className="h-3 w-full animate-pulse rounded-full bg-[#EEF2F7]"
            />
          ))}
          <div className="ml-auto h-7 w-7 animate-pulse rounded-[10px] bg-[#EEF2F7]" />
        </div>
      ))}
    </div>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PackageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3.5 4.5 7.3v9.4L12 20.5l7.5-3.8V7.3L12 3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 7.3 12 11l7.5-3.7M12 11v9.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m5 12 4.2 4.2L19 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3.5 5h2l1.8 9.2a1 1 0 0 0 1 .8H18a1 1 0 0 0 1-.8L20.5 8H7.2M9 19.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM17 19.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M8 3.5h6l4 4V20a.5.5 0 0 1-.5.5h-9A2.5 2.5 0 0 1 6 18V6a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5V8h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}
