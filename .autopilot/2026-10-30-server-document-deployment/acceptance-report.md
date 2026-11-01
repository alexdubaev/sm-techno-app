# Сервер обновлён2026-11-01

Развёрнут main `00d61528f0c26df56e1f75de28b0d1ace8ebf78a`, PR13. Временная расценка остаётся в Остатках; документы создаются в Документах, связаны с CRM. Работает DeepSeek Flash (`deepseek-flash`), выбранная владельцем; ключ находится только в protected server.env. Старые разделы/прайсы/клиентские КП/ручные формы сохраняются.

## Фактический runtime

- backend `sha256:37a83f278813cbf402ee2ad7bd933d06021c450db01e59d37d0548b209ebe9cd`;
- frontend `sha256:4dc605fedecae1c9d63336c85553eccab4d74b9028f8fa9b146f4c9dd3bcc473`;
- converter `sha256:a2a0ccc17491c6223c1c0ceb648e5e2928b3398ca9d366e1d5dfae55eebc8394`;
- оба контейнера healthy, own broker active, backend не имеет Docker socket;
- backend health и same-origin frontend health200; unauthenticated same-origin auth/me401;
- real live broker synthetic RTF→PDF10014B, work directory emptied. Production DB/1С не использовались для проверочных записей.

## Проверки

Combined Windows35PASS, Linux42PASS на runtime/adapter. Независимо5 actual DeepSeek calls и оба Word PASS на isolated synthetic data: XLSX ведущие нули; PNG→review→contract; DOCX→review→spec. Недостающие legal/CEO/currency поля явно исправлял менеджер; currency guard422 сработал до RUB correction. Спецификация: canonical contract, покупатель,00123Насос,qty2,gross1200/net1000,VAT400,total2400, условия совпали с незаполненным шаблоном. Отдельный stock resolve/XLSX/two warehouses/DB unchanged PASS. Это не гарантия безошибочного распознавания всех документов, manager review остаётся обязательным.

Fresh current-data copy NEW→OLD52 backend readback/strict verifier PASS,52 filehash и исходные данные сохранены; ожидаемая migration добавила6 document columns и4 empty tables. Ранее проверены synthetic newwrites и обе пары frontend/backend, stage rollback6.81s (не SLA). Единственный fresh runtime review выполнен, confirmed findings закрыты. Поздние реальные CI harness failures исправлены2 test-only строками; CRM8/8 и affected isolated Chromium1/1PASS. Старые красные результаты не переписаны зелёными.

## Backup и возврат

FINAL quiesced backup `/srv/sm-techno-test/backups/sm-techno-20261101T060408197811Z.tar.gz`; SHA256 `a859e168d6a8a17dd64f6fc5acd5eaaeb743c48898d4805bea5c786f9b8bf42d`. Verify-only и restore в empty `final-verified-00d6152` прошли перед запуском нового приложения. Старые source52, images и protected config сохранены. Deployment сам имеет recovery trap на точные старые образы с текущими данными. Восстановление старой БД поверх новых записей запрещено.

Для оператора: `/srv/sm-techno-test/releases/20261030-document-workflows/release-00d6152.yaml` содержит точные новые image IDs, `rollback-00d6152.yaml` — прежние4129backend/268frontend. Для будущего code-only rollback сначала корректно остановить только sm-techno-test и сделать свежий coherent backup из нового source/verifier, проверить поддержку текущих data/schema старым образом. Затем из app выполнить base compose + rollback override `up -d --no-build --pull never`, остановить/disable только own converter service, подтвердить health/auth и фактические image IDs. Не применять runtime socket overlay к старому образу, не делать git reset/rebase и не трогать DB/storage. После возврата Git HEAD может остаться новым, фактический runtime определяется image IDs.

## Время и ограничения

Stop→verified-ready26.685s; это верхняя наблюдаемая граница переключения до Docker+HTTP подтверждения. Сборки сделаны до остановки. Начало измеряемого продолжения после замены ключа05:52:38UTC, подтверждение работающего выпуска06:04:31UTC:11m53s; точное время получения исходного запроса и суммарное активное время всей многодневной задачи не инструментированы. Не выдавать ожидание маршрута/ключей за server downtime. Дальнейший хвост — фиксация evidence/архивов и отчёт, приложение уже работает.

Не вошло: необязательная очистка после редкой ошибки удаления (G01, пользователь отложил). OpenAI с прежнего VPS egress недоступен; сохранённая Codex-опция потребует отдельного разрешённого маршрута, автоматического fallback нет. DNS остаётся OS-managed вне socket watchdog. Рабочие настройки1С,DNS/Caddy и чужие ресурсы не менялись. Нового privileged account не создавали. Пустых обязательных переменных для выбранного DeepSeek нет.
