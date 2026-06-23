# Desktop app for 1C UNF stock and orders

Это legacy desktop-приложение СМ ТЕХНО. Оно оставлено в репозитории как старый контур и запускается отдельно через `desktop_stock_app.py`.

## Что умеет

- хранить локальные остатки в `SQLite`
- импортировать остатки из `Excel` и `CSV`
- генерировать Excel-шаблон для загрузки
- синхронизировать из `1С:УНФ`:
  - контрагентов
  - договоры контрагентов
  - организации
  - номенклатуру
- собирать локальный заказ и отправлять его в `1С` как `Document_ЗаказПокупателя`
- после успешной отправки списывать локальные остатки

## Запуск

```powershell
cd D:\codex\SEO_Gen
.\.venv\Scripts\python.exe desktop_stock_app.py
```

## Что нужно опубликовать в 1С

Через OData должны быть доступны:
- `Catalog_Контрагенты`
- `Catalog_ДоговорыКонтрагентов`
- `Catalog_Организации`
- `Catalog_Номенклатура`
- `Document_ЗаказПокупателя`

## Какие поля заполняются в настройках приложения

- `URL базы 1С`
- `Логин OData`
- `Пароль OData`
- GUID-поля, участвующие в создании `ЗаказаПокупателя`

Обычно часть GUID берется из существующего заказа в 1С через OData.

## Основные файлы legacy-контура

- `desktop_stock_app.py` — точка входа
- `stock_sync_desktop/database.py` — SQLite и транзакции
- `stock_sync_desktop/onec_api.py` — клиент OData
- `stock_sync_desktop/excel_tools.py` — импорт/экспорт Excel
- `stock_sync_desktop/service.py` — бизнес-логика
- `stock_sync_desktop/ui.py` — интерфейс Tkinter
