# Tailscale: быстрый запуск для СМ ТЕХНО

## Что уже подготовлено в проекте

- frontend слушает `0.0.0.0:3000`
- backend слушает `127.0.0.1:8000` — доступен только с этой машины
- API публикуется наружу через Tailscale Funnel:
  - `https://<имя-машины>.<tailnet>.ts.net` → `http://127.0.0.1:8000`
  - включение вручную: `scripts/enable_tailscale_funnel.ps1`
  - серверный режим включает Funnel автоматически
- для серверного режима есть запуск:
  - `start_tailscale_server.bat`
- для остановки:
  - `stop_all.bat`

## Что поставить на компьютер-сервер

1. Скачайте Tailscale для Windows:
   - <https://tailscale.com/download/windows>
2. Установите программу.
3. Войдите в Tailscale под своей учетной записью.

## Как включить серверный режим

1. Запустите `start_tailscale_server.bat`
2. Дождитесь строки вида:
   - `Tailscale access: http://...:3000`
3. Если Windows покажет запрос брандмауэра:
   - разрешите доступ для частных сетей

## Автозапуск после перезагрузки Windows

Откройте PowerShell от имени администратора и один раз выполните:

```powershell
cd D:\codex\sm-techno-app
.\scripts\install_backend_autostart.ps1
```

После этого Windows будет автоматически запускать и контролировать backend, frontend и Funnel. Проверка состояния:

```powershell
Get-ScheduledTask -TaskName "SM Techno Server"
Get-Content D:\codex\sm-techno-app\logs\sm-techno-server.log -Tail 50
```

Удаление задания автозапуска:

```powershell
.\scripts\install_backend_autostart.ps1 -Remove
```

## Что поставить на втором компьютере

1. Установите Tailscale:
   - <https://tailscale.com/download/windows>
2. Войдите в Tailscale.
3. Если второй компьютер не в вашем tailnet:
   - откройте админку Tailscale;
   - поделитесь машиной-сервером или пригласите пользователя.

## Как открывать приложение со второго компьютера

- по публичному адресу фронтенда, например:
  - `https://sm-techno-stock.alexdubaev.chatgpt.site`
- запросы к API идут через Funnel-адрес вида:
  - `https://<имя-машины>.<tailnet>.ts.net`

Прямой доступ к API по адресу `http://100.x.x.x:8000` больше не работает:
backend слушает только `127.0.0.1`, наружу его публикует Funnel.

## Если нужен доступ пользователю из другого tailnet

1. Откройте страницу `Machines` в админке Tailscale.
2. Найдите компьютер-сервер.
3. Выберите `Share`.
4. Отправьте приглашение по email или ссылке.
5. Дождитесь подтверждения пользователя.

## Как остановить сервер

На компьютере-сервере запустите:

```powershell
cd D:\codex\sm-techno-app
stop_all.bat
```
