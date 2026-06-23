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
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="hidden w-[246px] shrink-0 border-r border-[var(--border-color)] bg-white/92 px-3 py-3 backdrop-blur-sm lg:flex lg:flex-col">
          <div className="mb-4 px-1.5">
            <div className="relative h-[82px] w-[226px] overflow-hidden">
              <Image
                src="/logo.png"
                alt="СМ Техно"
                width={310}
                height={120}
                className="absolute left-1/2 top-[56%] h-auto w-[310px] max-w-none -translate-x-1/2 -translate-y-1/2"
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

          <div className="mt-auto space-y-2">
            <div className="rounded-[18px] border border-[var(--border-color)] bg-white/95 p-3.5 shadow-[0_12px_30px_rgba(7,22,46,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[var(--panel-muted)] text-[var(--brand-dark)]">
                  <HeadsetIcon className="h-4 w-4 stroke-[1.8]" />
                </div>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
              </div>
              <p className="mt-3 text-[12px] font-semibold text-[var(--text-primary)]">Нужна помощь?</p>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Поддержка 24/7</p>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-[40px] w-full items-center justify-center rounded-[14px] border border-[var(--border-color)] bg-white text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD]"
            >
              Выйти
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-2.5 py-2.5 md:px-3 md:py-3 xl:px-4 xl:py-4">
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

function HeadsetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 12a7 7 0 1 1 14 0v5a2 2 0 0 1-2 2h-1.5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 15.5 13H19M5 12v5a2 2 0 0 0 2 2h1.5A1.5 1.5 0 0 0 10 17.5v-3A1.5 1.5 0 0 0 8.5 13H5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
