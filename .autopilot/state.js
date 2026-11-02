window.STATE =
{
  "version": 2,
  "slug": "documents-ux",
  "dir": "2026-11-02-documents-ux--wip",
  "title": "СМ ТЕХНО: удобный интерфейс Документов и меню",
  "mode": "semi",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-02-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.claude/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-02T14:06:02+03:00",
  "updatedAt": "2026-11-02T14:17:27+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-02T14:06:02+03:00",
      "finishedAt": "2026-11-02T14:06:28+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-02T14:06:28+03:00",
      "finishedAt": "2026-11-02T14:07:13+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-02T14:07:13+03:00",
      "finishedAt": "2026-11-02T14:10:16+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-02T14:10:16+03:00",
      "finishedAt": "2026-11-02T14:16:53+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-02T14:16:53+03:00"
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
      "title": "Удобные Документы и плавное меню",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09i",
        "R10i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "sm-techno-web/app/globals.css",
        "sm-techno-web/components/documents/",
        "sm-techno-web/components/crm/document-extraction-panel.tsx",
        "sm-techno-web/components/crm/requisites-contract-form.tsx",
        "sm-techno-web/components/crm/client-documents-panel.tsx",
        "sm-techno-web/components/app-shell.tsx",
        "sm-techno-web/tests/",
        "tests/test_documents_navigation_ui.py"
      ],
      "review": "нет",
      "model": "сильная",
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
    "2026-11-02T14:06:02+03:00",
    "2026-11-02T14:06:28+03:00",
    "2026-11-02T14:06:42+03:00",
    "2026-11-02T14:07:13+03:00",
    "2026-11-02T14:07:15+03:00",
    "2026-11-02T14:09:52+03:00",
    "2026-11-02T14:10:16+03:00",
    "2026-11-02T14:16:52+03:00",
    "2026-11-02T14:16:53+03:00",
    "2026-11-02T14:16:54+03:00",
    "2026-11-02T14:17:26+03:00",
    "2026-11-02T14:17:27+03:00"
  ],
  "rev": 13,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-02T14:07:15+03:00",
      "to": "2026-11-02T14:09:52+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-02T14:06:02+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-02T14:06:28+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-02T14:07:13+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-02T14:07:15+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "три вопроса — автозапуск распознавания, поведение меню, хвосты прошлой сборки"
    },
    {
      "t": "2026-11-02T14:09:52+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-02T14:10:16+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 10,
      "total": 10
    },
    {
      "t": "2026-11-02T14:10:16+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-02T14:16:52+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    {
      "t": "2026-11-02T14:16:53+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-02T14:16:54+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-02T14:17:26+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-02T14:17:27+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«к серверной части и безопасности у меня на данный момент нет вопросов»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«меня не устраивает ui/uix то как это реализовано, посмотри как это можно улучшить» (раздел Документы: загрузка реквизитов и распознавание)",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«чтоб меньше бесполезных нажатий»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«кнопки чтоб были такие как в проекте, желтый»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«было показано что я нажимаю, а то нет реакции»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«сделай приятный и удобный интерфейс»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«проверь главное меню, там при нажатии не всегда подсвечивается выбранный раздел, только когда я перейду в его подраздел»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«хочется чтоб подразделы открывались плавно»",
      "status": "in-ticket"
    },
    {
      "id": "R09i",
      "text": "(подразумевается) существующие сценарии Документов (распознавание, проверка, привязка к клиенту, создание договора/спецификации, архив) продолжают работать",
      "status": "in-ticket"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) интерфейс удобен и на мобильном, и на десктопе",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-02T14:10:16+03:00",
      "open": 10,
      "total": 10
    },
    "G2": {
      "ok": true,
      "at": "2026-11-02T14:16:52+03:00",
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-02T14:17:27+03:00",
      "problems": 0
    }
  },
  "result": null
}
