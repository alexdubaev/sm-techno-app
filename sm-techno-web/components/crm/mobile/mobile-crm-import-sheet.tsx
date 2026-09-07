'use client';

import { useRef, useState } from 'react';

import { importCrmFile, previewCrmImport } from '@/lib/api';
import type { CrmImportPreview, CrmImportResult, CrmTab } from '@/lib/types';
import { MobileSheet, mobileButton, mobileInput, mobilePanel } from '@/components/crm/mobile/mobile-sheets';

type TargetKind = 'existing' | 'new';

type ImportRequest = {
  file: File;
  ownerId: number;
  targetTabId: number | null;
  newTabName: string | null;
  includeExistingClients: boolean;
};

type MobileCrmImportSheetProps = {
  ownerId: number;
  ownerName: string;
  tabs: CrmTab[];
  onClose: () => void;
  onImported: (result: CrmImportResult) => void;
};

function importErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось обработать CRM Excel файл.';
}

export function MobileCrmImportSheet({ ownerId, ownerName, tabs, onClose, onImported }: MobileCrmImportSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetKind, setTargetKind] = useState<TargetKind>('existing');
  const [targetTabId, setTargetTabId] = useState<number | null>(tabs[0]?.id ?? null);
  const [newTabName, setNewTabName] = useState('');
  const [includeExistingClients, setIncludeExistingClients] = useState(true);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [finalResult, setFinalResult] = useState<CrmImportResult | null>(null);
  const [previewRequest, setPreviewRequest] = useState<ImportRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const previewVersion = useRef(0);

  const resetPreview = () => {
    previewVersion.current += 1;
    setPreview(null);
    setFinalResult(null);
    setPreviewRequest(null);
    setError(null);
    setIsPreviewing(false);
  };

  const getPayload = (): ImportRequest | null => {
    if (!file) {
      setError('Выберите Excel-файл для проверки.');
      return null;
    }
    if (targetKind === 'existing') {
      if (targetTabId === null) {
        setError('Выберите вкладку для импорта.');
        return null;
      }
      return { file, ownerId, targetTabId, newTabName: null, includeExistingClients };
    }
    const trimmedName = newTabName.trim();
    if (!trimmedName) {
      setError('Укажите название новой вкладки.');
      return null;
    }
    return { file, ownerId, targetTabId: null, newTabName: trimmedName, includeExistingClients };
  };

  const checkFile = async () => {
    const request = getPayload();
    if (!request) return;
    const requestVersion = previewVersion.current + 1;
    previewVersion.current = requestVersion;
    setError(null);
    setPreview(null);
    setPreviewRequest(null);
    setIsPreviewing(true);
    try {
      const response = await previewCrmImport(request);
      if (previewVersion.current !== requestVersion) return;
      setPreview(response);
      setPreviewRequest(request);
    } catch (requestError) {
      if (previewVersion.current === requestVersion) {
        setError(importErrorMessage(requestError));
      }
    } finally {
      if (previewVersion.current === requestVersion) setIsPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !previewRequest || preview.errors.length > 0 || preview.duplicateConflicts > 0) return;
    setError(null);
    setIsImporting(true);
    try {
      const result = await importCrmFile(previewRequest);
      setFinalResult(result);
      setPreview(result);
      setPreviewRequest(null);
      onImported(result);
    } catch (requestError) {
      setError(importErrorMessage(requestError));
    } finally {
      setIsImporting(false);
    }
  };

  const selectedTab = tabs.find((tab) => tab.id === targetTabId);
  const targetLabel = targetKind === 'new'
    ? `Новая вкладка «${newTabName.trim() || 'Без названия'}»`
    : selectedTab?.name ?? 'Не выбрана';
  const canImport = finalResult === null && preview !== null && previewRequest !== null && preview.errors.length === 0 && preview.duplicateConflicts === 0;
  const isRequestLocked = isPreviewing || isImporting || finalResult !== null;

  return (
    <MobileSheet
      title="Загрузить клиентов"
      description={`Excel будет импортирован только в CRM: ${ownerName}. Проверка не меняет данные.`}
      error={error}
      busy={isPreviewing || isImporting}
      fullScreen
      onClose={onClose}
    >
      <div className="grid gap-4">
        <label className={`${mobilePanel} grid gap-2`}>
          <span className="text-sm font-bold">Excel-файл</span>
          <input
            aria-label="Выбрать Excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={isRequestLocked}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetPreview();
            }}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[var(--brand-yellow)] file:px-3 file:font-bold file:text-[var(--brand-dark)]"
          />
          {file ? <span className="text-xs text-[var(--text-secondary)]">{file.name}</span> : null}
        </label>

        <fieldset className={`${mobilePanel} grid gap-3`}>
          <legend className="px-1 text-sm font-bold">Куда импортировать</legend>
          {tabs.map((tab) => (
            <label key={tab.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[#F8FAFC] px-3 text-sm font-semibold">
              <input
                type="radio"
                name="crm-import-target"
                checked={targetKind === 'existing' && targetTabId === tab.id}
                disabled={isRequestLocked}
                onChange={() => {
                  setTargetKind('existing');
                  setTargetTabId(tab.id);
                  resetPreview();
                }}
                className="size-5 accent-[var(--brand-yellow)]"
              />
              <span>{tab.name}</span>
              <span className="ml-auto text-xs font-medium text-[var(--text-secondary)]">{tab.systemKind === 'work' ? 'Рабочая' : 'Личная'}</span>
            </label>
          ))}
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[#F8FAFC] px-3 text-sm font-semibold">
            <input
              aria-label="Новая вкладка"
              type="radio"
              name="crm-import-target"
              checked={targetKind === 'new'}
              disabled={isRequestLocked}
              onChange={() => {
                setTargetKind('new');
                resetPreview();
              }}
              className="size-5 accent-[var(--brand-yellow)]"
            />
            Новая вкладка
          </label>
          {targetKind === 'new' ? (
            <label className="grid gap-1.5 text-sm font-medium">
              <span>Название новой вкладки</span>
              <input
                aria-label="Название новой вкладки"
                value={newTabName}
                disabled={isRequestLocked}
                onChange={(event) => {
                  setNewTabName(event.target.value);
                  resetPreview();
                }}
                className={mobileInput}
              />
            </label>
          ) : null}
        </fieldset>

        <label className={`${mobilePanel} flex min-h-12 items-center gap-3 text-sm`}>
          <input
            type="checkbox"
            checked={includeExistingClients}
            disabled={isRequestLocked}
            onChange={(event) => {
              setIncludeExistingClients(event.target.checked);
              resetPreview();
            }}
            className="size-5 accent-[var(--brand-yellow)]"
          />
          <span>Добавить найденных клиентов в целевую вкладку</span>
        </label>

        <button type="button" onClick={checkFile} disabled={isRequestLocked} className={`${mobileButton} border-transparent bg-[var(--brand-yellow)] text-[var(--brand-dark)]`}>
          {isPreviewing ? 'Проверяем…' : 'Проверить файл'}
        </button>

        {preview ? (
          <section aria-label="Результат проверки" className={`${mobilePanel} grid gap-3`}>
            <div>
              <p className="text-sm font-bold">{finalResult ? 'Импорт завершён' : 'Проверка завершена'}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Цель: {targetLabel}</p>
              <p className="text-sm text-[var(--text-secondary)]">CRM: {ownerName}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>Будет создано: {preview.clientsToCreate}</p>
              <p>Будет обновлено: {preview.clientsToUpdate}</p>
              <p>Без изменений: {preview.unchangedClients}</p>
              <p>Назначено: {preview.clientsToAssign}</p>
              <p>Контактов создано: {preview.contactsToCreate}</p>
              <p>Контактов обновлено: {preview.contactsToUpdate}</p>
              <p>Пропущено 1С: {preview.skippedOneCLinked}</p>
              {preview.skippedArchived > 0 ? <p><span>Клиент находится в архиве — импорт пропущен</span>: {preview.skippedArchived}</p> : null}
            </div>
            {preview.duplicateConflicts > 0 ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Дубликаты: {preview.duplicateConflicts}. Исправьте файл перед импортом.</p> : null}
            {preview.errors.length > 0 ? (
              <div role="alert" className="grid gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {preview.errors.map((rowError) => <p key={`${rowError.sheet}-${rowError.row}-${rowError.code}`}>{rowError.sheet}, строка {rowError.row}: {rowError.message}</p>)}
              </div>
            ) : null}
            {finalResult ? (
              <button type="button" onClick={onClose} className={`${mobileButton} border-transparent bg-[var(--brand-dark)] text-white`}>Готово</button>
            ) : canImport ? (
              <button type="button" onClick={confirmImport} disabled={isImporting} className={`${mobileButton} border-transparent bg-[var(--brand-dark)] text-white`}>
                {isImporting ? 'Импортируем…' : `Импортировать ${preview.clientsToCreate} клиента`}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </MobileSheet>
  );
}
