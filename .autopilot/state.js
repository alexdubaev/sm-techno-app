window.STATE =
{
  "version": 2,
  "slug": "overview-compact-summary",
  "dir": "2026-11-08-overview-compact-summary--wip",
  "title": "Компактный общий обзор — Сводка рядом",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-08-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-08T13:13:39+03:00",
  "updatedAt": "2026-11-08T13:24:24+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-08T13:13:39+03:00",
      "finishedAt": "2026-11-08T13:19:02+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-08T13:19:02+03:00",
      "finishedAt": "2026-11-08T13:19:04+03:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "startedAt": "2026-11-08T13:19:03+03:00",
      "finishedAt": "2026-11-08T13:19:03+03:00",
      "note": "Выбран конкретный макет; бизнес-правила и контур прежние, дополнительных вопросов нет"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-08T13:19:04+03:00",
      "finishedAt": "2026-11-08T13:23:57+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-08T13:23:57+03:00"
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
    "total": 10,
    "done": 0,
    "inTicket": 10,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Компактный общий обзор «Сводка рядом»",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "sm-techno-web/components/admin-dashboard/",
        "sm-techno-web/tests/auth/admin-dashboard.integration.test.tsx",
        "sm-techno-web/tests/e2e/admin-dashboard.spec.ts",
        "sm-techno-web/tests/e2e/manager-bank-import.spec.ts",
        "sm-techno-web/tests/e2e/manager-dashboard-layout.spec.ts"
      ],
      "review": "нет",
      "model": "обычная",
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
    "found": 1,
    "fixed": 1,
    "deferred": 0,
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-08T13:13:39+03:00",
    "2026-11-08T13:19:01+03:00",
    "2026-11-08T13:19:02+03:00",
    "2026-11-08T13:19:03+03:00",
    "2026-11-08T13:19:04+03:00",
    "2026-11-08T13:23:56+03:00",
    "2026-11-08T13:23:57+03:00",
    "2026-11-08T13:23:58+03:00",
    "2026-11-08T13:23:59+03:00",
    "2026-11-08T13:24:00+03:00",
    "2026-11-08T13:24:23+03:00",
    "2026-11-08T13:24:24+03:00"
  ],
  "rev": 13,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-11-08T13:13:39+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-08T13:19:02+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-08T13:19:03+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "skip",
      "note": "Выбран конкретный макет; бизнес-правила и контур прежние, дополнительных вопросов нет"
    },
    {
      "t": "2026-11-08T13:19:04+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 10
    },
    {
      "t": "2026-11-08T13:19:04+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-08T13:23:56+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 1,
      "fixed": 1,
      "deferred": 0
    },
    {
      "t": "2026-11-08T13:23:57+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-08T13:23:58+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-08T13:23:59+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-08T13:24:00+03:00",
      "k": "gate",
      "g": "G3",
      "ok": false,
      "problems": 1
    },
    {
      "t": "2026-11-08T13:24:23+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-08T13:24:24+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«Давай реализуем вариант 1»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«пересобрать весь этот UI/UX, где вот месяца, недели, добавление всего»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«не было просто пустых пробелов»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«графики все вот эти вот продажи можно чуть-чуть уменьшить»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«этот график и даже продажи по менеджеру можно на одном экране как-то уместить»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«я нажимаю на график, и он уже раскроется на полный экран и будет больше»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«из списка менеджеров я тоже должен проваливаться в карточку менеджера»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«на остальных не надо»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«Вот это все не надо»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«ВСЯ СУММА ОПЛАТЫ С НДС»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-08T13:19:04+03:00",
      "open": 0,
      "total": 10
    },
    "G2": {
      "ok": true,
      "at": "2026-11-08T13:23:56+03:00",
      "found": 1,
      "fixed": 1,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-08T13:24:24+03:00",
      "problems": 0
    }
  },
  "result": null
}
