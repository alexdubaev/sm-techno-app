window.STATE =
{
  "version": 2,
  "slug": "server-document-deployment",
  "dir": "2026-10-30-server-document-deployment--wip",
  "title": "СМ ТЕХНО: серверный выпуск с DeepSeek и возвратом",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": null,
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "1d7dd9be7f733e6af37ede3c58a8ae0f488cb8fc",
  "startedAt": "2026-10-30T22:00:17+03:00",
  "updatedAt": "2026-11-01T08:58:30+03:00",
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
      "status": "done",
      "startedAt": "2026-10-30T22:07:47+03:00",
      "finishedAt": "2026-10-30T22:07:50+03:00"
    },
    {
      "id": "build",
      "status": "active",
      "startedAt": "2026-10-30T22:07:50+03:00"
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
    "done": 7,
    "inTicket": 1,
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
        "document_runtime/",
        "tests/document_assistant/",
        "Dockerfile.backend",
        "compose.document-runtime.yaml",
        "scripts/document_runtime/",
        "docs/server-document-runtime.md",
        ".env.example"
      ],
      "review": "нет — один fresh independent security review всей runtime delta",
      "model": "сильная",
      "status": "in-progress",
      "startedAt": "2026-10-30T22:07:51+03:00",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "F2",
      "title": "Закрыть реальные frontend release check failures",
      "requirements": [
        "R01",
        "R05"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "sm-techno-web/tests/",
        "sm-techno-web/scripts/"
      ],
      "review": "по фактическому риску; test-fixture-only узкий fix не требует второго whole review",
      "model": "сильная",
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "startedAt": "2026-11-01T08:53:40+03:00",
      "finishedAt": "2026-11-01T08:57:55+03:00",
      "tests": {
        "passed": 9,
        "failed": 0
      },
      "commit": "29776d9"
    }
  ],
  "tests": {
    "passed": 9,
    "failed": 0
  },
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
  "concerns": [
    "External resource: VPS OpenAI403 unsupported_country_region_territory; same-account local actual Terra PASS. Need owner-provided permitted egress/host; no app proxy configured. Preparation/rollback complete, no protected runtime guard weakened."
  ],
  "blind": {
    "checked": 5,
    "matched": 5,
    "mismatches": []
  },
  "beats": [
    "2026-10-30T22:00:17+03:00",
    "2026-10-30T22:00:18+03:00",
    "2026-10-30T22:06:58+03:00",
    "2026-10-30T22:06:59+03:00",
    "2026-10-30T22:07:00+03:00",
    "2026-10-30T22:07:45+03:00",
    "2026-10-30T22:07:46+03:00",
    "2026-10-30T22:07:47+03:00",
    "2026-10-30T22:07:48+03:00",
    "2026-10-30T22:07:50+03:00",
    "2026-10-30T22:07:51+03:00",
    "2026-10-30T22:54:10+03:00",
    "2026-10-30T22:54:11+03:00",
    "2026-10-30T22:54:12+03:00",
    "2026-10-30T22:54:13+03:00",
    "2026-11-01T08:28:19+03:00",
    "2026-11-01T08:28:20+03:00",
    "2026-11-01T08:35:22+03:00",
    "2026-11-01T08:35:23+03:00",
    "2026-11-01T08:53:39+03:00",
    "2026-11-01T08:53:40+03:00",
    "2026-11-01T08:57:55+03:00",
    "2026-11-01T08:58:30+03:00"
  ],
  "rev": 27,
  "waiting": null,
  "waits": [
    {
      "kind": "action",
      "from": "2026-10-30T22:54:13+03:00",
      "to": "2026-11-01T08:28:19+03:00"
    },
    {
      "kind": "action",
      "from": "2026-11-01T08:35:23+03:00",
      "to": "2026-11-01T08:53:39+03:00"
    }
  ],
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
    },
    {
      "t": "2026-10-30T22:07:50+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-10-30T22:07:51+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "start"
    },
    {
      "t": "2026-10-30T22:54:10+03:00",
      "k": "tests",
      "passed": 8,
      "failed": 0
    },
    {
      "t": "2026-10-30T22:54:11+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-10-30T22:54:12+03:00",
      "k": "add",
      "key": "concerns",
      "n": 1
    },
    {
      "t": "2026-10-30T22:54:13+03:00",
      "k": "ask",
      "kind": "action",
      "note": "Нужен разрешённый маршрут OpenAI: VPS403 unsupported_country_region_territory. Backups/images и 6.81s stage rollback готовы; рабочий сервер52 не переключён."
    },
    {
      "t": "2026-11-01T08:28:19+03:00",
      "k": "answered",
      "kind": "action"
    },
    {
      "t": "2026-11-01T08:35:22+03:00",
      "k": "tests",
      "passed": 42,
      "failed": 0
    },
    {
      "t": "2026-11-01T08:35:23+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 3,
      "matched": 0
    },
    {
      "t": "2026-11-01T08:35:23+03:00",
      "k": "ask",
      "kind": "action",
      "note": "DeepSeek rejects configured key: GET/models HTTP401 authentication_error; owner asked replace via protected helper. Source/image and backup checks ready, old runtime unchanged; no secret in chat."
    },
    {
      "t": "2026-11-01T08:53:39+03:00",
      "k": "answered",
      "kind": "action"
    },
    {
      "t": "2026-11-01T08:53:40+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-01T08:53:40+03:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T08:57:55+03:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "done",
      "tests": {
        "passed": 9,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T08:58:30+03:00",
      "k": "gate",
      "g": "G4",
      "ok": true,
      "checked": 5,
      "matched": 5
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
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«быстро откатить на старую»",
      "status": "done"
    },
    {
      "id": "R04",
      "text": "«резервная копия базы и файлов»",
      "status": "done"
    },
    {
      "id": "R05",
      "text": "«DeepSeek по api», «проверить распознавание и выкатить новую версию на сервер»",
      "status": "done"
    },
    {
      "id": "R06",
      "text": "«Тот же аккаунт (рекомендую)»",
      "status": "done"
    },
    {
      "id": "R07",
      "text": "«Проверь сразу место на сервере»",
      "status": "done"
    },
    {
      "id": "R08",
      "text": "«подготовление не удаляй»",
      "status": "done"
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
    },
    "G4": {
      "ok": true,
      "at": "2026-11-01T08:58:30+03:00",
      "checked": 5,
      "matched": 5
    }
  },
  "result": null,
  "report": [
    "One fresh runtime security review: two confirmed cleanup/deadline findings fixed with red→green Linux regressions. Native UID1000 broker→real isolated RTF conversion passed; startup companion package corrected. Exact server inference still FAIL403; no live switch."
  ]
}
