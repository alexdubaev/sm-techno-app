/** Public, signed template; personal setup is provided separately. */
export const STOCK_SHORTCUT_INSTALLER_PATH = '/shortcuts/download';
export const STOCK_SHORTCUT_INSTALLER_AVAILABLE: boolean = true;

export function encodeStockShortcutSetup(origin: string, credential: string): string {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error('Для настройки откройте приложение по защищённому HTTPS-адресу.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin || !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?$/.test(origin) || !/^[A-Za-z0-9_-]{43}$/.test(credential)) {
    throw new Error('Не удалось подготовить настройку. Проверьте защищённый адрес приложения и создайте новое подключение.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ baseUrl: origin, credential }));
  return 'SMTECHNO1.' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}
