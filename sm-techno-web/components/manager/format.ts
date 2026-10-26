export const money = (kopecks: number | null) =>
  kopecks === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: kopecks % 100 ? 2 : 0,
      }).format(kopecks / 100);
export const percent = (basisPoints: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(basisPoints / 100)}%`;
export const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU');
export const timestamp = (value: string) =>
  new Date(value).toLocaleString('ru-RU');
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие.';
export function minorUnits(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error(
      'Введите неотрицательное число, не более двух знаков после запятой.',
    );
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 1e12)
    throw new Error('Сумма превышает допустимый размер.');
  return result;
}
export function shiftMonth(month: string, delta: number) {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
