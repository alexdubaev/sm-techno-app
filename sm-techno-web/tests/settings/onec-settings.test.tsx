import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OneCSettings,
  type OneCSettingsValue,
} from '../../components/settings/onec/onec-settings';
import type { Organization } from '../../lib/types';

const SETTINGS: OneCSettingsValue = {
  base_url: 'https://onec.example.test/odata/standard.odata',
  default_organization_key: 'organization-key',
  sale_operation: 'ЗаказНаПродажу',
  currency_key: 'currency-key',
  order_type_key: 'order-type-key',
  order_type_type: 'StandardODATA.Catalog_ВидыЗаказовКлиентов',
  price_type_key: 'price-type-key',
  order_state_key: 'order-state-key',
  order_state_type: 'StandardODATA.Catalog_СостоянияЗаказовКлиентов',
  sale_unit_key: 'sale-unit-key',
  reserve_unit_key: 'reserve-unit-key',
  business_operation_key: 'business-operation-key',
  vat_rate_key: 'vat-rate-key',
  vat_percent: '22',
  vat_included: '1',
  sum_includes_vat: '1',
  unit_type: 'StandardODATA.Catalog_УпаковкиЕдиницыИзмерения',
};

const ORGANIZATIONS: Organization[] = [
  {
    id: 1,
    onecKey: 'organization-key',
    name: 'СМ Техно',
    inn: '7800000000',
    kpp: '780001001',
  },
  {
    id: 2,
    onecKey: 'new-organization-key',
    name: 'СМ Техно Москва',
    inn: '7700000000',
    kpp: '770001001',
  },
];

const ESSENTIAL_SECTION_TITLES = ['Подключение', 'Документы', 'НДС'];

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function setMobileViewport(isMobile: boolean) {
  const listeners = new Set<MediaQueryListener>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(
      (query: string): MediaQueryList =>
        ({
          matches: isMobile,
          media: query,
          onchange: null,
          addEventListener: (
            _type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            listeners.add(listener as MediaQueryListener);
          },
          removeEventListener: (
            _type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            listeners.delete(listener as MediaQueryListener);
          },
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    ),
  });
}

function setup() {
  const callbacks = {
    loadSettings: vi.fn().mockResolvedValue(SETTINGS),
    loadOrganizations: vi.fn().mockResolvedValue(ORGANIZATIONS),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
    testConnection: vi
      .fn()
      .mockResolvedValue({ counterparties: 12, organizations: 2 }),
  };

  render(<OneCSettings {...callbacks} />);
  return callbacks;
}

describe('OneCSettings', () => {
  beforeEach(() => {
    setMobileViewport(false);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'navigation');
    vi.restoreAllMocks();
  });

  it('keeps only essential settings visible and moves technical fields behind disclosure', async () => {
    const callbacks = setup();

    expect(
      await screen.findByRole('heading', { name: 'Интеграция с 1С' }),
    ).toBeInTheDocument();
    expect(callbacks.loadSettings).toHaveBeenCalledTimes(1);
    expect(callbacks.loadOrganizations).toHaveBeenCalledTimes(1);

    const desktop = screen.getByTestId('onec-desktop-sections');
    expect(within(desktop).getAllByTestId('settings-card')).toHaveLength(3);
    for (const title of ESSENTIAL_SECTION_TITLES) {
      expect(
        within(desktop).getByRole('heading', { name: title }),
      ).toBeInTheDocument();
    }

    expect(screen.getByLabelText('Организация по умолчанию')).toHaveValue(
      SETTINGS.default_organization_key,
    );
    expect(screen.getByLabelText('Организация по умолчанию')).toHaveTextContent(
      'СМ Техно',
    );
    expect(screen.getByLabelText('Ключ вида заказа')).not.toBeVisible();

    await userEvent.click(screen.getByText('Расширенные настройки'));
    expect(screen.getByLabelText('Ключ вида заказа')).toBeVisible();
  });

  it('renders three essential mobile accordions and keeps advanced fields separate', async () => {
    setMobileViewport(true);
    setup();
    await screen.findByRole('heading', { name: 'Интеграция с 1С' });

    const mobile = screen.getByTestId('onec-mobile-sections');
    const triggers = within(mobile).getAllByRole('button', { expanded: false });
    expect(triggers).toHaveLength(3);
    for (const [index, title] of ESSENTIAL_SECTION_TITLES.entries()) {
      expect(triggers[index]).toHaveAccessibleName(title);
      expect(triggers[index]).toHaveClass('min-h-20');
    }

    await userEvent.click(
      within(mobile).getByRole('button', { name: 'Подключение' }),
    );
    expect(within(mobile).getByLabelText('URL базы 1С')).toHaveValue(
      SETTINGS.base_url,
    );
    expect(screen.getByText('Расширенные настройки')).toBeInTheDocument();
  });

  it('tests the connection without saving or clearing edited values', async () => {
    const callbacks = setup();
    const baseUrl = await screen.findByLabelText('URL базы 1С');
    await userEvent.clear(baseUrl);
    await userEvent.type(baseUrl, 'https://changed.example.test/odata');

    await userEvent.click(
      screen.getByRole('button', { name: 'Проверить подключение' }),
    );

    await waitFor(() =>
      expect(callbacks.testConnection).toHaveBeenCalledTimes(1),
    );
    expect(callbacks.testConnection).toHaveBeenCalledWith();
    expect(callbacks.saveSettings).not.toHaveBeenCalled();
    expect(baseUrl).toHaveValue('https://changed.example.test/odata');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Доступ к 1С подтверждён',
    );
  });

  it('saves only the supported global settings through the exact CTA', async () => {
    const callbacks = setup();
    const organization = await screen.findByLabelText(
      'Организация по умолчанию',
    );
    await userEvent.selectOptions(organization, 'new-organization-key');

    await userEvent.click(
      screen.getByRole('button', { name: 'Сохранить настройки 1С' }),
    );

    await waitFor(() =>
      expect(callbacks.saveSettings).toHaveBeenCalledTimes(1),
    );
    expect(callbacks.saveSettings).toHaveBeenCalledWith({
      ...SETTINGS,
      default_organization_key: 'new-organization-key',
    });
  });

  it('presents a single price mode and updates both 1C VAT flags together', async () => {
    const callbacks = setup();
    await screen.findByLabelText('Ставка НДС, %');

    expect(
      screen.getByRole('radio', { name: 'НДС включён в цены' }),
    ).toBeChecked();

    await userEvent.click(
      screen.getByRole('radio', { name: 'НДС начисляется сверху' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Сохранить настройки 1С' }),
    );

    await waitFor(() =>
      expect(callbacks.saveSettings).toHaveBeenCalledTimes(1),
    );
    expect(callbacks.saveSettings).toHaveBeenCalledWith({
      ...SETTINGS,
      vat_included: '0',
      sum_includes_vat: '0',
    });
  });

  it('keeps the mobile save action sticky', async () => {
    setMobileViewport(true);
    setup();
    await screen.findByRole('heading', { name: 'Интеграция с 1С' });

    const saveButton = screen.getByRole('button', {
      name: 'Сохранить настройки 1С',
    });
    expect(saveButton.parentElement).toHaveClass('sticky');
    expect(saveButton).toHaveClass('min-h-12');
  });

  it('returns to the current history entry when dirty browser Back is cancelled', async () => {
    const restoreHistory = vi
      .spyOn(window.history, 'forward')
      .mockImplementation(() => undefined);
    const routerListener = vi.fn();
    window.addEventListener('popstate', routerListener);

    try {
      setup();
      const baseUrl = await screen.findByLabelText('URL базы 1С');
      await userEvent.type(baseUrl, '/changed');

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(restoreHistory).toHaveBeenCalledTimes(1);
      expect(routerListener).not.toHaveBeenCalled();

      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(restoreHistory).toHaveBeenCalledTimes(1);
      expect(routerListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('popstate', routerListener);
    }
  });

  it('cancels Navigation API traversal before it discards dirty settings', async () => {
    const navigation = new EventTarget();
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: navigation,
    });
    setup();
    const baseUrl = await screen.findByLabelText('URL базы 1С');
    await userEvent.type(baseUrl, '/changed');

    const navigateEvent = new Event('navigate', { cancelable: true });
    navigation.dispatchEvent(navigateEvent);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(navigateEvent.defaultPrevented).toBe(true);
  });

  it('intercepts in-app navigation and unload while the form is dirty', async () => {
    setup();
    const baseUrl = await screen.findByLabelText('URL базы 1С');
    await userEvent.type(baseUrl, '/changed');

    fireEvent.click(screen.getByRole('link', { name: 'Назад к настройкам' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);
  });
});
