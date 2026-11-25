window.STATE =
{
  "version": 2,
  "slug": "interface-speed",
  "dir": "2026-11-25-interface-speed--wip",
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
  "updatedAt": "2026-11-25T17:42:26+03:00",
  "finishedAt": null,
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
      "status": "active",
      "startedAt": "2026-11-25T17:41:54+03:00"
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
    "total": 3,
    "done": 0,
    "inTicket": 3,
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
      "status": "pending",
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
      "status": "pending",
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
  "coverage": null,
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-25T17:40:02+03:00",
    "2026-11-25T17:40:37+03:00",
    "2026-11-25T17:41:18+03:00",
    "2026-11-25T17:41:19+03:00",
    "2026-11-25T17:41:20+03:00",
    "2026-11-25T17:41:54+03:00",
    "2026-11-25T17:42:24+03:00",
    "2026-11-25T17:42:25+03:00",
    "2026-11-25T17:42:26+03:00"
  ],
  "rev": 11,
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
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«возвращаюсь обратно в обзор и опять заново заполняется график»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«я нажимаю на кнопку остатки […] он только тогда переключается»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«Все, весь интерфейс, все разделы, каждая вкладка, каждый пунктик проверь»",
      "status": "in-ticket"
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
    }
  },
  "result": null
}
