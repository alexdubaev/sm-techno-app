# Точечная карта

- assistant_extraction.py: CodexDocumentExtractor.extract/parse_events/arguments и DocumentSourceReader; локальная shape/semantic валидация уже есть.
- assistant_service.py: DocumentAssistantService.__init__ сейчас прямо создаёт CodexDocumentExtractor.
- stock_valuation.py: временный intake создаёт CodexDocumentExtractor с temp_root; tests/stock_valuation патчат существующий symbol.
- tests/document_assistant/test_extraction.py и остальные integration suites; старые fixtures патчат CodexDocumentExtractor.extract, сохранить режим default codex.
- docker-compose.yml backend env_file .env уже существует, нет необходимости переделывать Compose.
- Публичный ключ/endpoint ответ API не писать в browser logs или настройки. Provider request только официальный api.deepseek.com с проверенным TLS.
