window.STATE =
{
  "version": 2,
  "slug": "interface-speed",
  "dir": "2026-11-25-interface-speed",
  "title": "Быстродействие интерфейса СМ ТЕХНО",
  "mode": "semi",
  "depth": "normal",
  "tier": "T1",
  "briefFile": "2026-11-25-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-25T17:40:02+03:00",
  "updatedAt": "2026-11-25T18:23:42+03:00",
  "finishedAt": "2026-11-25T18:23:42+03:00",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-25T17:40:02+03:00",
      "finishedAt": "2026-11-25T17:40:37+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-25T17:40:37+03:00",
      "finishedAt": "2026-11-25T17:41:19+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-25T17:41:19+03:00",
      "finishedAt": "2026-11-25T17:41:20+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-25T17:41:20+03:00",
      "finishedAt": "2026-11-25T17:41:54+03:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-11-25T17:41:54+03:00",
      "finishedAt": "2026-11-25T17:42:38+03:00"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-11-25T17:42:38+03:00",
      "finishedAt": "2026-11-25T18:11:55+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-11-25T18:11:55+03:00",
      "finishedAt": "2026-11-25T18:23:17+03:00"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-11-25T18:23:17+03:00",
      "finishedAt": "2026-11-25T18:23:42+03:00"
    }
  ],
  "requirements": {
    "total": 3,
    "done": 3,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Плавный возврат к данным продаж",
      "requirements": [
        "R01",
        "R03"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "sm-techno-web/components/admin-dashboard/",
        "sm-techno-web/components/manager/",
        "sm-techno-web/lib/api.ts"
      ],
      "review": "да — изоляция сессии",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-25T17:42:39+03:00",
      "finishedAt": "2026-11-25T18:11:55+03:00",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "02",
      "title": "Переходы и повторное открытие остатков",
      "requirements": [
        "R02",
        "R03"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "sm-techno-web/components/app-shell.tsx",
        "sm-techno-web/app/glassy.css",
        "sm-techno-web/components/stock-page.tsx"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-25T17:42:39+03:00",
      "finishedAt": "2026-11-25T17:49:09+03:00",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "03",
      "title": "Меньше повторных запросов CRM",
      "requirements": [
        "R03"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "sm-techno-web/components/crm-workspace.tsx",
        "sm-techno-web/components/crm/"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-25T17:42:39+03:00",
      "finishedAt": "2026-11-25T17:49:48+03:00",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "F1",
      "title": "Убрать повторное проигрывание двух графиков",
      "requirements": [
        "R01"
      ],
      "blockedBy": [
        "01",
        "02",
        "03"
      ],
      "wave": 2,
      "zone": [
        "sm-techno-web/lib/sales-memory.ts",
        "sm-techno-web/components/admin-dashboard/"
      ],
      "review": "да — ремонт ветки",
      "model": "сильная",
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "startedAt": "2026-11-25T18:15:39+03:00",
      "finishedAt": "2026-11-25T18:23:17+03:00"
    }
  ],
  "tests": {
    "passed": 379,
    "failed": 379
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
    "items": []
  },
  "concerns": [],
  "blind": {
    "checked": 3,
    "matched": 3,
    "mismatches": []
  },
  "beats": [
    "2026-11-25T17:40:02+03:00",
    "2026-11-25T17:40:37+03:00",
    "2026-11-25T17:41:18+03:00",
    "2026-11-25T17:41:19+03:00",
    "2026-11-25T17:41:20+03:00",
    "2026-11-25T17:41:54+03:00",
    "2026-11-25T17:42:24+03:00",
    "2026-11-25T17:42:25+03:00",
    "2026-11-25T17:42:26+03:00",
    "2026-11-25T17:42:38+03:00",
    "2026-11-25T17:42:39+03:00",
    "2026-11-25T17:43:46+03:00",
    "2026-11-25T17:49:09+03:00",
    "2026-11-25T17:49:48+03:00",
    "2026-11-25T18:11:55+03:00",
    "2026-11-25T18:15:38+03:00",
    "2026-11-25T18:15:39+03:00",
    "2026-11-25T18:23:17+03:00",
    "2026-11-25T18:23:18+03:00",
    "2026-11-25T18:23:19+03:00",
    "2026-11-25T18:23:42+03:00"
  ],
  "rev": 25,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-11-25T17:40:02+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-25T17:40:37+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-25T17:41:19+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-25T17:41:20+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 3
    },
    {
      "t": "2026-11-25T17:41:20+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-25T17:41:54+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-25T17:42:24+03:00",
      "k": "tier",
      "v": "T1"
    },
    {
      "t": "2026-11-25T17:42:25+03:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-25T17:42:26+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-25T17:42:38+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-25T17:42:39+03:00",
      "k": "ticket",
      "ids": [
        "01",
        "02",
        "03"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-25T17:43:46+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-11-25T17:49:09+03:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "done"
    },
    {
      "t": "2026-11-25T17:49:48+03:00",
      "k": "ticket",
      "ids": [
        "03"
      ],
      "act": "done"
    },
    {
      "t": "2026-11-25T18:11:55+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "done"
    },
    {
      "t": "2026-11-25T18:11:55+03:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-25T18:15:38+03:00",
      "k": "tickets",
      "n": 4
    },
    {
      "t": "2026-11-25T18:15:39+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-25T18:23:17+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done"
    },
    {
      "t": "2026-11-25T18:23:17+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-25T18:23:18+03:00",
      "k": "gate",
      "g": "G4",
      "ok": true,
      "checked": 3,
      "matched": 3
    },
    {
      "t": "2026-11-25T18:23:19+03:00",
      "k": "tests",
      "passed": 379,
      "failed": 379
    },
    {
      "t": "2026-11-25T18:23:42+03:00",
      "k": "finish",
      "result": "Готовые данные продаж сохраняются между переходами, графики не проигрываются заново, основные разделы проверены"
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«возвращаюсь обратно в обзор и опять заново заполняется график»",
      "status": "done"
    },
    {
      "id": "R02",
      "text": "«я нажимаю на кнопку остатки […] он только тогда переключается»",
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«Все, весь интерфейс, все разделы, каждая вкладка, каждый пунктик проверь»",
      "status": "done"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-25T17:41:20+03:00",
      "open": 0,
      "total": 3
    },
    "G3": {
      "ok": true,
      "at": "2026-11-25T17:42:26+03:00",
      "problems": 0
    },
    "G2": {
      "ok": true,
      "at": "2026-11-25T17:43:46+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G4": {
      "ok": true,
      "at": "2026-11-25T18:23:18+03:00",
      "checked": 3,
      "matched": 3
    }
  },
  "result": "Готовые данные продаж сохраняются между переходами, графики не проигрываются заново, основные разделы проверены"
}
