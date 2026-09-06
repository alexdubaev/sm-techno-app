import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { AuthProvider } from '@/components/auth-provider';
import { StockPage } from '@/components/stock-page';
import { saveAuthSessionToStorage } from '@/lib/storage';
import type { AppUser, SystemSettings } from '@/lib/types';
import { server } from '@/tests/auth/server';

const user: AppUser = {
  id: 1,
  username: 'operator',
  role: 'user',
  fullName: 'Оператор',
  onecUsername: '',
  hasOnecPassword: false,
  isActive: true,
  createdAt: '2026-09-06T10:00:00Z',
  updatedAt: '2026-09-06T10:00:00Z',
};

const settings: SystemSettings = {
  base_url: '',
  username: '',
  password: '',
  default_organization_key: '',
  sale_operation: 'ЗаказНаПродажу',
  currency_key: '',
  order_type_key: '',
  order_type_type: '',
  price_type_key: '',
  order_state_key: '',
  order_state_type: '',
  sale_unit_key: '',
  reserve_unit_key: '',
  business_operation_key: '',
  vat_rate_key: '',
  vat_percent: '22',
  vat_included: '1',
  sum_includes_vat: '1',
  unit_type: '',
};

describe('mobile stock filters', () => {
  test('applies warehouse, date order and in-stock controls without leaving the mobile filter row', async () => {
    const catalogQueries: URLSearchParams[] = [];
    saveAuthSessionToStorage({ token: 'operator-token', user });
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ user })),
      http.get('/api/crm/reminders/due', () =>
        HttpResponse.json({ items: [] }),
      ),
      http.get('/api/meta', () =>
        HttpResponse.json({
          appTitle: 'СМ Техно',
          priceLoaded: true,
          catalogCount: 0,
        }),
      ),
      http.get('/api/settings/system', () => HttpResponse.json(settings)),
      http.get('/api/warehouses', () =>
        HttpResponse.json({
          items: [
            {
              id: 2,
              name: 'Основной склад',
              externalCode: 'main',
              isActive: true,
              createdAt: '2026-09-06T10:00:00Z',
              updatedAt: '2026-09-06T10:00:00Z',
            },
          ],
        }),
      ),
      http.get('/api/stock/catalog', ({ request }) => {
        catalogQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          categories: [],
          groups: [],
          summary: {
            catalog_count: 0,
            filtered_count: 0,
            filtered_quantity: 0,
          },
        });
      }),
    );

    render(
      <AuthProvider>
        <StockPage />
      </AuthProvider>,
    );

    await screen.findAllByLabelText('Склад');
    await screen.findAllByRole('option', { name: 'Основной склад' });
    const warehouseSelect = screen.getAllByLabelText('Склад')[0];
    const sortSelect = screen.getAllByLabelText('Сортировка товаров')[0];
    const inStockCheckbox = screen.getAllByRole('checkbox', {
      name: 'Только в наличии',
    })[0];
    const events = userEvent.setup();

    await events.selectOptions(warehouseSelect, '2');
    await waitFor(() => {
      expect(
        catalogQueries.some((query) => query.get('warehouse_id') === '2'),
      ).toBe(true);
    });

    await events.selectOptions(sortSelect, 'oldest');
    await waitFor(() => {
      expect(
        catalogQueries.some(
          (query) =>
            query.get('warehouse_id') === '2' &&
            query.get('sort_order') === 'oldest',
        ),
      ).toBe(true);
    });

    await events.click(inStockCheckbox);
    await waitFor(() => {
      expect(
        catalogQueries.some(
          (query) =>
            query.get('warehouse_id') === '2' &&
            query.get('sort_order') === 'oldest' &&
            query.get('only_in_stock') === 'true',
        ),
      ).toBe(true);
    });
  });
});
