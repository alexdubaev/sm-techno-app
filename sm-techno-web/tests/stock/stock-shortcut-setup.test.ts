import { describe, expect, it } from 'vitest';
import { encodeStockShortcutSetup, STOCK_SHORTCUT_INSTALLER_AVAILABLE, STOCK_SHORTCUT_INSTALLER_PATH } from '@/lib/stock-shortcut-setup';

describe('iPhone setup', () => {
  it('round trips exactly the origin and credential', () => {
    const value = encodeStockShortcutSetup('https://stock.example:8443', 'A_-'.repeat(14) + 'Z');
    expect(value.startsWith('SMTECHNO1.')).toBe(true);
    expect(JSON.parse(atob(value.slice(10)))).toEqual({baseUrl: 'https://stock.example:8443', credential: 'A_-'.repeat(14) + 'Z'});
  });
  it.each(['http://stock.example', 'https://[::1]', 'https://[2001:db8::1]:8443', 'https://user:pass@stock.example', 'https://stock.example/path', 'https://stock.example?x=1', 'https://stock.example#x', 'invalid'])('rejects unsafe origin %s', origin => {
    expect(() => encodeStockShortcutSetup(origin, 'a'.repeat(43))).toThrow();
  });
  it.each(['short', 'a'.repeat(42) + '+', 'a'.repeat(44)])('rejects invalid credential', credential => {
    expect(() => encodeStockShortcutSetup('https://stock.example', credential)).toThrow();
  });
  it('exposes the signed installer at the fixed download path', () => {
    expect(STOCK_SHORTCUT_INSTALLER_PATH).toBe('/shortcuts/sm-techno-stock.shortcut');
    expect(STOCK_SHORTCUT_INSTALLER_AVAILABLE).toBe(true);
  });
});
