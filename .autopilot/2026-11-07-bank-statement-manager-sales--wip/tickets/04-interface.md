# 04 — Импорт и поступления в CRM

**Требования:** R04, R06, R08, R10, R12, R16, R23, R24, R25, R26, R27, R28, R30, R33, R34, R46, R47, R49, R52, R53, R54, R58, R59, R61, R62, R65, R71, R72, R74, R78, R81, R82, R84, R85, R87, R89, R90, R91, R92, R93, R94, R98, R101
**Зависит от:** —
**Зона:** `sm-techno-web/components/manager` · `sm-techno-web/components/crm` · `sm-techno-web/components/crm-workspace.tsx` · `sm-techno-web/lib/api.ts` · `sm-techno-web/lib/manager-types.ts` · `sm-techno-web/lib/bank-types.ts` · `sm-techno-web/tests/settings/bank.test.tsx`
**Волна:** 1
**Ревью:** нет — единое независимое ревью
**Модель:** сильная

## Что должно заработать
Администратор открывает общий импорт из продаж, подтверждает счет организации, загружает один XLSX, исправляет и выбирает строки, видит эффект и подтверждает. В обеих CRM карточках назначает менеджера с датой/причиной, видит историю/ожидающие и поступления. Менеджер видит только разрешённые данные. UI соответствует существующему дизайну.

## Из брифа, дословно
> «Оплаты клиента засчитываются этому сотруднику»
> «Добавить N оплат на … ₽ с НДС»
> «На мобильном: без огромной таблицы с обязательным горизонтальным скроллом»

## Разделы спецификации
Все интерфейсы, мобильная версия, roles; interfaces.md секция 7 и фактический API T03.

## Критерии приёмки
- [ ] Глобальный админ импорт/история/private download/account config не привязаны к выбранному менеджеру.
- [ ] Metadata/totals/reconciliation, all statuses, cards/details, manual client/classification/duplicate/invoice actions with reasons and consequences, selected preview salary delta before confirm.
- [ ] Conflict refresh retains persisted work, commit idempotency key stable for retries; cache invalidation manager/CRM panels after success.
- [ ] Shared desktop/mobile sales assignment + history/payment panel, mandatory date defaults calendar today, active manager account ID picker.
- [ ] Existing source label bank_statement, manager graphs/search/pagination/formulas preserved; no unrelated CRM changes.
- [ ] Meaningful component test first RED then GREEN; lint/tsc narrow checks.
