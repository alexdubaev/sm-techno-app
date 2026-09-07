'use client';

import Image from 'next/image';
import type { MouseEventHandler, ReactNode } from 'react';

export type SettingsLandingProps = {
  totalUsersCount: number;
  activeUsersCount: number;
  usersHref: string;
  onecHref: string;
  onUsersNavigate?: MouseEventHandler<HTMLAnchorElement>;
  onOnecNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

type SettingsDestinationCardProps = {
  title: string;
  description: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  children?: ReactNode;
};

export function SettingsLanding({
  totalUsersCount,
  activeUsersCount,
  usersHref,
  onecHref,
  onUsersNavigate,
  onOnecNavigate,
}: SettingsLandingProps) {
  return (
    <nav
      aria-label="Разделы настроек"
      className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6"
    >
      <SettingsDestinationCard
        description="Учетные записи, роли и доступ к 1С"
        href={usersHref}
        imageAlt="Управление учетными записями пользователей"
        imageSrc="/mobile-icons/settings-users.webp"
        onNavigate={onUsersNavigate}
        title="Пользователи"
      >
        <dl className="mt-5 grid grid-cols-2 border-t border-[#dce3ed] pt-4 text-sm">
          <div>
            <dt className="text-[#6b7890]">Всего</dt>
            <dd
              className="mt-0.5 text-lg font-bold text-[#07162e]"
              aria-label={`Всего ${totalUsersCount}`}
            >
              {totalUsersCount}
            </dd>
          </div>
          <div className="border-l border-[#dce3ed] pl-5">
            <dt className="text-[#6b7890]">Активны</dt>
            <dd
              className="mt-0.5 text-lg font-bold text-[#07162e]"
              aria-label={`Активны ${activeUsersCount}`}
            >
              {activeUsersCount}
            </dd>
          </div>
        </dl>
      </SettingsDestinationCard>

      <SettingsDestinationCard
        description="Подключение, заказы, документы и НДС"
        href={onecHref}
        imageAlt="Обмен данными между СМ ТЕХНО и 1С"
        imageSrc="/mobile-icons/settings-onec.webp"
        onNavigate={onOnecNavigate}
        title="Интеграция с 1С"
      />
    </nav>
  );
}

function SettingsDestinationCard({
  title,
  description,
  href,
  imageSrc,
  imageAlt,
  onNavigate,
  children,
}: SettingsDestinationCardProps) {
  return (
    <a
      aria-label={`${title}: ${description}`}
      className="group relative min-h-64 overflow-hidden rounded-2xl border border-[#dce3ed] bg-white p-5 shadow-[5px_5px_0_rgba(7,22,46,0.06)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#aeb9c9] hover:shadow-[7px_7px_0_rgba(7,22,46,0.09)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffc400]/45 motion-reduce:transform-none motion-reduce:transition-none sm:min-h-72 sm:p-7"
      href={href}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-[#ffc400]"
      />
      <span className="relative z-10 flex h-full flex-col">
        <span className="flex items-start justify-between gap-5">
          <span className="max-w-md pt-1">
            <h2 className="text-xl font-bold tracking-[-0.02em] text-[#07162e] sm:text-2xl">
              {title}
            </h2>
            <span className="mt-2 block max-w-sm text-sm leading-6 text-[#5f6d82] sm:text-base">
              {description}
            </span>
          </span>
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-[#f1f4f8] sm:h-32 sm:w-32">
            <Image
              alt={imageAlt}
              className="h-20 w-20 object-contain sm:h-28 sm:w-28"
              height={112}
              src={imageSrc}
              width={112}
            />
          </span>
        </span>
        <span className="mt-auto flex items-end justify-between gap-4 pt-7">
          <span>{children}</span>
          <span className="flex items-center gap-2 text-sm font-bold text-[#07162e]">
            Открыть
            <ArrowRightIcon />
          </span>
        </span>
      </span>
    </a>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
