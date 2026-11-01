# T01 — Подключаемый DeepSeek

**Требования:** R01, R02, R03, R04
**Модель:** сильная (по указанию пользователя gpt-6.1-terra).
**Ревью:** да — новый внешний получатель документов и API-ключ.
**Волна:** 1
**Зависит от:** нет
**Зона:** `stock_sync_web/assistant_extraction.py`; `stock_sync_web/assistant_service.py`; `stock_sync_web/stock_valuation.py`; `stock_sync_web/assistant_deepseek.py`; `tests/document_assistant/`; `tests/stock_valuation/`; `tests/support/isolated_environment.py`; `.env.example`; `docs/deepseek-document-provider.md`.

Цитаты: «подготовь пока базу под DeepSeek», «ключи я дам позже».

Прочитать interfaces.md, notes.md, spec.md (все четыре коротких раздела) и инструкции executor.md. Реализовать всю спецификацию в зоне; тесты с настоящим локальным HTTP stub и синтетическими данными. До реализации доказать значимые новые границы красным тестом. Не менять окружение/деплой/старые worktrees. Не коммитить: root зафиксирует всю проверенную зону. Дать контракт результата STATUS/FILES/TESTS/REDPROOF/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS до25строк.
