"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

export type ResizableColumnConfig = {
  key: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  compactMinWidth?: number;
};

type WidthMap = Record<string, number>;

type ResizeSession = {
  key: string;
  startX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
};

type ResizableHeaderProps = {
  columnKey: string;
  label: ReactNode;
  onResizeStart: (columnKey: string, event: MouseEvent<HTMLSpanElement>) => void;
  className?: string;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function buildDefaultWidths(columns: ResizableColumnConfig[]) {
  return columns.reduce<WidthMap>((result, column) => {
    result[column.key] = column.width;
    return result;
  }, {});
}

function clampWidth(value: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, value));
}

function fitWidthsToContainer(
  columns: ResizableColumnConfig[],
  widths: WidthMap,
  containerWidth: number,
  allowTightFit = false,
) {
  const normalizedWidths = columns.map((column) => {
    const minWidth = column.minWidth ?? 56;
    const maxWidth = column.maxWidth ?? 720;
    const width = clampWidth(widths[column.key] ?? column.width, minWidth, maxWidth);
    const compactMinWidth = Math.min(minWidth, column.compactMinWidth ?? minWidth);

    return {
      key: column.key,
      width,
      minWidth,
      compactMinWidth,
    };
  });

  const compactTotalWidth = normalizedWidths.reduce((sum, column) => sum + column.compactMinWidth, 0);
  const minTotalWidth = normalizedWidths.reduce((sum, column) => sum + column.minWidth, 0);
  const baseTotalWidth = normalizedWidths.reduce((sum, column) => sum + column.width, 0);

  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return {
      widths: Object.fromEntries(normalizedWidths.map((column) => [column.key, column.width])),
      tableWidth: baseTotalWidth,
      tableMinWidth: minTotalWidth,
    };
  }

  if (containerWidth <= minTotalWidth) {
    if (allowTightFit) {
      if (containerWidth <= compactTotalWidth) {
        const tightRatio = compactTotalWidth > 0 ? containerWidth / compactTotalWidth : 1;

        return {
          widths: Object.fromEntries(
            normalizedWidths.map((column) => [column.key, column.compactMinWidth * tightRatio]),
          ),
          tableWidth: containerWidth,
          tableMinWidth: compactTotalWidth,
        };
      }

      const interpolationRange = minTotalWidth - compactTotalWidth;
      const interpolationRatio =
        interpolationRange > 0
          ? (containerWidth - compactTotalWidth) / interpolationRange
          : 1;

      return {
        widths: Object.fromEntries(
          normalizedWidths.map((column) => [
            column.key,
            column.compactMinWidth +
              (column.minWidth - column.compactMinWidth) * interpolationRatio,
          ]),
        ),
        tableWidth: containerWidth,
        tableMinWidth: compactTotalWidth,
      };
    }

    return {
      widths: Object.fromEntries(normalizedWidths.map((column) => [column.key, column.minWidth])),
      tableWidth: minTotalWidth,
      tableMinWidth: minTotalWidth,
    };
  }

  if (containerWidth < baseTotalWidth) {
    const flexibleWidth = baseTotalWidth - minTotalWidth;
    const compressionRatio = flexibleWidth > 0 ? (containerWidth - minTotalWidth) / flexibleWidth : 1;

    return {
      widths: Object.fromEntries(
        normalizedWidths.map((column) => [
          column.key,
          column.minWidth + (column.width - column.minWidth) * compressionRatio,
        ]),
      ),
      tableWidth: containerWidth,
      tableMinWidth: minTotalWidth,
    };
  }

  const expansionRatio = containerWidth / baseTotalWidth;

  return {
    widths: Object.fromEntries(
      normalizedWidths.map((column) => [column.key, column.width * expansionRatio]),
    ),
    tableWidth: containerWidth,
    tableMinWidth: minTotalWidth,
  };
}

export function useResizableColumns(
  storageKey: string,
  columns: ResizableColumnConfig[],
  options?: {
    allowTightFit?: boolean;
  },
) {
  const defaults = useMemo(() => buildDefaultWidths(columns), [columns]);
  const rules = useMemo(
    () =>
      columns.reduce<Record<string, { minWidth: number; maxWidth: number }>>((result, column) => {
        result[column.key] = {
          minWidth: column.minWidth ?? 56,
          maxWidth: column.maxWidth ?? 720,
        };
        return result;
      }, {}),
    [columns],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [widths, setWidths] = useState<WidthMap>(() => {
    const savedWidths = canUseStorage() ? window.localStorage.getItem(storageKey) : null;
    let parsedWidths: WidthMap | null = null;

    if (savedWidths) {
      try {
        parsedWidths = JSON.parse(savedWidths) as WidthMap;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const nextWidths = { ...defaults };

    if (parsedWidths) {
      for (const column of columns) {
        const candidate = parsedWidths[column.key];
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          const { minWidth, maxWidth } = rules[column.key];
          nextWidths[column.key] = clampWidth(candidate, minWidth, maxWidth);
        }
      }
    }

    return nextWidths;
  });
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const syncWidth = () => {
      setContainerWidth(node.clientWidth);
    };

    syncWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        syncWidth();
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  useEffect(() => {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = event.clientX - session.startX;
      const nextWidth = Math.min(
        session.maxWidth,
        Math.max(session.minWidth, session.startWidth + deltaX),
      );

      setWidths((current) => ({
        ...current,
        [session.key]: nextWidth,
      }));
    };

    const finishResize = () => {
      resizeSessionRef.current = null;
      if (typeof document !== "undefined") {
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishResize);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishResize);
    };
  }, []);

  const startResize = useCallback(
    (columnKey: string, event: MouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();

      resizeSessionRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth: widths[columnKey] ?? defaults[columnKey] ?? 120,
        minWidth: rules[columnKey]?.minWidth ?? 56,
        maxWidth: rules[columnKey]?.maxWidth ?? 720,
      };

      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }
    },
    [defaults, rules, widths],
  );

  const getWidth = useCallback(
    (columnKey: string) => widths[columnKey] ?? defaults[columnKey] ?? 120,
    [defaults, widths],
  );

  const fitted = useMemo(
    () => fitWidthsToContainer(columns, widths, containerWidth, options?.allowTightFit ?? false),
    [columns, containerWidth, options?.allowTightFit, widths],
  );

  return {
    containerRef,
    getWidth: (columnKey: string) => fitted.widths[columnKey] ?? getWidth(columnKey),
    onResizeStart: startResize,
    tableMinWidth: fitted.tableMinWidth,
    tableWidth: fitted.tableWidth,
  };
}

export function ResizableTableHeader({
  columnKey,
  label,
  onResizeStart,
  className = "",
}: ResizableHeaderProps) {
  const alignmentClass = className.includes("text-right")
    ? "justify-end"
    : className.includes("text-center")
      ? "justify-center"
      : "justify-start";

  return (
    // The visible label sits inside the flex layout wrapper, one level deeper
    // than the rule's default label search, and the header is not interactive;
    // resizing stays a pointer affordance by design.
    // oxlint-disable-next-line jsx-a11y/control-has-associated-label
    <th className={`relative ${className}`}>
      <div className={`relative flex min-h-[30px] items-center pr-3 ${alignmentClass}`}>
        <span>{label}</span>
        <span
          role="presentation"
          aria-hidden="true"
          onMouseDown={(event) => onResizeStart(columnKey, event)}
          className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none select-none"
        >
          <span className="absolute right-1 top-1/2 h-[60%] w-px -translate-y-1/2 rounded-full bg-[var(--border-color)] transition-colors duration-200 hover:bg-[var(--brand-yellow)]" />
        </span>
      </div>
    </th>
  );
}
