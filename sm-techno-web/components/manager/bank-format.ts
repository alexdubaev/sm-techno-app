import type { BankStatus } from '@/lib/bank-types';
export const bankStatusLabel: Record<BankStatus, string> = {
  ready: 'Готово',
  client_not_found: 'Клиент не найден',
  multiple_clients: 'Несколько совпадений',
  manager_missing: 'Менеджер не назначен',
  terms_missing: 'Нет условий месяца',
  possible_duplicate: 'Возможный дубль',
  accounted: 'Уже учтено',
  month_closed: 'Месяц закрыт',
  purpose_review: 'Требуется проверка назначения',
  excluded: 'Исключено',
  data_error: 'Ошибка данных',
  client_archived: 'Клиент в архиве',
  manager_inactive: 'Менеджер неактивен',
};
export function calendarToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}
