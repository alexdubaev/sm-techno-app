'use client';

import Image from 'next/image';
import Link from 'next/link';

import type { AppNavGroup } from '@/components/navigation/app-navigation';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

type MobileMoreMenuProps = {
  displayName: string;
  groups: AppNavGroup[];
  logout: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  roleLabel: string;
};

export function MobileMoreMenu({
  displayName,
  groups,
  logout,
  onOpenChange,
  open,
  roleLabel,
}: MobileMoreMenuProps) {
  const menuGroups = groups.flatMap((group) => {
    const items = group.items.filter(
      (item) =>
        item.href !== '/' && item.href !== '/crm' && item.href !== '/settings',
    );
    return items.length > 0 ? [{ ...group, items }] : [];
  });

  return (
    <Drawer
      onOpenChange={onOpenChange}
      open={open}
      showSwipeHandle
      swipeDirection="down"
    >
      <DrawerContent className="max-h-[88dvh] rounded-t-[28px] border-0 bg-[#F7F9FC] shadow-[0_-18px_48px_rgba(7,22,46,0.2)]">
        <DrawerHeader className="px-5 pb-3 pt-4 text-left">
          <DrawerTitle className="text-[18px] font-bold text-[var(--text-primary)]">
            Ещё
          </DrawerTitle>
        </DrawerHeader>
        <nav
          aria-label="Дополнительная навигация"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
        >
          <div className="space-y-5">
            {menuGroups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  {group.label}
                </h2>
                <div className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-white">
                  {group.items.map((item) => (
                    <Link
                      className="flex min-h-[54px] items-center gap-3 border-b border-[var(--border-color)] px-3 last:border-b-0 active:bg-[#F4F8FE]"
                      href={item.href}
                      key={item.href}
                      onClick={() => onOpenChange(false)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#EAF2FF]">
                        <Image
                          alt=""
                          className="h-6 w-6 object-contain"
                          height={64}
                          src={item.mobileIcon}
                          width={64}
                        />
                      </span>
                      <span className="min-w-0 text-[14px] font-semibold text-[var(--text-primary)]">
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>
        <DrawerFooter className="mt-0 border-t border-[var(--border-color)] bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                {displayName}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                {roleLabel}
              </div>
            </div>
            <button
              className="min-h-10 rounded-[12px] border border-[var(--border-color)] px-3 text-[12px] font-semibold text-[var(--text-primary)] active:bg-[#F4F8FE]"
              onClick={() => void logout()}
              type="button"
            >
              Выйти
            </button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
