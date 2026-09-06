'use client';

import { useEffect, useId, useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { CrmWorkOwner } from '@/lib/types';

const MISSING_NAME = 'Имя сотрудника не указано';

function ownerName(owner: CrmWorkOwner) {
  return owner.fullName.trim() || MISSING_NAME;
}

export function WorkOwnersStatus({
  owners,
  variant,
}: {
  owners: CrmWorkOwner[];
  variant: 'desktop' | 'mobile';
}) {
  const names = owners.map(ownerName);
  const dialogId = useId();
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (variant !== 'mobile' || names.length === 0 || names.length >= 3) return;
    const updateWidth = () => setIsNarrow(window.innerWidth <= 360);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [variant, names.length]);

  if (!names.length) return <span>Свободен</span>;
  const hasPopover = names.length >= 3 || (variant === 'mobile' && isNarrow);
  if (!hasPopover)
    return (
      <>
        {variant === 'mobile' ? (
          <span className="mr-1 text-[#2563EB]">В работе:</span>
        ) : null}
        <span>{names.join(', ')}</span>
      </>
    );

  const summary =
    variant === 'mobile'
      ? `В работе у ${names.length} ${names.length === 1 ? 'сотрудника' : 'сотрудников'}`
      : `${names[0]} +${names.length - 1}`;

  return (
    <Popover>
      <PopoverTrigger
        aria-controls={dialogId}
        className={`max-w-full rounded-[5px] text-left underline decoration-dotted underline-offset-2 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)] ${variant === 'mobile' ? 'min-h-11' : ''}`}
      >
        {summary}
      </PopoverTrigger>
      <PopoverContent
        id={dialogId}
        align="start"
        className="max-h-[min(20rem,var(--available-height))] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto [overflow-wrap:anywhere]"
      >
        <PopoverTitle className="sr-only">Сотрудники в работе</PopoverTitle>
        <ul className="grid gap-1">
          {names.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
