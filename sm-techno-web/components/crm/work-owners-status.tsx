"use client";

import { useEffect, useRef, useState } from "react";

import type { CrmWorkOwner } from "@/lib/types";

const MISSING_NAME = "Имя сотрудника не указано";

function ownerName(owner: CrmWorkOwner) {
  return owner.fullName.trim() || MISSING_NAME;
}

export function WorkOwnersStatus({ owners, variant }: { owners: CrmWorkOwner[]; variant: "desktop" | "mobile" }) {
  const names = owners.map(ownerName);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const hasPopover = variant === "desktop" && names.length >= 3;

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  if (!names.length) return <span>Свободен</span>;
  if (!hasPopover) return <span>{names.join(", ")}</span>;

  const summary = `${names[0]} +${names.length - 1}`;
  return <span ref={containerRef} className="relative inline-flex"><button type="button" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)} className="rounded-[5px] text-left underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]">{summary}</button>{isOpen ? <span role="dialog" aria-label="Сотрудники в работе" className="absolute left-0 top-full z-20 mt-1 min-w-48 rounded-[8px] border border-[var(--border-color)] bg-white p-2 text-[10px] text-[var(--text-primary)] shadow-[0_12px_28px_rgba(7,22,46,0.16)]"><span className="sr-only">Сотрудники в работе</span><span className="grid gap-1">{names.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</span></span> : null}</span>;
}
