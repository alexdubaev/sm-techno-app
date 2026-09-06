'use client';

import type { CrmTab } from '@/lib/types';

type ActiveTab = 'primary' | number;

type MobileCrmTabsProps = {
  activeTab: ActiveTab;
  disabled?: boolean;
  tabs: CrmTab[];
  onTabChange: (tab: ActiveTab) => void;
};

export function MobileCrmTabs({
  activeTab,
  disabled = false,
  tabs,
  onTabChange,
}: MobileCrmTabsProps) {
  return (
    <nav
      className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Вкладки CRM"
    >
      <div className="flex min-w-max gap-2 py-3">
        <MobileTab
          active={activeTab === 'primary'}
          disabled={disabled}
          label="Клиенты 1С"
          onClick={() => onTabChange('primary')}
        />
        {tabs.map((tab) => (
          <MobileTab
            key={tab.id}
            active={activeTab === tab.id}
            disabled={disabled}
            label={tab.name}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function MobileTab({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-[12px] font-bold outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:opacity-60 ${active ? 'border-[var(--brand-dark)] bg-[var(--brand-dark)] text-white' : 'border-[var(--border-color)] bg-white text-[#526174]'}`}
    >
      {label}
    </button>
  );
}
