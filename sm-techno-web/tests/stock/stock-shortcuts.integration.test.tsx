// @vitest-environment-options {"url":"https://stock.example"}
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { StockShortcutsPanel } from '@/components/stock/stock-shortcuts-panel';
import * as api from '@/lib/stock-shortcuts-api';
vi.mock('@/lib/stock-shortcuts-api', () => ({listShortcutDevices: vi.fn(), createShortcutDevice: vi.fn(), revokeShortcutDevice: vi.fn()}));
it('creates a personal code, hides it on close and revokes a listed device', async () => {
  const device = { id: 1, label: 'iPhone', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, idleExpiresAt: '2027-01-01T00:00:00Z', absoluteExpiresAt: '2027-01-01T00:00:00Z', revokedAt: null };
  vi.mocked(api.listShortcutDevices).mockResolvedValue({devices: [device]});
  vi.mocked(api.createShortcutDevice).mockResolvedValue({device, credential: 'a'.repeat(43)});
  vi.mocked(api.revokeShortcutDevice).mockResolvedValue({ok: true});
  render(<StockShortcutsPanel />);
  fireEvent.click(screen.getByRole('button', {name: 'Команды iPhone'}));
  fireEvent.click(await screen.findByRole('button', {name: 'Создать подключение'}));
  expect(await screen.findByLabelText('Настройка для iPhone')).toBeVisible();
  const setup = (screen.getByLabelText('Настройка для iPhone') as HTMLInputElement).value;
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  fireEvent.click(screen.getByRole('button', {name: 'Скопировать настройку'}));
  expect(writeText).toHaveBeenCalledWith(setup);
  expect(JSON.parse(atob(setup.slice('SMTECHNO1.'.length)))).toEqual({baseUrl: 'https://stock.example', credential: 'a'.repeat(43)});
  expect(screen.getByRole('link', {name: 'Установить команду на iPhone'})).toHaveAttribute('href', '/shortcuts/sm-techno-stock.shortcut');
  fireEvent.click(screen.getByRole('button', {name: 'Закрыть'}));
  expect(screen.queryByDisplayValue(setup)).toBeNull();
  expect(screen.queryByDisplayValue('a'.repeat(43))).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Команды iPhone'}));
  fireEvent.click(await screen.findByRole('button', {name: 'Отозвать iPhone'}));
  await waitFor(() => expect(api.revokeShortcutDevice).toHaveBeenCalledWith(1));
});
it('discards a late code after closing while keeping the created device revocable', async () => {
  const device = { id: 2, label: 'iPhone', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, idleExpiresAt: '2027-01-01T00:00:00Z', absoluteExpiresAt: '2027-01-01T00:00:00Z', revokedAt: null };
  let complete!: (value: {device: typeof device; credential: string}) => void;
  vi.mocked(api.listShortcutDevices).mockResolvedValue({devices: [device]});
  vi.mocked(api.createShortcutDevice).mockReturnValue(new Promise(resolve => { complete = resolve; }));
  vi.mocked(api.revokeShortcutDevice).mockResolvedValue({ok: true});
  render(<StockShortcutsPanel />);
  fireEvent.click(screen.getByRole('button', {name: 'Команды iPhone'}));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Создать подключение'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Создать подключение'}));
  fireEvent.click(screen.getByRole('button', {name: 'Закрыть'}));
  fireEvent.click(screen.getByRole('button', {name: 'Команды iPhone'}));
  await act(async () => { complete({device, credential: 'b'.repeat(43)}); });
  expect(screen.queryByDisplayValue('b'.repeat(43))).toBeNull();
  const revoke = await screen.findByRole('button', {name: 'Отозвать iPhone'});
  await waitFor(() => expect(revoke).toBeEnabled());
  fireEvent.click(revoke);
  await waitFor(() => expect(api.revokeShortcutDevice).toHaveBeenCalledWith(2));
});

