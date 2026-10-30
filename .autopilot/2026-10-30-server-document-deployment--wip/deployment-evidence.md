# Сервер подготовлен; рабочее переключение ещё не выполнено

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

## Оставшееся условие

Авторизация выбранного ChatGPT аккаунта настроена через официальный защищённый auth-cache fallback; account identity сопоставлена без вывода значения, auth.json0600 отдельно от app/Git/image context. Локальный реальный gpt-6.1-terra вызов с тем же аккаунтом PASS.

С VPS exact production-policy CLI получает403 при models/workspace routing. Непосредственный first-party API GET также вернул403 с `unsupported_country_region_territory`. Проверены host и container путь, WebSocket и штатный HTTPS fallback; действующего proxy в контексте приложения/SSH нет. Backend agent inference на VPS остаётся FAIL, не выдаётся за PASS. Не менялись TLS, sandbox, модель, аккаунт, host network policy или платная инфраструктура.

Владельцу отправлен один вопрос о существующем разрешённом proxy/узле в поддерживаемом регионе; пароли/токены не запрашивались. До маршрута и успешной реальной inference проверки live switch не производится. После ответа — настроить ровно согласованный маршрут, подтвердить exact Linux inference/security/cleanup, завершить PR→main, зафиксировать finalSHA/images, новый проверенный backup и выполнить уже разрешённое обновление с read-only same-origin smoke.
