window.STATE =
{
  "version": 2,
  "slug": "server-document-deployment",
  "dir": "2026-10-30-server-document-deployment--wip",
  "title": "СМ ТЕХНО: серверный выпуск с Terra и возвратом",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": null,
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "1d7dd9be7f733e6af37ede3c58a8ae0f488cb8fc",
  "startedAt": "2026-10-30T22:00:17+03:00",
  "updatedAt": "2026-10-30T22:07:48+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-10-30T22:00:17+03:00",
      "finishedAt": "2026-10-30T22:06:59+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-10-30T22:06:59+03:00",
      "finishedAt": "2026-10-30T22:06:59+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-10-30T22:07:45+03:00",
      "finishedAt": "2026-10-30T22:07:45+03:00",
      "note": "Latest explicit deploy instruction resumes paused work; same-account choice already answered, no new product fork."
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-10-30T22:06:59+03:00",
      "finishedAt": "2026-10-30T22:07:47+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-10-30T22:07:47+03:00"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 9,
    "done": 0,
    "inTicket": 8,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 1,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Рабочая Linux среда Terra и безопасный конвертер",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "stock_sync_web/assistant_extraction.py",
        "stock_sync_web/assistant_errors.py",
        "stock_sync_web/assistant_environment.py",
        "stock_sync_web/assistant_office.py",
        "stock_sync_web/assistant_converter_broker.py",
        "tests/document_assistant/",
        "Dockerfile.backend",
        "compose.document-runtime.yaml",
        "scripts/document_runtime/",
        "docs/server-document-runtime.md",
        ".env.example"
      ],
      "review": "нет — один fresh independent security review всей runtime delta",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 0,
    "fixed": 0,
    "deferred": 0,
    "items": [
      "Independent reader missing0/half0. Broker/security specifics are technical children of R05 supporting already-agreed formats; no new user capability or public API."
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-10-30T22:00:17+03:00",
    "2026-10-30T22:00:18+03:00",
    "2026-10-30T22:06:58+03:00",
    "2026-10-30T22:06:59+03:00",
    "2026-10-30T22:07:00+03:00",
    "2026-10-30T22:07:45+03:00",
    "2026-10-30T22:07:46+03:00",
    "2026-10-30T22:07:47+03:00",
    "2026-10-30T22:07:48+03:00"
  ],
  "rev": 11,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-10-30T22:00:17+03:00",
      "k": "init"
    },
    {
      "t": "2026-10-30T22:00:18+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-10-30T22:06:58+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-10-30T22:06:59+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 9
    },
    {
      "t": "2026-10-30T22:06:59+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-10-30T22:06:59+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-10-30T22:07:00+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-10-30T22:07:45+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "done"
    },
    {
      "t": "2026-10-30T22:07:46+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-10-30T22:07:47+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-10-30T22:07:48+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«деплоить надо было»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«сохранив старую версию»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«быстро откатить на старую»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«резервная копия базы и файлов»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«подготовка среды Terra на сервере»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«Тот же аккаунт (рекомендую)»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«Проверь сразу место на сервере»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«подготовление не удаляй»",
      "status": "in-ticket"
    },
    {
      "id": "G01",
      "text": "«Оставить отдельно (рекомендую)»",
      "status": "deferred",
      "why": "Необязательная старая staging cleanup вне выпуска"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-10-30T22:06:59+03:00",
      "open": 0,
      "total": 9
    },
    "G3": {
      "ok": true,
      "at": "2026-10-30T22:07:48+03:00",
      "problems": 0
    },
    "G2": {
      "ok": true,
      "at": "2026-10-30T22:07:46+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    }
  },
  "result": null
}
