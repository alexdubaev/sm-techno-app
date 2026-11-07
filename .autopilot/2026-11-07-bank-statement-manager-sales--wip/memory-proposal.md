# Предложение для памяти проекта (AGENTS.md не изменён)

- Банковский импорт: эксплуатационные правила и точные таблицы — `docs/domains/bank-statement-import.md`; архитектурное решение — `docs/adr/0004-bank-payments-in-manager-ledger.md`.
- Source `bank_statement` и любая bank_sale_links-связь запрещают обычное редактирование финансовой идентичности продажи; штатная отмена остаётся доступна. Legacy link сохраняет source, rate, updated_at и все поля старой продажи.
- `crm_sales_assignments` — отдельная датированная связь с manager_accounts.id; workOwners/личные вкладки/CRM owner не являются закреплением продаж.
- Оригиналы банковских файлов приватны, только admin; `vps_integrity` проверяет ссылки/размер/SHA, при записи сохраняется storage_operation_lock.
- Windows Python3.10.11 не поддерживает legacy tar filter test; общий backend-набор содержит Linux-only converter tests. Полный Linux-прогон требует Git-историю (миграционный baseline), frontend npm dependencies для Vitest runtime test и системную базу MIME types. Не ослаблять тесты.
- Turbopack не собирает worktree с node_modules junction вне root: зависимости должны быть доступны внутри build root; cache можно переиспользовать.
