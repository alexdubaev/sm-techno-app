'use client';

import {
  Building2,
  ChevronDown,
  Percent,
  Plug,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { Organization, SystemSettings } from '../../../lib/types';
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
  loadOrganizations: () => Promise<Organization[]>;
  saveSettings: (settings: OneCSettingsValue) => Promise<unknown>;
  testConnection: () => Promise<{
    counterparties: number;
    organizations: number;
  }>;
};

type TextField = {
  key: Exclude<
    OneCSettingsKey,
    | 'base_url'
    | 'default_organization_key'
    | 'vat_percent'
    | 'vat_included'
    | 'sum_includes_vat'
  >;
  label: string;
  description: string;
};

const ADVANCED_FIELDS: readonly TextField[] = [
  {
    key: 'sale_operation',
    label: 'Вид операции продажи',
    description: 'Значение операции, которое получает заказ в 1С.',
  },
  {
    key: 'currency_key',
    label: 'Ключ валюты',
    description:
      'GUID валюты документа. Пустое значение использует правило 1С.',
  },
  {
    key: 'order_type_key',
    label: 'Ключ вида заказа',
    description: 'GUID вида заказа покупателя.',
  },
  {
    key: 'order_type_type',
    label: 'Тип вида заказа',
    description: 'Технический OData-тип справочника видов заказа.',
  },
  {
    key: 'price_type_key',
    label: 'Ключ вида цен',
    description: 'GUID вида цен, передаваемого в документ.',
  },
  {
    key: 'order_state_key',
    label: 'Ключ состояния заказа',
    description: 'GUID начального состояния заказа.',
  },
  {
    key: 'order_state_type',
    label: 'Тип состояния заказа',
    description: 'Технический OData-тип справочника состояний.',
  },
  {
    key: 'sale_unit_key',
    label: 'Структурная единица продажи',
    description: 'GUID подразделения, от которого оформляется продажа.',
  },
  {
    key: 'reserve_unit_key',
    label: 'Структурная единица резерва',
    description: 'GUID подразделения, в котором резервируется товар.',
  },
  {
    key: 'business_operation_key',
    label: 'Хозяйственная операция',
    description: 'GUID бухгалтерской операции документа.',
  },
  {
    key: 'vat_rate_key',
    label: 'Ключ ставки НДС',
    description: 'Необязательно: без GUID ставка определяется по проценту.',
  },
  {
    key: 'unit_type',
    label: 'Тип единицы измерения',
    description: 'Технический OData-тип единиц измерения.',
  },
];

const INPUT_CLASS =
  'min-h-11 w-full rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[#768397] hover:border-[#AEB9C8] focus:border-[var(--brand-yellow)] focus:ring-3 focus:ring-[rgba(255,196,0,0.18)]';

export function OneCSettings({
  loadSettings,
  loadOrganizations,
  saveSettings,
  testConnection,
}: OneCSettingsProps) {
  const isMobile = useMobileLayout();
  const [form, setForm] = useState<OneCSettingsValue | null>(null);
  const [savedForm, setSavedForm] = useState<OneCSettingsValue | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsError, setOrganizationsError] = useState(false);
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
      const [settingsResult, organizationsResult] = await Promise.allSettled([
        loadSettings(),
        loadOrganizations(),
      ]);

      if (!isActive) {
        return;
      }

      if (settingsResult.status === 'fulfilled') {
        const loaded = pickSupportedSettings(settingsResult.value);
        setForm(loaded);
        setSavedForm(loaded);
      } else {
        setFeedback({
          kind: 'error',
          text: getErrorMessage(
            settingsResult.reason,
            'Не удалось загрузить настройки 1С.',
          ),
        });
      }

      if (organizationsResult.status === 'fulfilled') {
        setOrganizations(organizationsResult.value);
        setOrganizationsError(false);
      } else {
        setOrganizationsError(true);
      }
      setIsLoading(false);
    }

    void load();
    return () => {
      isActive = false;
    };
  }, [loadOrganizations, loadSettings]);

  const updateField = useCallback((key: OneCSettingsKey, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFeedback(null);
  }, []);

  const updateVatMode = useCallback((mode: 'included' | 'excluded') => {
    const enabled = mode === 'included' ? '1' : '0';
    setForm((current) =>
      current
        ? {
            ...current,
            vat_included: enabled,
            sum_includes_vat: enabled,
          }
        : current,
    );
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
      setFeedback({
        kind: 'success',
        text: 'Доступ к 1С подтверждён. Каталоги контрагентов и организаций доступны.',
      });
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
            Подключение, организация документов и правила НДС.
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
            className={isMobile ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-3'}
          >
            <SettingsSection
              title="Подключение"
              description="Общий адрес базы и проверка доступа текущего пользователя."
              icon={
                <Plug aria-hidden="true" className="size-5" strokeWidth={1.8} />
              }
              variant={isMobile ? 'mobile' : 'desktop'}
            >
              <ConnectionFields
                baseUrl={form.base_url}
                isTesting={isTesting}
                onChange={(value) => updateField('base_url', value)}
                onTestConnection={handleTestConnection}
              />
            </SettingsSection>

            <SettingsSection
              title="Документы"
              description="Организация, которая будет выбрана при создании заказа."
              icon={
                <Building2
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={1.8}
                />
              }
              variant={isMobile ? 'mobile' : 'desktop'}
            >
              <OrganizationField
                value={form.default_organization_key}
                organizations={organizations}
                hasLoadError={organizationsError}
                onChange={(value) =>
                  updateField('default_organization_key', value)
                }
              />
            </SettingsSection>

            <SettingsSection
              title="НДС"
              description="Ставка и способ расчёта налога в ценах заказа."
              icon={
                <Percent
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={1.8}
                />
              }
              variant={isMobile ? 'mobile' : 'desktop'}
            >
              <VatFields
                form={form}
                onPercentChange={(value) => updateField('vat_percent', value)}
                onModeChange={updateVatMode}
              />
            </SettingsSection>
          </div>

          <AdvancedSettings form={form} updateField={updateField} />

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

function ConnectionFields({
  baseUrl,
  isTesting,
  onChange,
  onTestConnection,
}: {
  baseUrl: string;
  isTesting: boolean;
  onChange: (value: string) => void;
  onTestConnection: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      <FieldLabel label="URL базы 1С">
        <input
          type="url"
          value={baseUrl}
          placeholder="https://server/odata/standard.odata"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT_CLASS}
        />
      </FieldLabel>
      <p className="text-[10px] leading-4 text-[var(--text-secondary)]">
        Проверяется сохранённый URL и доступ 1С текущего пользователя.
      </p>
      <button
        type="button"
        onClick={() => void onTestConnection()}
        disabled={isTesting}
        className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-4 text-[12px] font-[620] text-[var(--brand-dark)] outline-none transition hover:border-[#AEB9C8] hover:bg-[#F8FAFD] focus-visible:ring-3 focus-visible:ring-[rgba(255,196,0,0.28)] disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-4 ${isTesting ? 'animate-spin' : ''}`}
        />
        {isTesting ? 'Проверяем…' : 'Проверить подключение'}
      </button>
    </div>
  );
}

function OrganizationField({
  value,
  organizations,
  hasLoadError,
  onChange,
}: {
  value: string;
  organizations: Organization[];
  hasLoadError: boolean;
  onChange: (value: string) => void;
}) {
  const hasCurrentOrganization = organizations.some(
    (organization) => organization.onecKey === value,
  );

  return (
    <div className="grid gap-2">
      <FieldLabel label="Организация по умолчанию">
        <select
          aria-label="Организация по умолчанию"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Не выбрана</option>
          {value && !hasCurrentOrganization ? (
            <option value={value}>Сохранённая организация</option>
          ) : null}
          {organizations.map((organization) => (
            <option key={organization.onecKey} value={organization.onecKey}>
              {organization.name}
            </option>
          ))}
        </select>
      </FieldLabel>
      <p className="text-[10px] leading-4 text-[var(--text-secondary)]">
        {hasLoadError
          ? 'Список организаций сейчас недоступен. Сохранённое значение не изменено.'
          : organizations.length
            ? 'В заказе организацию всё равно можно изменить перед отправкой.'
            : 'Организации появятся после синхронизации справочников 1С.'}
      </p>
    </div>
  );
}

function VatFields({
  form,
  onPercentChange,
  onModeChange,
}: {
  form: OneCSettingsValue;
  onPercentChange: (value: string) => void;
  onModeChange: (mode: 'included' | 'excluded') => void;
}) {
  const included = form.vat_included === '1' && form.sum_includes_vat === '1';
  const excluded = form.vat_included === '0' && form.sum_includes_vat === '0';

  return (
    <div className="grid gap-4">
      <FieldLabel label="Ставка НДС, %">
        <input
          aria-label="Ставка НДС, %"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={form.vat_percent}
          placeholder="22"
          onChange={(event) => onPercentChange(event.target.value)}
          className={INPUT_CLASS}
        />
      </FieldLabel>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[11px] font-[620] text-[var(--text-primary)]">
          Как указаны цены
        </legend>
        <VatModeOption
          label="НДС включён в цены"
          description="Итоговая цена уже содержит налог."
          checked={included}
          onChange={() => onModeChange('included')}
        />
        <VatModeOption
          label="НДС начисляется сверху"
          description="Налог добавляется к стоимости товара."
          checked={excluded}
          onChange={() => onModeChange('excluded')}
        />
        {!included && !excluded ? (
          <p className="rounded-[10px] bg-[#FFF8DC] px-3 py-2 text-[10px] leading-4 text-[#6F5610]">
            Сейчас используется индивидуальная схема. Изменить её можно в
            расширенных настройках.
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}

function VatModeOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5 transition ${
        checked
          ? 'border-[var(--brand-yellow)] bg-[#FFFBEB]'
          : 'border-[var(--border-color)] hover:border-[#AEB9C8]'
      }`}
    >
      <input
        aria-label={label}
        type="radio"
        name="vat-price-mode"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-5 shrink-0 accent-[var(--brand-yellow)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-[620]">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-secondary)]">
          {description}
        </span>
      </span>
    </label>
  );
}

function AdvancedSettings({
  form,
  updateField,
}: {
  form: OneCSettingsValue;
  updateField: (key: OneCSettingsKey, value: string) => void;
}) {
  return (
    <details
      data-testid="onec-advanced-settings"
      className="group overflow-hidden rounded-[16px] border border-[var(--border-color)] bg-white"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition hover:bg-[#F8FAFD] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[rgba(255,196,0,0.28)] [&::-webkit-details-marker]:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F3F5F8] text-[var(--brand-dark)]">
          <Settings2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-[650]">
            Расширенные настройки
          </span>
          <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-secondary)]">
            Технические ключи 1С. Меняйте их только при настройке обмена.
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="grid gap-4 border-t border-[var(--border-color)] px-4 py-5 md:grid-cols-2">
        {ADVANCED_FIELDS.map((field) => (
          <FieldLabel
            key={field.key}
            label={field.label}
            description={field.description}
          >
            <input
              aria-label={field.label}
              type="text"
              value={form[field.key]}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => updateField(field.key, event.target.value)}
              className={INPUT_CLASS}
            />
          </FieldLabel>
        ))}

        <fieldset className="grid gap-3 rounded-[12px] bg-[#F8FAFD] p-4 md:col-span-2">
          <legend className="px-1 text-[11px] font-[650]">
            Индивидуальная схема НДС
          </legend>
          <p className="text-[10px] leading-4 text-[var(--text-secondary)]">
            Эти флаги нужны только для нестандартной конфигурации 1С.
          </p>
          <AdvancedToggle
            label="НДС включать в стоимость"
            checked={form.vat_included === '1'}
            onChange={(checked) =>
              updateField('vat_included', checked ? '1' : '0')
            }
          />
          <AdvancedToggle
            label="Сумма документа включает НДС"
            checked={form.sum_includes_vat === '1'}
            onChange={(checked) =>
              updateField('sum_includes_vat', checked ? '1' : '0')
            }
          />
        </fieldset>
      </div>
    </details>
  );
}

function AdvancedToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-[var(--brand-yellow)]"
      />
      <span className="text-[12px] font-[620]">{label}</span>
    </label>
  );
}

function FieldLabel({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-[620] text-[var(--text-primary)]">
        {label}
      </span>
      {children}
      {description ? (
        <span className="text-[10px] leading-4 text-[var(--text-secondary)]">
          {description}
        </span>
      ) : null}
    </label>
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
