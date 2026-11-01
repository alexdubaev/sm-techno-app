/** The signed artifact must be added and audited before enabling its download. */
export const STOCK_SHORTCUT_INSTALLER_PATH = '/shortcuts/sm-techno-stock.shortcut';
export const STOCK_SHORTCUT_INSTALLER_AVAILABLE: boolean = false;

export function encodeStockShortcutSetup(origin: string, credential: string): string {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error('Для настройки откройте приложение по защищённому HTTPS-адресу.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin || !/^[A-Za-z0-9_-]{43}$/.test(credential)) {
    throw new Error('Не удалось подготовить настройку. Проверьте защищённый адрес приложения и создайте новое подключение.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ baseUrl: origin, credential }));
  return 'SMTECHNO1.' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}
