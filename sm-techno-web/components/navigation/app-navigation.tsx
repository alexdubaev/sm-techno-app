import type { ReactNode, SVGProps } from 'react';

export type AppNavItem = {
  href: string;
  label: string;
  mobileIcon: `/mobile-icons/${string}.webp`;
  adminOnly?: boolean;
  isActive?: (pathname: string) => boolean;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
};

export const navigationGroups: AppNavGroup[] = [
  {
    label: 'Прайсы',
    items: [
      {
        href: '/',
        label: 'Остатки',
        mobileIcon: '/mobile-icons/stock.webp',
        Icon: BoxIcon,
      },
      {
        href: '/work-with-price',
        label: 'Работа с прайсом',
        mobileIcon: '/mobile-icons/price-work.webp',
        Icon: PriceTagIcon,
        adminOnly: true,
      },
      {
        href: '/work-with-invoice',
        label: 'Работа со счетом',
        mobileIcon: '/mobile-icons/invoice-work.webp',
        Icon: DocumentIcon,
      },
      {
        href: '/orders',
        label: 'Заказы',
        mobileIcon: '/mobile-icons/orders.webp',
        Icon: ClipboardIcon,
      },
    ],
  },
  {
    label: 'Коммерческие предложения',
    items: [
      {
        href: '/commercial-offers/new',
        label: 'Создать КП',
        mobileIcon: '/mobile-icons/offer-create.webp',
        Icon: DocumentIcon,
      },
      {
        href: '/commercial-offers',
        label: 'Журнал КП',
        mobileIcon: '/mobile-icons/offer-journal.webp',
        Icon: ClipboardIcon,
        isActive: (path) =>
          path === '/commercial-offers' ||
          /^\/commercial-offers\/\d+/.test(path),
      },
    ],
  },
  {
    label: 'Клиенты',
    items: [
      {
        href: '/crm',
        label: 'CRM',
        mobileIcon: '/mobile-icons/crm.webp',
        Icon: UsersIcon,
      },
      {
        href: '/clients',
        label: 'Клиенты',
        mobileIcon: '/mobile-icons/clients.webp',
        Icon: UsersIcon,
      },
    ],
  },
  {
    label: 'Документы',
    items: [
      {
        href: '/documents',
        label: 'Документы',
        mobileIcon: '/mobile-icons/documents.webp',
        Icon: DocumentIcon,
        isActive: (path) => path === '/documents',
      },
      {
        href: '/documents/journal',
        label: 'Журнал документов',
        mobileIcon: '/mobile-icons/documents-journal.webp',
        Icon: ClipboardIcon,
      },
    ],
  },
  {
    label: 'Администрирование',
    items: [
      {
        href: '/references',
        label: 'Справочники',
        mobileIcon: '/mobile-icons/references.webp',
        Icon: BookIcon,
      },
      {
        href: '/settings',
        label: 'Настройки',
        mobileIcon: '/mobile-icons/settings.webp',
        Icon: GearIcon,
        adminOnly: true,
      },
    ],
  },
];

export function isNavGroupActive(group: AppNavGroup, pathname: string) {
  return group.items.some((item) => isNavItemActive(item, pathname));
}

export function normalizePathname(value: string) {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? '/';
  const normalized = withoutQuery.replace(/\/+$/, '');
  return normalized || '/';
}

export function isNavItemActive(item: AppNavItem, pathname: string) {
  const normalizedPathname = normalizePathname(pathname);
  if (item.isActive) return item.isActive(normalizedPathname);

  const normalizedHref = normalizePathname(item.href);
  if (normalizedHref === '/') return normalizedPathname === '/';

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}

function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4 7.5 12 4l8 3.5M4 7.5V16l8 4 8-4V7.5M4 7.5 12 11l8-3.5M12 11V20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M8 3.5h6l4 4V20a.5.5 0 0 1-.5.5h-9A2.5 2.5 0 0 1 6 18V6a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5V8h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function PriceTagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M10 4H6a2 2 0 0 0-2 2v4l8.5 8.5a2.1 2.1 0 0 0 3 0l3-3a2.1 2.1 0 0 0 0-3L10 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9 4.5h6M9.5 3h5a1.5 1.5 0 0 1 1.5 1.5v1H8V4.5A1.5 1.5 0 0 1 9.5 3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5.5H6.5A1.5 1.5 0 0 0 5 7v11.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 17.5 5.5H16M8.5 10h7M8.5 13.5h7M8.5 17h4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M5.5 5A2.5 2.5 0 0 1 8 2.5h10.5V18H8a2.5 2.5 0 0 0-2.5 2.5V5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 18H8a2.5 2.5 0 0 0-2.5 2.5h10.5a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m14.5 3 .7 1.8a7.7 7.7 0 0 1 1.8.8L18.8 5l2.2 2.2-.6 1.8c.3.6.6 1.2.8 1.8l1.8.7v3.1l-1.8.7a7.7 7.7 0 0 1-.8 1.8l.6 1.8-2.2 2.2-1.8-.6a7.7 7.7 0 0 1-1.8.8l-.7 1.8h-3.1l-.7-1.8a7.7 7.7 0 0 1-1.8-.8l-1.8.6L5 18.8l.6-1.8a7.7 7.7 0 0 1-.8-1.8L3 14.5v-3.1l1.8-.7c.2-.6.5-1.2.8-1.8L5 7.2 7.2 5l1.8.6c.6-.3 1.2-.6 1.8-.8L11.5 3h3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 20a6 6 0 0 1 12 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 11a3 3 0 1 0-.7-5.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 19.5a5 5 0 0 0-3.1-4.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
