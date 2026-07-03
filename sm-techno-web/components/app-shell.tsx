"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, SVGProps } from "react";

import { useAuth } from "@/components/auth-provider";

type ShellProps = {
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
};

const navItems: NavItem[] = [
  { href: "/", label: "Остатки", Icon: BoxIcon },
  { href: "/work-with-price", label: "Работа с прайсом", Icon: PriceTagIcon, adminOnly: true },
  { href: "/work-with-invoice", label: "Работа со счетом", Icon: DocumentIcon },
  { href: "/orders", label: "Заказы", Icon: ClipboardIcon },
  { href: "/references", label: "Справочники", Icon: BookIcon },
  { href: "/settings", label: "Настройки", Icon: GearIcon, adminOnly: true },
];

export function AppShell({ children }: ShellProps) {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const displayName = user.fullName.trim() || user.username;
  const roleLabel = isAdmin ? "Администратор" : "Пользователь";

  return (
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
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">{displayName}</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{roleLabel}</div>
          </div>

          <nav className="space-y-2">
            {visibleNavItems.map(({ href, label, Icon }) => {
              const isActive = pathname === href;

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "group flex items-center gap-3 rounded-[16px] px-3 py-2 text-[13px] font-medium transition-all duration-200",
                    isActive
                      ? "bg-[var(--brand-dark)] text-white shadow-[0_18px_32px_rgba(7,22,46,0.16)]"
                      : "text-[var(--text-primary)] hover:bg-[#F7F9FC]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-8 w-[3px] rounded-full transition-colors",
                      isActive ? "bg-[var(--brand-yellow)]" : "bg-transparent",
                    ].join(" ")}
                  />
                  <Icon
                    className={[
                      "h-[18px] w-[18px] shrink-0 stroke-[1.8]",
                      isActive ? "text-white" : "text-[var(--text-secondary)]",
                    ].join(" ")}
                  />
                  <span className={isActive ? "leading-5 text-white" : "leading-5 text-[var(--text-primary)]"}>
                    {label}
                  </span>
                </Link>
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
          <div className="app-shell-mobile-header border-b border-[var(--border-color)] bg-white/92 px-2 py-2 backdrop-blur-sm 2xl:hidden">
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
                <div className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{displayName}</div>
                <div className="text-[9px] text-[var(--text-secondary)]">{roleLabel}</div>
              </div>
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {visibleNavItems.map(({ href, label, Icon }) => {
                const isActive = pathname === href;

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3 py-2 text-[11px] font-medium transition-all duration-200",
                      isActive
                        ? "border-[var(--brand-dark)] bg-[var(--brand-dark)] text-white shadow-[0_10px_20px_rgba(7,22,46,0.14)]"
                        : "border-[var(--border-color)] bg-white text-[var(--text-primary)] hover:bg-[#F7F9FC]",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "h-[16px] w-[16px] shrink-0 stroke-[1.8]",
                        isActive ? "text-white" : "text-[var(--text-secondary)]",
                      ].join(" ")}
                    />
                    <span className="whitespace-nowrap">{label}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex shrink-0 items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
              >
                Выйти
              </button>
            </div>
          </div>

          <main className="app-shell-main min-w-0 px-2 py-2 md:px-3 md:py-3 xl:px-3.5 xl:py-3.5 2xl:px-4 2xl:py-4">
          <div className="app-shell-content relative">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 7.5 12 4l8 3.5M4 7.5V16l8 4 8-4V7.5M4 7.5 12 11l8-3.5M12 11V20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M8 3.5h6l4 4V20a.5.5 0 0 1-.5.5h-9A2.5 2.5 0 0 1 6 18V6a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3.5V8h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function PriceTagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v4l8.5 8.5a2.1 2.1 0 0 0 3 0l3-3a2.1 2.1 0 0 0 0-3L10 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M9 4.5h6M9.5 3h5a1.5 1.5 0 0 1 1.5 1.5v1H8V4.5A1.5 1.5 0 0 1 9.5 3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5.5H6.5A1.5 1.5 0 0 0 5 7v11.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 17.5 5.5H16M8.5 10h7M8.5 13.5h7M8.5 17h4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5.5 5A2.5 2.5 0 0 1 8 2.5h10.5V18H8a2.5 2.5 0 0 0-2.5 2.5V5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 18H8a2.5 2.5 0 0 0-2.5 2.5h10.5a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="m14.5 3 .7 1.8a7.7 7.7 0 0 1 1.8.8L18.8 5l2.2 2.2-.6 1.8c.3.6.6 1.2.8 1.8l1.8.7v3.1l-1.8.7a7.7 7.7 0 0 1-.8 1.8l.6 1.8-2.2 2.2-1.8-.6a7.7 7.7 0 0 1-1.8.8l-.7 1.8h-3.1l-.7-1.8a7.7 7.7 0 0 1-1.8-.8l-1.8.6L5 18.8l.6-1.8a7.7 7.7 0 0 1-.8-1.8L3 14.5v-3.1l1.8-.7c.2-.6.5-1.2.8-1.8L5 7.2 7.2 5l1.8.6c.6-.3 1.2-.6 1.8-.8L11.5 3h3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

