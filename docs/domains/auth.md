# Домен: авторизация, пользователи и права доступа

## 1. Текущая модель доступа

В приложении есть локальная авторизация уровня самого сервиса.

Роли сейчас две:

- `admin`
- `user`

Разделение прав уже встроено в UI и API:

- администратор управляет настройками 1С, пользователями, прайсом и складскими служебными операциями;
- пользователь работает с остатками, счетом и историей своих операций в пределах доступного интерфейса.

## 2. Где находится логика

### Frontend
- [components/auth-provider.tsx](D:/codex/SEO_Gen/sm-techno-web/components/auth-provider.tsx)
- [app/settings/page.tsx](D:/codex/SEO_Gen/sm-techno-web/app/settings/page.tsx)
- [lib/storage.ts](D:/codex/SEO_Gen/sm-techno-web/lib/storage.ts)
- [lib/api.ts](D:/codex/SEO_Gen/sm-techno-web/lib/api.ts)
- [lib/types.ts](D:/codex/SEO_Gen/sm-techno-web/lib/types.ts)

### API
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/{id}`
- `DELETE /api/users/{id}`

Маршруты объявлены в [stock_sync_api.py](D:/codex/SEO_Gen/stock_sync_api.py).

### Backend / БД
- [stock_sync_web/service.py](D:/codex/SEO_Gen/stock_sync_web/service.py)
- [stock_sync_web/database.py](D:/codex/SEO_Gen/stock_sync_web/database.py)

Ключевые методы:

- `login_app_user`
- `get_user`
- `get_user_by_session_token`
- `revoke_session`
- `list_users`
- `create_user`
- `update_user_account`
- `reset_user_password`
- `delete_user`
- `authenticate`
- `create_session`
- `delete_session`

## 3. Таблицы

### `users`
Содержит:

- `username`
- `password_hash`
- `app_password`
- `role`
- `full_name`
- `onec_username`
- `onec_password`
- `is_active`
- `created_at`
- `updated_at`

Важно:

- вход выполняется по `password_hash`;
- `app_password` хранится отдельно для показа администратору;
- `onec_password` тоже хранится отдельно для использования в интеграции с 1С.

### `app_sessions`
Содержит:

- `user_id`
- `token`
- `created_at`
- `last_seen_at`

## 4. Как проходит авторизация

### Логин
1. Пользователь вводит логин и пароль в `AuthProvider`.
2. Frontend вызывает `loginAppUser`.
3. Backend маршрут `/api/auth/login` вызывает `SERVICE.login_app_user`.
4. `WebDatabase.authenticate` проверяет `password_hash`.
5. При успехе создается session token в `app_sessions`.
6. Frontend сохраняет token и объект пользователя в `localStorage`.

### Восстановление сессии
При загрузке приложения:

- `AuthProvider` читает `AUTH_SESSION_STORAGE_KEY`;
- если сессия найдена, вызывает `/api/auth/me`;
- при успехе состояние восстанавливается;
- при ошибке локальная сессия сбрасывается.

### Logout
- frontend вызывает `/api/auth/logout`;
- backend удаляет токен из `app_sessions`;
- frontend очищает локальное состояние.

## 5. Как работают права

### На клиенте
`AuthProvider` отдает:

- `user`
- `isAdmin`
- `logout`
- `refreshUser`

По `isAdmin` прячутся или показываются:

- раздел “Работа с прайсом”;
- раздел “Настройки”;
- управление пользователями;
- служебные складские действия.

### На backend
Есть два уровня зависимостей:

- `_get_current_user`
- `_get_admin_user`

`_get_current_user`:
- извлекает bearer token;
- ищет пользователя по session token;
- возвращает `401`, если сессия недействительна.

`_get_admin_user`:
- требует роль `admin`;
- возвращает `403`, если роль не подходит.

## 6. Пользователи и настройки 1С

Сейчас модель такая:

- у каждого пользователя могут быть свои `onec_username` и `onec_password`;
- администратор может создавать пользователей и задавать им эти данные;
- системные настройки 1С живут отдельно в `app_settings`;
- пользовательские 1С-учетки могут использоваться для отправки заказов и синхронизации справочников.

Это важно для безопасности изменений:

- нельзя смешивать глобальные настройки 1С и пользовательские учетные данные;
- нельзя случайно очистить `onec_password` при частичном обновлении профиля;
- нельзя ломать показ сохраненных паролей администратору.

## 7. Ограничения и защитные правила

По текущей реализации backend не дает:

- удалить свою учетную запись;
- удалить последнего активного администратора;
- разжаловать последнего активного администратора;
- отключить последнего активного администратора.

Также:

- пользователь должен иметь пароль не короче 6 символов;
- логин нормализуется в lowercase;
- неактивный пользователь не проходит авторизацию.

## 8. Клиентское хранение состояния

В `localStorage` хранятся:

- auth session (`sm-techno-auth-session`)
- пользовательский черновик счета
- состояние страницы остатков
- состояние формы счета

Ключевой нюанс:

- для пользовательских данных применяется user-scoped key через `getScopedStorageKey`;
- это помогает не смешивать черновики разных пользователей на одном компьютере.

## 9. Инварианты, которые нельзя нарушать

- вход должен идти по `password_hash`, а не по открытому `app_password`;
- token должен оставаться обязательным для защищенных API;
- неактивный пользователь не должен проходить авторизацию;
- админские маршруты должны оставаться за `_get_admin_user`;
- пользовательские черновики и экранное состояние должны быть user-scoped;
- нельзя допустить удаление последнего активного администратора;
- нельзя терять сохраненные `onec_username` / `onec_password` при обновлении аккаунта;
- logout должен очищать и серверную, и локальную сессию.

## 10. Рискованные места

- [components/auth-provider.tsx](D:/codex/SEO_Gen/sm-techno-web/components/auth-provider.tsx)
- [lib/storage.ts](D:/codex/SEO_Gen/sm-techno-web/lib/storage.ts)
- [app/settings/page.tsx](D:/codex/SEO_Gen/sm-techno-web/app/settings/page.tsx)
- [stock_sync_api.py](D:/codex/SEO_Gen/stock_sync_api.py)
- [stock_sync_web/service.py](D:/codex/SEO_Gen/stock_sync_web/service.py)
- [stock_sync_web/database.py](D:/codex/SEO_Gen/stock_sync_web/database.py)

Отдельно опасны:

- схема `users`;
- схема `app_sessions`;
- логика сериализации пользователя в API;
- логика показа паролей администратору;
- правила refresh/reset сессии.

## 11. Что проверять после изменений

### Команды
- `cd sm-techno-web && npm run build`
- `cd sm-techno-web && npm run lint`
- `cd sm-techno-web && npx tsc --noEmit`

### Ручные сценарии
- вход валидным пользователем;
- отказ при неверном пароле;
- отказ для неактивного пользователя;
- logout;
- перезагрузка страницы с сохраненной сессией;
- вход под админом и под обычным пользователем;
- скрытие админских разделов для `user`;
- создание нового пользователя;
- обновление роли и пароля;
- удаление пользователя;
- запрет удаления самого себя;
- запрет удаления последнего активного администратора;
- проверка, что пользовательские черновики не смешиваются между разными учетками на одном ПК.

