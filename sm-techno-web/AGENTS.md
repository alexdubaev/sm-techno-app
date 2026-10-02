# Frontend

Действуют ограничения [корневого AGENTS](../AGENTS.md). Единственная постоянная линия — main; новые задачи в отдельной codex-ветке от свежего origin/main, интеграция через PR. Не менять API/данные/1С без отдельного плана.

Из этого каталога: npm ci; npm run test:auth; npm run test:settings; node --test tests/*.test.mjs; npm run lint; npx tsc --noEmit --incremental false; npm run build; npm run test:auth:e2e. E2E только через изолированный launcher, без рабочих настроек и данных.

Lint: `npm run lint` показывает весь raw output (включая известные 29 react-compiler diagnostics, ожидаем exit 1); CI использует `npm run lint:ci` — строгий гейт к точному versioned baseline `lint-baseline/react-compiler.json` (новый/изменённый/пропавший diagnostic или любая другая lint-диагностика, включая warnings = FAIL).

Деплой отдельно по утверждённому SHA; не публиковать Sites автоматически после merge. Исторические docs/superpowers не входят в текущие инструкции. См. [контуры](../docs/deployment-source-of-truth.md).
