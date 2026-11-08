# Память — предложение, AGENTS.md не изменён

- В существующих BaseUI dialogs регистрировать реальные DialogTrigger для всех способов открытия; программное open без trigger может нарушить возврат фокуса после touch в Safari.
- Для мобильной visual acceptance capture делать до native date interaction: iOS visual viewport может смещаться при window.scrollY0. Проверять полную видимость AppShellheader и геометрию над bottomnav, не только scrollY.
- Состояние последней Autopilot-сборки и неоконченные отдельные задачи — .autopilot/PROGRESS.md. Snapshot сборки и отдельный выпуск различаются; runtime SHA проверять по runbook.

Новых envvariables, dependencies и обязательных команд запуска нет. Изменения owner-owned AGENTS.md не требуются для работы функции и не внесены.
