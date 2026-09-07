'use client';

import { FileText, Network, Percent, Plug, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { SystemSettings } from '../../../lib/types';
import { SettingsSection } from './settings-section';

const SETTINGS_KEYS = [
  'base_url',
  'default_organization_key',
  'sale_operation',
  'currency_key',
  'order_type_key',
  'order_type_type',
  'price_type_key',
  'order_state_key',
  'order_state_type',
  'sale_unit_key',
  'reserve_unit_key',
  'business_operation_key',
  'vat_rate_key',
  'vat_percent',
  'vat_included',
  'sum_includes_vat',
  'unit_type',
] as const satisfies readonly (keyof SystemSettings)[];

type OneCSettingsKey = (typeof SETTINGS_KEYS)[number];

export type OneCSettingsValue = Pick<SystemSettings, OneCSettingsKey>;

export type OneCSettingsProps = {
  loadSettings: () => Promise<OneCSettingsValue>;
  saveSettings: (settings: OneCSettingsValue) => Promise<unknown>;
  testConnection: () => Promise<unknown>;
};

type TextField = {
  key: Exclude<OneCSettingsKey, 'vat_included' | 'sum_includes_vat'>;
  label: string;
  placeholder?: string;
};

type SectionDefinition = {
  title: string;
  description: string;
  icon: ReactNode;
  fields: readonly TextField[];
  toggles?: readonly {
    key: 'vat_included' | 'sum_includes_vat';
    label: string;
    description: string;
  }[];
  connectionAction?: boolean;
};

const SECTIONS: readonly SectionDefinition[] = [
  {
    title: 'Подключение',
    description: 'Адрес базы для обмена данными с 1С.',
    icon: <Plug aria-hidden="true" className="size-5" strokeWidth={1.8} />,
    fields: [
      {
        key: 'base_url',
        label: 'URL базы 1С',
        placeholder: 'https://server/odata/standard.odata',
      },
    ],
    connectionAction: true,
  },
  {
    title: 'Заказы и документы',
    description: 'Параметры организации, операций и состояний документов.',
    icon: <FileText aria-hidden="true" className="size-5" strokeWidth={1.8} />,
    fields: [
      { key: 'default_organization_key', label: 'Организация по умолчанию' },
      { key: 'sale_operation', label: 'Вид операции продажи' },
      { key: 'currency_key', label: 'Валюта документа' },
      { key: 'order_type_key', label: 'Ключ вида заказа' },
      { key: 'order_type_type', label: 'Тип вида заказа' },
      { key: 'price_type_key', label: 'Вид цен' },
      { key: 'order_state_key', label: 'Ключ состояния заказа' },
      { key: 'order_state_type', label: 'Тип состояния заказа' },
      { key: 'business_operation_key', label: 'Хозяйственная операция' },
    ],
  },
  {
    title: 'Структура и единицы',
    description: 'Структурные единицы продажи, резерва и единицы измерения.',
    icon: <Network aria-hidden="true" className="size-5" strokeWidth={1.8} />,
    fields: [
      { key: 'sale_unit_key', label: 'Структурная единица продажи' },
      { key: 'reserve_unit_key', label: 'Структурная единица резерва' },
      { key: 'unit_type', label: 'Тип единицы измерения' },
    ],
  },
  {
    title: 'НДС',
    description: 'Ставка налога и правила включения НДС в стоимость документа.',
    icon: <Percent aria-hidden="true" className="size-5" strokeWidth={1.8} />,
    fields: [
      { key: 'vat_rate_key', label: 'Ключ ставки НДС' },
      { key: 'vat_percent', label: 'Ставка НДС, %', placeholder: '22' },
    ],
    toggles: [
      {
        key: 'vat_included',
        label: 'НДС включён в стоимость',
        description: 'Передавать цену позиции с включённым НДС.',
      },
      {
        key: 'sum_includes_vat',
        label: 'Сумма документа включает НДС',
        description: 'Считать итоговую сумму документа уже содержащей НДС.',
      },
    ],
  },
];

export function OneCSettings({
  loadSettings,
  saveSettings,
  testConnection,
}: OneCSettingsProps) {
  const isMobile = useMobileLayout();
  const [form, setForm] = useState<OneCSettingsValue | null>(null);
  const [savedForm, setSavedForm] = useState<OneCSettingsValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const isDirty = Boolean(
    form &&
    savedForm &&
    SETTINGS_KEYS.some((key) => form[key] !== savedForm[key]),
  );

  useDirtyStateWarning(isDirty);

  useEffect(() => {
    let isActive = true;

    async function load() {
      setIsLoading(true);
      setFeedback(null);
      try {
        const loaded = pickSupportedSettings(await loadSettings());
        if (isActive) {
          setForm(loaded);
          setSavedForm(loaded);
        }
      } catch (error: unknown) {
        if (isActive) {
          setFeedback({
            kind: 'error',
            text: getErrorMessage(error, 'Не удалось загрузить настройки 1С.'),
          });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      isActive = false;
    };
  }, [loadSettings]);

  const updateField = useCallback((key: OneCSettingsKey, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFeedback(null);
  }, []);

  async function handleSave() {
    if (!form) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = pickSupportedSettings(form);
      await saveSettings(payload);
      setSavedForm(payload);
      setFeedback({ kind: 'success', text: 'Настройки 1С сохранены.' });
    } catch (error: unknown) {
      setFeedback({
        kind: 'error',
        text: getErrorMessage(error, 'Не удалось сохранить настройки 1С.'),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setFeedback(null);
    try {
      await testConnection();
      setFeedback({ kind: 'success', text: 'Подключение к 1С работает.' });
    } catch (error: unknown) {
      setFeedback({
        kind: 'error',
        text: getErrorMessage(error, 'Не удалось подключиться к 1С.'),
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-4 text-[var(--text-primary)]">
      <header className="flex items-center gap-3">
        <Link
          href="/settings"
          aria-label="Назад к настройкам"
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-color)] bg-white text-[var(--brand-dark)] shadow-[0_6px_18px_rgba(7,22,46,0.06)] outline-none transition hover:bg-[#F8FAFD] focus-visible:ring-3 focus-visible:ring-[rgba(255,196,0,0.35)]"
        >
          <BackIcon />
        </Link>
        <div>
          <h1 className="text-[24px] font-[680] leading-tight tracking-[-0.035em] md:text-[28px]">
            Интеграция с 1С
          </h1>
          <p className="mt-1 hidden text-[12px] text-[var(--text-secondary)] md:block">
            Глобальные параметры подключения, документов, структуры и НДС.
          </p>
        </div>
      </header>

      {feedback ? (
        <output
          role={feedback.kind === 'success' ? 'status' : 'alert'}
          className={`rounded-[14px] border px-4 py-3 text-[12px] ${
            feedback.kind === 'success'
              ? 'border-[#CDEBD5] bg-[#ECFDF3] text-[#147A36]'
              : 'border-[#F9D4D4] bg-[#FEF2F2] text-[var(--stock-empty)]'
          }`}
        >
          {feedback.text}
        </output>
      ) : null}

      {isLoading ? (
        <output className="rounded-[18px] border border-[var(--border-color)] bg-white p-6 text-[12px] text-[var(--text-secondary)]">
          Загружаем настройки 1С…
        </output>
      ) : form ? (
        <>
          <div
            data-testid={
              isMobile ? 'onec-mobile-sections' : 'onec-desktop-sections'
            }
            className={isMobile ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}
          >
            {SECTIONS.map((section) => (
              <SettingsSection
                key={section.title}
                title={section.title}
                description={section.description}
                icon={section.icon}
                variant={isMobile ? 'mobile' : 'desktop'}
              >
                <SectionFields
                  section={section}
                  form={form}
                  updateField={updateField}
                  isTesting={isTesting}
                  onTestConnection={handleTestConnection}
                />
              </SettingsSection>
            ))}
          </div>

          <div
            className={
              isMobile
                ? 'sticky bottom-0 z-20 -mx-1 border-t border-[var(--border-color)] bg-[rgba(245,247,250,0.96)] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur'
                : 'flex justify-end pt-1'
            }
          >
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !isDirty}
              className="app-action-button app-action-button--xl min-h-12 w-full px-6 text-[13px] md:w-auto"
            >
              {isSaving ? 'Сохраняем…' : 'Сохранить настройки 1С'}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-[18px] border border-[var(--border-color)] bg-white p-6 text-[12px] text-[var(--text-secondary)]">
          Настройки 1С недоступны.
        </div>
      )}
    </div>
  );
}

function SectionFields({
  section,
  form,
  updateField,
  isTesting,
  onTestConnection,
}: {
  section: SectionDefinition;
  form: OneCSettingsValue;
  updateField: (key: OneCSettingsKey, value: string) => void;
  isTesting: boolean;
  onTestConnection: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      {section.fields.map((field) => (
        <label key={field.key} className="grid gap-1.5">
          <span className="text-[11px] font-[620] text-[var(--text-primary)]">
            {field.label}
          </span>
          <input
            type="text"
            value={form[field.key]}
            placeholder={field.placeholder}
            onChange={(event) => updateField(field.key, event.target.value)}
            className="min-h-11 w-full rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[#9AA5B5] hover:border-[#CCD4E0] focus:border-[var(--brand-yellow)] focus:ring-3 focus:ring-[rgba(255,196,0,0.14)]"
          />
        </label>
      ))}

      {section.toggles?.map((toggle) => (
        <label
          key={toggle.key}
          className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--border-color)] px-3 py-2"
        >
          <input
            type="checkbox"
            aria-label={toggle.label}
            checked={form[toggle.key] === '1'}
            onChange={(event) =>
              updateField(toggle.key, event.target.checked ? '1' : '0')
            }
            className="size-5 shrink-0 accent-[var(--brand-yellow)]"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-[620]">{toggle.label}</span>
            <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-secondary)]">
              {toggle.description}
            </span>
          </span>
        </label>
      ))}

      {section.connectionAction ? (
        <button
          type="button"
          onClick={() => void onTestConnection()}
          disabled={isTesting}
          className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-4 text-[12px] font-[620] text-[var(--brand-dark)] outline-none transition hover:bg-[#F8FAFD] focus-visible:ring-3 focus-visible:ring-[rgba(255,196,0,0.28)]"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${isTesting ? 'animate-spin' : ''}`}
          />
          {isTesting ? 'Проверяем…' : 'Проверить подключение'}
        </button>
      ) : null}
    </div>
  );
}

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}

function useDirtyStateWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warning = 'Есть несохранённые изменения. Покинуть страницу?';
    let isRestoringHistory = false;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- Required by older browsers to show the native unload warning.
      event.returnValue = '';
    };
    const handlePopState = (event: PopStateEvent) => {
      if (isRestoringHistory) {
        isRestoringHistory = false;
        return;
      }

      if (!window.confirm(warning)) {
        event.stopImmediatePropagation();
        isRestoringHistory = true;
        window.history.forward();
      }
    };
    const handleNavigate = (event: Event) => {
      if (event.cancelable && !window.confirm(warning)) {
        event.preventDefault();
      }
    };
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (link && !window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    if (navigation) {
      navigation.addEventListener('navigate', handleNavigate);
    } else {
      window.addEventListener('popstate', handlePopState, true);
      document.addEventListener('click', handleLinkClick, true);
    }
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (navigation) {
        navigation.removeEventListener('navigate', handleNavigate);
      } else {
        window.removeEventListener('popstate', handlePopState, true);
        document.removeEventListener('click', handleLinkClick, true);
      }
    };
  }, [isDirty]);
}

function pickSupportedSettings(value: OneCSettingsValue): OneCSettingsValue {
  return Object.fromEntries(
    SETTINGS_KEYS.map((key) => [key, value[key] ?? '']),
  ) as OneCSettingsValue;
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path
        d="M16 10H4m0 0 5-5m-5 5 5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}
