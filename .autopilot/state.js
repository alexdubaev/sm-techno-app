window.STATE =
{
  "version": 2,
  "slug": "glassy-theme",
  "dir": "2026-11-24-glassy-theme--wip",
  "title": "Стеклянная тема СМ ТЕХНО",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-25-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "1ec44589",
  "startedAt": "2026-11-24T15:16:48+03:00",
  "updatedAt": "2026-11-25T11:28:37+03:00",
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
      "startedAt": "2026-11-25T11:26:37+03:00",
      "finishedAt": "2026-11-25T11:27:19+03:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "startedAt": "2026-11-25T11:27:18+03:00",
      "finishedAt": "2026-11-25T11:27:18+03:00",
      "note": "Объём и эталон формы заданы в правке и скриншотах"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-25T11:27:19+03:00",
      "finishedAt": "2026-11-25T11:28:36+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-25T11:28:36+03:00"
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
    "total": 14,
    "done": 8,
    "inTicket": 6,
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
        "sm-techno-web/hooks",
        "sm-techno-web/lib",
        "sm-techno-web/tests"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-24T15:21:35+03:00",
      "finishedAt": "2026-11-24T15:40:01+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 371,
        "failed": 0
      },
      "commit": "0cd7bb3f504a"
    },
    {
      "id": "02",
      "title": "Общие таблицы, кнопки и скругление",
      "requirements": [
        "R09",
        "R10",
        "R11",
        "R12",
        "R13",
        "R14"
      ],
      "blockedBy": [],
      "wave": 3,
      "zone": [
        "sm-techno-web/app",
        "sm-techno-web/components",
        "sm-techno-web/tests"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "F1",
      "title": "Доводка после ревью и приёмки",
      "requirements": [
        "R02",
        "R03",
        "R04",
        "R06",
        "R08"
      ],
      "blockedBy": [],
      "wave": 2,
      "zone": [
        "sm-techno-web/app/glassy.css",
        "sm-techno-web/components/stock-page.tsx",
        "sm-techno-web/components/resizable-table.tsx",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "sm-techno-web/components/admin-dashboard",
        "sm-techno-web/tests/e2e/glassy-theme.spec.ts"
      ],
      "review": "да — ремонт ветки",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-24T15:43:32+03:00",
      "finishedAt": "2026-11-24T15:53:10+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 35,
        "failed": 0
      },
      "commit": "f4414a45600f"
    }
  ],
  "tests": {
    "passed": 372,
    "failed": 0
  },
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 3,
    "fixed": 3,
    "deferred": 0,
    "items": []
  },
  "concerns": [
    "Recharts в dev сообщает о начальном замере размера; диаграммы видимы и работают на проверенных ширинах"
  ],
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
    "2026-11-24T15:20:05+03:00",
    "2026-11-24T15:21:31+03:00",
    "2026-11-24T15:21:33+03:00",
    "2026-11-24T15:21:35+03:00",
    "2026-11-24T15:40:01+03:00",
    "2026-11-24T15:40:03+03:00",
    "2026-11-24T15:41:17+03:00",
    "2026-11-24T15:41:19+03:00",
    "2026-11-24T15:43:30+03:00",
    "2026-11-24T15:43:32+03:00",
    "2026-11-24T15:45:31+03:00",
    "2026-11-24T15:45:33+03:00",
    "2026-11-24T15:50:11+03:00",
    "2026-11-24T15:50:13+03:00",
    "2026-11-24T15:53:10+03:00",
    "2026-11-24T15:53:12+03:00",
    "2026-11-24T15:53:14+03:00",
    "2026-11-24T15:53:15+03:00",
    "2026-11-24T15:53:53+03:00",
    "2026-11-25T11:26:37+03:00",
    "2026-11-25T11:27:18+03:00",
    "2026-11-25T11:27:19+03:00",
    "2026-11-25T11:28:35+03:00",
    "2026-11-25T11:28:36+03:00",
    "2026-11-25T11:28:37+03:00"
  ],
  "rev": 37,
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
    },
    {
      "t": "2026-11-24T15:21:33+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:21:35+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-24T15:40:01+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "done",
      "tests": {
        "passed": 371,
        "failed": 0
      }
    },
    {
      "t": "2026-11-24T15:40:03+03:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:41:17+03:00",
      "k": "add",
      "key": "concerns",
      "n": 1
    },
    {
      "t": "2026-11-24T15:41:19+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-24T15:43:30+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-24T15:43:32+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-24T15:45:31+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-24T15:45:33+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-24T15:50:11+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 35,
        "failed": 0
      }
    },
    {
      "t": "2026-11-24T15:50:13+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "review"
    },
    {
      "t": "2026-11-24T15:53:10+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 35,
        "failed": 0
      }
    },
    {
      "t": "2026-11-24T15:53:12+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-24T15:53:14+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 8,
      "matched": 7
    },
    {
      "t": "2026-11-24T15:53:15+03:00",
      "k": "tests",
      "passed": 372,
      "failed": 0
    },
    {
      "t": "2026-11-24T15:53:53+03:00",
      "k": "finish",
      "result": "Тема «Стекло» работает в отдельной ветке и открыта на локальном стенде."
    },
    {
      "t": "2026-11-25T11:26:37+03:00",
      "k": "reopen"
    },
    {
      "t": "2026-11-25T11:27:18+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "skip",
      "note": "Объём и эталон формы заданы в правке и скриншотах"
    },
    {
      "t": "2026-11-25T11:27:19+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 14
    },
    {
      "t": "2026-11-25T11:27:19+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-25T11:28:35+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 3,
      "fixed": 3,
      "deferred": 0
    },
    {
      "t": "2026-11-25T11:28:36+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-25T11:28:37+03:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-25T11:28:37+03:00",
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
      "status": "done"
    },
    {
      "id": "R02",
      "text": "«перенесем этот интерфейс на наше приложение»",
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«чтоб можно было быстро менять интерфейс»",
      "status": "done"
    },
    {
      "id": "R04",
      "text": "«и кнопки прозрачность»",
      "status": "done"
    },
    {
      "id": "R05",
      "text": "«и анимации»",
      "status": "done"
    },
    {
      "id": "R06",
      "text": "«и графики»",
      "status": "done"
    },
    {
      "id": "R07",
      "text": "«только цвета наши»",
      "status": "done"
    },
    {
      "id": "R08",
      "text": "«на десктоп и на мобильной версии»",
      "status": "done"
    },
    {
      "id": "R09",
      "text": "«в работе с прайсом остались старые элементы интерфейса»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«таблицы везде были одним элементом, меняли может столбцы наполняемость но это была одна сущность»",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«тоже самое с кнопками»",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«везде сделаем одинаковое скругление, чтоб был не овал»",
      "status": "in-ticket"
    },
    {
      "id": "R13",
      "text": "«а как все категории или то как выделен раздел прайсы работа с прайсом. на другом снимке тоже есть скруглённые ближе к овалам»",
      "status": "in-ticket"
    },
    {
      "id": "R14",
      "text": "«в остатках на кнопке раскрывающегося списка стрелочка вниз слишком близко к краю»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-25T11:27:19+03:00",
      "open": 0,
      "total": 14
    },
    "G2": {
      "ok": true,
      "at": "2026-11-25T11:28:35+03:00",
      "found": 3,
      "fixed": 3,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-25T11:28:37+03:00",
      "problems": 0
    }
  },
  "result": null,
  "report": [
    "Тесты auth 266, settings 104, линтер, типы, production build и браузерная проверка прошли. Предпросмотр на отдельных локальных данных."
  ]
}
