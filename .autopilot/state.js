window.STATE =
{
  "version": 2,
  "slug": "ios-shortcuts-stock-export",
  "dir": "2026-11-01-ios-shortcuts-stock-export--wip",
  "title": "СМ ТЕХНО: мобильная расценка и Android",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-01-android-intake-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "7d42a9cd3ac79826cedaa9bbd001acd68c129061",
  "startedAt": "2026-11-01T10:17:16+03:00",
  "updatedAt": "2026-11-01T18:50:13+03:00",
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
      "startedAt": "2026-11-01T16:49:33+03:00",
      "finishedAt": "2026-11-01T16:55:13+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-01T16:55:13+03:00",
      "finishedAt": "2026-11-01T16:55:13+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-01T16:55:13+03:00",
      "finishedAt": "2026-11-01T17:05:27+03:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-11-01T17:05:27+03:00",
      "finishedAt": "2026-11-01T18:12:51+03:00"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-11-01T18:12:51+03:00",
      "finishedAt": "2026-11-01T18:35:03+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-11-01T18:23:18+03:00",
      "finishedAt": "2026-11-01T18:35:03+03:00"
    },
    {
      "id": "final",
      "status": "active",
      "startedAt": "2026-11-01T18:35:03+03:00"
    }
  ],
  "requirements": {
    "total": 15,
    "done": 13,
    "inTicket": 2,
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
      "status": "done",
      "startedAt": "2026-11-01T10:39:35+03:00",
      "finishedAt": "2026-11-01T10:48:04+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 27,
        "failed": 0
      },
      "commit": "e1bb5e6"
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
        "tests/test_vps_backup_restore.py",
        "sm-techno-web/tests/stock/",
        "docs/ios-shortcuts.md",
        "assets/shortcuts/"
      ],
      "review": "нет — одна итоговаяfreshsecurityreviewauth/schema/restore/files без повторного whole review",
      "model": "сильная — userTerra6.1",
      "status": "done",
      "startedAt": "2026-11-01T10:48:05+03:00",
      "finishedAt": "2026-11-01T11:00:03+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 47,
        "failed": 0
      },
      "commit": "HEAD"
    },
    {
      "id": "03",
      "title": "Общий ввод в Остатках и Android share",
      "requirements": [
        "R08",
        "R09",
        "R10",
        "R11",
        "R12i",
        "R13i",
        "R14"
      ],
      "blockedBy": [
        "02"
      ],
      "wave": 4,
      "zone": [
        "sm-techno-web/app/manifest.ts",
        "sm-techno-web/app/layout.tsx",
        "sm-techno-web/app/icon-192.png/",
        "sm-techno-web/app/stock-share/",
        "sm-techno-web/public/stock-share/",
        "sm-techno-web/next.config.ts",
        "sm-techno-web/components/stock-page.tsx",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "sm-techno-web/components/stock/stock-valuation-entry.tsx",
        "sm-techno-web/components/stock/stock-share-session-bridge.tsx",
        "sm-techno-web/lib/stock-share.ts",
        "sm-techno-web/lib/stock-intake-source.ts",
        "sm-techno-web/tests/stock/",
        "sm-techno-web/tests/e2e/stock-valuation.spec.ts",
        "sm-techno-web/tests/e2e/stock-share.spec.ts",
        "docs/android-stock-share.md"
      ],
      "review": "нет — одна итоговаяfreshsecurityreview всего нового slice, без дублирующего pointreview",
      "model": "сильная — ранее выбранная владельцем Terra6.1",
      "status": "done",
      "startedAt": "2026-11-01T18:12:51+03:00",
      "finishedAt": "2026-11-01T18:35:03+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 73,
        "failed": 0
      },
      "commit": "11f9f24416fd"
    },
    {
      "id": "04",
      "title": "Свёрнутый блок расценки и ровные кнопки",
      "requirements": [
        "R15"
      ],
      "blockedBy": [
        "03",
        "02"
      ],
      "wave": 6,
      "zone": [
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "sm-techno-web/tests/stock/",
        "sm-techno-web/tests/e2e/stock-valuation.spec.ts",
        "sm-techno-web/tests/e2e/stock-share.spec.ts"
      ],
      "review": "нет — known bounded UI steering без protected behavior change, owner smallchangepolicy",
      "model": "сильная — existingTerra6.1context",
      "status": "done",
      "startedAt": "2026-11-01T18:44:38+03:00",
      "finishedAt": "2026-11-01T18:50:12+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 5,
        "failed": 0
      },
      "commit": "0becd450afd5"
    },
    {
      "id": "F1",
      "title": "Исправления независимого ревью",
      "requirements": [
        "R02",
        "R05",
        "R07"
      ],
      "blockedBy": [],
      "wave": 3,
      "zone": [
        "stock_sync_web/stock_valuation.py",
        "tests/stock_valuation/test_valuation.py",
        "sm-techno-web/components/stock/stock-shortcuts-panel.tsx",
        "sm-techno-web/tests/stock/stock-shortcuts.integration.test.tsx"
      ],
      "review": "да — узкая проверка закрытия подтверждённых условий, не повторный whole review",
      "model": "сильная — userTerra6.1",
      "status": "done",
      "startedAt": "2026-11-01T11:01:42+03:00",
      "finishedAt": "2026-11-01T11:04:04+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 13,
        "failed": 0
      },
      "commit": "HEAD"
    },
    {
      "id": "F2",
      "title": "Устранить конкретные нарушения приватной передачи Android",
      "requirements": [
        "R08",
        "R11",
        "R12i",
        "R13i"
      ],
      "blockedBy": [
        "03"
      ],
      "wave": 5,
      "zone": [
        "sm-techno-web/public/stock-share/worker.js",
        "sm-techno-web/lib/stock-share.ts",
        "sm-techno-web/components/stock/stock-share-session-bridge.tsx",
        "sm-techno-web/components/stock/stock-valuation-entry.tsx",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "sm-techno-web/next.config.ts",
        "sm-techno-web/tests/stock/",
        "sm-techno-web/tests/e2e/stock-share.spec.ts",
        "docs/android-stock-share.md"
      ],
      "review": "нет — одно whole-review завершено; после bounded fixes узкие поведенческие closure checks по ownerpolicy, без повторного whole-review",
      "model": "сильная — Terra6.1",
      "status": "done",
      "startedAt": "2026-11-01T18:25:49+03:00",
      "finishedAt": "2026-11-01T18:35:03+03:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 2,
        "failed": 0
      },
      "commit": "8484079e6af1"
    }
  ],
  "tests": {
    "passed": 5,
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
      "G2: independent reader checked14 requirement groups, missing0/half0/extra0; physicalgates explicitlyopen."
    ]
  },
  "concerns": [],
  "blind": {
    "checked": 7,
    "matched": 5,
    "mismatches": [
      "R11: independent browser file/text accepted, physical Android OS share remains NOTRUN",
      "R14: signed bytes/download name verified, iPhone imported name remains NOTRUN"
    ]
  },
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
    "2026-11-01T10:34:48+03:00",
    "2026-11-01T10:36:40+03:00",
    "2026-11-01T10:36:49+03:00",
    "2026-11-01T10:39:33+03:00",
    "2026-11-01T10:39:34+03:00",
    "2026-11-01T10:39:35+03:00",
    "2026-11-01T10:48:04+03:00",
    "2026-11-01T10:48:05+03:00",
    "2026-11-01T10:57:10+03:00",
    "2026-11-01T11:00:03+03:00",
    "2026-11-01T11:00:04+03:00",
    "2026-11-01T11:01:41+03:00",
    "2026-11-01T11:01:42+03:00",
    "2026-11-01T11:03:20+03:00",
    "2026-11-01T11:04:04+03:00",
    "2026-11-01T11:06:51+03:00",
    "2026-11-01T11:35:26+03:00",
    "2026-11-01T11:35:27+03:00",
    "2026-11-01T12:52:49+03:00",
    "2026-11-01T15:09:34+03:00",
    "2026-11-01T15:09:35+03:00",
    "2026-11-01T16:00:20+03:00",
    "2026-11-01T16:49:33+03:00",
    "2026-11-01T16:49:34+03:00",
    "2026-11-01T16:55:13+03:00",
    "2026-11-01T16:58:27+03:00",
    "2026-11-01T17:05:26+03:00",
    "2026-11-01T17:05:27+03:00",
    "2026-11-01T17:09:34+03:00",
    "2026-11-01T17:10:17+03:00",
    "2026-11-01T18:12:48+03:00",
    "2026-11-01T18:12:49+03:00",
    "2026-11-01T18:12:51+03:00",
    "2026-11-01T18:23:18+03:00",
    "2026-11-01T18:25:49+03:00",
    "2026-11-01T18:35:03+03:00",
    "2026-11-01T18:44:38+03:00",
    "2026-11-01T18:47:09+03:00",
    "2026-11-01T18:47:10+03:00",
    "2026-11-01T18:50:12+03:00",
    "2026-11-01T18:50:13+03:00"
  ],
  "rev": 74,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-01T10:19:57+03:00",
      "to": "2026-11-01T10:31:06+03:00"
    },
    {
      "kind": "plan",
      "from": "2026-11-01T10:36:49+03:00",
      "to": "2026-11-01T10:39:33+03:00"
    },
    {
      "kind": "action",
      "from": "2026-11-01T11:35:27+03:00",
      "to": "2026-11-01T16:49:33+03:00"
    },
    {
      "kind": "plan",
      "from": "2026-11-01T17:10:17+03:00",
      "to": "2026-11-01T18:12:48+03:00"
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
    },
    {
      "t": "2026-11-01T10:36:49+03:00",
      "k": "ask",
      "kind": "plan",
      "note": "Подтвердить конкретный API/schema/auth/restore plan по AGENTS.md: scopedphonecredentials, registry,2native endpoints,directExcel,restore revokesdevicekeys. Product forks all answered; G2/G3PASS, код не начат."
    },
    {
      "t": "2026-11-01T10:39:33+03:00",
      "k": "answered",
      "kind": "plan"
    },
    {
      "t": "2026-11-01T10:39:34+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-01T10:39:35+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T10:48:04+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "done",
      "tests": {
        "passed": 27,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T10:48:05+03:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T10:57:10+03:00",
      "k": "tickets",
      "n": 2
    },
    {
      "t": "2026-11-01T11:00:03+03:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "done",
      "tests": {
        "passed": 47,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T11:00:04+03:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-01T11:01:41+03:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-01T11:01:42+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T11:03:20+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 7,
      "matched": 4
    },
    {
      "t": "2026-11-01T11:04:04+03:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 13,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T11:06:51+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-01T11:35:26+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-01T11:35:27+03:00",
      "k": "tests",
      "passed": 739,
      "failed": 0
    },
    {
      "t": "2026-11-01T11:35:27+03:00",
      "k": "ask",
      "kind": "action",
      "note": "Сервер96faf42 выпущен и проверен; нужна физическая проверка владельцем первой команды iPhone и безопасного распространения. HTTP/browser не являются iOS PASS."
    },
    {
      "t": "2026-11-01T12:52:49+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-01T15:09:34+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-01T15:09:35+03:00",
      "k": "ask",
      "kind": "action",
      "note": "На iPhone: Настройки приложения → Команды iPhone → создать подключение → скопировать настройку → установить команду и вставить настройку → передать файл и проверить Excel."
    },
    {
      "t": "2026-11-01T16:00:20+03:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-01T16:00:20+03:00",
      "k": "ask",
      "kind": "action",
      "note": "Перезапустить PWA → скопировать настройку с подтверждением → удалить старую sm-techno-stock в Командах → установить новую/вставить настройку → проверить файл и Excel на iPhone."
    },
    {
      "t": "2026-11-01T16:49:33+03:00",
      "k": "answered",
      "kind": "action"
    },
    {
      "t": "2026-11-01T16:49:33+03:00",
      "k": "reopen"
    },
    {
      "t": "2026-11-01T16:49:34+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-11-01T16:49:34+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-01T16:55:13+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-01T16:55:13+03:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 13
    },
    {
      "t": "2026-11-01T16:55:13+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-01T16:58:27+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-01T17:05:26+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-11-01T17:05:27+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-01T17:09:34+03:00",
      "k": "tickets",
      "n": 4
    },
    {
      "t": "2026-11-01T17:09:34+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-01T17:10:17+03:00",
      "k": "ask",
      "kind": "plan",
      "note": "Новый OS share вход и privatefile/sessionhandoff: preparedandroidprotectedplan, требуется подтверждение до productcode."
    },
    {
      "t": "2026-11-01T18:12:48+03:00",
      "k": "answered",
      "kind": "plan"
    },
    {
      "t": "2026-11-01T18:12:48+03:00",
      "k": "tickets",
      "n": 4
    },
    {
      "t": "2026-11-01T18:12:49+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-01T18:12:51+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-01T18:12:51+03:00",
      "k": "ticket",
      "ids": [
        "03"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T18:23:18+03:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-01T18:25:49+03:00",
      "k": "tickets",
      "n": 5
    },
    {
      "t": "2026-11-01T18:25:49+03:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T18:35:03+03:00",
      "k": "ticket",
      "ids": [
        "03"
      ],
      "act": "done",
      "tests": {
        "passed": 73,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T18:35:03+03:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "done",
      "tests": {
        "passed": 2,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T18:35:03+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-01T18:35:03+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 7,
      "matched": 5
    },
    {
      "t": "2026-11-01T18:44:38+03:00",
      "k": "tickets",
      "n": 6
    },
    {
      "t": "2026-11-01T18:44:38+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-01T18:44:38+03:00",
      "k": "ticket",
      "ids": [
        "04"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-01T18:47:09+03:00",
      "k": "ticket",
      "ids": [
        "04"
      ],
      "act": "done",
      "tests": {
        "passed": 5,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T18:47:10+03:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-01T18:47:10+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 8,
      "matched": 6
    },
    {
      "t": "2026-11-01T18:47:10+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-01T18:50:12+03:00",
      "k": "ticket",
      "ids": [
        "04"
      ],
      "act": "done",
      "tests": {
        "passed": 5,
        "failed": 0
      }
    },
    {
      "t": "2026-11-01T18:50:13+03:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 7,
      "matched": 5
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«поддержка команд была на сервере»",
      "status": "done"
    },
    {
      "id": "R02",
      "text": "«настрою один раз ... передаю на другой телефон»",
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«напиши ... по шагово, как настроить такую команду»",
      "status": "done"
    },
    {
      "id": "R04",
      "text": "«два варианта скачивания Excel ... один вот простой который уже реализован»",
      "status": "done"
    },
    {
      "id": "R05",
      "text": "«второй, обернутый в шаблон нашего коммерческого предложения»",
      "status": "done"
    },
    {
      "id": "R06",
      "text": "«только те позиции, которые есть на складах ... не будет пустых ... прочерков»",
      "status": "done"
    },
    {
      "id": "R07",
      "text": "«цена ... то количество, которое есть у нас на складе»",
      "status": "done"
    },
    {
      "id": "R08",
      "text": "«реализуем экран, как ты придумал» — «Вставить список»",
      "status": "done"
    },
    {
      "id": "R09",
      "text": "«реализуем экран, как ты придумал» — «Фото / скриншот»",
      "status": "done"
    },
    {
      "id": "R10",
      "text": "«реализуем экран, как ты придумал» — «Выбрать файл»",
      "status": "done"
    },
    {
      "id": "R11",
      "text": "«добавим поддержку Андроида»",
      "status": "in-ticket"
    },
    {
      "id": "R12i",
      "text": "(подразумевается) вложение получает только текущий авторизованный менеджер",
      "status": "done"
    },
    {
      "id": "R13i",
      "text": "(подразумевается) ошибки передачи не подменяют файл названием и дают путь восстановления",
      "status": "done"
    },
    {
      "id": "R14",
      "text": "«команда будет называться Поделиться СМ ТЕХНО»; затем «Не тогда делай как проще, без переименования»",
      "status": "in-ticket"
    },
    {
      "id": "R15",
      "text": "«новый экран ... по умолчанию свернутым ... свернуть и развернуть ... кнопки ... одинакового размера ... равномерно ... по две в столбик»",
      "status": "done"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-01T16:55:13+03:00",
      "open": 0,
      "total": 13
    },
    "G2": {
      "ok": true,
      "at": "2026-11-01T17:05:26+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-01T18:47:10+03:00",
      "problems": 0
    },
    "G4": {
      "ok": false,
      "at": "2026-11-01T18:50:13+03:00",
      "checked": 7,
      "matched": 5
    }
  },
  "result": null,
  "report": [
    "Physical iPhone installation/import/share/Quick Look NOT RUN; only readable workflow provided, no signed Shortcut or iCloud link published.",
    "G02: подключение iPhone перенесено в Настройки, версия8498dc4 установлена. Физическая проверка самой команды на iPhone остаётся отдельным действием.",
    "Готовая подписанная команда опубликована; сервер и скачивание проверены. Первый запуск на iPhone ещё не проверен.",
    "Исправление If и подтверждение копирования опубликованы. Прежний файл не прошёл проверку на iPhone; новый требует переустановки и проверки."
  ]
}
