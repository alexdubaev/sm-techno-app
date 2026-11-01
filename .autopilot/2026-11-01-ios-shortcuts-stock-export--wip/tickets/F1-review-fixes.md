# F1 — Исправления независимого ревью
**Требования:** R02, R05, R07
**Зависит от:** —
**Зона:** `stock_sync_web/stock_valuation.py` · `tests/stock_valuation/test_valuation.py` · `sm-techno-web/components/stock/stock-shortcuts-panel.tsx` · `sm-techno-web/tests/stock/stock-shortcuts.integration.test.tsx`
**Волна:** 3
**Ревью:** да — узкая проверка закрытия подтверждённых условий, не повторный whole review
**Модель:** сильная — userTerra6.1

Read interfaces.md first; review requirements below, approved spec/protectedplan unchanged. No deps/API/schema/auth refactor; no nested agents/commits/deploy. Executor instructions C:/Users/Alexandr/.codex/skills/autopilot/prompts/executor.md.

## Подтверждённые условия из единственного независимого ревью, verbatim
- Spec · stock_sync_web/stock_valuation.py:240 — строки Excel по шаблону КП всегда получают brand=None, хотя категория доступна в DB snapshot и используется существующим процессом КП как бренд. Заполнить ячейку из доверенных данных и проверить непустое значение, включая формулоподобный текст.
- Spec/security · sm-techno-web/components/stock/stock-shortcuts-panel.tsx:14 — если закрыть панель до ответа создания, поздний ответ снова сохраняет код и показывает его при следующем открытии, вопреки указанному в интерфейсе условию. Не показывать ответ после закрытия; проверить отложенный ответ и доступность отзыва созданного устройства.

Meaningful RED then narrow regression only. Backend exact existing export testcase; frontend stock-shortcuts integration. Types/lint only if necessary touchedTS errors. No finalbuild/browser until final integration. Ready Python/interfaces containspaths. Return <=25lines contract evidence, no diffs.
