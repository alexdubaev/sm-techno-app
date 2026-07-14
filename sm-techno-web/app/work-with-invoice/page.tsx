"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import {
  fetchStockItem,
  fetchContracts,
  fetchCounterparties,
  fetchOrganizations,
  fetchSystemSettings,
  sendOrderToOneC,
  syncReferences,
  testOneCAccess,
} from "@/lib/api";
import {
  loadDraftLinesFromStorage,
  loadInvoiceFormStateFromStorage,
  saveDraftLinesToStorage,
  saveInvoiceFormStateToStorage,
  type InvoiceFormState,
} from "@/lib/storage";
import type {
  Contract,
  Counterparty,
  DraftLine,
  Organization,
  StockItem,
  SystemSettings,
} from "@/lib/types";
import { calculateAmountWithoutVat, calculateVatAmount, parseVatPercent } from "@/lib/vat";

const TODAY = new Date().toISOString().slice(0, 10);

const INVOICE_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "index", width: 34, minWidth: 30, maxWidth: 60 },
  { key: "sku", width: 96, minWidth: 84, maxWidth: 160 },
  { key: "name", width: 270, minWidth: 190, maxWidth: 460 },
  { key: "warehouse", width: 168, minWidth: 140, maxWidth: 260 },
  { key: "stock", width: 68, minWidth: 60, maxWidth: 110 },
  { key: "quantity", width: 130, minWidth: 116, maxWidth: 190 },
  { key: "price", width: 96, minWidth: 84, maxWidth: 150 },
  { key: "vat", width: 92, minWidth: 80, maxWidth: 140 },
  { key: "amount", width: 106, minWidth: 90, maxWidth: 160 },
  { key: "remove", width: 38, minWidth: 34, maxWidth: 70 },
];

export default function WorkWithInvoicePage() {
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [itemDetailsById, setItemDetailsById] = useState<Record<number, StockItem>>({});

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [contractId, setContractId] = useState<number | null>(null);
  const [organizationKey, setOrganizationKey] = useState("");
  const [orderDate, setOrderDate] = useState(TODAY);
  const [comment, setComment] = useState("");
  const [counterpartyInput, setCounterpartyInput] = useState("");

  const [isReferencesLoading, setIsReferencesLoading] = useState(true);
  const [isSyncingReferences, setIsSyncingReferences] = useState(false);
  const [isTestingOneC, setIsTestingOneC] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-invoice-table-widths-v2",
    INVOICE_TABLE_COLUMNS,
  );

  useEffect(() => {
    const savedDraft = loadDraftLinesFromStorage();
    if (savedDraft) {
      setDraftLines(sanitizeDraftLines(savedDraft));
    }

    const savedForm = loadInvoiceFormStateFromStorage();
    if (savedForm) {
      if (typeof savedForm.counterpartyId === "number") {
        setCounterpartyId(savedForm.counterpartyId);
      }
      if (typeof savedForm.contractId === "number") {
        setContractId(savedForm.contractId);
      }
      if (typeof savedForm.organizationKey === "string") {
        setOrganizationKey(savedForm.organizationKey);
      }
      if (typeof savedForm.orderDate === "string" && savedForm.orderDate) {
        setOrderDate(savedForm.orderDate);
      }
      if (typeof savedForm.comment === "string") {
        setComment(savedForm.comment);
      }
    }
  }, []);

  useEffect(() => {
    setQuantityInputs((prev) => {
      const next: Record<string, string> = {};

      for (const line of draftLines) {
        const lineKey = getDraftLineKey(line);
        const currentInput = prev[lineKey];
        const normalized = formatEditableQuantity(line.quantity);

        next[lineKey] =
          currentInput !== undefined && parseQuantityInput(currentInput) === line.quantity
            ? currentInput
            : normalized;
      }

      return next;
    });
  }, [draftLines]);

  useEffect(() => {
    let cancelled = false;
    const missingItemIds = Array.from(
      new Set(
        draftLines
          .map((line) => line.itemId)
          .filter((itemId) => !itemDetailsById[itemId]),
      ),
    );

    if (missingItemIds.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(missingItemIds.map((itemId) => fetchStockItem(itemId))).then((items) => {
      if (cancelled) {
        return;
      }
      setItemDetailsById((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (item) {
            next[item.id] = item;
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [draftLines, itemDetailsById]);

  useEffect(() => {
    const state: InvoiceFormState = {
      counterpartyId,
      contractId,
      organizationKey,
      orderDate,
      comment,
    };
    saveInvoiceFormStateToStorage(state);
  }, [comment, contractId, counterpartyId, orderDate, organizationKey]);

  useEffect(() => {
    void fetchSystemSettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings);
        setOrganizationKey((current) => current || loadedSettings.default_organization_key || "");
      })
      .catch(() => {
        setSettings(null);
      });
  }, []);

  useEffect(() => {
    void loadReferences();
  }, []);

  useEffect(() => {
    if (!counterpartyId) {
      setContracts([]);
      setContractId(null);
      return;
    }

    void fetchContracts(counterpartyId)
      .then((items) => {
        setContracts(items);
        setContractId((current) =>
          items.some((item) => item.id === current) ? current : null,
        );
      })
      .catch((requestError: unknown) => {
        setContracts([]);
        setError(getErrorMessage(requestError, "Не удалось загрузить договоры."));
      });
  }, [counterpartyId]);

  const selectedCounterparty = useMemo(
    () => counterparties.find((item) => item.id === counterpartyId) ?? null,
    [counterparties, counterpartyId],
  );

  useEffect(() => {
    if (selectedCounterparty) {
      setCounterpartyInput(selectedCounterparty.name);
    }
  }, [selectedCounterparty]);

  const vatPercent = useMemo(() => parseVatPercent(settings?.vat_percent), [settings?.vat_percent]);
  const pricesIncludeVat = settings
    ? settings.vat_included === "1" && settings.sum_includes_vat === "1"
    : true;

  const totals = useMemo(() => {
    const quantity = draftLines.reduce((sum, line) => sum + line.quantity, 0);
    const amount = draftLines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const vatAmount = calculateVatAmount(amount, vatPercent, { includedInPrice: pricesIncludeVat });
    const amountWithoutVat = calculateAmountWithoutVat(amount, vatPercent, {
      includedInPrice: pricesIncludeVat,
    });
    return { quantity, amount, vatAmount, amountWithoutVat };
  }, [draftLines, pricesIncludeVat, vatPercent]);

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

  const updateLineQuantity = (lineId: string, quantity: number | string) => {
    setAndPersistDraftLines((prev) =>
      prev
        .map((line) => {
          if (line.lineId !== lineId) {
            return line;
          }

          const safeQuantity = clampQuantity(quantity, line.availableOnWarehouse);
          if (safeQuantity <= 0) {
            return null;
          }

          return { ...line, quantity: safeQuantity };
        })
        .filter((line): line is DraftLine => line !== null),
    );
  };

  const removeLine = (lineId: string) => {
    setAndPersistDraftLines((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const handleQuantityInputChange = (lineId: string, rawValue: string, available: number) => {
    if (!/^\d*$/.test(rawValue)) {
      return;
    }

    setQuantityInputs((prev) => ({ ...prev, [lineId]: rawValue }));

    const parsed = parseQuantityInput(rawValue);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= getAvailableUnits(available)) {
      updateLineQuantity(lineId, parsed);
    }
  };

  const handleQuantityInputBlur = (lineId: string, available: number) => {
    const safeQuantity = clampQuantity(quantityInputs[lineId] ?? "", available);
    if (safeQuantity <= 0) {
      removeLine(lineId);
      return;
    }

    updateLineQuantity(lineId, safeQuantity);
    setQuantityInputs((prev) => ({
      ...prev,
      [lineId]: formatEditableQuantity(safeQuantity),
    }));
  };

  const changeLineWarehouse = (lineId: string, nextWarehouseId: number) => {
    setAndPersistDraftLines((previous) => {
      const sourceLine = previous.find((line) => line.lineId === lineId);
      if (!sourceLine) {
        return previous;
      }

      const itemDetails = itemDetailsById[sourceLine.itemId];
      const nextWarehouse = itemDetails?.warehouses.find(
        (warehouse) => warehouse.warehouseId === nextWarehouseId,
      );
      if (!nextWarehouse) {
        return previous;
      }

      const nextLineId = buildDraftLineKey(sourceLine.itemId, nextWarehouseId);
      const safeQuantity = clampQuantity(sourceLine.quantity, nextWarehouse.quantity);
      const remaining = previous.filter((line) => line.lineId !== lineId);
      const existingTarget = remaining.find((line) => line.lineId === nextLineId);

      if (safeQuantity <= 0) {
        return remaining;
      }

      if (existingTarget) {
        return remaining.map((line) =>
          line.lineId === nextLineId
            ? {
                ...line,
                quantity: clampQuantity(line.quantity + safeQuantity, nextWarehouse.quantity),
                available: nextWarehouse.quantity,
                availableOnWarehouse: nextWarehouse.quantity,
                warehouseName: nextWarehouse.warehouseName,
                rack: nextWarehouse.rack,
                cell: nextWarehouse.cell,
                locationLabel: nextWarehouse.locationLabel,
              }
            : line,
        );
      }

      return [
        ...remaining,
        {
          ...sourceLine,
          lineId: nextLineId,
          warehouseId: nextWarehouseId,
          warehouseName: nextWarehouse.warehouseName,
          rack: nextWarehouse.rack,
          cell: nextWarehouse.cell,
          locationLabel: nextWarehouse.locationLabel,
          available: nextWarehouse.quantity,
          availableOnWarehouse: nextWarehouse.quantity,
          quantity: safeQuantity,
        },
      ];
    });
  };

  async function loadReferences() {
    setIsReferencesLoading(true);
    try {
      let [loadedCounterparties, loadedOrganizations] = await Promise.all([
        fetchCounterparties(),
        fetchOrganizations(),
      ]);

      const referencesAreMissing =
        loadedCounterparties.length === 0 || loadedOrganizations.length === 0;

      if (referencesAreMissing) {
        await syncReferences();
        [loadedCounterparties, loadedOrganizations] = await Promise.all([
          fetchCounterparties(),
          fetchOrganizations(),
        ]);
      }

      setCounterparties(loadedCounterparties);
      setOrganizations(loadedOrganizations);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить справочники."));
    } finally {
      setIsReferencesLoading(false);
    }
  }

  async function handleTestOneC() {
    setError(null);
    setMessage(null);
    setIsTestingOneC(true);

    try {
      const result = await testOneCAccess();
      setMessage(
        `Подключение к 1С работает. Контрагентов: ${result.counterparties}, организаций: ${result.organizations}.`,
      );
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось проверить доступ к 1С."));
    } finally {
      setIsTestingOneC(false);
    }
  }

  async function handleSyncReferences() {
    setError(null);
    setMessage(null);
    setIsSyncingReferences(true);

    try {
      const result = await syncReferences();
      await loadReferences();
      if (counterpartyId) {
        const items = await fetchContracts(counterpartyId);
        setContracts(items);
        setContractId((current) => (items.some((item) => item.id === current) ? current : null));
      }
      setMessage(
        `Справочники обновлены. Контрагентов: ${result.counterparties}, договоров: ${result.contracts}, организаций: ${result.organizations}.`,
      );
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось синхронизировать справочники."));
    } finally {
      setIsSyncingReferences(false);
    }
  }

  async function handleSendOrder() {
    if (draftLines.length === 0) {
      setError("Счет пуст. Сначала добавьте товары из остатков.");
      return;
    }
    if (!counterpartyId) {
      setError("Выберите контрагента.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSending(true);

    try {
      const result = await sendOrderToOneC({
        counterpartyId,
        contractId,
        organizationKey,
        orderDate,
        comment,
        draftLines: draftLines.map((line) => ({
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantity: line.quantity,
          price: line.price,
        })),
      });

      setAndPersistDraftLines([]);
      setQuantityInputs({});
      setComment("");
      setContractId(null);

      const number = result.onecDocument.number || result.order?.onecNumber || "без номера";
      setMessage(`Заказ успешно отправлен в 1С. Номер 1С: ${number}. История обновлена в разделе "Заказы".`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось отправить заказ в 1С."));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div className="max-w-[40rem]">
            <h1 className="text-[17px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Работа со счетом
            </h1>
            <p className="mt-0.5 max-w-[40rem] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Заполняем шапку, проверяем табличную часть и отправляем заказ в 1С с записью в историю.
            </p>
          </div>

          <div className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[11px] border border-[var(--border-color)] bg-[#FCFDFE] px-2.5 py-1 text-[9px] text-[var(--text-secondary)]">
            <span>Позиции: {draftLines.length}</span>
            <span className="h-3 w-px bg-[var(--border-color)]" />
            <span>Количество: {totals.quantity}</span>
            <span className="h-3 w-px bg-[var(--border-color)]" />
            <span>НДС {formatVatPercent(vatPercent)}: {formatMoney(totals.vatAmount)}</span>
            <span className="h-3 w-px bg-[var(--border-color)]" />
            <span className="font-medium text-[10px] text-[var(--text-primary)]">{formatMoney(totals.amount)}</span>
          </div>
        </header>

        <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_124px]">
            <FieldBlock label="Контрагент">
              <input
                list="counterparty-options"
                value={counterpartyInput}
                placeholder="Начните вводить контрагента"
                autoComplete="off"
                onChange={(event) => {
                  const value = event.target.value;
                  setCounterpartyInput(value);

                  const normalized = value.trim().toLocaleLowerCase("ru-RU");
                  if (!normalized) {
                    setCounterpartyId(null);
                    return;
                  }

                  const matched = counterparties.find(
                    (item) => item.name.trim().toLocaleLowerCase("ru-RU") === normalized,
                  );
                  setCounterpartyId(matched?.id ?? null);
                }}
                onBlur={() => {
                  const normalized = counterpartyInput.trim().toLocaleLowerCase("ru-RU");
                  if (!normalized) {
                    setCounterpartyId(null);
                    setCounterpartyInput("");
                    return;
                  }

                  const matched = counterparties.find(
                    (item) => item.name.trim().toLocaleLowerCase("ru-RU") === normalized,
                  );

                  if (matched) {
                    setCounterpartyId(matched.id);
                    setCounterpartyInput(matched.name);
                    return;
                  }

                  if (selectedCounterparty) {
                    setCounterpartyInput(selectedCounterparty.name);
                    return;
                  }

                  setCounterpartyInput("");
                }}
                className={fieldClassName}
              />
              <datalist id="counterparty-options">
                {counterparties.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </FieldBlock>

            <FieldBlock label="Договор">
              <select
                value={contractId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setContractId(value ? Number(value) : null);
                }}
                className={fieldClassName}
              >
                <option value="">Без договора</option>
                {contracts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Организация">
              <select
                value={organizationKey}
                onChange={(event) => setOrganizationKey(event.target.value)}
                className={fieldClassName}
              >
                <option value="">По умолчанию из настроек</option>
                {organizations.map((item) => (
                  <option key={item.onecKey} value={item.onecKey}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Дата">
              <input
                type="date"
                value={orderDate}
                onChange={(event) => setOrderDate(event.target.value)}
                className={fieldClassName}
              />
            </FieldBlock>
          </div>

          <div className="mt-1.5 grid gap-1.5 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="flex min-h-[32px] items-center rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[10px] text-[var(--text-secondary)]">
              Доступ к 1С берется из карточки текущего пользователя. Администратор может изменить его в настройках пользователей.
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTestOneC}
                disabled={isTestingOneC || isSyncingReferences || isSending}
                className="app-action-button app-action-button--sm"
              >
                {isTestingOneC ? "Проверка..." : "Проверить 1С"}
              </button>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSyncReferences}
                disabled={isReferencesLoading || isSyncingReferences || isSending}
                className="app-action-button app-action-button--sm"
              >
                {isSyncingReferences ? "Синхронизация..." : "Синхронизировать справочники"}
              </button>
            </div>
          </div>

          <div className="mt-1.5 grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <FieldBlock label="Комментарий">
              <input
                type="text"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий к заказу"
                className={fieldClassName}
              />
            </FieldBlock>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSendOrder}
                disabled={isSending || draftLines.length === 0}
                className="app-action-button app-action-button--sm"
              >
                {isSending ? "Отправка..." : "Отправить в 1С"}
              </button>
            </div>
          </div>

          {selectedCounterparty ? (
            <div className="mt-1.5 text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Выбран: <span className="font-medium text-[var(--text-primary)]">{selectedCounterparty.name}</span>
              {selectedCounterparty.inn ? ` · ИНН ${selectedCounterparty.inn}` : ""}
              {settings?.base_url ? " · база 1С подключена" : " · в настройках еще не заполнен URL базы 1С"}
            </div>
          ) : (
            <div className="mt-1.5 text-[10px] leading-[14px] text-[var(--text-secondary)]">
              {isReferencesLoading
                ? "Загружаем справочники..."
                : "Если список контрагентов пуст, попросите администратора заполнить 1С-доступ пользователя и выполните синхронизацию справочников."}
            </div>
          )}

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

        <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_200px] xl:items-start">
          <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">Табличная часть счета</h2>
              <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                перед отправкой в 1С
              </span>
            </div>

            <div className="mt-1.5 overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-white">
              {draftLines.length === 0 ? (
                <div className="px-3 py-5 text-[11px] leading-4 text-[var(--text-secondary)]">
                  Счет пока пуст. Вернитесь в остатки и добавьте нужные позиции.
                </div>
              ) : (
                <div ref={containerRef} className="max-h-[calc(100dvh-9.5rem)] overflow-auto">
                  <table
                    className="min-w-full table-fixed border-collapse"
                    style={{ width: tableWidth }}
                  >
                    <colgroup>
                      {INVOICE_TABLE_COLUMNS.map((column) => (
                        <col key={column.key} style={{ width: getWidth(column.key) }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                      <tr>
                        <ResizableTableHeader columnKey="index" label="№" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="sku" label="Артикул" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="name" label="Наименование" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="warehouse" label="Склад" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                        <ResizableTableHeader columnKey="stock" label="Остаток" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="quantity" label="Кол-во" onResizeStart={onResizeStart} className="px-3 py-2 text-center font-semibold" />
                        <ResizableTableHeader columnKey="price" label="Цена" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="vat" label="НДС" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="amount" label="Сумма" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                        <ResizableTableHeader columnKey="remove" label="×" onResizeStart={onResizeStart} className="px-3 py-2 text-center font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {draftLines.map((line, index) => {
                        const lineKey = line.lineId;
                        const availableUnits = getAvailableUnits(line.availableOnWarehouse);
                        const rawInput =
                          quantityInputs[lineKey] ?? formatEditableQuantity(line.quantity);
                        const parsedInput = parseQuantityInput(rawInput);
                        const inputIsValid = Number.isFinite(parsedInput) && parsedInput > 0;
                        const inputWithinStock = inputIsValid && parsedInput <= availableUnits;
                        const itemDetails = itemDetailsById[line.itemId];
                        const warehouseOptions = itemDetails?.warehouses ?? [];
                        const currentWarehouse = warehouseOptions.find(
                          (warehouse) => warehouse.warehouseId === line.warehouseId,
                        );
                        const lineLocationLabel =
                          line.locationLabel?.trim() || currentWarehouse?.locationLabel || "";

                        return (
                          <tr
                            key={line.lineId}
                            className="border-t border-[var(--border-color)] align-top text-[10px] text-[var(--text-primary)]"
                          >
                            <td className="px-3 py-1.5 text-[10px] tabular-nums text-[var(--text-secondary)]">
                              {index + 1}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="space-y-0.5">
                                <div className="text-[10px] font-semibold tabular-nums">
                                  {line.sku || "-"}
                                </div>
                                <div className="text-[9px] text-[var(--text-secondary)]">
                                  {line.categoryName || "Без категории"}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="line-clamp-2 text-[11px] font-medium leading-[15px] text-[var(--text-primary)]">
                                {line.name}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              {warehouseOptions.length > 0 ? (
                                <select
                                  value={line.warehouseId}
                                  onChange={(event) =>
                                    changeLineWarehouse(line.lineId, Number(event.target.value))
                                  }
                                  className="h-7 w-full rounded-[8px] border border-[var(--border-color)] bg-white px-2 text-[10px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                                >
                                  {warehouseOptions.map((warehouse) => (
                                    <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                                      {warehouse.warehouseName}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="text-[10px] text-[var(--text-secondary)]">
                                  {line.warehouseName}
                                </div>
                              )}
                              {lineLocationLabel ? (
                                <div className="mt-1 truncate text-[9px] text-[var(--text-secondary)]">
                                  {lineLocationLabel}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div
                                className={[
                                  "text-[10px] font-semibold tabular-nums",
                                  availableUnits > 0
                                    ? "text-[var(--stock-ok)]"
                                    : "text-[var(--stock-empty)]",
                                ].join(" ")}
                              >
                                {availableUnits}
                              </div>
                              <div className="text-[9px] text-[var(--text-secondary)]">шт.</div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center justify-center gap-1 rounded-[9px] border border-[var(--border-color)] bg-[var(--panel-muted)] p-1">
                                <QuantityButton
                                  label={`Уменьшить количество для ${line.name}`}
                                  onClick={() => updateLineQuantity(lineKey, Math.max(1, line.quantity - 1))}
                                  disabled={line.quantity <= 1}
                                >
                                  -
                                </QuantityButton>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={rawInput}
                                  onChange={(event) =>
                                    handleQuantityInputChange(
                                      lineKey,
                                      event.target.value,
                                      line.availableOnWarehouse,
                                    )
                                  }
                                  onBlur={() =>
                                    handleQuantityInputBlur(lineKey, line.availableOnWarehouse)
                                  }
                                  className="h-6 w-12 rounded-[7px] border border-transparent bg-white px-1 text-center text-[10px] font-semibold tabular-nums text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
                                />
                                <QuantityButton
                                  label={`Увеличить количество для ${line.name}`}
                                  onClick={() => updateLineQuantity(lineKey, line.quantity + 1)}
                                  disabled={line.quantity >= availableUnits}
                                >
                                  +
                                </QuantityButton>
                              </div>
                              {!inputIsValid ? (
                                <div className="mt-1 text-center text-[9px] text-[var(--stock-empty)]">
                                  Введите целое число
                                </div>
                              ) : !inputWithinStock ? (
                                <div className="mt-1 text-center text-[9px] text-[var(--stock-empty)]">
                                  Доступно {availableUnits}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-right text-[10px] font-medium tabular-nums text-[var(--text-primary)]">
                              {formatMoney(line.price)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-[10px] font-medium tabular-nums text-[var(--text-primary)]">
                              {formatMoney(
                                calculateVatAmount(line.quantity * line.price, vatPercent, {
                                  includedInPrice: pricesIncludeVat,
                                }),
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                              {formatMoney(line.quantity * line.price)}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(line.lineId)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] border border-[var(--border-color)] bg-white text-[12px] leading-none text-[var(--text-secondary)] transition-colors duration-200 hover:border-[rgba(239,68,68,0.35)] hover:text-[var(--stock-empty)]"
                                aria-label={`Удалить ${line.name}`}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] bg-[#FBFCFE] px-3 py-2 text-[10px]">
                <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                  <span>Строк: {draftLines.length}</span>
                  <span>Количество: {totals.quantity} шт.</span>
                </div>
                <div className="flex items-center gap-4 text-[var(--text-primary)]">
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                      Без НДС
                    </div>
                    <div className="text-[10px] font-semibold tabular-nums">
                      {formatMoney(totals.amountWithoutVat)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                      НДС {formatVatPercent(vatPercent)}
                    </div>
                    <div className="text-[10px] font-semibold tabular-nums">
                      {formatMoney(totals.vatAmount)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                      Итого
                    </div>
                    <div className="text-[14px] font-[650] tabular-nums text-[var(--brand-dark)]">
                      {formatMoney(totals.amount)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
            <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">Сводка</h2>
            <div className="mt-1.5 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Позиции</span>
                <span className="tabular-nums">{draftLines.length}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Количество</span>
                <span className="tabular-nums">{totals.quantity}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Без НДС</span>
                <span className="tabular-nums">{formatMoney(totals.amountWithoutVat)}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>НДС {formatVatPercent(vatPercent)}</span>
                <span className="tabular-nums">{formatMoney(totals.vatAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Контрагент</span>
                <span className="max-w-[108px] truncate text-right text-[var(--text-primary)]">
                  {selectedCounterparty?.name || "Не выбран"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-1.5 text-[var(--text-primary)]">
                <span className="font-semibold">Итого</span>
                <span className="text-[15px] font-[650] tabular-nums">
                  {formatMoney(totals.amount)}
                </span>
              </div>
            </div>

            <Link
              href="/orders"
              className="app-action-button app-action-button--sm mt-2 w-full"
            >
              История заказов
            </Link>
            <Link
              href="/"
              className="app-action-button app-action-button--sm mt-1.5 w-full"
            >
              Вернуться в остатки
            </Link>

            <p className="mt-1.5 text-[9px] leading-[13px] text-[var(--text-secondary)]">
              После успешной отправки заказ попадет в раздел истории и спишет остаток по строкам.
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function sanitizeDraftLines(lines: DraftLine[]) {
  return lines
    .map((line) => {
      if (!line.warehouseId || !line.warehouseName) {
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
        available: availableOnWarehouse,
        rack: line.rack ?? "",
        cell: line.cell ?? "",
        locationLabel: line.locationLabel ?? "",
        availableOnWarehouse,
      };
    })
    .filter((line): line is DraftLine => line !== null);
}

function buildDraftLineKey(itemId: number, warehouseId: number) {
  return `${itemId}:${warehouseId}`;
}

function getDraftLineKey(line: DraftLine) {
  return line.lineId || buildDraftLineKey(line.itemId, line.warehouseId);
}

function getAvailableUnits(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
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

function formatEditableQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return String(Math.trunc(value));
}

function formatMoney(value: number) {
  const rubleSign = "\u20BD";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${rubleSign}`;
}

function formatVatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
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
      className="flex h-6 w-6 items-center justify-center rounded-[8px] border border-[var(--border-color)] bg-white text-[13px] text-[var(--brand-dark)] transition-all duration-200 hover:bg-[#F8FAFD] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const fieldClassName =
  "h-[32px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]";
