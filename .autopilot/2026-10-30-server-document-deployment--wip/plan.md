# Один runtime ticket и последовательный release

Оценка~1500–2500 строк с integration tests; один исполнитель, tierT0. Owner FULL gates для runtime/credentials/rollback сохраняются: exact Linux probe, security review, migration/backup/current-data downgrade rehearsal, final same-origin health. Старый проверенный продукт не перепроверяется целиком без нового риска.

01: одна связная runtime реализация: лёгкий shared converter, fixed Unix broker+client, optional selection, pinned backendCLI, own service/compose overlay/runbook и реальные security integration tests. Root одновременно выполняет default-security CLI/auth probe, backup и ресурсный контроль на VPS. Worker не изменяет сервер.

После01: один fresh review runtime delta, bounded confirmed fix pass, affected closure. PR→main с exact source, подготовленные образы и rehearsal по immutable IDs. Перед actual switch root сообщает готовый состав backup и проверенный возврат. Последнее «деплоить надо было» разрешает переключение этого результата, если safeguards проходят. При реальном новом protected blocker задаётся только конкретный вопрос, остальная работа продолжается.
