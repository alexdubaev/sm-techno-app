"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ResizableTableHeader,
  useResizableColumns,
  type ResizableColumnConfig,
} from "@/components/resizable-table";
import { deleteDocument, downloadDocumentFile, fetchDocuments } from "@/lib/api";
import type { GeneratedDocument } from "@/lib/types";

const DOCUMENTS_TABLE_COLUMNS: ResizableColumnConfig[] = [
  { key: "type", width: 132, minWidth: 112, maxWidth: 180 },
  { key: "number", width: 132, minWidth: 104, maxWidth: 190 },
  { key: "date", width: 98, minWidth: 86, maxWidth: 140 },
  { key: "client", width: 320, minWidth: 220, maxWidth: 520 },
  { key: "offer", width: 94, minWidth: 78, maxWidth: 130 },
  { key: "warnings", width: 170, minWidth: 130, maxWidth: 260 },
  { key: "author", width: 156, minWidth: 120, maxWidth: 240 },
  { key: "created", width: 124, minWidth: 106, maxWidth: 180 },
  { key: "actions", width: 172, minWidth: 150, maxWidth: 220 },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, getWidth, onResizeStart, tableWidth } = useResizableColumns(
    "sm-techno-documents-table-widths-v1",
    DOCUMENTS_TABLE_COLUMNS,
  );

  useEffect(() => {
    void loadDocuments();
  }, []);

  const summary = useMemo(() => {
    const contracts = documents.filter((document) => document.documentType === "contract").length;
    const specifications = documents.filter((document) => document.documentType === "specification").length;
    const warnings = documents.filter((document) => document.missingFields.length > 0).length;
    return { total: documents.length, contracts, specifications, warnings };
  }, [documents]);
  const filteredDocuments = useMemo(() => {
    const query = normalizeDocumentSearch(documentSearch);
    if (!query) {
      return documents;
    }
    return documents.filter((document) => documentMatchesSearch(document, query));
  }, [documentSearch, documents]);
  const documentSearchOptions = useMemo(
    () => documents.map((document) => buildDocumentSearchLabel(document)),
    [documents],
  );

  async function loadDocuments() {
    setIsLoading(true);
    setError(null);
    try {
      setDocuments(await fetchDocuments());
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить документы."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownload(documentId: number) {
    setDownloadingId(documentId);
    setError(null);
    try {
      await downloadDocumentFile(documentId);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось скачать документ."));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(document: GeneratedDocument) {
    const confirmed = window.confirm(`Удалить документ ${document.number}? Это действие нельзя отменить.`);
    if (!confirmed) {
      return;
    }
    setDeletingId(document.id);
    setError(null);
    try {
      await deleteDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось удалить документ."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-1.5">
          <div>
            <h1 className="text-[17px] font-[650] leading-none text-[var(--text-primary)]">
              Документы
            </h1>
            <p className="mt-0.5 max-w-[72ch] text-[10px] leading-[14px] text-[var(--text-secondary)]">
              Договоры и спецификации формируются из карточки клиента и сохраняются как редактируемые DOCX-файлы.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <MetricChip label="Всего" value={String(summary.total)} />
            <MetricChip label="Договоры" value={String(summary.contracts)} />
            <MetricChip label="Спецификации" value={String(summary.specifications)} />
            <MetricChip label="Предупр." value={String(summary.warnings)} tone={summary.warnings > 0 ? "warning" : "default"} />
            <Link href="/documents" className="app-action-button app-action-button--xs">
              Сформировать
            </Link>
            <button
              type="button"
              onClick={() => void loadDocuments()}
              disabled={isLoading}
              className="app-action-button app-action-button--xs"
            >
              {isLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-1.5 text-[10px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}

        <div>
          <input
            type="search"
            list="document-search-options"
            value={documentSearch}
            onChange={(event) => setDocumentSearch(event.target.value)}
            placeholder="Поиск по клиенту, номеру, КП или типу документа"
            className="h-[34px] w-full rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 text-[11px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-yellow)]"
          />
          <datalist id="document-search-options">
            {documentSearchOptions.map((option, index) => (
              <option key={`${option}-${index}`} value={option} />
            ))}
          </datalist>
        </div>

        <section className="rounded-[14px] border border-[var(--border-color)] bg-[var(--page-bg)] p-1.5">
          <div className="overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-white">
            {documents.length === 0 && !isLoading ? (
              <div className="px-3 py-5 text-[11px] leading-4 text-[var(--text-secondary)]">
                Журнал пока пуст. Сформируйте первый договор или спецификацию из карточки клиента.
              </div>
            ) : filteredDocuments.length === 0 && !isLoading ? (
              <div className="px-3 py-5 text-[11px] leading-4 text-[var(--text-secondary)]">
                Документы по этому запросу не найдены.
              </div>
            ) : (
              <div ref={containerRef} className="max-h-[calc(100dvh-8rem)] overflow-auto">
                <table className="min-w-full table-fixed border-collapse" style={{ width: tableWidth }}>
                  <colgroup>
                    {DOCUMENTS_TABLE_COLUMNS.map((column) => (
                      <col key={column.key} style={{ width: getWidth(column.key) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#FAFBFD] text-left text-[10px] text-[var(--text-secondary)]">
                    <tr>
                      <ResizableTableHeader columnKey="type" label="Тип" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="number" label="Номер" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="date" label="Дата" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="client" label="Клиент" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="offer" label="КП" onResizeStart={onResizeStart} className="px-3 py-2 text-right font-semibold" />
                      <ResizableTableHeader columnKey="warnings" label="Поля" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="author" label="Автор" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="created" label="Создано" onResizeStart={onResizeStart} className="px-3 py-2 text-left font-semibold" />
                      <ResizableTableHeader columnKey="actions" label="" onResizeStart={onResizeStart} className="px-3 py-2 text-center font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document) => (
                      <tr key={document.id} className="border-t border-[var(--border-color)] text-[10px] text-[var(--text-primary)]">
                        <td className="px-3 py-1.5">
                          <TypeBadge type={document.documentType} />
                        </td>
                        <td className="px-3 py-1.5 font-semibold tabular-nums">{document.number}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{formatShortDate(document.documentDate)}</td>
                        <td className="px-3 py-1.5">
                          <div className="line-clamp-2 text-[11px] font-medium leading-[15px]">{document.clientName || "-"}</div>
                          <div className="mt-0.5 text-[9px] text-[var(--text-secondary)]">
                            {document.clientSource === "onec" ? "Клиент из 1С" : "Локальный клиент"}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {document.commercialOfferId ? `#${document.commercialOfferId}` : "-"}
                        </td>
                        <td className="px-3 py-1.5">
                          {document.missingFields.length > 0 ? (
                            <span className="line-clamp-2 text-[9px] leading-[12px] text-[#92400E]">
                              Не заполнено: {document.missingFields.join(", ")}
                            </span>
                          ) : (
                            <span className="text-[9px] text-[#166534]">Готово</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{document.createdByName || document.createdByUsername || "-"}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{formatDateTime(document.createdAt)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDownload(document.id)}
                              disabled={downloadingId === document.id || deletingId === document.id}
                              className="app-action-button app-action-button--xs"
                            >
                              {downloadingId === document.id ? "..." : "DOCX"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(document)}
                              disabled={deletingId === document.id || downloadingId === document.id}
                              className="app-action-button app-action-button--xs"
                            >
                              {deletingId === document.id ? "..." : "Удалить"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MetricChip({ label, tone = "default", value }: { label: string; tone?: "default" | "warning"; value: string }) {
  const toneClass = tone === "warning" ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]" : "border-[var(--border-color)] bg-[#FBFCFE] text-[var(--text-primary)]";
  return (
    <div className={`rounded-[9px] border px-2.5 py-1.5 ${toneClass}`}>
      <span className="text-[9px] text-[var(--text-secondary)]">{label}</span>
      <span className="ml-1.5 text-[11px] font-semibold">{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: GeneratedDocument["documentType"] }) {
  const isContract = type === "contract";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${isContract ? "bg-[#EEF2FF] text-[#3730A3]" : "bg-[var(--brand-light)] text-[var(--brand-dark)]"}`}>
      {getDocumentTypeLabel(type)}
    </span>
  );
}

function getDocumentTypeLabel(type: GeneratedDocument["documentType"]) {
  return type === "contract" ? "Договор" : "Спецификация";
}

function buildDocumentSearchLabel(document: GeneratedDocument) {
  return [
    getDocumentTypeLabel(document.documentType),
    document.number,
    formatShortDate(document.documentDate),
    document.clientName,
    document.commercialOfferId ? `КП #${document.commercialOfferId}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function normalizeDocumentSearch(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function documentMatchesSearch(document: GeneratedDocument, query: string) {
  const haystack = normalizeDocumentSearch(
    [
      buildDocumentSearchLabel(document),
      document.clientSource === "onec" ? "клиент из 1С" : "локальный клиент",
      document.createdByName,
      document.createdByUsername,
      document.missingFields.join(" "),
    ].join(" "),
  );
  return haystack.includes(query);
}

function formatShortDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
