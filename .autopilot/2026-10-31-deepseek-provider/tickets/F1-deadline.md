# F1 — Закрыть общий deadline HTTP
**Требования:** R01, R02, R03
**Зависит от:** 01
**Зона:** `stock_sync_web/assistant_deepseek.py`; `tests/document_assistant/test_deepseek.py`
**Волна:** 2
**Ревью:** нет — один свежий review завершён, owner policy требует узкое закрытие подтверждённого finding
**Модель:** сильная

Независимый review product3040b67: assistant_deepseek.py:59-62 connection.request/getresponse используют per-socket timeout; slow trickled HTTP headers обновляют timeout и обходят общий deadline. Stub отправляет один байт заголовка каждые0.04s при timeout0.12; runtime_timeout возник только через1.72s. Бесконечный поток может удерживать слот бесконечно. Ограничить deadline также отправку и получение заголовков, сохранив body deadline и безопасную очистку соединения. Новая meaningful regression должна сначала упасть. Исправить минимально без новых зависимостей, реальной сети/ключей, ослаблений TLS, отключения тестов, бесконечных фоновых запросов или утечек потоков/соединений. Проверить ровно затронутые adapter/consumer tests. Других findings нет, не расширять scope.
