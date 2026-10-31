# Границы и проверки

Repo D:/codex-deepseek-provider-20261031, чистая ветка codex/deepseek-document-provider от origin/main 1d7dd9be7f733e6af37ede3c58a8ae0f488cb8fc. Чужие worktrees не менять. Ветка server-document-runtime и PR13 не интегрированы; этот обработчик должен работать независимо и позже сочетаться с их конвертером. Общие текущие классы ExtractionRequest/ExtractionResult/ExtractionError, extraction_schema и validate_payload сохраняются. Один выбор extractor у двух потребителей, никакой новой бизнес-схемы/route.

Базовое окружение Python D:/codex/sm-techno-app/.venv/Scripts/python.exe переиспользовать, не переустанавливать зависимости. Запуск из корня новой копии: `D:/codex/sm-techno-app/.venv/Scripts/python.exe -m pytest tests/document_assistant tests/stock_valuation -q --strict-markers`. tests/conftest.py создаёт изолированные DB/storage/ключ. Известный Windows SQLite open-handle teardown в stock tests: расследовать и использовать изолированный Linux/Docker check если воспроизведётся; не объявлять syntax-only PASS. Никогда не передавать рабочую .env/1С в проверки.

Worker может читать другие файлы для контекста; менять только зону T01. Root ведёт .autopilot и Git. Ключи пустые, никаких запросов к реальному API. Время начала инструментального наблюдения: 2026-10-31T17:35:01Z; точный request arrival раньше не измерен.
