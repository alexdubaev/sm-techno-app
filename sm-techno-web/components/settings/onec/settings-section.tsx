import { useId, useState, type ReactNode } from 'react';

type SettingsSectionProps = {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  variant: 'desktop' | 'mobile';
};

export function SettingsSection({
  title,
  description,
  icon,
  children,
  variant,
}: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  if (variant === 'mobile') {
    return (
      <section
        data-testid="settings-accordion"
        className="overflow-hidden rounded-[20px] border border-[var(--border-color)] bg-white shadow-[0_8px_24px_rgba(7,22,46,0.07)]"
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((current) => !current)}
          className="flex min-h-20 w-full items-center gap-4 px-4 py-3 text-left text-[var(--text-primary)] outline-none transition-colors hover:bg-[#F8FAFD] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[rgba(255,196,0,0.35)]"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F3F5F8] text-[var(--brand-dark)]">
            {icon}
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-[650] leading-5">
            {title}
          </span>
          <ChevronIcon isOpen={isOpen} />
        </button>

        {isOpen ? (
          <div
            id={panelId}
            className="border-t border-[var(--border-color)] px-4 py-4"
          >
            <p className="mb-4 text-[12px] leading-5 text-[var(--text-secondary)]">
              {description}
            </p>
            {children}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      data-testid="settings-card"
      className="rounded-[18px] border border-[var(--border-color)] bg-white p-5 shadow-[0_8px_24px_rgba(7,22,46,0.055)]"
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(255,196,0,0.16)] text-[var(--brand-dark)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-[650] leading-5 tracking-[-0.015em] text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`size-5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
