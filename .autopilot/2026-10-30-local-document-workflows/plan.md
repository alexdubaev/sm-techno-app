# Local Document Workflows Implementation Plan

> For agentic workers: execute the following Autopilot tickets in fresh contexts, using the existing isolated worktree. The lead owns integration and verification; no implementation in main.

**Goal:** Integrate the approved full-interface workflows and retain a proven local fallback to the preceding feature version.
**Architecture:** Port the already reviewed feature TREE without its private ancestry. Add independent routers for stateless stock valuation and document match/binding. Stock has no durable jobs; documents retain existing repository, canonical contract, versioning, generation and ACL. The full current UI remains with purpose-driven actions in Stock/Documents and a linked-documents projection in the existing CRM card.
**Tech Stack:** Existing FastAPI/Python3.12, SQLite/openpyxl, Next16/React19/TS/Tailwind4. No new runtime dependency beyond those already pinned in the ported feature requirements.
**Spec:** spec.md; shared names/shapes in interfaces.md; concrete existing seams in ../local-workflows-notes.md.

## Global Constraints

- Approved 2026-10-30: full existing menu, first file then client confirmation, invoice DOCX only, temporary valuation→Excel, no CP or selection persistence from Stock.
- One canonical contract/version history; current saved contract supplies legaldata; manager fills conditions in Word; preserve numbering, physical stock/all warehouses/prices; reserves unchanged.
- No working DB/storage/config/1С or VPS modifications. Server-release preparation remains paused and preserved.
- Never publish original feature ancestry. Customer fixture/template privacy audit before public push. Main baseline52ccb395; old local feature8f96c36/product182bc62 remains intact and privately reachable.
- Actor/manager/admin boundaries and no private CRM data in model prompts. No tests using working1Сsettings.
- Source and useful checks are locally verified before publication. No CI/deploy setup, forcepush, reset, stash or foreign cleanup. One independent whole-change review; narrow closure only.

## Review Focus

- Untrusted formula/path/media input: 02 integration pins text SKU, source limits, leadingzeros, cleanup, XLSX text neutralization and no durable side effects.
- File-first recognition could silently write client/1С:03 integration pins read-only match, explicit bind/confirm and cross-actor/version/identity errors.
- Concurrent generation/version/canonical identity:03 retains relevant storage/specification regression and existing idempotency/concurrency coverage.
- Existing UI routes/CRM privacy:02/03 targeted frontend tests + final critical browser paths preserve old card/tabs, user/admin roles and imports.
- Rollback preserving new records/files:04 code-only downgrade rehearsal on isolated copy + fresh strict backup verifier; no old DB restored over new writes.

## Tasks and order

- 01: safe port of 58-path reviewed feature tree, metadata audit, environment readiness and shared empty router registration. Existing feature baseline works in fresh branch; old branches remain untouched.
- 02 and03 in parallel after01: independent stock valuation and documents/CRM workflows. Each owns dedicated router, frontend API module/components, tests. Shared API mount/helper prepared once by01.
- 04 after02+03: integration checks, isolated local demo with separate ports/data, coherent backup/restore and old-feature code-only fallback rehearsal; rollback runbook and output evidence.

## Explicit shared API and test seams

Foundation exports existing frontend requestJsonWithInit<T>(path, init, fallbackMessage, options?) from lib/api.ts without changing its authentication/session/error behavior. Dedicated new API modules import it. No second auth layer.
Foundation registers create_stock_valuation_router(_get_current_user, lambda: SERVICE) and create_document_workflows_router(_get_current_user, lambda: SERVICE) in stock_sync_api.py. Initial modules expose empty APIRouter factories so main import remains green;02/03 fill independent modules. Same-origin existing Next proxy handles routes.

Stock routes: POST /api/stock/valuation/intake multipart file→{rows:[{article,requestedQty:null|string,sourceRow}],warnings}; POST /api/stock/valuation/resolve {rows}→{resolvedAt,articleResolution:[{sourceRow,article,requestedQty,status,variants:[{itemId,warehouseId,warehouseName,physicalStock,price}]}],workbook:{filename,mediaType,base64}}. Canonical statuses matched/not_found/ambiguous/zero_stock/duplicate; quantity optional, no allocation/offerQty promises. Both authenticated,no-store, bounded, repeatably read-only; no jobId/assetId/DB writes/stock mutations/1С. Workbook generated from same fresh resolved snapshot and held only in browser memory; download creates Blob and revokesURL. Browser clears valuation on leaving Stock/reload. Temporary input outside durable storage, finallycleanup and guarded scavenging of OWN abandoned temp dirs on restart/request; never delete other temps/symlinks or bypass verifier. Reuse client_price_template.xlsx and preserve warehouse rows/price source; no buyer/CP identifiers. Neutralize untrusted Excel cells and prevent template sample leakage.

Document routes: POST /api/document-assistant/jobs/{job_id}/client-match {version,fields}→{status:'matched'|'not_found'|'ambiguous',candidates:[{clientId,documentName,inn,kpp,contract:{documentId,number,versionId}|null}]}. Legalfields only; use current actor allowed document identity and no contact/privateCRM fields; no save/1С/mutations. POST .../{job_id}/bind-client {version,clientId,operationKey}→DocumentAssistantJob, requires owner unbound, allowed kind, confirmed review/version, identity consistency; existing repository transaction/idempotency. No new tables. Contract generation/newclient creation retains existing explicit confirm pipeline and1Сservice, invoice binding then existing generateSpec with saved contract. New client inferred from invoice still needs full confirmed requisites/contract path before spec. No source/config data leakage.

Documents UI uses existing API/types plus dedicated document-workflows-api.ts for new routes; new Documents workspace replaces old generic creator while keeping ready-file upload and journal/detail/version functions. The old generic extraction/creation controls leave CRM; CRM keeps full normal card and links/download projection. Shared documents-only links remain safe for managers lacking private CRM-card access; do not widen personal CRM ACL to fabricate a full-card link.

## Environment and checks

Ready Python interpreter C:/Users/Alexandr/.codex/worktrees/f3c0/sm-techno-app/.autopilot/serve.py312/Scripts/python.exe; verify availability. Reuse ready cached npm dependencies only when lock matches, otherwise one npmci using cache; no repeatedinstall. All product tests in clean isolated source clone/temp DB/storage with syntheticFernet and safeenv fixture; real own.git required for git-archive baseline tests. Ticket-specific tests first, one integrated affected/full required checkset at04, narrow repeat after confirmedfix. Strict lint:ci accepted baseline, report rawlint separately if it remains same29 baseline; never fabricate clean rawlint. Existing backend auth+all, frontend auth/settings/lint:ci/types/build/allowlistedE2E once on final source for publication.

Rollback target local8f96c36/product182bc62, not assumed VPS compatibility52. Preserve both references and current demo15000/19000. Candidate demo15100/19100 from persistent isolated owned clone outside temporaryworktree, synthetic DB/storage; never overwrite existing ports/processes. Only controlled foreground managed session, no rejected detached Start-Process workaround. Code-only rollback uses separate clone and current data copy; preserve rawfile hashes/newbusinessrows, and verify with NEW vps_integrity. Actual restore only emptyisolatedtarget. New final working source and old source runnable independently. Scripts may not delete production or foreign dirs/processes.
