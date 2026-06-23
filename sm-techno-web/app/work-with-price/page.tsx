"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";

import { useAuth } from "@/components/auth-provider";
import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import {
  addItemStock,
  buildApiUrl,
  clearCatalog,
  createWarehouse,
  createLocalItem,
  deleteWarehouse,
  deleteItem,
  fetchStockCatalog,
  fetchStockItem,
  fetchWarehouses,
  importPriceFile,
  moveItemStock,
  updateLocalItem,
  writeoffItemStock,
  type LocalItemPayload,
} from "@/lib/api";
import type { StockItem, Warehouse } from "@/lib/types";

type ItemFormState = {
  sku: string;
  name: string;
  categoryName: string;
  groupName: string;
  price: string;
  warehouses: WarehouseFormState[];
};

type WarehouseFormState = {
  key: string;
  warehouseId: number | null;
  warehouseName: string;
  quantity: string;
};

type StockActionMode = "add" | "move" | "writeoff";

type StockActionState = {
  itemId: number;
  mode: StockActionMode;
};

type StockActionFormState = {
  warehouseId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  comment: string;
};

const EMPTY_FORM: ItemFormState = {
  sku: "",
  name: "",
  categoryName: "",
  groupName: "",
  price: "0.00",
  warehouses: [createWarehouseFormState("Основной склад", "0")],
};

const PRICE_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "sku", width: 108, minWidth: 84, maxWidth: 180 },
  { key: "name", width: 258, minWidth: 190, maxWidth: 440 },
  { key: "warehouse", width: 160, minWidth: 124, maxWidth: 240 },
  { key: "category", width: 148, minWidth: 104, maxWidth: 230 },
  { key: "group", width: 124, minWidth: 96, maxWidth: 200 },
  { key: "stock", width: 88, minWidth: 72, maxWidth: 138 },
  { key: "price", width: 102, minWidth: 84, maxWidth: 160 },
  { key: "amount", width: 114, minWidth: 92, maxWidth: 180 },
  { key: "action", width: 72, minWidth: 64, maxWidth: 96 },
];

export default function WorkWithPricePage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="rounded-[16px] border border-[var(--border-color)] bg-white p-5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
          <h1 className="text-[18px] font-[650] tracking-[-0.04em] text-[var(--text-primary)]">
            Работа с прайсом
          </h1>
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            Этот раздел доступен только администратору приложения.
          </p>
        </div>
      </AppShell>
    );
  }

  return <WorkWithPriceAdminPage />;
}

function WorkWithPriceAdminPage() {
  const isAdmin = true;
  const [items, setItems] = useState<StockItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [createForm, setCreateForm] = useState<ItemFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ItemFormState>(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouseNameInput, setWarehouseNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isCreateExpanded, setIsCreateExpanded] = useState(false);
  const [isWarehouseSettingsExpanded, setIsWarehouseSettingsExpanded] = useState(false);
  const [activeRowMenuId, setActiveRowMenuId] = useState<number | null>(null);
  const [stockAction, setStockAction] = useState<StockActionState | null>(null);
  const [stockActionForm, setStockActionForm] = useState<StockActionFormState>({
    warehouseId: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    quantity: "1",
    comment: "",
  });
  const [isStockActionBusy, setIsStockActionBusy] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<StockItem | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-price-table-widths-v2",
    PRICE_TABLE_COLUMNS,
  );

  const loadWarehouses = useCallback(async () => {
    const rows = await fetchWarehouses();
    setWarehouses(rows);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (activeRowMenuId === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setActiveRowMenuId(null);
        return;
      }

      if (target.closest("[data-row-actions-root='true']")) {
        return;
      }

      setActiveRowMenuId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveRowMenuId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeRowMenuId]);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetchStockCatalog({
      search,
      category,
      warehouseId: activeWarehouseId,
      onlyInStock: false,
      page: onlyUnlinked ? 1 : page,
      pageSize: onlyUnlinked ? 500 : pageSize,
    });

    const filtered = onlyUnlinked
      ? response.items.filter((item) => !item.isLinkedToOneC)
      : response.items;

    setItems(filtered);
    setCategories(response.categories);
    setTotal(onlyUnlinked ? filtered.length : response.total);

    if (filtered.length === 0) {
      if (selectedId !== null) {
        const persisted = await fetchStockItem(selectedId);
        setSelectedItem(persisted);
      } else {
        setSelectedItem(null);
      }
      return;
    }

    if (selectedId === null) {
      setSelectedId(filtered[0].id);
      setSelectedItem(filtered[0]);
      return;
    }

    const matched = filtered.find((item) => item.id === selectedId);
    if (matched) {
      setSelectedItem((current) => {
        if (!current || current.id !== matched.id) {
          return matched;
        }

        return {
          ...matched,
          warehouses: current.warehouses,
        };
      });
      return;
    }

    const persisted = await fetchStockItem(selectedId);
    setSelectedItem(persisted);
  }, [activeWarehouseId, search, category, onlyUnlinked, page, pageSize, selectedId]);

  useEffect(() => {
    let cancelled = false;

    void loadCatalog()
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось загрузить локальный каталог.",
          );
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
  }, [loadCatalog]);

  useEffect(() => {
    let cancelled = false;
    void loadWarehouses().catch((requestError: unknown) => {
      if (!cancelled) {
        setError(
          requestError instanceof Error ? requestError.message : "Не удалось загрузить список складов.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadWarehouses]);

  useEffect(() => {
    if (!selectedItem) {
      setEditForm(EMPTY_FORM);
      return;
    }

    setEditForm({
      sku: selectedItem.sku || "",
      name: selectedItem.name || "",
      categoryName: selectedItem.categoryName || "",
      groupName: selectedItem.groupName || "",
      price: formatNumberInput(selectedItem.price, 2),
      warehouses:
        selectedItem.warehouses.length > 0
          ? selectedItem.warehouses.map((warehouse) =>
              createWarehouseFormState(
                warehouse.warehouseName,
                formatIntegerInput(warehouse.quantity),
                warehouse.warehouseId,
              ),
            )
          : [createWarehouseFormState("Основной склад", "0")],
    });
  }, [selectedItem]);

  useEffect(() => {
    let cancelled = false;
    if (selectedId === null) {
      return () => {
        cancelled = true;
      };
    }
    void fetchStockItem(selectedId)
      .then((item) => {
        if (!cancelled && item) {
          setSelectedItem(item);
        }
      })
      .catch(() => {
        // Keep current selection if details could not be refreshed.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!stockAction) {
      return;
    }

    const positiveWarehouses = (selectedItem?.warehouses ?? []).filter(
      (warehouse) => getIntegerQuantity(warehouse.quantity) > 0,
    );
    const preferredWarehouseId =
      activeWarehouseId !== null
        ? activeWarehouseId
        : positiveWarehouses[0]?.warehouseId ?? warehouses[0]?.id ?? null;
    const destinationWarehouseId =
      warehouses.find((warehouse) => warehouse.id !== preferredWarehouseId)?.id ??
      warehouses[0]?.id ??
      null;

    setStockActionForm((current) => ({
      warehouseId:
        stockAction.mode === "add" && preferredWarehouseId !== null
          ? String(preferredWarehouseId)
          : stockAction.mode === "writeoff" && positiveWarehouses[0]
            ? String(preferredWarehouseId ?? positiveWarehouses[0].warehouseId)
            : current.warehouseId,
      fromWarehouseId:
        stockAction.mode === "move" && positiveWarehouses[0]
          ? String(
              positiveWarehouses.find((warehouse) => warehouse.warehouseId === preferredWarehouseId)
                ?.warehouseId ?? positiveWarehouses[0].warehouseId,
            )
          : current.fromWarehouseId,
      toWarehouseId:
        stockAction.mode === "move" && destinationWarehouseId !== null
          ? String(destinationWarehouseId)
          : current.toWarehouseId,
      quantity: "1",
      comment: "",
    }));
  }, [stockAction, selectedItem, activeWarehouseId, warehouses]);

  useEffect(() => {
    if (isCreateExpanded) {
      return;
    }
    setCreateForm(buildItemForm(activeWarehouseId, warehouses));
  }, [activeWarehouseId, warehouses, isCreateExpanded]);

  const summary = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + getIntegerQuantity(item.quantity), 0);
    const unlinkedCount = items.filter((item) => !item.isLinkedToOneC).length;
    return {
      totalItems: total,
      visibleItems: items.length,
      totalQuantity,
      unlinkedCount,
    };
  }, [items, total]);

  const activeWarehouseName = useMemo(() => {
    if (activeWarehouseId === null) {
      return "Все склады";
    }
    return (
      warehouses.find((warehouse) => warehouse.id === activeWarehouseId)?.name ?? "Выбранный склад"
    );
  }, [activeWarehouseId, warehouses]);

  useEffect(() => {
    if (activeWarehouseId === null) {
      return;
    }
    if (!warehouses.some((warehouse) => warehouse.id === activeWarehouseId)) {
      setActiveWarehouseId(null);
    }
  }, [activeWarehouseId, warehouses]);

  const selectedWarehouseBalances = useMemo(
    () =>
      (selectedItem?.warehouses ?? [])
        .filter((warehouse) => getIntegerQuantity(warehouse.quantity) > 0)
        .sort((left, right) => right.quantity - left.quantity || left.warehouseName.localeCompare(right.warehouseName, "ru")),
    [selectedItem],
  );

  const stockActionItem =
    stockAction && selectedItem?.id === stockAction.itemId ? selectedItem : null;

  const stockActionSourceWarehouses = useMemo(
    () =>
      (stockActionItem?.warehouses ?? [])
        .filter((warehouse) => getIntegerQuantity(warehouse.quantity) > 0)
        .sort((left, right) => right.quantity - left.quantity || left.warehouseName.localeCompare(right.warehouseName, "ru")),
    [stockActionItem],
  );

  const stockActionAvailable = useMemo(() => {
    if (stockAction?.mode === "move") {
      const target = stockActionSourceWarehouses.find(
        (warehouse) => String(warehouse.warehouseId) === stockActionForm.fromWarehouseId,
      );
      return getIntegerQuantity(target?.quantity ?? 0);
    }
    if (stockAction?.mode === "writeoff") {
      const target = stockActionSourceWarehouses.find(
        (warehouse) => String(warehouse.warehouseId) === stockActionForm.warehouseId,
      );
      return getIntegerQuantity(target?.quantity ?? 0);
    }
    return 0;
  }, [stockAction, stockActionForm.fromWarehouseId, stockActionForm.warehouseId, stockActionSourceWarehouses]);

  const pageCount = Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
  const selectedInList = selectedItem ? items.some((item) => item.id === selectedItem.id) : false;

  const createFormValidation = validateItemForm(createForm);
  const editFormValidation = validateItemForm(editForm);

  const applyItemToLocalState = (item: StockItem) => {
    setItems((current) => {
      const exists = current.some((entry) => entry.id === item.id);
      const next = exists
        ? current.map((entry) => (entry.id === item.id ? item : entry))
        : [item, ...current];
      return next.sort((left, right) => left.name.localeCompare(right.name, "ru"));
    });
    setSelectedId(item.id);
    setSelectedItem(item);
  };

  const handleCreateItem = async () => {
    const parsed = toPayload(createForm);
    if (!parsed.ok) {
      setError(parsed.message);
      setMessage(null);
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const created = await createLocalItem(parsed.payload);
      if (!created) {
        throw new Error("Сервер не вернул созданную позицию.");
      }

      applyItemToLocalState(created);
      setCreateForm(buildItemForm(activeWarehouseId, warehouses));
      setMessage(`Позиция "${created.name}" сохранена в локальном прайсе.`);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать позицию.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveItem = async () => {
    if (!selectedItem) {
      return;
    }

    const parsed = toPayload(editForm);
    if (!parsed.ok) {
      setError(parsed.message);
      setMessage(null);
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateLocalItem(selectedItem.id, parsed.payload);
      if (!updated) {
        throw new Error("Сервер не вернул обновленную позицию.");
      }

      applyItemToLocalState(updated);
      setMessage(`Позиция "${updated.name}" обновлена.`);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить изменения по позиции.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteItem = async (targetItem?: StockItem | null) => {
    const itemToDelete = targetItem ?? selectedItem;
    if (!itemToDelete) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await deleteItem(itemToDelete.id);
      const deletedName = itemToDelete.name;
      setItems((current) => current.filter((item) => item.id !== itemToDelete.id));
      if (selectedItem?.id === itemToDelete.id) {
        setSelectedId(null);
        setSelectedItem(null);
      }
      setItemPendingDelete(null);
      setActiveRowMenuId(null);
      setMessage(`Позиция "${deletedName}" удалена. Удалено: ${result.deleted}, скрыто: ${result.hidden}.`);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить позицию.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearCatalog = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await clearCatalog();
      setItems([]);
      setCategories([]);
      setSelectedId(null);
      setSelectedItem(null);
      setMessage(`Каталог очищен. Удалено: ${result.deleted}, скрыто: ${result.hidden}.`);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось очистить каталог.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await importPriceFile(importFile);
      setImportFile(null);
      setMessage(`Импорт завершен. Создано: ${result.created}, обновлено: ${result.updated}.`);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось импортировать прайс.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateWarehouse = async () => {
    const trimmedName = warehouseNameInput.trim();
    if (!trimmedName) {
      setError("Укажите название склада.");
      setMessage(null);
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const warehouse = await createWarehouse({ name: trimmedName });
      setWarehouseNameInput("");
      setMessage(`Склад "${warehouse.name}" сохранен.`);
      await loadWarehouses();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить склад.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteWarehouse = async (warehouseId: number) => {
    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      await deleteWarehouse(warehouseId);
      if (activeWarehouseId === warehouseId) {
        setActiveWarehouseId(null);
      }
      setMessage("Склад удален.");
      await Promise.all([loadWarehouses(), loadCatalog()]);
      if (selectedId !== null) {
        const refreshedItem = await fetchStockItem(selectedId);
        setSelectedItem(refreshedItem);
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить склад.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectItem = (item: StockItem) => {
    setSelectedId(item.id);
    setSelectedItem(item);
    setActiveRowMenuId(null);
  };

  const handleOpenStockAction = async (item: StockItem, mode: StockActionMode) => {
    handleSelectItem(item);
    setStockAction({ itemId: item.id, mode });
    try {
      const detailedItem = await fetchStockItem(item.id);
      if (detailedItem) {
        setSelectedItem(detailedItem);
      }
    } catch {
      // Keep the current lightweight row data if details could not be refreshed.
    }
  };

  const handleSubmitStockAction = async () => {
    if (!stockAction || !selectedItem || selectedItem.id !== stockAction.itemId) {
      return;
    }

    const quantity = Number.parseInt(sanitizeIntegerInput(stockActionForm.quantity), 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Укажите количество больше нуля.");
      setMessage(null);
      return;
    }

    setIsStockActionBusy(true);
    setError(null);
    setMessage(null);

    try {
      let updatedItem: StockItem;

      if (stockAction.mode === "add") {
        const warehouseId = Number.parseInt(stockActionForm.warehouseId, 10);
        if (!Number.isFinite(warehouseId)) {
          throw new Error("Выберите склад.");
        }
        updatedItem = await addItemStock(selectedItem.id, {
          warehouseId,
          quantity,
          comment: stockActionForm.comment.trim(),
        });
        const warehouseName =
          warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "склад";
        setMessage(`На склад "${warehouseName}" добавлено ${quantity} шт.`);
      } else if (stockAction.mode === "move") {
        const fromWarehouseId = Number.parseInt(stockActionForm.fromWarehouseId, 10);
        const toWarehouseId = Number.parseInt(stockActionForm.toWarehouseId, 10);
        if (!Number.isFinite(fromWarehouseId) || !Number.isFinite(toWarehouseId)) {
          throw new Error("Выберите склады для перемещения.");
        }
        updatedItem = await moveItemStock(selectedItem.id, {
          fromWarehouseId,
          toWarehouseId,
          quantity,
          comment: stockActionForm.comment.trim(),
        });
        const fromName =
          selectedItem.warehouses.find((warehouse) => warehouse.warehouseId === fromWarehouseId)
            ?.warehouseName ?? "склад";
        const toName = warehouses.find((warehouse) => warehouse.id === toWarehouseId)?.name ?? "склад";
        setMessage(`Перемещено ${quantity} шт.: ${fromName} → ${toName}.`);
      } else {
        const warehouseId = Number.parseInt(stockActionForm.warehouseId, 10);
        if (!Number.isFinite(warehouseId)) {
          throw new Error("Выберите склад.");
        }
        updatedItem = await writeoffItemStock(selectedItem.id, {
          warehouseId,
          quantity,
          comment: stockActionForm.comment.trim(),
        });
        const warehouseName =
          selectedItem.warehouses.find((warehouse) => warehouse.warehouseId === warehouseId)
            ?.warehouseName ?? "склад";
        setMessage(`Со склада "${warehouseName}" списано ${quantity} шт.`);
      }

      setSelectedItem(updatedItem);
      setStockAction(null);
      setActiveRowMenuId(null);
      await loadCatalog();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось изменить остатки по складам.",
      );
    } finally {
      setIsStockActionBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-[42rem]">
            <h1 className="text-[18px] font-[650] leading-none tracking-[-0.05em] text-[var(--text-primary)]">
              Работа с прайсом
            </h1>
            <p className="mt-0.5 max-w-[62ch] text-[10px] leading-[15px] text-[var(--text-secondary)]">
              {isAdmin
                ? "Тот же локальный каталог, что и в остатках: здесь можно импортировать позиции, добавлять их вручную, менять цену и остаток, а также удалять карточки по одной."
                : "Просмотр локального прайса в режиме пользователя. Изменение каталога доступно только администратору."}
            </p>
          </div>

          <div className="inline-flex min-h-[32px] min-w-[220px] items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
            <span className="h-2 w-2 rounded-full bg-[var(--stock-ok)]" />
            <div className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--text-primary)]">
              {activeWarehouseName}
            </div>
            <div className="h-4 w-px bg-[var(--border-color)]" />
            <div className="text-[10px] tabular-nums text-[var(--text-secondary)]">
              {summary.totalItems} поз.
            </div>
            <div className="h-4 w-px bg-[var(--border-color)]" />
            <div className="text-[10px] tabular-nums text-[var(--text-secondary)]">
              {summary.totalQuantity} шт.
            </div>
          </div>
        </header>

        <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
          <div className="grid gap-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
            <ActionLink
              href={buildApiUrl("/api/price/template")}
              icon={<DownloadIcon className="h-3.5 w-3.5 stroke-[2]" />}
              label="Скачать шаблон"
            />
            <ActionLink
              href={buildApiUrl("/api/price/snapshot")}
              icon={<CloudArrowDownIcon className="h-3.5 w-3.5 stroke-[2]" />}
              label="Выгрузить текущий срез"
            />
            {isAdmin ? (
              <>
                <label className="flex h-[34px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] font-semibold text-[var(--text-primary)] transition-all duration-200 hover:bg-[#F8FAFD] active:scale-[0.985]">
                  <UploadIcon className="h-3.5 w-3.5 stroke-[2] text-[var(--text-secondary)]" />
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="truncate">{importFile ? importFile.name : "Выбрать файл прайса"}</span>
                </label>
                <button
                  type="button"
                  disabled={!importFile || isBusy}
                  onClick={handleImport}
                  className="flex h-[34px] items-center justify-center gap-2 rounded-[10px] bg-[var(--brand-dark)] px-3 text-[11px] font-semibold text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                >
                  <SparkBoxIcon className="h-3.5 w-3.5 stroke-[2]" />
                  Импортировать остатки
                </button>
              </>
            ) : (
              <div className="flex h-[34px] items-center justify-center rounded-[10px] border border-[var(--border-color)] bg-[#F8FAFD] px-3 text-[10px] font-medium text-[var(--text-secondary)]">
                Редактирование каталога доступно только администратору
              </div>
            )}
          </div>

          {message ? (
            <div className="mt-1.5 rounded-[10px] border border-[#D8F0DE] bg-[#ECFDF3] px-3 py-1.5 text-[10px] text-[var(--stock-ok)]">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-1.5 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
              {error}
            </div>
          ) : null}
        </section>

        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_316px] xl:items-start">
          <div className="min-w-0 space-y-2">
            <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_160px_160px]">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                    <SearchIcon className="h-3.5 w-3.5 stroke-[2]" />
                  </span>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Поиск по артикулу или названию"
                    className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white pl-[36px] pr-3 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                  />
                </div>

                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(1);
                  }}
                  className="h-[34px] rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] font-medium text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                >
                  <option value="">Все категории</option>
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <label className="flex h-[34px] items-center gap-2 rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[10px] font-medium text-[var(--text-primary)] transition-all duration-200 focus-within:border-[var(--brand-yellow)] focus-within:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]">
                  <input
                    type="checkbox"
                    checked={onlyUnlinked}
                    onChange={(event) => {
                      setOnlyUnlinked(event.target.checked);
                      setPage(1);
                    }}
                    className="h-4 w-4 rounded border-[var(--border-color)] accent-[var(--brand-yellow)]"
                  />
                  Только без связи с 1С
                </label>
              </div>
            </section>

            <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
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

              <div ref={containerRef} className="max-h-[calc(100dvh-8rem)] overflow-auto rounded-[12px] border border-[var(--border-color)] bg-white">
                {isLoading && items.length === 0 ? (
                  <TableSkeleton />
                ) : items.length === 0 ? (
                  <EmptyStateCard
                    icon={<PackageIcon className="h-5 w-5 stroke-[1.8]" />}
                    title="Локальный каталог пуст"
                    description={
                      isAdmin
                        ? "Импортируйте Excel-файл или добавьте первую позицию вручную в правой колонке."
                        : "Каталог пока пуст. Попросите администратора загрузить прайс."
                    }
                  />
                ) : (
                  <table
                    className="min-w-full table-fixed border-separate border-spacing-0"
                    style={{ width: tableWidth }}
                  >
                    <colgroup>
                      {PRICE_TABLE_COLUMNS.map((column) => (
                        <col key={column.key} style={{ width: getWidth(column.key) }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                        <ResizableTableHeader columnKey="sku" label="Артикул" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="name" label="Наименование" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="warehouse" label="Склад" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="category" label="Категория" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="group" label="Группа" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="stock" label="Остаток" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="price" label="Цена" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                        <ResizableTableHeader columnKey="action" label="Действия" onResizeStart={onResizeStart} className="px-3 py-2 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isSelected = selectedId === item.id;
                        const hasStock = getIntegerQuantity(item.quantity) > 0;

                        return (
                          <tr
                            key={item.id}
                            onClick={() => handleSelectItem(item)}
                            className={[
                              "cursor-pointer transition-colors duration-200",
                              isSelected
                                ? "bg-[#FFF8D9] shadow-[inset_3px_0_0_#FFC400]"
                                : "bg-white hover:bg-[#F8FBFF]",
                            ].join(" ")}
                          >
                            <td
                              className={[
                                "border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] font-semibold tabular-nums",
                                item.isLinkedToOneC
                                  ? "text-[var(--stock-ok)]"
                                  : "text-[var(--text-primary)]",
                              ].join(" ")}
                            >
                              {item.sku || "-"}
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-primary)]">
                              <div className="max-w-[320px] line-clamp-2 text-[11px] font-medium leading-[15px]">
                                {item.name}
                              </div>
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)]">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleSelectItem(item);
                                }}
                                className="line-clamp-2 text-left transition hover:text-[var(--brand-dark)]"
                                title={item.warehouseSummary || formatWarehouseLabel(item, activeWarehouseName, activeWarehouseId)}
                              >
                                {formatWarehouseLabel(item, activeWarehouseName, activeWarehouseId)}
                              </button>
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)]">
                              {item.categoryName || "-"}
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)]">
                              {item.groupName || "-"}
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] font-semibold tabular-nums">
                              <span className={hasStock ? "text-[var(--stock-ok)]" : "text-[var(--stock-empty)]"}>
                                {formatStockUnits(item.quantity)}
                              </span>
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                              {formatMoney(item.price)}
                            </td>
                            <td className="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                              {formatMoney(getIntegerQuantity(item.quantity) * item.price)}
                            </td>
                            <td className="relative border-t border-[var(--border-color)] px-3 py-1.5 text-right">
                              <div className="relative inline-flex" onMouseLeave={() => setActiveRowMenuId((current) => (current === item.id ? null : current))}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setActiveRowMenuId((current) => (current === item.id ? null : item.id));
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-yellow)] hover:text-[var(--brand-dark)]"
                                  title="Быстрые действия"
                                >
                                  <MoreIcon className="h-3.5 w-3.5 stroke-[2]" />
                                </button>

                                {activeRowMenuId === item.id ? (
                                  <div
                                    className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[208px] rounded-[12px] border border-[var(--border-color)] bg-white p-1 shadow-[0_18px_36px_rgba(7,22,46,0.14)]"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <ActionMenuButton
                                      label="Изменить карточку"
                                      onClick={() => handleSelectItem(item)}
                                    />
                                    <ActionMenuButton
                                      label="Добавить остаток"
                                      onClick={() => handleOpenStockAction(item, "add")}
                                    />
                                    <ActionMenuButton
                                      label="Переместить между складами"
                                      onClick={() => handleOpenStockAction(item, "move")}
                                    />
                                    <ActionMenuButton
                                      label="Списать остаток"
                                      destructive
                                      onClick={() => handleOpenStockAction(item, "writeoff")}
                                    />
                                    <ActionMenuButton
                                      label="Удалить товар"
                                      destructive
                                      onClick={() => {
                                        handleSelectItem(item);
                                        setItemPendingDelete(item);
                                        setActiveRowMenuId(null);
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-1.5 flex flex-col gap-1.5 border-t border-[var(--border-color)] pt-1.5 text-[10px] text-[var(--text-secondary)] md:flex-row md:items-center md:justify-between">
                <div>
                  Показано {items.length} из {summary.totalItems} · Без связи с 1С: {summary.unlinkedCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5 stroke-[2]" />
                  </button>
                  <div className="min-w-[56px] text-center tabular-nums text-[var(--text-primary)]">
                    {page} / {pageCount}
                  </div>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2]" />
                  </button>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    className="h-7 rounded-[9px] border border-[var(--border-color)] bg-white px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option value={20}>20 строк</option>
                    <option value={50}>50 строк</option>
                    <option value={100}>100 строк</option>
                  </select>
                </div>
              </div>
            </section>
          </div>

          <aside className="flex min-h-0 flex-col gap-2 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-0.75rem)] xl:self-start xl:overflow-auto">
            <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-semibold text-[var(--text-secondary)]">
                    Выбранная позиция
                  </p>
                  <h2 className="mt-1 text-[13px] font-[650] leading-tight text-[var(--text-primary)]">
                    {selectedItem ? selectedItem.name : "Позиция не выбрана"}
                  </h2>
                  <p className="mt-1 text-[9px] text-[var(--text-secondary)]">
                    {selectedItem
                      ? `Артикул: ${selectedItem.sku || "-"}`
                      : "Кликните по строке в таблице, чтобы редактировать карточку."}
                  </p>
                </div>
                {selectedInList && selectedItem ? (
                  <StatusBadge tone={selectedItem.isLinkedToOneC ? "success" : "warning"}>
                    {selectedItem.isLinkedToOneC ? "Связана" : "Локальная"}
                  </StatusBadge>
                ) : null}
              </div>

              {selectedItem ? (
                <>
                  <div className="mt-1.5 grid gap-1.5">
                    <CompactField
                      label="Артикул"
                      value={editForm.sku}
                      disabled={!isAdmin}
                      onChange={(value) => setEditForm((current) => ({ ...current, sku: value }))}
                    />
                    <CompactField
                      label="Наименование"
                      value={editForm.name}
                      disabled={!isAdmin}
                      onChange={(value) => setEditForm((current) => ({ ...current, name: value }))}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <CompactField
                        label="Категория"
                        value={editForm.categoryName}
                        disabled={!isAdmin}
                        onChange={(value) =>
                          setEditForm((current) => ({ ...current, categoryName: value }))
                        }
                      />
                      <CompactField
                        label="Группа"
                        value={editForm.groupName}
                        disabled={!isAdmin}
                        onChange={(value) =>
                          setEditForm((current) => ({ ...current, groupName: value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <CompactField
                        label="Цена"
                        value={editForm.price}
                        inputMode="decimal"
                        disabled={!isAdmin}
                        onChange={(value) =>
                          setEditForm((current) => ({ ...current, price: sanitizeMoneyInput(value) }))
                        }
                      />
                      <CompactReadonlyField
                        label="Общий остаток"
                        value={formatStockUnits(selectedItem.quantity)}
                      />
                    </div>
                    <div className="rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] p-2">
                      <div className="min-w-0">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                          Остатки по складам
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                          Общий остаток:{" "}
                          <span className="font-semibold text-[var(--text-primary)]">
                            {formatStockUnits(selectedItem.quantity)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleOpenStockAction(selectedItem, "add")}
                        className="mt-1.5 flex h-[28px] w-full items-center justify-center rounded-[8px] bg-[var(--brand-dark)] px-3 text-[10px] font-semibold leading-none whitespace-nowrap text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                      >
                        Изменить остатки
                      </button>

                      <div className="mt-2 space-y-1">
                        {selectedWarehouseBalances.length > 0 ? (
                          selectedWarehouseBalances.map((warehouse) => (
                            <div
                              key={warehouse.warehouseId}
                              className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-[10px]"
                            >
                              <span className="truncate text-[var(--text-primary)]">
                                {warehouse.warehouseName}
                              </span>
                              <span className="font-semibold text-[var(--stock-ok)] tabular-nums">
                                {formatStockUnits(warehouse.quantity)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[8px] border border-dashed border-[var(--border-color)] bg-white px-2.5 py-2 text-[10px] text-[var(--text-secondary)]">
                            Остатки по складам пока не распределены.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isAdmin ? (
                    <p className="mt-1.5 text-[9px] leading-[14px] text-[var(--text-secondary)]">
                      Режим просмотра. Менять цену, остаток и удалять позиции может только администратор.
                    </p>
                  ) : !editFormValidation.ok ? (
                    <p className="mt-1.5 text-[9px] leading-[14px] text-[var(--stock-empty)]">
                      {editFormValidation.message}
                    </p>
                  ) : null}

                  {isAdmin ? (
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy || !editFormValidation.ok}
                        onClick={handleSaveItem}
                        className="flex h-[32px] items-center justify-center gap-1.5 rounded-[10px] bg-[var(--brand-dark)] px-3 text-[11px] font-semibold text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                      >
                        <SaveIcon className="h-3.5 w-3.5 stroke-[2]" />
                        Сохранить
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setItemPendingDelete(selectedItem)}
                        className="flex h-[32px] items-center justify-center gap-1.5 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 text-[11px] font-semibold text-[var(--stock-empty)] transition-all duration-200 hover:bg-[#FEE2E2] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <TrashIcon className="h-3.5 w-3.5 stroke-[2]" />
                        Удалить
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-1.5 rounded-[10px] border border-dashed border-[var(--border-color)] bg-[#FBFCFE] px-3 py-3 text-[10px] leading-[15px] text-[var(--text-secondary)]">
                  {isAdmin
                    ? "Выберите позицию в таблице слева. Здесь можно менять цену, остаток, категорию, группу и удалять карточку по одной."
                    : "Выберите позицию в таблице слева, чтобы посмотреть карточку товара."}
                </div>
              )}
            </section>

            {isAdmin ? (
              <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
                <button
                  type="button"
                  onClick={() => setIsWarehouseSettingsExpanded((current) => !current)}
                  className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-3 py-1.5 text-left transition hover:bg-white"
                >
                  <div>
                    <p className="text-[9px] font-semibold text-[var(--text-secondary)]">
                      Настройка складов
                    </p>
                    <h2 className="mt-1 text-[13px] font-[650] leading-tight text-[var(--text-primary)]">
                      Локальные склады
                    </h2>
                    <p className="mt-1 text-[9px] text-[var(--text-secondary)]">
                      {isWarehouseSettingsExpanded
                        ? "Добавляйте и удаляйте локальные склады. В 1С они не отправляются."
                        : "Разверните блок, чтобы управлять локальными складами."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="success">{warehouses.length} шт.</StatusBadge>
                    <ChevronToggleIcon
                      className={[
                        "h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-200",
                        isWarehouseSettingsExpanded ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </div>
                </button>

                {isWarehouseSettingsExpanded ? (
                  <>
                    <div className="mt-1.5 flex gap-1.5">
                      <input
                        value={warehouseNameInput}
                        onChange={(event) => setWarehouseNameInput(event.target.value)}
                        placeholder="Название нового склада"
                        className="h-[30px] min-w-0 flex-1 rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                      />
                      <button
                        type="button"
                        disabled={isBusy || !warehouseNameInput.trim()}
                        onClick={handleCreateWarehouse}
                        className="flex h-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--brand-dark)] px-3 text-[10px] font-semibold text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                      >
                        Добавить
                      </button>
                    </div>

                    <div className="mt-1.5 space-y-1">
                      {warehouses.length > 0 ? (
                        warehouses.map((warehouse) => (
                          <div
                            key={warehouse.id}
                            className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                                {warehouse.name}
                              </div>
                              <div className="text-[9px] text-[var(--text-secondary)]">
                                ID: {warehouse.id}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteWarehouse(warehouse.id)}
                              className="flex h-[28px] shrink-0 items-center justify-center rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-2.5 text-[10px] font-semibold text-[var(--stock-empty)] transition-all duration-200 hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Удалить
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[10px] border border-dashed border-[var(--border-color)] bg-[#FBFCFE] px-3 py-3 text-[10px] text-[var(--text-secondary)]">
                          Пока нет складов. Добавьте первый склад вручную или импортируйте остатки из Excel.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}

            {isAdmin ? (
              <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <button
                type="button"
                onClick={() =>
                  setIsCreateExpanded((current) => {
                    const next = !current;
                    if (next) {
                      setCreateForm(buildItemForm(activeWarehouseId, warehouses));
                    }
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-3 py-1.5 text-left transition hover:bg-white"
              >
                <div>
                    <p className="text-[9px] font-semibold text-[var(--text-secondary)]">
                      Новая позиция
                    </p>
                    <h2 className="mt-1 text-[13px] font-[650] leading-tight text-[var(--text-primary)]">
                      Добавление вручную
                    </h2>
                    <p className="mt-1 text-[9px] text-[var(--text-secondary)]">
                    {isCreateExpanded
                      ? "Заполните поля и сохраните локальную позицию."
                      : "Разверните блок, чтобы добавить товар вручную."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#FFF8D9] px-2 py-0.5 text-[9px] font-semibold text-[var(--brand-dark)]">
                      Локально
                    </span>
                  <ChevronToggleIcon
                    className={[
                      "h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-200",
                      isCreateExpanded ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </div>
              </button>

              {isCreateExpanded ? (
                <>
                  <div className="mt-1.5 grid gap-1.5">
                    <CompactField
                      label="Артикул"
                      value={createForm.sku}
                      onChange={(value) => setCreateForm((current) => ({ ...current, sku: value }))}
                    />
                    <CompactField
                      label="Наименование"
                      value={createForm.name}
                      onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <CompactField
                        label="Категория"
                        value={createForm.categoryName}
                        onChange={(value) =>
                          setCreateForm((current) => ({ ...current, categoryName: value }))
                        }
                      />
                      <CompactField
                        label="Группа"
                        value={createForm.groupName}
                        onChange={(value) =>
                          setCreateForm((current) => ({ ...current, groupName: value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <CompactField
                        label="Цена"
                        value={createForm.price}
                        inputMode="decimal"
                        onChange={(value) =>
                          setCreateForm((current) => ({
                            ...current,
                            price: sanitizeMoneyInput(value),
                          }))
                        }
                      />
                      <div className="rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-2 py-1.5 text-[10px] text-[var(--text-secondary)]">
                        Первая строка склада обязательна. Остатки по товару считаются суммой всех складов.
                      </div>
                    </div>
                    <WarehouseFormEditor
                      rows={createForm.warehouses}
                      onChange={(rows) =>
                        setCreateForm((current) => ({
                          ...current,
                          warehouses: rows,
                        }))
                      }
                    />
                  </div>

                  {!createFormValidation.ok ? (
                    <p className="mt-1.5 text-[9px] leading-[14px] text-[var(--stock-empty)]">
                      {createFormValidation.message}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={isBusy || !createFormValidation.ok}
                    onClick={handleCreateItem}
                    className="mt-1.5 flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--brand-dark)] px-3 text-[11px] font-semibold text-white transition-all duration-200 hover:bg-[#10264A] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                  >
                    <PlusIcon className="h-3.5 w-3.5 stroke-[2]" />
                    Добавить позицию
                  </button>
                </>
              ) : null}
              </section>
            ) : null}

            {isAdmin ? (
              <section className="rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
              <p className="text-[9px] font-semibold text-[var(--text-secondary)]">
                Обслуживание каталога
              </p>
              <div className="mt-1.5 grid gap-1.5 text-[10px] text-[var(--text-secondary)]">
                <div className="rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] px-3 py-2">
                  В локальном прайсе сейчас {summary.totalItems} позиций. В текущей выборке видно {summary.visibleItems}.
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleClearCatalog}
                  className="flex h-[32px] items-center justify-center gap-1.5 rounded-[10px] border border-[#FECACA] bg-white px-3 text-[11px] font-semibold text-[var(--stock-empty)] transition-all duration-200 hover:bg-[#FEF2F2] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <TrashIcon className="h-3.5 w-3.5 stroke-[2]" />
                  Очистить весь локальный прайс
                </button>
              </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {stockAction && stockActionItem ? (
        <StockActionDrawer
          item={stockActionItem}
          warehouses={warehouses}
          mode={stockAction.mode}
          form={stockActionForm}
          availableQuantity={stockActionAvailable}
          isBusy={isStockActionBusy}
          onClose={() => setStockAction(null)}
          onFormChange={(patch) =>
            setStockActionForm((current) => ({
              ...current,
              ...patch,
            }))
          }
          onModeChange={(mode) =>
            setStockAction((current) => (current ? { ...current, mode } : current))
          }
          onSubmit={() => void handleSubmitStockAction()}
        />
      ) : null}

      {itemPendingDelete ? (
        <ConfirmDeleteDialog
          itemName={itemPendingDelete.name}
          isBusy={isBusy}
          onCancel={() => setItemPendingDelete(null)}
          onConfirm={() => void handleDeleteItem(itemPendingDelete)}
        />
      ) : null}
    </AppShell>
  );
}
function toPayload(form: ItemFormState):
  | { ok: true; payload: LocalItemPayload }
  | { ok: false; message: string } {
  const validation = validateItemForm(form);
  if (!validation.ok) {
    return validation;
  }

  const warehouses = normalizeWarehouseRows(form.warehouses).map((row) => ({
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName.trim(),
    quantity: parseWarehouseQuantity(row.quantity),
  }));

  return {
    ok: true,
    payload: {
      sku: form.sku.trim(),
      name: form.name.trim(),
      printName: form.name.trim(),
      categoryName: form.categoryName.trim(),
      groupName: form.groupName.trim(),
      price: Number.parseFloat(normalizeMoneyValue(form.price)),
      warehouses,
    },
  };
}

function validateItemForm(form: ItemFormState):
  | { ok: true }
  | { ok: false; message: string } {
  if (!form.name.trim()) {
    return { ok: false, message: "Заполните наименование товара." };
  }

  const price = Number.parseFloat(normalizeMoneyValue(form.price));
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "Цена должна быть числом от 0 и выше." };
  }

  const rows = normalizeWarehouseRows(form.warehouses);
  if (rows.length === 0) {
    return { ok: false, message: "Добавьте хотя бы одну складскую строку." };
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.warehouseName.trim()) {
      return { ok: false, message: "Укажите название склада в каждой строке." };
    }

    const quantity = parseWarehouseQuantity(row.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { ok: false, message: "Остаток по складу должен быть целым числом от 0 и выше." };
    }

    const duplicateKey =
      row.warehouseId !== null
        ? `id:${row.warehouseId}`
        : `name:${row.warehouseName.trim().toLocaleLowerCase("ru")}`;
    if (seen.has(duplicateKey)) {
      return { ok: false, message: "Один и тот же склад нельзя добавлять в товар дважды." };
    }
    seen.add(duplicateKey);
  }

  return { ok: true };
}

function normalizeWarehouseRows(rows: WarehouseFormState[]) {
  return rows
    .map((row) => ({
      ...row,
      warehouseName: row.warehouseName.trim(),
    }))
    .filter(
      (row) =>
        row.warehouseId !== null ||
        row.warehouseName.length > 0 ||
        row.quantity.trim().length > 0,
    );
}

function buildItemForm(activeWarehouseId: number | null, warehouses: Warehouse[]): ItemFormState {
  const preferredWarehouse =
    activeWarehouseId !== null
      ? warehouses.find((warehouse) => warehouse.id === activeWarehouseId) ?? null
      : warehouses.find((warehouse) => warehouse.name === "Основной склад") ?? warehouses[0] ?? null;

  return {
    sku: "",
    name: "",
    categoryName: "",
    groupName: "",
    price: "0.00",
    warehouses: [
      createWarehouseFormState(
        preferredWarehouse?.name ?? "Основной склад",
        "0",
        preferredWarehouse?.id ?? null,
      ),
    ],
  };
}

function createWarehouseFormState(
  warehouseName = "",
  quantity = "0",
  warehouseId: number | null = null,
): WarehouseFormState {
  return {
    key: `warehouse-${Math.random().toString(36).slice(2, 10)}`,
    warehouseId,
    warehouseName,
    quantity,
  };
}

function parseWarehouseQuantity(value: string) {
  const raw = sanitizeIntegerInput(value);
  if (!raw) {
    return 0;
  }
  return Math.max(0, Number.parseInt(raw, 10));
}

function getWarehouseRowsTotal(rows: WarehouseFormState[]) {
  return normalizeWarehouseRows(rows).reduce(
    (sum, row) => sum + parseWarehouseQuantity(row.quantity),
    0,
  );
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

function getDrawerTitle(mode: StockActionMode) {
  if (mode === "add") {
    return "Добавить";
  }
  if (mode === "move") {
    return "Переместить";
  }
  return "Списать";
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function sanitizeMoneyInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [integerPart = "", fractionPart] = normalized.split(".");

  if (fractionPart === undefined) {
    return integerPart;
  }

  return `${integerPart}.${fractionPart.slice(0, 2)}`;
}

function normalizeMoneyValue(value: string) {
  const normalized = sanitizeMoneyInput(value);
  return normalized.trim() ? normalized : "0";
}

function getIntegerQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function formatIntegerInput(value: number) {
  return String(getIntegerQuantity(value));
}

function formatNumberInput(value: number, fractionDigits: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fractionDigits > 0 ? "0.00" : "0";
  }

  return value.toFixed(fractionDigits);
}

function formatMoney(value: number) {
  const rubleSign = "\u20BD";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${rubleSign}`;
}

function formatStockUnits(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(getIntegerQuantity(value))} шт.`;
}

function ActionLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition-all duration-200 hover:bg-[#F8FAFD] active:scale-[0.985]"
    >
      <span className="text-[var(--text-secondary)]">{icon}</span>
      {label}
    </a>
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

function CompactField({
  label,
  value,
  onChange,
  inputMode = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "numeric" | "decimal";
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-[30px] w-full rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)] disabled:cursor-not-allowed disabled:bg-[#F8FAFD] disabled:text-[var(--text-secondary)]"
      />
    </label>
  );
}

function CompactReadonlyField({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <div className="flex h-[30px] w-full items-center justify-between rounded-[9px] border border-[var(--border-color)] bg-[#FCFDFE] px-2.5 text-[11px]">
      <span className="truncate font-semibold text-[var(--text-primary)]">{value}</span>
      {hint ? (
        <span className="shrink-0 pl-2 text-[9px] font-semibold text-[var(--brand-dark)]">
          {hint}
        </span>
      ) : null}
    </div>
  );

  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="block w-full text-left transition hover:[&>div]:border-[var(--brand-yellow)] hover:[&>div]:shadow-[0_0_0_3px_rgba(255,196,0,0.10)]"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </label>
  );
}

function WarehouseFormEditor({
  rows,
  onChange,
  disabled = false,
}: {
  rows: WarehouseFormState[];
  onChange: (rows: WarehouseFormState[]) => void;
  disabled?: boolean;
}) {
  const safeRows = rows.length > 0 ? rows : [createWarehouseFormState("Основной склад", "0")];

  const replaceRow = (rowKey: string, updater: (row: WarehouseFormState) => WarehouseFormState) => {
    onChange(safeRows.map((row) => (row.key === rowKey ? updater(row) : row)));
  };

  const handleRemove = (rowKey: string) => {
    const next = safeRows.filter((row) => row.key !== rowKey);
    onChange(next.length > 0 ? next : [createWarehouseFormState("Основной склад", "0")]);
  };

  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[#FCFDFE] p-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
            Остатки по складам
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
            Общий остаток:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {formatStockUnits(getWarehouseRowsTotal(safeRows))}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...safeRows, createWarehouseFormState()])}
          className="inline-flex h-[28px] items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-white px-2.5 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Склад
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        {safeRows.map((row, index) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_92px_32px] items-end gap-1.5 rounded-[9px] border border-[var(--border-color)] bg-white px-1.5 py-1.5"
          >
            <label className="block min-w-0">
              <span className="mb-1 block text-[9px] font-medium text-[var(--text-secondary)]">
                Склад {safeRows.length > 1 ? index + 1 : ""}
              </span>
              <input
                value={row.warehouseName}
                disabled={disabled}
                onChange={(event) =>
                  replaceRow(row.key, (current) => ({
                    ...current,
                    warehouseName: event.target.value,
                    warehouseId: current.warehouseId,
                  }))
                }
                placeholder="Например, Основной склад"
                className="h-[28px] w-full rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)] disabled:cursor-not-allowed disabled:bg-[#F8FAFD] disabled:text-[var(--text-secondary)]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[9px] font-medium text-[var(--text-secondary)]">
                Остаток
              </span>
              <input
                value={row.quantity}
                inputMode="numeric"
                disabled={disabled}
                onChange={(event) =>
                  replaceRow(row.key, (current) => ({
                    ...current,
                    quantity: sanitizeIntegerInput(event.target.value),
                  }))
                }
                className="h-[28px] w-full rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)] disabled:cursor-not-allowed disabled:bg-[#F8FAFD] disabled:text-[var(--text-secondary)]"
              />
            </label>

            <button
              type="button"
              disabled={disabled}
              onClick={() => handleRemove(row.key)}
              className="flex h-[28px] w-8 items-center justify-center rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] text-[11px] font-semibold text-[var(--stock-empty)] transition hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-60"
              title="Удалить складскую строку"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionMenuButton({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-[11px] font-medium transition",
        destructive
          ? "text-[var(--stock-empty)] hover:bg-[#FEF2F2]"
          : "text-[var(--text-primary)] hover:bg-[#F8FAFD]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StockActionDrawer({
  item,
  warehouses,
  mode,
  form,
  availableQuantity,
  isBusy,
  onClose,
  onFormChange,
  onModeChange,
  onSubmit,
}: {
  item: StockItem;
  warehouses: Warehouse[];
  mode: StockActionMode;
  form: StockActionFormState;
  availableQuantity: number;
  isBusy: boolean;
  onClose: () => void;
  onFormChange: (patch: Partial<StockActionFormState>) => void;
  onModeChange: (mode: StockActionMode) => void;
  onSubmit: () => void;
}) {
  const positiveWarehouses = item.warehouses.filter((warehouse) => getIntegerQuantity(warehouse.quantity) > 0);
  const moveTargets = warehouses.filter(
    (warehouse) => String(warehouse.id) !== form.fromWarehouseId,
  );
  const showWarehouseLabel = mode !== "move";
  const requestedQuantity = Number.parseInt(sanitizeIntegerInput(form.quantity), 10);
  const isSubmitDisabled =
    isBusy ||
    !Number.isFinite(requestedQuantity) ||
    requestedQuantity <= 0 ||
    (mode === "add" && !form.warehouseId) ||
    (mode === "writeoff" &&
      (!form.warehouseId || availableQuantity <= 0 || requestedQuantity > availableQuantity)) ||
    (mode === "move" &&
      (!form.fromWarehouseId ||
        !form.toWarehouseId ||
        form.fromWarehouseId === form.toWarehouseId ||
        availableQuantity <= 0 ||
        requestedQuantity > availableQuantity));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgba(7,22,46,0.18)] backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Закрыть окно"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <section className="relative z-10 flex h-full w-full max-w-[420px] flex-col border-l border-[var(--border-color)] bg-white shadow-[-18px_0_40px_rgba(7,22,46,0.14)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              Управление остатками
            </p>
            <h2 className="mt-1 line-clamp-2 text-[16px] font-[650] leading-tight text-[var(--text-primary)]">
              {item.name}
            </h2>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Артикул: {item.sku || "-"} · Общий остаток: {formatStockUnits(item.quantity)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-color)] bg-white text-[var(--text-secondary)] transition hover:bg-[#F8FAFD]"
          >
            ×
          </button>
        </div>

        <div className="border-b border-[var(--border-color)] px-4 py-2">
          <div className="flex gap-1">
            {(["add", "move", "writeoff"] as StockActionMode[]).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => onModeChange(entry)}
                className={[
                  "flex h-9 items-center rounded-[10px] px-3 text-[11px] font-semibold transition",
                  mode === entry
                    ? entry === "writeoff"
                      ? "bg-[#FEF2F2] text-[var(--stock-empty)]"
                      : "bg-[var(--brand-dark)] text-white"
                    : "bg-[#F8FAFD] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                {getDrawerTitle(entry)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="rounded-[12px] border border-[var(--border-color)] bg-[#FCFDFE] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              Остатки по складам
            </div>
            <div className="mt-2 space-y-1.5">
              {positiveWarehouses.length > 0 ? (
                positiveWarehouses.map((warehouse) => (
                  <div
                    key={warehouse.warehouseId}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-[11px]"
                  >
                    <span className="truncate text-[var(--text-primary)]">{warehouse.warehouseName}</span>
                    <span className="font-semibold text-[var(--stock-ok)] tabular-nums">
                      {formatStockUnits(warehouse.quantity)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-[10px] border border-dashed border-[var(--border-color)] bg-white px-3 py-3 text-[11px] text-[var(--text-secondary)]">
                  По складам пока нет остатков.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {showWarehouseLabel ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                  Склад
                </span>
                <select
                  value={form.warehouseId}
                  onChange={(event) => onFormChange({ warehouseId: event.target.value })}
                  className="h-[36px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                >
                  <option value="">Выберите склад</option>
                  {(mode === "add" ? warehouses : positiveWarehouses).map((warehouse) => (
                    <option
                      key={"warehouseId" in warehouse ? warehouse.warehouseId : warehouse.id}
                      value={"warehouseId" in warehouse ? warehouse.warehouseId : warehouse.id}
                    >
                      {"warehouseName" in warehouse ? warehouse.warehouseName : warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Откуда
                  </span>
                  <select
                    value={form.fromWarehouseId}
                    onChange={(event) => onFormChange({ fromWarehouseId: event.target.value })}
                    className="h-[36px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                  >
                    <option value="">Выберите склад</option>
                    {positiveWarehouses.map((warehouse) => (
                      <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                        {warehouse.warehouseName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Куда
                  </span>
                  <select
                    value={form.toWarehouseId}
                    onChange={(event) => onFormChange({ toWarehouseId: event.target.value })}
                    className="h-[36px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                  >
                    <option value="">Выберите склад</option>
                    {moveTargets.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {mode !== "add" ? (
              <div className="space-y-1">
                <div className="rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  Доступно:{" "}
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                    {formatStockUnits(availableQuantity)}
                  </span>
                </div>
                {Number.isFinite(requestedQuantity) &&
                requestedQuantity > 0 &&
                requestedQuantity > availableQuantity ? (
                  <p className="text-[10px] text-[var(--stock-empty)]">
                    Нельзя указать количество больше доступного остатка.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                Количество
              </span>
              <input
                value={form.quantity}
                inputMode="numeric"
                onChange={(event) =>
                  onFormChange({ quantity: sanitizeIntegerInput(event.target.value) })
                }
                className="h-[36px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                {mode === "writeoff" ? "Причина списания" : "Комментарий"}
              </span>
              <textarea
                value={form.comment}
                onChange={(event) => onFormChange({ comment: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-[var(--border-color)] px-4 py-3">
          <button
            type="button"
            disabled={isSubmitDisabled}
            onClick={onSubmit}
            className={[
              "flex h-[38px] w-full items-center justify-center rounded-[12px] px-4 text-[12px] font-semibold transition-all duration-200 active:scale-[0.985]",
              mode === "writeoff"
                ? "bg-[#FEF2F2] text-[var(--stock-empty)] hover:bg-[#FDE8E8] disabled:bg-[#F8D7DA]"
                : "bg-[var(--brand-dark)] text-white hover:bg-[#10264A] disabled:bg-[#CBD5E1]",
            ].join(" ")}
          >
            {mode === "add" ? "Добавить остаток" : mode === "move" ? "Переместить" : "Списать"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDeleteDialog({
  itemName,
  isBusy,
  onCancel,
  onConfirm,
}: {
  itemName: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,22,46,0.2)] px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--border-color)] bg-white p-5 shadow-[0_22px_48px_rgba(7,22,46,0.16)]">
        <h3 className="text-[16px] font-[650] text-[var(--text-primary)]">Удалить товар?</h3>
        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
          Товар "{itemName}" будет удален из локального прайса вместе с остатками по всем складам.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[38px] items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className="flex h-[38px] items-center justify-center rounded-[12px] bg-[#EF4444] text-[12px] font-semibold text-white transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Удалить товар
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyStateCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center px-4 py-5 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#FBFCFE] text-[var(--brand-dark)] shadow-[0_8px_18px_rgba(7,22,46,0.06)]">
        {icon}
      </div>
      <p className="mt-2.5 text-[13px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1 max-w-[30rem] text-[10px] leading-[16px] text-[var(--text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold",
        tone === "success"
          ? "bg-[#ECFDF3] text-[var(--stock-ok)]"
          : "bg-[#FFF7E8] text-[#B45309]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_2.2fr_1.3fr_1.1fr_1fr_0.8fr_0.9fr_1fr_0.55fr] items-center gap-3 border-t border-[var(--border-color)] px-3 py-1.5 first:border-t-0"
        >
          <div className="h-3 w-16 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-full animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-16 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-12 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-16 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="h-3 w-16 animate-pulse rounded-full bg-[#EEF2F7]" />
          <div className="ml-auto h-7 w-7 animate-pulse rounded-[9px] bg-[#EEF2F7]" />
        </div>
      ))}
    </div>
  );
}

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
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

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 4v10M8 10l4 4 4-4M5 19.5h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloudArrowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M8.5 18.5h8a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.5 9.7 3.5 3.5 0 0 0 8.5 18.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 19V8M8.5 11.5 12 8l3.5 3.5M6 19.5h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkBoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3.5 4.5 7.3v9.4L12 20.5l7.5-3.8V7.3L12 3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 7 .8 1.9 2.1.2-1.6 1.4.5 2-1.8-1-1.8 1 .5-2-1.6-1.4 2.1-.2L12 7Z"
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

function SaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h9.4L19 8.1V20M8 20v-6h8v6M8 5v4h6V5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4.5 7h15M9 7V4.5h6V7M8 10.5v6M12 10.5v6M16 10.5v6M6.5 7l.8 11a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m15 6-6 6 6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function ChevronToggleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
