import { requestJsonWithInit } from '@/lib/api';
export type ShortcutDevice = { id: number; label: string; createdAt: string; lastUsedAt: string | null; idleExpiresAt: string; absoluteExpiresAt: string; revokedAt: string | null };
export const listShortcutDevices = () => requestJsonWithInit<{devices: ShortcutDevice[]}>('/api/stock/shortcut-devices', {}, 'Не удалось загрузить подключения.');
export const createShortcutDevice = (label: string) => requestJsonWithInit<{device: ShortcutDevice; credential: string}>('/api/stock/shortcut-devices', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label})}, 'Не удалось создать подключение.');
export const revokeShortcutDevice = (id: number) => requestJsonWithInit<{ok: boolean}>(`/api/stock/shortcut-devices/${id}`, {method: 'DELETE'}, 'Не удалось отозвать подключение.');
