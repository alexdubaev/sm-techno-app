# Разведка Android/mobile intake на 0c20786

Read-only code-scout map проверен: pre/scout/post HEAD0c20786d94600988363e6db4e3298b2c0908021c, fingerprint7101670981ee2bd70b92744214bdac947547e165c994cb19d20bc69db935f01e. Fingerprint через WSL тем же неизменённым скриптом и реальным Gitdir: Windows selectors не работают с pipe; проверки не ослаблялись. Terra6.1 по ранее выбранной владельцем модели вместо старого имени5.6 в навыке.

- app/stock/page.tsx → components/stock-page.tsx:1133 → StockValuationPanel (существующая сворачиваемая расценка), rootapp alias сохраняется.
- StockValuationPanel сам держит rows/results в памяти, abort/generation, file/drop, review, оба Excel. При смене источника требуется очищать старые строки/выгрузки, не показывать прежний результат как новый.
- lib/stock-valuation-api.ts: intakeValuation(File,AbortSignal) multipart и resolveValuation(rows,AbortSignal) существующие API. Вставленный текст можно отправить как UTF8 File.txt; новые backend API не нужны.
- stock_sync_web/stock_valuation.py:185+ extract_valuation_upload проверяет FORMATS, max_bytes, temporaryworkspace/semaphore, extraction schema и закрывает файл. UploadLimits.max_bytes=25MiB; existingJSONrows/extraction policy сохраняются.
- AuthProvider до проверки/входа не рендерит children; useAuth предоставляет user/isAdmin/logout/refreshUser. lib/storage хранит existing bearer session, lib/api добавляет Authorization. Нельзя менять формат/права/хуки на сервере; observer для privatehandoff обсуждается в protected plan.
- app/layout.tsx оборачивает children в AuthProvider. manifest.ts standalone, icons256/512, start_url '/', share_target отсутствует. Существующих service workers/CacheStorage обработчиков в app/components/lib/public не обнаружено.
- tests: stock-valuation.integration.test.tsx, e2e/stock-valuation.spec.ts (реальный File→review→2actualXLSX→reloadnohistory), auth-provider integration и backendvaluation/authdevice tests.
- Ready Python3.10 C:/Users/Alexandr/.codex/worktrees/f3c0/sm-techno-app/.venv/Scripts/python.exe; ready node_modules D:/codex/sm-techno-app/sm-techno-web/node_modules, копировать в ownedworktree без внешних junction. E2E только existing npmallowlist13000/18000/syntheticenv.

Первичные docs: Chrome Web Share Target (developer.chrome.com/docs/capabilities/web-apis/web-share-target); MDN ServiceWorkerGlobalScope (state disappears on restart) и ExtendableEvent.waitUntil; Next.js официальные PWA/manifest docs получены Context7. Новый worker будет scoped только /stock-share/, без offline/auth/API cache. Постоянно сохранять сами полученные файлы не планируется.

UX guidance ui-ux-pro-max: mobile file-upload query дал нерелевантный результат и не использован; уточнённый file upload error recovery → конкретные recovery actions, role=alert, error рядом с источником. Сохраняем существующие цвета/навигацию, touch targets не менее44px, итоговые сообщения рядом с действием.
