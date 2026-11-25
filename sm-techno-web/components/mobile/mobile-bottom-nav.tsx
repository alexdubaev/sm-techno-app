'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Ellipsis, House } from 'lucide-react';

import {
  isNavItemActive,
  type AppNavItem,
} from '@/components/navigation/app-navigation';

type MobileBottomNavProps = {
  items: AppNavItem[];
  moreOpen: boolean;
  onMoreClick: () => void;
  pathname: string;
};

export function MobileBottomNav({
  items,
  moreOpen,
  onMoreClick,
  pathname,
}: MobileBottomNavProps) {
  const moreActive = !items.some((item) => isNavItemActive(item, pathname));
  const itemCount = items.length + 1;

  return (
    <nav
      aria-label="Основная навигация"
      className="app-shell-dock fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--border-color)] bg-white/95 px-2 pt-1.5 shadow-[0_-8px_28px_rgba(7,22,46,0.08)] backdrop-blur 2xl:hidden"
      data-item-count={itemCount}
      style={{
        gridTemplateColumns: `repeat(${itemCount}, minmax(0, 1fr))`,
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {items.map((item) => (
        <PrimaryLink item={item} key={item.href} pathname={pathname} />
      ))}
      <button
        aria-current={moreActive ? 'page' : undefined}
        aria-expanded={moreOpen}
        className={navItemClass(moreActive)}
        onClick={onMoreClick}
        type="button"
      >
        <span className="grid size-7 shrink-0 place-items-center">
          <Image
            alt=""
            className="app-classic-only h-6 w-6 object-contain"
            height={64}
            src="/mobile-icons/more.webp"
            width={64}
          />
          <Ellipsis aria-hidden="true" className="app-glassy-only size-6" />
        </span>
        <span>Ещё</span>
      </button>
    </nav>
  );
}

function PrimaryLink({
  item,
  pathname,
}: {
  item: AppNavItem;
  pathname: string;
}) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.href === '/dashboard' ? House : item.Icon;

  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={navItemClass(active)}
      href={item.href}
      prefetch={item.href === '/stock' ? true : undefined}
    >
      <span className="grid size-7 shrink-0 place-items-center">
        <Image
          alt=""
          className={`app-classic-only h-6 w-6 object-contain ${item.href === '/manager' ? 'scale-[1.25]' : ''}`}
          height={64}
          src={item.mobileIcon}
          width={64}
        />
        <Icon aria-hidden="true" className={`app-glassy-only ${item.href === '/settings' ? 'size-5' : 'size-6'}`} />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function navItemClass(active: boolean) {
  return `app-shell-dock-item relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[11px] font-semibold transition ${
    active
      ? 'bg-[#E8F1FF] text-[var(--brand-dark)]'
      : 'text-[var(--text-secondary)] active:bg-[#F2F6FC]'
  }`;
}
