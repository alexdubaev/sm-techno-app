'use client';

import { useRef, useState, type SyntheticEvent } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importCrmFile, previewCrmImport } from '@/lib/api';
import type { CrmImportPreview, CrmTab } from '@/lib/types';

type TargetMode = 'existing' | 'new';
type ImportSnapshot = {
  file: File;
  ownerId: number;
  targetTabId: number | null;
  newTabName: string | null;
  includeExistingClients: boolean;
};

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
  const [targetMode, setTargetMode] = useState<TargetMode>('existing');
  const [targetTabId, setTargetTabId] = useState<number | null>(
    tabs[0]?.id ?? null,
  );
  const [newTabName, setNewTabName] = useState('');
  const [includeExistingClients, setIncludeExistingClients] = useState(true);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<ImportSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const previewRequestId = useRef(0);
  const isBusy = isPreviewing || isImporting;
  const isBlocked = Boolean(
    preview && (preview.errors.length > 0 || preview.duplicateConflicts > 0),
  );
  const resolvedExistingTabId = tabs.some((tab) => tab.id === targetTabId)
    ? targetTabId
    : (tabs[0]?.id ?? null);

  const resetPreview = () => {
    previewRequestId.current += 1;
    setPreview(null);
    setPreviewSnapshot(null);
    setError(null);
  };

  const createSnapshot = (): ImportSnapshot | null => {
    if (!file) {
      setError('Выберите Excel-файл .xlsx.');
      return null;
    }
    if (targetMode === 'existing' && resolvedExistingTabId === null) {
      setError('Выберите вкладку для импорта.');
      return null;
    }
    if (targetMode === 'new' && !newTabName.trim()) {
      setError('Укажите название новой вкладки.');
      return null;
    }
    return {
      file,
      ownerId,
      targetTabId: targetMode === 'existing' ? resolvedExistingTabId : null,
      newTabName: targetMode === 'new' ? newTabName.trim() : null,
      includeExistingClients,
    };
  };

  const submitPreview = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    const snapshot = createSnapshot();
    if (!snapshot) return;
    const requestId = ++previewRequestId.current;
    setIsPreviewing(true);
    setError(null);
    try {
      const nextPreview = await previewCrmImport(snapshot);
      if (previewRequestId.current !== requestId) return;
      setPreview(nextPreview);
      setPreviewSnapshot(snapshot);
    } catch (cause) {
      if (previewRequestId.current === requestId) {
        setPreview(null);
        setPreviewSnapshot(null);
        setError(errorMessage(cause, 'Не удалось проверить CRM Excel файл.'));
      }
    } finally {
      if (previewRequestId.current === requestId) setIsPreviewing(false);
    }
  };

  const submitImport = async () => {
    if (!preview || !previewSnapshot || isBlocked || isBusy) return;
    setIsImporting(true);
    setError(null);
    try {
      const result = await importCrmFile(previewSnapshot);
      await onImported(result.targetTab.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось импортировать CRM Excel файл.'));
    } finally {
      setIsImporting(false);
    }
  };

  const closeIfIdle = () => {
    if (!isBusy) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeIfIdle();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto rounded-[18px] p-5 sm:max-w-2xl"
      >
        <form onSubmit={submitPreview}>
          <DialogHeader className="flex-row items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-[18px] font-bold text-[var(--text-primary)]">
                Загрузка клиентов из Excel
              </DialogTitle>
              <DialogDescription className="mt-1 text-[12px] text-[var(--text-secondary)]">
                Файл сначала проверяется. Данные будут сохранены только после
                подтверждения.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={isBusy}
              className="rounded-[8px] px-2 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[#F6F8FB] disabled:opacity-60"
            >
              Закрыть
            </button>
          </DialogHeader>
          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]"
            >
              {error}
            </div>
          ) : null}
          <label className="mt-5 grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
            <span>Excel-файл</span>
            <input
              aria-label="Excel-файл"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isBusy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                resetPreview();
              }}
              className="block w-full rounded-[10px] border border-[var(--border-color)] p-2 text-[12px] disabled:opacity-60"
            />
          </label>
          <fieldset disabled={isBusy} className="mt-4 grid gap-3">
            <legend className="text-[12px] font-semibold text-[var(--text-secondary)]">
              Куда импортировать
            </legend>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="radio"
                name="crm-import-target"
                checked={targetMode === 'existing'}
                onChange={() => {
                  setTargetMode('existing');
                  resetPreview();
                }}
              />
              Существующая вкладка
            </label>
            {targetMode === 'existing' ? (
              <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                <span>Вкладка для импорта</span>
                <select
                  aria-label="Вкладка для импорта"
                  value={resolvedExistingTabId ?? ''}
                  onChange={(event) => {
                    setTargetTabId(Number(event.target.value));
                    resetPreview();
                  }}
                  className="h-10 rounded-[10px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)] disabled:opacity-60"
                >
                  <option value="" disabled>
                    Выберите вкладку
                  </option>
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-[12px]">
              <input
                aria-label="Новая вкладка"
                type="radio"
                name="crm-import-target"
                checked={targetMode === 'new'}
                onChange={() => {
                  setTargetMode('new');
                  resetPreview();
                }}
              />
              Новая вкладка
            </label>
            {targetMode === 'new' ? (
              <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                <span>Название новой вкладки</span>
                <input
                  aria-label="Название новой вкладки"
                  value={newTabName}
                  onChange={(event) => {
                    setNewTabName(event.target.value);
                    resetPreview();
                  }}
                  className="h-10 rounded-[10px] border border-[var(--border-color)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-yellow)] disabled:opacity-60"
                />
              </label>
            ) : null}
          </fieldset>
          <label className="mt-4 flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
            <input
              aria-label="Включить существующих клиентов"
              type="checkbox"
              checked={includeExistingClients}
              disabled={isBusy}
              onChange={(event) => {
                setIncludeExistingClients(event.target.checked);
                resetPreview();
              }}
            />
            Включить существующих клиентов в выбранную вкладку
          </label>
          {preview ? (
            <section
              aria-label="Результат проверки"
              className="mt-5 rounded-[12px] border border-[var(--border-color)] bg-[#F8FAFD] p-4"
            >
              <h3 className="text-[13px] font-bold text-[var(--text-primary)]">
                Результат проверки
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] text-[var(--text-secondary)]">
                <div>Будет создано клиентов: {preview.clientsToCreate}</div>
                <div>Будет обновлено клиентов: {preview.clientsToUpdate}</div>
                <div>Без изменений: {preview.unchangedClients}</div>
                <div>Будет назначено: {preview.clientsToAssign}</div>
                <div>Будет создано контактов: {preview.contactsToCreate}</div>
                <div>Будет обновлено контактов: {preview.contactsToUpdate}</div>
                <div>Конфликтов-дубликатов: {preview.duplicateConflicts}</div>
                <div>Пропущено (связано с 1С): {preview.skippedOneCLinked}</div>
              </dl>
              {preview.errors.length ? (
                <div role="alert" className="mt-4">
                  <p className="font-semibold text-[#B91C1C]">Ошибки строк</p>
                  <ul className="mt-2 grid gap-1 text-[12px] text-[#B91C1C]">
                    {preview.errors.map((item, index) => (
                      <li
                        key={`${item.sheet}-${item.row}-${item.code}-${index}`}
                      >
                        {item.sheet}, строка {item.row}
                        {item.field ? `, ${item.field}` : ''}: {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isBlocked ? (
                <p className="mt-4 text-[12px] font-semibold text-[#B91C1C]">
                  Исправьте ошибки и конфликты в файле перед импортом.
                </p>
              ) : null}
            </section>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={isBusy}
              className="h-9 rounded-[9px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] disabled:opacity-60"
            >
              Отмена
            </button>
            {preview ? (
              <button
                type="button"
                onClick={() => void submitImport()}
                disabled={isBlocked || isBusy}
                className="app-action-button h-9 rounded-[9px] px-3 text-[12px] disabled:opacity-60"
              >
                {isImporting ? 'Импортируем…' : 'Импортировать'}
              </button>
            ) : (
              <button
                type="submit"
                disabled={isBusy}
                className="app-action-button h-9 rounded-[9px] px-3 text-[12px] disabled:opacity-60"
              >
                {isPreviewing ? 'Проверяем…' : 'Проверить файл'}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
