# Сервер подготовлен; рабочее переключение ещё не выполнено

## Продолжение2026-11-01 — DeepSeek

Владелец безопасно настроил ключ в server.env и сообщил DONE. После merge main4126fd9 в runtime ветку sourcee51f83f64e56c213f4ea402c6fd8bfeff40940a7 собран кандидат backend `sha256:02ed2e533b749d2d0ad36e2f341b0cf5bf561e5808d88ea58a4bc41ada1d6732` (tag sm-techno-candidate-backend:20261101-deepseek). Поддержка DeepSeek и broker автоматически совместились; конфликты только в Autopilot metadata и .env.example разрешены с сохранением обеих настроек. Frontend tree d2856c81bf8085a6f24c4071e423cea167ddf66a совпадает с ранее собранным frontend, повторная сборка неизменённого frontend до finalSHA не требуется.

Local combined extraction/provider/stock-route35PASS/12.06s. Linux на actual candidate: broker8 + extraction16 + provider18 =42PASS/14.27s. Использованы изолированные testDB/storage/synthetickey и собственный dependency target (pytest9.1.1/httpx2 2.12.0 из requirements-dev), без рабочей .env/1С; readonly source вызвал только cache warning. Первые диагностические попытки с CRLF через PowerShell→SSH и отсутствующим pytest не засчитаны как PASS; найден нормализующий remote pipeline `tr -d '\015' | bash -s`, затем выполнен настоящий зелёный набор.

Независимый actual canary на e51 candidate: три real DeepSeek extraction запроса (XLSX articles, PNG requisites, DOCX invoice) вернули provider_auth без модельного результата. Независимый GET official `/models` с тем же server-only key вернул HTTP401, type authentication_error, code invalid_request_error. Проверено только boolean: ключ в canary точно совпал с защищённым server.env; он без кавычек и пробелов, временный env содержал только3 выбранных provider settings и synthetic settings. Значения, hashes, prefixes ключа не выводились. Это отказ провайдера принять credential, не ошибка модели/документа/выбранного адаптера. Рабочую .env в тесты не передавали. Временный canary env удалён, own container остановлен; реальная проверка распознавания/Word после него остаётся FAIL/NOT RUN, не выдаётся за PASS.

Независимый downstream stock PASS на synthetic SQLite: ведущий ноль, два склада, реальный XLSX, canonical DB tables unchanged, без записей offer storage. Это отдельно от заблокированной actual extraction. Свежий предварительный backup `sm-techno-20261101T053353302747Z.tar.gz`, SHA25685c3a922d16fb8c4f363cd8e67adb6bbf8b26eebd86609c9b53fefadeb4e7f47: verify-only и empty-target restore PASS (`verified-backup-20261101`). Перед actual switch по-прежнему нужен новый FINAL quiesced backup.

Владельцу отправлено одно сообщение о замене ключа через готовый hidden-input helper; ключ в чат не запрашивается. PR13 остаётся draft, mandatory actual-model gate не обходится. Main/live app не переключены: фактический server Git52ccb395 и исходная healthy пара проверены сегодня; свободно8.4GiB. Прежний OpenAI403 ниже — исторический факт, маршрут OpenAI больше не является текущим условием выпуска по решению владельца.

Последнее указание владельца разрешило deploy и отменило прежнюю паузу. Выпуск удерживает обнаруженное техническое условие: OpenAI не обслуживает текущий исходящий маршрут VPS. Это не новая просьба о разрешении на уже порученный deploy.

## Подготовлено и проверено

- Текущий рабочий runtime остаётся52ccb395, оба исходных контейнера healthy; app checkout и рабочие настройки не менялись. Свободно6,1GiB после подготовки, до неё7,9GiB. Чужие Docker ресурсы, DNS/Caddy/SSH/учётные записи не менялись, prune не выполнялся.
- Сохранены исходный код52, защищённая runtime.env и оба оригинальных образа, архив235MiB. Проверены manifest/config SHA256 обоих образов. Old backend4129fdd8…, old frontend268c0e9e…; полные IDs в notes.md и закрытом recovery manifest.
- Fresh backup `sm-techno-20261030T185956658421Z.tar.gz`, SHA256ecafbc690b8629f6af8a891b39cd63616df7ad3174373dd23c24ba88fd18fff9 создан новым verifier. Verify-only и restore в пустое staging прошли. Это предварительная копия; перед actual switch нужна новая quiesced копия.
- Candidate backend image `sha256:5f19c496fbb8d5c728619f407947be788323154848de0b5a8db28a84f5bb1956`, source708d2bd; frontend `sha256:3a79bfe2d0e26a16e2c740b95a787517cf4a659ed984c996f991468a38ea78b7`, unchanged frontend source; converter `sha256:a2a0ccc17491c6223c1c0ceb648e5e2928b3398ca9d366e1d5dfae55eebc8394`. Сборки прошли; images не подменяют обязательный final main SHA.
- Реальный host broker под uid1000 и backend-container client uid0 преобразовали synthetic RTF в PDF11928B; work directory опустел. Docker socket в backend не монтируется. Два security review findings исправлены: known UID65534 output cleanup при ошибке/после restart и общий deadline с резервом exact-label cleanup.
- Linux affected:40passed+7subtests; после permission fix22passed. Новые regression tests сначала упали, после bounded fixes real Linux AF_UNIX8passed, включая actual chown/failed-output/orphan и budget tests; Windows extraction16passed. Ранее15 Windows teardown отказов не засчитаны как PASS; те же затронутые случаи прошли в Linux.
- Pinned Codex0.166.0 и matching code-mode host установлены и проверены официальными SHA256. Исправлена неполная standalone установка; exact default-security probe после companion больше не выдаёт missing-host startup item.error. Модель/permissions/capabilities/event validation не ослаблялись.

## Проверка возврата на текущих данных

Восстановлена отдельная копия текущих данных. Existing transfer helper очистил только копию от сессий и 1С credentials; тесты использовали synthetic Fernet, no-network контейнеры и контролируемые reviewed-job fixtures, без реальной модели и 1С. Candidate записал synthetic client, item, КП, договор и спецификацию.

Exact OLD52 запустился на этой обновлённой копии, прочитал клиента/КП; stock проверен SQL, файл договора доступен. Затем проверены обе пары frontend/backend: new ready200/200/401 → stop → exact old pair ready200/200/401. Остановка и готовность обоих старых сервисов заняла6,81с в изолированной репетиции. Это не production SLA. NEW strict verifier passed; все44 таблицы,14368 строк и58 файлов сохранили canonical hashes. Повторный старт нового backend также прошёл с идентичными snapshots. Старый runtime не предоставляет новые функции UI, но новые записи и файлы не уничтожает. Тестовые контейнеры остановлены.

Закрытое evidence: `/srv/sm-techno-test/releases/20261030-document-workflows/rehearsal-agent-20261030/`; не публиковать дампы или customer filenames.

Observed `manager_periods.mode=minimum` проверен отдельно: фактический старый image4129… содержит поддержку minimum и max(fixed, commission); обе ветви расчёта прошли на синтетических параметрах без DB mutation. SHA256 manager_repository.py внутри образа совпал с source52: ce378d96224cc50a67369092055eb3396494c5764fb59dc3388c2d0b325c0f3f. Ограничение на реально pre-minimum backend не обходилось. Полный startup старой пары измерен6,81с, не только одного backend.

Actual lifecycle probe нового образа с полностью синтетическим invalid API key и network=none довёл реальный CodexDocumentExtractor до runtime_timeout15с; через3с после возврата не осталось Codex/code-mode-host процессов. Это проверка timeout/cleanup, не успешного model inference.

## Оставшееся условие

Авторизация выбранного ChatGPT аккаунта настроена через официальный защищённый auth-cache fallback; account identity сопоставлена без вывода значения, auth.json0600 отдельно от app/Git/image context. Локальный реальный gpt-6.1-terra вызов с тем же аккаунтом PASS.

С VPS exact production-policy CLI получает403 при models/workspace routing. Непосредственный first-party API GET также вернул403 с `unsupported_country_region_territory`. Проверены host и container путь, WebSocket и штатный HTTPS fallback; действующего proxy в контексте приложения/SSH нет. Backend agent inference на VPS остаётся FAIL, не выдаётся за PASS. Не менялись TLS, sandbox, модель, аккаунт, host network policy или платная инфраструктура.

Владельцу отправлен один вопрос о существующем разрешённом proxy/узле в поддерживаемом регионе; пароли/токены не запрашивались. До маршрута и успешной реальной inference проверки live switch не производится. После ответа — настроить ровно согласованный маршрут, подтвердить exact Linux inference/security/cleanup, завершить PR→main, зафиксировать finalSHA/images, новый проверенный backup и выполнить уже разрешённое обновление с read-only same-origin smoke.
