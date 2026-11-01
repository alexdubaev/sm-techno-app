window.STATE =
{
  "version": 2,
  "slug": "ios-shortcuts-stock-export",
  "dir": "2026-11-01-ios-shortcuts-stock-export--wip",
  "title": "СМ ТЕХНО: команды iPhone и Excel по шаблону КП",
  "mode": "semi",
  "depth": "normal",
  "tier": "T1",
  "briefFile": "2026-11-01-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "8f8e7689541dc022fb8cc11d320bdc236a043f35",
  "startedAt": "2026-11-01T10:17:16+03:00",
  "updatedAt": "2026-11-01T10:34:48+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-01T10:17:16+03:00",
      "finishedAt": "2026-11-01T10:19:56+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-01T10:19:56+03:00",
      "finishedAt": "2026-11-01T10:19:57+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-01T10:19:57+03:00",
      "finishedAt": "2026-11-01T10:31:07+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-01T10:31:07+03:00",
      "finishedAt": "2026-11-01T10:34:46+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-01T10:34:46+03:00"
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
    "total": 7,
    "done": 0,
    "inTicket": 7,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Второй Excel по реальному шаблону КП",
      "requirements": [
        "R04",
        "R05",
        "R06",
        "R07"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "stock_sync_web/stock_valuation.py",
        "stock_sync_web/commercial_offers.py",
        "sm-techno-web/lib/stock-valuation-api.ts",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "tests/stock_valuation/",
        "tests/test_commercial_offers.py",
        "sm-techno-web/tests/stock/",
        "sm-techno-web/tests/e2e/stock-valuation.spec.ts"
      ],
      "review": "нет — одна итоговаяfreshsecurityreview включая pricing/file-boundary; не повторятьreviewформально",
      "model": "сильная — userTerra6.1",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "02",
      "title": "Личное подключение iPhone и прямая выдача Excel",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "stock_sync_web/database.py",
        "stock_sync_api.py",
        "stock_sync_web/shortcut_devices.py",
        "stock_sync_web/shortcut_routes.py",
        "scripts/vps_restore.py",
        "sm-techno-web/lib/stock-shortcuts-api.ts",
        "sm-techno-web/components/stock/stock-shortcuts-panel.tsx",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "tests/shortcuts/",
        "tests/auth/",
        "tests/test_auth_session_persistence.py",
        "tests/test_vps_restore.py",
        "sm-techno-web/tests/stock/",
        "docs/ios-shortcuts.md",
        "assets/shortcuts/"
      ],
      "review": "нет — одна итоговаяfreshsecurityreviewauth/schema/restore/files без повторного whole review",
      "model": "сильная — userTerra6.1",
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
      "Fresh independent rawbrief/spec coveragePASS8/8; missing0/half0"
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-01T10:17:16+03:00",
    "2026-11-01T10:17:18+03:00",
    "2026-11-01T10:19:55+03:00",
    "2026-11-01T10:19:56+03:00",
    "2026-11-01T10:19:57+03:00",
    "2026-11-01T10:31:06+03:00",
    "2026-11-01T10:31:07+03:00",
    "2026-11-01T10:31:08+03:00",
    "2026-11-01T10:34:46+03:00",
    "2026-11-01T10:34:47+03:00",
    "2026-11-01T10:34:48+03:00"
  ],
  "rev": 15,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-01T10:19:57+03:00",
      "to": "2026-11-01T10:31:06+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-01T10:17:16+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-01T10:17:18+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-11-01T10:19:56+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-01T10:19:57+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-01T10:19:57+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Три решения: stateless template Excel или durable CP; наличие без цены; Shortcut получает Excel либо продолжает в приложении. Защищённый API план будет подтверждён до кода."
    },
    {
      "t": "2026-11-01T10:31:06+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-01T10:31:07+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 7
    },
    {
      "t": "2026-11-01T10:31:07+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-01T10:31:08+03:00",
      "k": "tier",
      "v": "T1"
    },
    {
      "t": "2026-11-01T10:34:46+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-11-01T10:34:46+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-01T10:34:47+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-01T10:34:48+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«поддержка команд была на сервере»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«настрою один раз ... передаю на другой телефон»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«напиши ... по шагово, как настроить такую команду»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«два варианта скачивания Excel ... один вот простой который уже реализован»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«второй, обернутый в шаблон нашего коммерческого предложения»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«только те позиции, которые есть на складах ... не будет пустых ... прочерков»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«цена ... то количество, которое есть у нас на складе»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-01T10:31:07+03:00",
      "open": 0,
      "total": 7
    },
    "G2": {
      "ok": true,
      "at": "2026-11-01T10:34:46+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-01T10:34:48+03:00",
      "problems": 0
    }
  },
  "result": null
}
