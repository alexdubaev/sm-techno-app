# 01 — Рабочая Linux среда Terra и безопасный конвертер
**Требования:** R01, R02, R03, R04, R05, R06, R07, R08
**Зависит от:** —
**Зона:** `stock_sync_web/assistant_extraction.py` · `document_runtime/` · `tests/document_assistant/` · `Dockerfile.backend` · `compose.document-runtime.yaml` · `scripts/document_runtime/` · `docs/server-document-runtime.md` · `.env.example`
**Волна:** 1
**Ревью:** нет — один fresh independent security review всей runtime delta
**Модель:** сильная

## Сценарий и проверки
Следовать spec/interfaces. Новый host broker только stdlib, не импортировать heavy documents/storage/service/credentials. Сохранить backward imports и exact converter guards. Никаких публичных API/schema/1С/Frontend changes. Реальные Linux Unix-socket integration tests: успех с fake fixed converter, неверный uid/frame/size/format/truncation/timeout/concurrency, symlink и чужие temp/active lease, ownfinallycleanup. Existing extractor+stock affected checks. Real Docker converter/CLI production-policy probes выполняются root отдельно на isolated Linux synthetic sources. No fabricated PASS or guard weakening.

Worker пишет только свою зону, не Git/meta/server. Возвращает exact checks/paths/runtime commands; root commits, review и deploy. Старые privatehistory/bundle/worktrees не трогать. Secrets only variable names. Не использовать реальные документы/данные в тестах.
