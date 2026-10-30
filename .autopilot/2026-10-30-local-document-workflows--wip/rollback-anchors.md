# Зафиксированные точки возврата и публикация

Локальные аннотированные теги (не release):
- archive/2026-10-30/local-workflows-main-before →52ccb3957c37b42f951feec86449d9b2f3a08d5f.
- archive/2026-10-30/local-workflows-feature-before →8f96c36be402b4651d5df4681fd130169689945b (product182bc62).

PRIVATE LOCAL bundle: C:/Users/Alexandr/.codex/artifacts/local-document-workflows-20261030/old-local-feature.bundle;6,972,254bytes. git bundle verify PASS, completehistory, SHA1. Этот bundle/tagcontainsprivate originalfeaturehistory: не публиковать вGitHub, не git push --tags/--all. Сами исходнаяветка/worktree/demo15000/19000 не менялись. Это кодовый backup, не coherentdata backup; данные проверяются отдельно04.

Read-only Gitpublicationfacts2026-10-30: repoalexdubaev/sm-techno-app PUBLIC; originmain52ccb395, основнойcheckoutD:/codex/sm-techno-app cleanmainнаэтомSHA. GitHub webhook listempty; existing auth-tests workflowactive(pushmain,codex/**,PR), это тесты, не deployment, новыйCIнедобавлять. Последниеdeploymentrecordsисторические(2026-10-06Preview,2026-10-02/09-16Production). Root/frontendvercel.json обеgit.deploymentEnabled=false; Sites/Vercelисключеныполитикой. VPS не проверялся/не менялся в этойитерации; серверная работа остаётсяpaused. Перед фактическойpublication освежитьrefs/triggersеслиизменились.
