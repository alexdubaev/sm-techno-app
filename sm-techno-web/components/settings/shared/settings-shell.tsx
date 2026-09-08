'use client';

import type { MouseEventHandler, ReactNode } from 'react';

export type SettingsShellProps = {
  title: string;
  children: ReactNode;
  description?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: MouseEventHandler<HTMLAnchorElement>;
  actions?: ReactNode;
};

export function SettingsShell({
  title,
  description,
  backHref,
  backLabel = 'Вернуться в настройки',
  onBack,
  actions,
  children,
}: SettingsShellProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 border-b border-[#dce3ed] pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {backHref ? (
            <a
              aria-label={backLabel}
              className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#33435c] hover:bg-[#e9edf3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffc400]/45"
              href={backHref}
              onClick={onBack}
            >
              <ArrowLeftIcon />
              <span aria-hidden="true">Назад</span>
            </a>
          ) : null}
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-[#07162e] sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66758b] sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
