window.STATE =
{
  "version": 2,
  "slug": "admin-dashboard",
  "dir": "2026-11-01-admin-dashboard--wip",
  "title": "СМ ТЕХНО: дашборд администратора",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-01-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-01T21:11:05+03:00",
  "updatedAt": "2026-11-01T21:33:27+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-01T21:11:05+03:00",
      "finishedAt": "2026-11-01T21:11:07+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-01T21:11:07+03:00",
      "finishedAt": "2026-11-01T21:11:37+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-01T21:11:37+03:00",
      "finishedAt": "2026-11-01T21:31:34+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-01T21:31:34+03:00",
      "finishedAt": "2026-11-01T21:33:03+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-01T21:33:03+03:00"
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
    "total": 13,
    "done": 0,
    "inTicket": 13,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Обзор компании и расход DeepSeek",
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
        "R10",
        "R11",
        "R12",
        "R13i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "stock_sync_web/",
        "stock_sync_api.py",
        "sm-techno-web/app/",
        "sm-techno-web/components/",
        "sm-techno-web/lib/",
        "sm-techno-web/tests/",
        "tests/",
        "docs/admin-dashboard.md"
      ],
      "review": "нет",
      "model": "сильная — Terra 6.1 по выбору владельца",
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
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-01T21:11:05+03:00",
    "2026-11-01T21:11:07+03:00",
    "2026-11-01T21:11:36+03:00",
    "2026-11-01T21:11:37+03:00",
    "2026-11-01T21:12:12+03:00",
    "2026-11-01T21:15:11+03:00",
    "2026-11-01T21:26:16+03:00",
    "2026-11-01T21:31:33+03:00",
    "2026-11-01T21:31:34+03:00",
    "2026-11-01T21:33:02+03:00",
    "2026-11-01T21:33:03+03:00",
    "2026-11-01T21:33:04+03:00",
    "2026-11-01T21:33:05+03:00",
    "2026-11-01T21:33:26+03:00",
    "2026-11-01T21:33:27+03:00"
  ],
  "rev": 17,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-01T21:12:12+03:00",
      "to": "2026-11-01T21:15:11+03:00"
    },
    {
      "kind": "plan",
      "from": "2026-11-01T21:15:11+03:00",
      "to": "2026-11-01T21:31:33+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-01T21:11:05+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-01T21:11:07+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-01T21:11:36+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-11-01T21:11:37+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-01T21:12:12+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Уточняем границу OData и смысл лимитов DeepSeek; исследование существующих продаж продолжается"
    },
    {
      "t": "2026-11-01T21:15:11+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-01T21:15:11+03:00",
      "k": "ask",
      "kind": "plan",
      "note": "Ожидаются решения брифинга и подтверждение добавочных API/числового журнала DeepSeek по protected-plan.md; код не менялся"
    },
    {
      "t": "2026-11-01T21:26:16+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-01T21:31:33+03:00",
      "k": "answered",
      "kind": "plan"
    },
    {
      "t": "2026-11-01T21:31:34+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 13,
      "total": 13
    },
    {
      "t": "2026-11-01T21:31:34+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-01T21:33:02+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-11-01T21:33:03+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-01T21:33:04+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-01T21:33:04+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-01T21:33:05+03:00",
      "k": "gate",
      "g": "G3",
      "ok": false,
      "problems": 1
    },
    {
      "t": "2026-11-01T21:33:26+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-01T21:33:27+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«экран с дашбордом для администратора»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«стартовый экран у администратора должен показывать все продажи компании»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«всех менеджеров»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«экран продаж для админа все таки был, потому что теоретически он может продавать, только это экран не стартовый»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«процент выполнения плана если он есть»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«график продаж за месяц»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«за неделю»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«за квартал»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«за год»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«Предусмотреть что это будет подгружаться через odata»",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«оставить ручную загрузку продаж которая уже реализована»",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«график использования наших лимитов api DeepSeek»",
      "status": "in-ticket"
    },
    {
      "id": "R13i",
      "text": "«(подразумевается) стартовый экран менеджера сохраняется, общая аналитика доступна только администратору»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-01T21:31:34+03:00",
      "open": 13,
      "total": 13
    },
    "G2": {
      "ok": true,
      "at": "2026-11-01T21:33:02+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-01T21:33:27+03:00",
      "problems": 0
    }
  },
  "result": null,
  "report": [
    "Уточнение владельца: DeepSeek Flash уже рабочий провайдер, ранее проверен реальными вызовами. Новая задача добавляет только аналитику расхода; без повторной миграции/настройки ключа/деплоя."
  ]
}
