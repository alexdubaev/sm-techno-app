'use client';

import Image from 'next/image';
import Link from 'next/link';

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
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--border-color)] bg-white/95 px-2 pt-1.5 shadow-[0_-8px_28px_rgba(7,22,46,0.08)] backdrop-blur 2xl:hidden"
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
        <span className={navIconClass(moreActive)}>
          <Image
            alt=""
            className="h-6 w-6 object-contain"
            height={64}
            src="/mobile-icons/more.webp"
            width={64}
          />
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

  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={navItemClass(active)}
      href={item.href}
    >
      <span className={navIconClass(active)}>
        <Image
          alt=""
          className="h-6 w-6 object-contain"
          height={64}
          src={item.mobileIcon}
          width={64}
        />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function navItemClass(active: boolean) {
  return `relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[11px] font-semibold transition ${
    active
      ? 'bg-[#E8F1FF] text-[var(--brand-dark)]'
      : 'text-[var(--text-secondary)] active:bg-[#F2F6FC]'
  }`;
}

function navIconClass(active: boolean) {
  return `relative flex h-7 w-7 items-center justify-center after:absolute after:-bottom-1 after:h-0.5 after:w-3 after:rounded-full ${
    active ? 'after:bg-[var(--brand-dark)]' : 'after:bg-transparent'
  }`;
}
