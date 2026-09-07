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

const SECTION_TITLES = [
  'Подключение',
  'Заказы и документы',
  'Структура и единицы',
  'НДС',
];

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
    vi.restoreAllMocks();
  });

  it('renders the four named desktop cards after loading settings', async () => {
    const callbacks = setup();

    expect(
      await screen.findByRole('heading', { name: 'Интеграция с 1С' }),
    ).toBeInTheDocument();
    expect(callbacks.loadSettings).toHaveBeenCalledTimes(1);

    const desktop = screen.getByTestId('onec-desktop-sections');
    expect(within(desktop).getAllByTestId('settings-card')).toHaveLength(4);
    for (const title of SECTION_TITLES) {
      expect(
        within(desktop).getByRole('heading', { name: title }),
      ).toBeInTheDocument();
    }
  });

  it('renders four large mobile accordions and exposes their fields on demand', async () => {
    setMobileViewport(true);
    setup();
    await screen.findByRole('heading', { name: 'Интеграция с 1С' });

    const mobile = screen.getByTestId('onec-mobile-sections');
    const triggers = within(mobile).getAllByRole('button', { expanded: false });
    expect(triggers).toHaveLength(4);
    for (const [index, title] of SECTION_TITLES.entries()) {
      expect(triggers[index]).toHaveAccessibleName(title);
      expect(triggers[index]).toHaveClass('min-h-20');
    }

    await userEvent.click(
      within(mobile).getByRole('button', { name: 'Подключение' }),
    );
    expect(within(mobile).getByLabelText('URL базы 1С')).toHaveValue(
      SETTINGS.base_url,
    );
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
      'Подключение к 1С работает',
    );
  });

  it('saves only the supported global settings through the exact CTA', async () => {
    const callbacks = setup();
    const organization = await screen.findByLabelText(
      'Организация по умолчанию',
    );
    await userEvent.clear(organization);
    await userEvent.type(organization, 'new-organization-key');

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

  it('intercepts in-app navigation, browser back, and unload while the form is dirty', async () => {
    setup();
    const baseUrl = await screen.findByLabelText('URL базы 1С');
    await userEvent.type(baseUrl, '/changed');

    fireEvent.click(screen.getByRole('link', { name: 'Назад к настройкам' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(window.confirm).toHaveBeenCalledTimes(2);

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);
  });
});
