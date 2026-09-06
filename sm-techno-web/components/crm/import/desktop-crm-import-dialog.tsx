"use client";

import { useState, type SyntheticEvent } from "react";

import { importCrmFile, previewCrmImport } from "@/lib/api";
import type { CrmImportPreview, CrmTab } from "@/lib/types";

type TargetMode = "existing" | "new";

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function DesktopCrmImportDialog({
  ownerId,
  tabs,
  onClose,
  onImported,
}: {
  ownerId: number;
  tabs: CrmTab[];
  onClose: () => void;
  onImported: (targetTabId: number) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>("existing");
  const [targetTabId, setTargetTabId] = useState<number | null>(tabs[0]?.id ?? null);
  const [newTabName, setNewTabName] = useState("");
  const [includeExistingClients, setIncludeExistingClients] = useState(true);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedTarget = targetMode === "existing"
    ? { targetTabId, newTabName: null }
    : { targetTabId: null, newTabName: newTabName.trim() || null };
  const isBlocked = Boolean(preview && (preview.errors.length > 0 || preview.duplicateConflicts > 0));

  const resetPreview = () => {
    setPreview(null);
    setError(null);
  };

  const validate = () => {
    if (!file) {
      setError("Выберите Excel-файл .xlsx.");
      return false;
    }
    if (targetMode === "existing" && targetTabId === null) {
      setError("Выберите вкладку для импорта.");
      return false;
    }
    if (targetMode === "new" && !newTabName.trim()) {
      setError("Укажите название новой вкладки.");
      return false;
    }
    return true;
  };

  const submitPreview = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate() || !file) return;
    setIsPreviewing(true);
    setError(null);
    try {
      setPreview(await previewCrmImport({ file, ownerId, ...selectedTarget, includeExistingClients }));
    } catch (cause) {
      setPreview(null);
      setError(errorMessage(cause, "Не удалось проверить CRM Excel файл."));
    } finally {
      setIsPreviewing(false);
    }
  };

  const submitImport = async () => {
    if (!preview || isBlocked || !validate() || !file) return;
    setIsImporting(true);
    setError(null);
    try {
      const result = await importCrmFile({ file, ownerId, ...selectedTarget, includeExistingClients });
      await onImported(result.targetTab.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось импортировать CRM Excel файл."));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <dialog open aria-modal="true" aria-labelledby="desktop-crm-import-title" className="fixed inset-0 z-50 flex h-full max-h-none w-full max-w-none items-center justify-center bg-[#07162e]/35 p-4">
      <form onSubmit={submitPreview} className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white p-5 shadow-[0_24px_64px_rgba(7,22,46,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="desktop-crm-import-title" className="text-[18px] font-bold text-[var(--text-primary)]">Загрузка клиентов из Excel</h2><p className="mt-1 text-[12px] text-[var(--text-secondary)]">Файл сначала проверяется. Данные будут сохранены только после подтверждения.</p></div>
          <button type="button" onClick={onClose} className="rounded-[8px] px-2 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB]">Закрыть</button>
        </div>

        {error ? <div role="alert" className="mt-4 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</div> : null}

        <label className="mt-5 grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]"><span>Excel-файл</span><input aria-label="Excel-файл" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); resetPreview(); }} className="block w-full rounded-[10px] border border-[var(--border-color)] p-2 text-[12px]" /></label>

        <fieldset className="mt-4 grid gap-3"><legend className="text-[12px] font-semibold text-[var(--text-secondary)]">Куда импортировать</legend>
          <label className="flex items-center gap-2 text-[12px]"><input type="radio" name="crm-import-target" checked={targetMode === "existing"} onChange={() => { setTargetMode("existing"); resetPreview(); }} />Существующая вкладка</label>
          {targetMode === "existing" ? <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]"><span>Вкладка для импорта</span><select aria-label="Вкладка для импорта" value={targetTabId ?? ""} onChange={(event) => { setTargetTabId(Number(event.target.value)); resetPreview(); }} className="h-10 rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)]">{tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select></label> : null}
          <label className="flex items-center gap-2 text-[12px]"><input aria-label="Новая вкладка" type="radio" name="crm-import-target" checked={targetMode === "new"} onChange={() => { setTargetMode("new"); resetPreview(); }} />Новая вкладка</label>
          {targetMode === "new" ? <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]"><span>Название новой вкладки</span><input aria-label="Название новой вкладки" value={newTabName} onChange={(event) => { setNewTabName(event.target.value); resetPreview(); }} className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)]" /></label> : null}
        </fieldset>

        <label className="mt-4 flex items-center gap-2 text-[12px] text-[var(--text-primary)]"><input aria-label="Включить существующих клиентов" type="checkbox" checked={includeExistingClients} onChange={(event) => { setIncludeExistingClients(event.target.checked); resetPreview(); }} />Включить существующих клиентов в выбранную вкладку</label>

        {preview ? <section aria-label="Результат проверки" className="mt-5 rounded-[12px] border border-[var(--border-color)] bg-[#F8FAFD] p-4"><h3 className="text-[13px] font-bold text-[var(--text-primary)]">Результат проверки</h3><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] text-[var(--text-secondary)]"><div>Будет создано клиентов: {preview.clientsToCreate}</div><div>Будет обновлено клиентов: {preview.clientsToUpdate}</div><div>Без изменений: {preview.unchangedClients}</div><div>Будет назначено: {preview.clientsToAssign}</div><div>Будет создано контактов: {preview.contactsToCreate}</div><div>Будет обновлено контактов: {preview.contactsToUpdate}</div><div>Конфликтов-дубликатов: {preview.duplicateConflicts}</div><div>Пропущено (связано с 1С): {preview.skippedOneCLinked}</div></dl>{preview.errors.length ? <div role="alert" className="mt-4"><p className="font-semibold text-[#B91C1C]">Ошибки строк</p><ul className="mt-2 grid gap-1 text-[12px] text-[#B91C1C]">{preview.errors.map((item, index) => <li key={`${item.sheet}-${item.row}-${item.code}-${index}`}>{item.sheet}, строка {item.row}{item.field ? `, ${item.field}` : ""}: {item.message}</li>)}</ul></div> : null}{isBlocked ? <p className="mt-4 text-[12px] font-semibold text-[#B91C1C]">Исправьте ошибки и конфликты в файле перед импортом.</p> : null}</section> : null}

        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={isPreviewing || isImporting} className="h-9 rounded-[9px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] disabled:opacity-60">Отмена</button>{preview ? <button type="button" onClick={() => void submitImport()} disabled={isBlocked || isImporting} className="app-action-button h-9 rounded-[9px] px-3 text-[12px] disabled:opacity-60">{isImporting ? "Импортируем…" : "Импортировать"}</button> : <button type="submit" disabled={isPreviewing} className="app-action-button h-9 rounded-[9px] px-3 text-[12px] disabled:opacity-60">{isPreviewing ? "Проверяем…" : "Проверить файл"}</button>}</div>
      </form>
    </dialog>
  );
}
