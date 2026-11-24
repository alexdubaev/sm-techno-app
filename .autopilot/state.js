window.STATE =
{
  "version": 2,
  "slug": "glassy-theme",
  "dir": "2026-11-24-glassy-theme--wip",
  "title": "Стеклянная тема СМ ТЕХНО",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-24-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-24T15:16:48+03:00",
  "updatedAt": "2026-11-24T15:20:05+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-24T15:16:48+03:00",
      "finishedAt": "2026-11-24T15:17:13+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-24T15:17:13+03:00",
      "finishedAt": "2026-11-24T15:17:52+03:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "startedAt": "2026-11-24T15:17:50+03:00",
      "finishedAt": "2026-11-24T15:17:50+03:00",
      "note": "Контекст определён макетами и предыдущим обсуждением двух тем"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-24T15:17:52+03:00",
      "finishedAt": "2026-11-24T15:20:00+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-24T15:20:00+03:00"
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
    "total": 8,
    "done": 0,
    "inTicket": 8,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Переключаемая тема «Стекло»",
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
        "sm-techno-web/app",
        "sm-techno-web/components",
        "sm-techno-web/lib",
        "sm-techno-web/tests"
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
    "found": 2,
    "fixed": 2,
    "deferred": 0,
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-24T15:16:48+03:00",
    "2026-11-24T15:17:13+03:00",
    "2026-11-24T15:17:48+03:00",
    "2026-11-24T15:17:50+03:00",
    "2026-11-24T15:17:52+03:00",
    "2026-11-24T15:19:59+03:00",
    "2026-11-24T15:20:00+03:00",
    "2026-11-24T15:20:02+03:00",
    "2026-11-24T15:20:04+03:00",
    "2026-11-24T15:20:05+03:00"
  ],
  "rev": 11,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-11-24T15:16:48+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-24T15:17:13+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:17:50+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "skip",
      "note": "Контекст определён макетами и предыдущим обсуждением двух тем"
    },
    {
      "t": "2026-11-24T15:17:52+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 8,
      "total": 8
    },
    {
      "t": "2026-11-24T15:17:52+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:19:59+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    {
      "t": "2026-11-24T15:20:00+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:20:02+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-24T15:20:04+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-24T15:20:05+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«в отдельной ветке»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«перенесем этот интерфейс на наше приложение»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«чтоб можно было быстро менять интерфейс»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«и кнопки прозрачность»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«и анимации»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«и графики»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«только цвета наши»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«на десктоп и на мобильной версии»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-24T15:17:52+03:00",
      "open": 8,
      "total": 8
    },
    "G2": {
      "ok": true,
      "at": "2026-11-24T15:19:59+03:00",
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-24T15:20:05+03:00",
      "problems": 0
    }
  },
  "result": null
}
