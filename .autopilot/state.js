window.STATE =
{
  "version": 2,
  "slug": "local-document-workflows",
  "dir": "2026-10-30-local-document-workflows--wip",
  "title": "СМ ТЕХНО: остатки, договор и спецификация по действию",
  "mode": "semi",
  "depth": "normal",
  "tier": "T2",
  "briefFile": "2026-10-30-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Alexandr/.codex/skills/autopilot",
  "baseCommit": "a5f78ceb287823374f4bf60048d8d6dda0e42ea4",
  "startedAt": "2026-10-30T18:23:03+03:00",
  "updatedAt": "2026-10-30T19:41:09+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-10-30T18:23:03+03:00",
      "finishedAt": "2026-10-30T18:23:04+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-10-30T18:23:04+03:00",
      "finishedAt": "2026-10-30T18:25:49+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-10-30T18:25:49+03:00",
      "finishedAt": "2026-10-30T18:29:48+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-10-30T18:29:48+03:00",
      "finishedAt": "2026-10-30T19:40:23+03:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-10-30T19:40:23+03:00",
      "finishedAt": "2026-10-30T19:41:09+03:00"
    },
    {
      "id": "build",
      "status": "active",
      "startedAt": "2026-10-30T19:41:09+03:00"
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
    "total": 22,
    "done": 0,
    "inTicket": 21,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 1
  },
  "tickets": [
    {
      "id": "01",
      "title": "Безопасно перенести готовую основу",
      "requirements": [
        "R03",
        "R04",
        "R07",
        "R08",
        "R10",
        "G08"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "reviewed feature TREE from182bc62 (58paths excluding.autopilot)",
        "stock_sync_api.py",
        "sm-techno-web/lib/api.ts",
        "new empty routermodules stock_sync_web/stock_valuation.py and document_workflows.py"
      ],
      "review": "нет — один итоговый review по owner policy",
      "model": "сильная",
      "status": "in-progress",
      "retries": 0,
      "repairs": 0,
      "startedAt": "2026-10-30T19:41:09+03:00"
    },
    {
      "id": "02",
      "title": "Временная расценка в Остатках",
      "requirements": [
        "R01",
        "R02",
        "R05",
        "R06",
        "G04",
        "G05",
        "G06",
        "G07"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "stock_sync_web/stock_valuation.py",
        "sm-techno-web/components/stock-page.tsx",
        "sm-techno-web/components/stock/stock-valuation-panel.tsx",
        "sm-techno-web/lib/stock-valuation-api.ts",
        "tests/stock_valuation/",
        "sm-techno-web/tests/stock/stock-valuation.integration.test.tsx",
        "sm-techno-web/tests/e2e/stock-valuation.spec.ts"
      ],
      "review": "нет — один итоговый review по owner policy",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "03",
      "title": "Документы по действию и связь с полной CRM-карточкой",
      "requirements": [
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
        "G01",
        "G02",
        "G04"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "stock_sync_web/document_workflows.py",
        "stock_sync_web/assistant_service.py",
        "stock_sync_web/assistant_repository.py",
        "sm-techno-web/app/documents/",
        "sm-techno-web/components/documents/",
        "sm-techno-web/components/crm/",
        "sm-techno-web/components/crm-workspace.tsx",
        "sm-techno-web/lib/document-workflows-api.ts",
        "tests/document_assistant/",
        "sm-techno-web/tests/crm/",
        "sm-techno-web/tests/e2e/client-documents.spec.ts"
      ],
      "review": "нет — один итоговый review по owner policy",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "04",
      "title": "Проверить приложение и возврат к прежней локальной версии",
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
        "R13",
        "R14",
        "G01",
        "G02",
        "G04",
        "G05",
        "G06",
        "G07",
        "G08"
      ],
      "blockedBy": [
        "02",
        "03"
      ],
      "wave": 3,
      "zone": [
        "scripts/local_workflows/",
        "tests/local_workflows/",
        "docs/local-workflows-rollback.md",
        "isolated owned runtime/demo artifacts outside repo; no product logic outside confirmedfix via lead"
      ],
      "review": "нет — один итоговый review по owner policy",
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
    "found": 0,
    "fixed": 0,
    "deferred": 0,
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-10-30T18:23:03+03:00",
    "2026-10-30T18:23:04+03:00",
    "2026-10-30T18:25:48+03:00",
    "2026-10-30T18:25:49+03:00",
    "2026-10-30T18:29:48+03:00",
    "2026-10-30T18:41:30+03:00",
    "2026-10-30T18:42:13+03:00",
    "2026-10-30T18:44:48+03:00",
    "2026-10-30T18:52:07+03:00",
    "2026-10-30T19:03:08+03:00",
    "2026-10-30T19:36:18+03:00",
    "2026-10-30T19:40:22+03:00",
    "2026-10-30T19:40:23+03:00",
    "2026-10-30T19:40:24+03:00",
    "2026-10-30T19:40:25+03:00",
    "2026-10-30T19:41:01+03:00",
    "2026-10-30T19:41:02+03:00",
    "2026-10-30T19:41:08+03:00",
    "2026-10-30T19:41:09+03:00"
  ],
  "rev": 27,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-10-30T18:25:49+03:00",
      "to": "2026-10-30T18:29:48+03:00"
    },
    {
      "kind": "spec",
      "from": "2026-10-30T18:42:13+03:00",
      "to": "2026-10-30T18:52:07+03:00"
    },
    {
      "kind": "spec",
      "from": "2026-10-30T19:03:08+03:00",
      "to": "2026-10-30T19:36:18+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-10-30T18:23:03+03:00",
      "k": "init"
    },
    {
      "t": "2026-10-30T18:23:04+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-10-30T18:25:49+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-10-30T18:25:49+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Определение CRM-клиента из файла, форматы счёта, необходимость клиента для КП после складского поиска; product code пока не менялся."
    },
    {
      "t": "2026-10-30T18:29:48+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-10-30T18:29:48+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 17,
      "total": 17
    },
    {
      "t": "2026-10-30T18:29:48+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-10-30T18:41:30+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 5,
      "fixed": 5,
      "deferred": 0
    },
    {
      "t": "2026-10-30T18:42:13+03:00",
      "k": "ask",
      "kind": "spec",
      "note": "Показан работающий UX-макет. Ожидается подтверждение рабочей схемы и узкого API-плана локальной реализации; серверная работа остаётся на паузе."
    },
    {
      "t": "2026-10-30T18:44:48+03:00",
      "k": "ask",
      "kind": "spec",
      "note": "Владелец выбрал «Нужно изменить макет — напишу что». Ждём конкретные замечания. Реализацию не начинать; подготовку сохранить."
    },
    {
      "t": "2026-10-30T18:52:07+03:00",
      "k": "answered",
      "kind": "spec"
    },
    {
      "t": "2026-10-30T19:03:08+03:00",
      "k": "ask",
      "kind": "spec",
      "note": "Обновлён полный макет:13 пунктов меню, прежние экраны и CRM-карточка, временная расценка→Excel без КП и хранения. Показать владельцу; product code и сервер не менять до согласования."
    },
    {
      "t": "2026-10-30T19:36:18+03:00",
      "k": "answered",
      "kind": "spec"
    },
    {
      "t": "2026-10-30T19:40:22+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-10-30T19:40:23+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-10-30T19:40:23+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-10-30T19:40:24+03:00",
      "k": "tickets",
      "n": 4
    },
    {
      "t": "2026-10-30T19:40:25+03:00",
      "k": "gate",
      "g": "G3",
      "ok": false,
      "problems": 4
    },
    {
      "t": "2026-10-30T19:41:01+03:00",
      "k": "tickets",
      "n": 4
    },
    {
      "t": "2026-10-30T19:41:02+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-10-30T19:41:09+03:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-10-30T19:41:09+03:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "start"
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«Загружать артикулы массово я должен, естественно, в работе, где я работаю с остатками»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«при чем здесь вообще клиенты?»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«У меня должен быть раздел: создать договор»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«у меня должен быть раздел: создать спецификацию»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«drag and drop-ом перетащить реквизиты или счёт»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«он поймёт, что это»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«Создать договор — я переношу реквизиты, и он создаёт договор»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«окошко Создать спецификацию, я drag and drop-ом переношу»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«работа с договорами, спецификациями должна быть в разделе документов»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«Клиентам это должно привязываться»",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«он должен это подтягивать потом туда в клиенты»",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«И не в раздел клиенты, а в CRM-системе клиенты»",
      "status": "in-ticket"
    },
    {
      "id": "R13",
      "text": "«Продумай, задай мне нужные вопросы»",
      "status": "in-ticket"
    },
    {
      "id": "R14",
      "text": "«включи навык UI/UX, продумай с этой точки зрения»",
      "status": "in-ticket"
    },
    {
      "id": "G01",
      "text": "«Сначала файл, затем подтверждение клиента (рекомендую)»",
      "status": "in-ticket"
    },
    {
      "id": "G02",
      "text": "«Достаточно Word DOCX»",
      "status": "in-ticket"
    },
    {
      "id": "G03",
      "text": "«Да, КП можно создать без клиента (рекомендую)»",
      "status": "dropped",
      "why": "Позднее владелец: «давай это не будет кп, эти подборки не должны никак хранится это просто помощь в расценке, а кп это кп для клиентов, должно хранится в базе»"
    },
    {
      "id": "G04",
      "text": "«новые функции должны быть интегрированы в старый интерфейс … макет покажи со всеми разделами»",
      "status": "in-ticket"
    },
    {
      "id": "G05",
      "text": "«давай это не будет кп … это просто помощь в расценке»",
      "status": "in-ticket"
    },
    {
      "id": "G06",
      "text": "«эти подборки не должны никак хранится»",
      "status": "in-ticket"
    },
    {
      "id": "G07",
      "text": "«а кп это кп для клиентов, должно хранится в базе, я если что буду сам делать … на основе этих файлов»",
      "status": "in-ticket"
    },
    {
      "id": "G08",
      "text": "«Этот давай реализуем с возможностью отката на старую версию»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-10-30T18:29:48+03:00",
      "open": 17,
      "total": 17
    },
    "G2": {
      "ok": true,
      "at": "2026-10-30T19:40:22+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-10-30T19:41:02+03:00",
      "problems": 0
    }
  },
  "result": null
}
