window.STATE =
{
  "version": 2,
  "slug": "overview-compact-summary",
  "dir": "2026-11-08-overview-compact-summary",
  "title": "Компактный общий обзор — Сводка рядом",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-08-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "8b7318de",
  "startedAt": "2026-11-08T13:13:39+03:00",
  "updatedAt": "2026-11-08T14:19:57+03:00",
  "finishedAt": "2026-11-08T14:19:57+03:00",
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
      "status": "done",
      "startedAt": "2026-11-08T13:23:57+03:00",
      "finishedAt": "2026-11-08T13:24:28+03:00"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-11-08T13:24:28+03:00",
      "finishedAt": "2026-11-08T14:05:19+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-11-08T14:05:19+03:00",
      "finishedAt": "2026-11-08T14:18:46+03:00"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-11-08T14:18:46+03:00",
      "finishedAt": "2026-11-08T14:19:57+03:00"
    }
  ],
  "requirements": {
    "total": 10,
    "done": 10,
    "inTicket": 0,
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
        "sm-techno-web/tests/e2e/manager-dashboard-layout.spec.ts",
        "design-qa.md"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-08T13:24:29+03:00",
      "finishedAt": "2026-11-08T14:05:18+03:00",
      "retries": 1,
      "repairs": 0,
      "tests": {
        "passed": 8,
        "failed": 0
      },
      "commit": "8dcdb2ca"
    },
    {
      "id": "F1",
      "title": "Сохранить прежние подсказки и закрыть проверки обзора",
      "requirements": [
        "R01",
        "R04",
        "R06"
      ],
      "blockedBy": [],
      "wave": 2,
      "zone": [
        "sm-techno-web/components/admin-dashboard/dashboard.tsx",
        "sm-techno-web/tests/e2e/admin-dashboard.spec.ts",
        "sm-techno-web/tests/e2e/manager-dashboard-layout.spec.ts",
        "design-qa.md"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-08T14:11:10+03:00",
      "retries": 0,
      "repairs": 0,
      "finishedAt": "2026-11-08T14:18:45+03:00",
      "tests": {
        "passed": 9,
        "failed": 0
      },
      "commit": "d56f2067"
    }
  ],
  "tests": {
    "passed": 17,
    "failed": 0
  },
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
  "blind": {
    "checked": 10,
    "matched": 10,
    "mismatches": []
  },
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
    "2026-11-08T13:24:24+03:00",
    "2026-11-08T13:24:27+03:00",
    "2026-11-08T13:24:28+03:00",
    "2026-11-08T13:24:29+03:00",
    "2026-11-08T13:26:16+03:00",
    "2026-11-08T13:26:17+03:00",
    "2026-11-08T13:50:06+03:00",
    "2026-11-08T14:05:18+03:00",
    "2026-11-08T14:05:19+03:00",
    "2026-11-08T14:11:08+03:00",
    "2026-11-08T14:11:09+03:00",
    "2026-11-08T14:11:10+03:00",
    "2026-11-08T14:14:49+03:00",
    "2026-11-08T14:18:45+03:00",
    "2026-11-08T14:18:46+03:00",
    "2026-11-08T14:18:47+03:00",
    "2026-11-08T14:18:48+03:00",
    "2026-11-08T14:19:57+03:00"
  ],
  "rev": 30,
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
    },
    {
      "t": "2026-11-08T13:24:28+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-08T13:24:29+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-08T13:26:16+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-08T13:26:17+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-08T13:50:06+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "retry"
    },
    {
      "t": "2026-11-08T14:05:18+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "done",
      "tests": {
        "passed": 8,
        "failed": 0
      }
    },
    {
      "t": "2026-11-08T14:05:19+03:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-08T14:11:08+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-08T14:11:09+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-08T14:11:10+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-08T14:14:49+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-08T14:18:45+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 9,
        "failed": 0
      }
    },
    {
      "t": "2026-11-08T14:18:46+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-08T14:18:47+03:00",
      "k": "gate",
      "g": "G4",
      "ok": true,
      "checked": 10,
      "matched": 10
    },
    {
      "t": "2026-11-08T14:18:48+03:00",
      "k": "tests",
      "passed": 17,
      "failed": 0
    },
    {
      "t": "2026-11-08T14:19:57+03:00",
      "k": "finish",
      "result": "Вариант1 реализован: компактный обзор и полноэкранный график; проверенная UI-сборка, выпуск отдельно по runbook"
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«Давай реализуем вариант 1»",
      "status": "done"
    },
    {
      "id": "R02",
      "text": "«пересобрать весь этот UI/UX, где вот месяца, недели, добавление всего»",
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«не было просто пустых пробелов»",
      "status": "done"
    },
    {
      "id": "R04",
      "text": "«графики все вот эти вот продажи можно чуть-чуть уменьшить»",
      "status": "done"
    },
    {
      "id": "R05",
      "text": "«этот график и даже продажи по менеджеру можно на одном экране как-то уместить»",
      "status": "done"
    },
    {
      "id": "R06",
      "text": "«я нажимаю на график, и он уже раскроется на полный экран и будет больше»",
      "status": "done"
    },
    {
      "id": "R07",
      "text": "«из списка менеджеров я тоже должен проваливаться в карточку менеджера»",
      "status": "done"
    },
    {
      "id": "R08",
      "text": "«на остальных не надо»",
      "status": "done"
    },
    {
      "id": "R09",
      "text": "«Вот это все не надо»",
      "status": "done"
    },
    {
      "id": "R10",
      "text": "«ВСЯ СУММА ОПЛАТЫ С НДС»",
      "status": "done"
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
      "at": "2026-11-08T14:11:09+03:00",
      "problems": 0
    },
    "G4": {
      "ok": true,
      "at": "2026-11-08T14:18:47+03:00",
      "checked": 10,
      "matched": 10
    }
  },
  "result": "Вариант1 реализован: компактный обзор и полноэкранный график; проверенная UI-сборка, выпуск отдельно по runbook"
}
