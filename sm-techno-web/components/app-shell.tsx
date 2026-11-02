'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';

import { useAuth } from '@/components/auth-provider';
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav';
import { MobileMoreMenu } from '@/components/mobile/mobile-more-menu';
import { fetchCurrentUserDueCrmReminders } from '@/lib/api';
import {
  isNavGroupActive,
  isNavItemActive,
  navigationGroups,
  type AppNavGroup,
  type AppNavItem,
} from '@/components/navigation/app-navigation';
import { Toaster, toast } from '@/components/ui/toast';

type ShellProps = {
  children: ReactNode;
};

type MenuState = {
  expandedGroupLabel: string;
  selectedGroupLabel: string;
  pathname: string;
};

function formatMoscowDeadline(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Moscow',
      });
}

let menuStateSnapshot: MenuState = {
  expandedGroupLabel: '',
  selectedGroupLabel: '',
  pathname: '',
};

/** A new address (link on a page, back/forward, fresh load) selects and opens its group. */
function syncMenuWithRoute(
  state: MenuState,
  pathname: string,
  routeGroupLabel: string,
): MenuState {
  if (state.pathname === pathname) return state;
  if (!routeGroupLabel) return { ...state, pathname };
  return {
    expandedGroupLabel: routeGroupLabel,
    selectedGroupLabel: routeGroupLabel,
    pathname,
  };
}

export function AppShell({ children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const seenReminderRevisions = useRef(new Set<string>());

  useEffect(() => {
    if (!user.id) return;
    const checkDueReminders = () => {
      void fetchCurrentUserDueCrmReminders()
        .then((items) =>
          items.forEach((reminder) => {
            const revision = `${reminder.id}:${reminder.updatedAt}`;
            if (seenReminderRevisions.current.has(revision)) return;
            seenReminderRevisions.current.add(revision);
            toast.add({
              title: 'Напоминание',
              description: `${reminder.clientLabel || 'Клиент'} · ${formatMoscowDeadline(reminder.dueAt)}`,
              actionProps: {
                children: 'Открыть CRM',
                onClick: () => router.push('/crm'),
              },
            });
          }),
        )
        .catch(() => undefined);
    };
    checkDueReminders();
    const interval = window.setInterval(checkDueReminders, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkDueReminders();
    };
    window.addEventListener('focus', checkDueReminders);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkDueReminders);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, user.id]);

  const visibleNavGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin).map((item) => isAdmin && item.href === '/manager' ? { ...item, label: 'Мои продажи' } : item),
    }))
    .filter((group) => group.items.length > 0);
  const routeGroupLabel =
    visibleNavGroups.find((group) => isNavGroupActive(group, pathname))
      ?.label ?? '';
  const [storedMenuState, setMenuState] = useState<MenuState>(() =>
    syncMenuWithRoute(menuStateSnapshot, pathname, routeGroupLabel),
  );
  const menuState = syncMenuWithRoute(
    storedMenuState,
    pathname,
    routeGroupLabel,
  );
  useEffect(() => {
    menuStateSnapshot = menuState;
  }, [menuState]);
  const [moreOpen, setMoreOpen] = useState(false);
  const selectedGroupIsVisible = visibleNavGroups.some(
    (group) => group.label === menuState.selectedGroupLabel,
  );
  const activeGroupLabel = selectedGroupIsVisible
    ? menuState.selectedGroupLabel
    : routeGroupLabel;
  const displayName = user.fullName.trim() || user.username;
  const roleLabel = isAdmin ? 'Администратор' : 'Пользователь';
  const mobilePrimaryItems = visibleNavGroups.flatMap((group) =>
    group.items.filter(
      (item) =>
        item.href === (isAdmin ? '/dashboard' : '/manager') || item.href === '/stock' || item.href === '/crm' || item.href === '/settings',
    ),
  );

  const updateMenuState = (updater: (current: MenuState) => MenuState) => {
    setMenuState((current) =>
      updater(syncMenuWithRoute(current, pathname, routeGroupLabel)),
    );
  };

  const handleGroupClick = (group: AppNavGroup) => {
    updateMenuState((current) => ({
      ...current,
      expandedGroupLabel:
        current.expandedGroupLabel === group.label ? '' : group.label,
      selectedGroupLabel: group.label,
    }));
  };

  const handleItemClick = (groupLabel: string) => {
    updateMenuState((current) => ({
      ...current,
      expandedGroupLabel: groupLabel,
      selectedGroupLabel: groupLabel,
    }));
  };

  return (
    <Toaster>
      <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
        <div className="mx-auto min-h-screen max-w-[1680px] 2xl:flex">
          <aside className="app-shell-sidebar hidden w-[246px] shrink-0 border-r border-[var(--border-color)] bg-white/92 px-3 py-3 backdrop-blur-sm 2xl:flex 2xl:flex-col">
            <div className="mb-4 px-1.5">
              <div className="relative h-[76px] w-[198px] overflow-hidden 2xl:h-[82px] 2xl:w-[226px]">
                <Image
                  src="/logo.png"
                  alt="СМ Техно"
                  width={310}
                  height={120}
                  className="absolute left-1/2 top-[56%] h-auto w-[270px] max-w-none -translate-x-1/2 -translate-y-1/2 2xl:w-[310px]"
                  priority
                />
              </div>
            </div>

            <div className="mb-3 rounded-[16px] border border-[var(--border-color)] bg-[#FBFCFE] px-3 py-2.5">
              <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                {displayName}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                {roleLabel}
              </div>
            </div>

            <nav className="space-y-1.5" aria-label="Главное меню">
              {visibleNavGroups.map((group, groupIndex) => {
                const groupActive = activeGroupLabel === group.label;
                const groupExpanded =
                  menuState.expandedGroupLabel === group.label;
                const collapseId = `desktop-nav-group-${groupIndex}`;

                if (group.items.length === 1) {
                  const [item] = group.items;
                  return (
                    <div key={group.label}>
                      <Link
                        href={item.href}
                        aria-current={
                          isNavItemActive(item, pathname) ? 'page' : undefined
                        }
                        onClick={() => handleItemClick(group.label)}
                        className={navGroupClassName(groupActive, false)}
                      >
                        <span className="min-w-0 text-left">{group.label}</span>
                      </Link>
                    </div>
                  );
                }

                return (
                  <div key={group.label}>
                    <NavGroupButton
                      active={groupActive}
                      controlsId={collapseId}
                      expanded={groupExpanded}
                      label={group.label}
                      onClick={() => handleGroupClick(group)}
                    />
                    <div
                      id={collapseId}
                      className="app-nav-collapse"
                      data-open={groupExpanded ? 'true' : 'false'}
                      aria-hidden={groupExpanded ? undefined : true}
                      inert={!groupExpanded}
                    >
                      <div>
                        <div className="space-y-1 pb-1 pl-2 pt-1.5">
                          {group.items.map((item) => (
                            <SidebarLink
                              key={item.href}
                              item={item}
                              onClick={() => handleItemClick(group.label)}
                              pathname={pathname}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="mt-auto">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex h-[40px] w-full items-center justify-center rounded-[14px] border border-[var(--border-color)] bg-white text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
              >
                Выйти
              </button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div
              data-testid="mobile-shell-header"
              className="app-shell-mobile-header border-b border-[var(--border-color)] bg-white/92 px-2 py-2 backdrop-blur-sm 2xl:hidden"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="relative h-[50px] w-[146px] overflow-hidden">
                  <Image
                    src="/logo.png"
                    alt="СМ Техно"
                    width={240}
                    height={92}
                    className="absolute left-1/2 top-[56%] h-auto w-[192px] max-w-none -translate-x-1/2 -translate-y-1/2"
                    priority
                  />
                </div>
                <div className="min-w-0 text-right">
                  <div className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                    {displayName}
                  </div>
                  <div className="text-[9px] text-[var(--text-secondary)]">
                    {roleLabel}
                  </div>
                </div>
              </div>
            </div>

            <main className="app-shell-main min-w-0 px-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-2 md:px-3 md:pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pt-3 xl:px-3.5 xl:pb-[calc(5.5rem+env(safe-area-inset-bottom))] xl:pt-3.5 2xl:px-4 2xl:py-4">
              <div className="app-shell-content relative">{children}</div>
            </main>
            <MobileBottomNav
              items={mobilePrimaryItems}
              moreOpen={moreOpen}
              onMoreClick={() => setMoreOpen(true)}
              pathname={pathname}
            />
            <MobileMoreMenu
              displayName={displayName}
              groups={visibleNavGroups}
              logout={logout}
              onOpenChange={setMoreOpen}
              open={moreOpen}
              roleLabel={roleLabel}
            />
          </div>
        </div>
      </div>
    </Toaster>
  );
}

function navGroupClassName(active: boolean, expanded: boolean) {
  const toneClass = active
    ? 'bg-[var(--brand-dark)] text-white shadow-[0_12px_24px_rgba(7,22,46,0.14)]'
    : expanded
      ? 'bg-[#F1F4F9] text-[var(--text-primary)] hover:bg-[#EBEFF5]'
      : 'bg-transparent text-[var(--text-primary)] hover:bg-[#F1F4F9]';
  return `inline-flex min-h-[36px] w-full items-center justify-between gap-2 rounded-[12px] px-3 py-1.5 text-left transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[.985] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(255,196,0,0.35)] motion-reduce:transition-none ${toneClass}`;
}

function NavGroupButton({
  active,
  controlsId,
  expanded,
  label,
  onClick,
}: {
  active: boolean;
  controlsId: string;
  expanded: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-controls={controlsId}
      aria-expanded={expanded}
      onClick={onClick}
      className={navGroupClassName(active, expanded)}
    >
      <span className="min-w-0 text-left">{label}</span>
      <ChevronIcon
        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function SidebarLink({
  item,
  onClick,
  pathname,
}: {
  item: AppNavItem;
  onClick: () => void;
  pathname: string;
}) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.Icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex h-[38px] items-center gap-2 rounded-[12px] border px-3 text-[12px] font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[.985] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(255,196,0,0.35)] motion-reduce:transition-none ${
        active
          ? 'border-[var(--brand-dark)] bg-white text-[var(--brand-dark)] shadow-[inset_3px_0_0_var(--brand-yellow)]'
          : 'border-transparent text-[var(--text-primary)] hover:bg-[#F1F4F9]'
      }`}
    >
      <Icon className="h-[17px] w-[17px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
