# SM Techno Web Frontend

Frontend для проекта СМ ТЕХНО на Next.js.

## Команды

### Development

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

### Build

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run build
```

### Start production build

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run start -- --hostname 127.0.0.1 --port 3000
```

### Lint

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run lint
```

## Переменные окружения

Создайте `.env.local`:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Связанный backend

Backend запускается из корня проекта:

```powershell
cd D:\codex\SEO_Gen
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```
