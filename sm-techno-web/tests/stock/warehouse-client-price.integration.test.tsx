import { useState } from 'react';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { WarehouseClientPriceToggle } from '@/components/stock/warehouse-client-price-toggle';
import { saveAuthSessionToStorage } from '@/lib/storage';
import type { Warehouse } from '@/lib/types';
import { server } from '@/tests/auth/server';

const warehouse: Warehouse = { id: 2, name: 'Внутренний склад', externalCode: '', isActive: true, createdAt: '', updatedAt: '' };

function View({ included = true }: { included?: boolean }) {
  const [value, setValue] = useState<Warehouse>({ ...warehouse, includeInClientPrice: included });
  const [busy, setBusy] = useState(false);
  return <WarehouseClientPriceToggle warehouse={value} disabled={busy} onBusyChange={setBusy} onSaved={setValue} />;
}

function session() {
  saveAuthSessionToStorage({ token: 'synthetic-admin-token', user: {
    id: 1, username: 'admin', role: 'admin', fullName: 'Admin', onecUsername: '', hasOnecPassword: false,
    hasRecoverableAppPassword: false, isActive: true, createdAt: '', updatedAt: '',
  } });
}

test('waits for persisted state and prevents repeated changes while saving', async () => {
  session();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const bodies: unknown[] = [];
  server.use(http.patch('/api/warehouses/2/client-price', async ({ request }) => {
    bodies.push(await request.json());
    await pending;
    return HttpResponse.json({ warehouse: { ...warehouse, includeInClientPrice: false } });
  }));
  render(<View />);
  const checkbox = screen.getByRole('checkbox', { name: 'Включать в клиентский прайс: Внутренний склад' });
  await userEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toHaveAttribute('aria-disabled', 'true'));
  expect(checkbox).toBeChecked();
  expect(screen.getByRole('status')).toHaveTextContent('Сохраняется');
  await userEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  expect(bodies).toHaveLength(1);
  finish();
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(checkbox).toHaveAttribute('aria-disabled', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('Исключён из клиентского прайса');
  expect(bodies).toEqual([{ includeInClientPrice: false }]);
});

test('announces save failure, keeps the old value and allows retry', async () => {
  session();
  server.use(http.patch('/api/warehouses/2/client-price', () => HttpResponse.json({ detail: 'Не удалось сохранить настройку склада.' }, { status: 500 })));
  render(<View included={false} />);
  const checkbox = screen.getByRole('checkbox', { name: 'Включать в клиентский прайс: Внутренний склад' });
  expect(checkbox).not.toBeChecked();
  await userEvent.click(checkbox);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить настройку склада');
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toHaveAttribute('aria-disabled', 'false');
  server.use(http.patch('/api/warehouses/2/client-price', () => HttpResponse.json({ warehouse: { ...warehouse, includeInClientPrice: true } })));
  await userEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Включён в клиентский прайс');
});
