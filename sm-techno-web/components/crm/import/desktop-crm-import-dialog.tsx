"use client";

import { useRef, useState, type SyntheticEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importCrmFile, previewCrmImport } from "@/lib/api";
import type { CrmImportPreview, CrmTab } from "@/lib/types";

type TargetMode = "existing" | "new";
type Snapshot = { file: File; ownerId: number; targetTabId: number | null; newTabName: string | null; includeExistingClients: boolean };
const errorMessage = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;

export function DesktopCrmImportDialog({ ownerId, tabs, onClose, onImported }: { ownerId: number; tabs: CrmTab[]; onClose: () => void; onImported: (targetTabId: number) => void | Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>("existing");
  const [targetTabId, setTargetTabId] = useState<number | null>(tabs[0]?.id ?? null);
  const [newTabName, setNewTabName] = useState("");
  const [includeExistingClients, setIncludeExistingClients] = useState(true);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const previewRequestId = useRef(0);
  const isBusy = isPreviewing || isImporting;
  const isBlocked = Boolean(preview && (preview.errors.length > 0 || preview.duplicateConflicts > 0));
  const existingTargetId = tabs.some((tab) => tab.id === targetTabId) ? targetTabId : tabs[0]?.id ?? null;
  const resetPreview = () => { previewRequestId.current += 1; setPreview(null); setSnapshot(null); setError(null); };
  const closeIfIdle = () => { if (!isBusy) onClose(); };

  const currentSnapshot = (): Snapshot | null => {
    if (!file) { setError("Выберите Excel-файл .xlsx."); return null; }
    if (targetMode === "existing" && existingTargetId === null) { setError("Выберите вкладку для импорта."); return null; }
    if (targetMode === "new" && !newTabName.trim()) { setError("Укажите название новой вкладки."); return null; }
    return { file, ownerId, targetTabId: targetMode === "existing" ? existingTargetId : null, newTabName: targetMode === "new" ? newTabName.trim() : null, includeExistingClients };
  };
  const submitPreview = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault(); if (isBusy) return;
    const next = currentSnapshot(); if (!next) return;
    const requestId = ++previewRequestId.current; setIsPreviewing(true); setError(null);
    try { const result = await previewCrmImport(next); if (previewRequestId.current === requestId) { setPreview(result); setSnapshot(next); } }
    catch (cause) { if (previewRequestId.current === requestId) { setPreview(null); setSnapshot(null); setError(errorMessage(cause, "Не удалось проверить CRM Excel файл.")); } }
    finally { if (previewRequestId.current === requestId) setIsPreviewing(false); }
  };
  const submitImport = async () => {
    if (!preview || !snapshot || isBlocked || isBusy) return;
    setIsImporting(true); setError(null);
    try { const result = await importCrmFile(snapshot); await onImported(result.targetTab.id); onClose(); }
    catch (cause) { setError(errorMessage(cause, "Не удалось импортировать CRM Excel файл.")); }
    finally { setIsImporting(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open) closeIfIdle(); }}><DialogContent showCloseButton={false} className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto rounded-[18px] p-5 sm:max-w-2xl"><form onSubmit={submitPreview}>
    <DialogHeader className="flex-row items-start justify-between gap-4"><div><DialogTitle className="text-[18px] font-bold text-[var(--text-primary)]">Загрузка клиентов из Excel</DialogTitle><DialogDescription className="mt-1 text-[12px] text-[var(--text-secondary)]">Файл сначала проверяется. Данные будут сохранены только после подтверждения.</DialogDescription></div><button type="button" onClick={closeIfIdle} disabled={isBusy}>Закрыть</button></DialogHeader>
    {error ? <div role="alert">{error}</div> : null}
    <label><span>Excel-файл</span><input aria-label="Excel-файл" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={isBusy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); resetPreview(); }} /></label>
    <fieldset disabled={isBusy}><legend>Куда импортировать</legend><label><input type="radio" name="crm-import-target" checked={targetMode === "existing"} onChange={() => { setTargetMode("existing"); resetPreview(); }} />Существующая вкладка</label>{targetMode === "existing" ? <label><span>Вкладка для импорта</span><select aria-label="Вкладка для импорта" value={existingTargetId ?? ""} onChange={(event) => { setTargetTabId(Number(event.target.value)); resetPreview(); }}><option value="" disabled>Выберите вкладку</option>{tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}</select></label> : null}<label><input aria-label="Новая вкладка" type="radio" name="crm-import-target" checked={targetMode === "new"} onChange={() => { setTargetMode("new"); resetPreview(); }} />Новая вкладка</label>{targetMode === "new" ? <label><span>Название новой вкладки</span><input aria-label="Название новой вкладки" value={newTabName} onChange={(event) => { setNewTabName(event.target.value); resetPreview(); }} /></label> : null}</fieldset>
    <label><input aria-label="Включить существующих клиентов" type="checkbox" checked={includeExistingClients} disabled={isBusy} onChange={(event) => { setIncludeExistingClients(event.target.checked); resetPreview(); }} />Включить существующих клиентов в выбранную вкладку</label>
    {preview ? <section aria-label="Результат проверки"><h3>Результат проверки</h3><div>Будет создано клиентов: {preview.clientsToCreate}</div><div>Будет обновлено клиентов: {preview.clientsToUpdate}</div><div>Без изменений: {preview.unchangedClients}</div><div>Будет назначено: {preview.clientsToAssign}</div><div>Будет создано контактов: {preview.contactsToCreate}</div><div>Будет обновлено контактов: {preview.contactsToUpdate}</div><div>Конфликтов-дубликатов: {preview.duplicateConflicts}</div><div>Пропущено (связано с 1С): {preview.skippedOneCLinked}</div>{preview.errors.length ? <div role="alert"><p>Ошибки строк</p><ul>{preview.errors.map((item, index) => <li key={`${item.sheet}-${item.row}-${item.code}-${index}`}>{item.sheet}, строка {item.row}{item.field ? `, ${item.field}` : ""}: {item.message}</li>)}</ul></div> : null}{isBlocked ? <p>Исправьте ошибки и конфликты в файле перед импортом.</p> : null}</section> : null}
    <div><button type="button" onClick={closeIfIdle} disabled={isBusy}>Отмена</button>{preview ? <button type="button" onClick={() => void submitImport()} disabled={isBlocked || isBusy}>{isImporting ? "Импортируем…" : "Импортировать"}</button> : <button type="submit" disabled={isBusy}>{isPreviewing ? "Проверяем…" : "Проверить файл"}</button>}</div>
  </form></DialogContent></Dialog>;
}
