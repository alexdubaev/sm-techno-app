# Blind functional acceptance — bank statement manager sales

Date: 2026-11-07. Verdict: **main customer scenario realized and passed on clean committed source**. No missing required product surface was identified in the inspected import/CRM/manager UI. This is functional acceptance against the original owner brief, not a second code or security review.

## Independence and environment

Read the original brief at `D:/codex/worktrees/bank-statement-manager-sales/.autopilot/2026-11-07-bank-statement-manager-sales--wip/2026-11-07-brief.md` and repository source/tests. No other .autopilot spec, manifest, ticket or report was opened. No skill or subagent was invoked.

Created a new independent local clone:

```powershell
git clone --no-hardlinks --branch codex/bank-statement-manager-sales 'D:/codex/worktrees/bank-statement-manager-sales' 'D:/codex/worktrees/bank-statement-acceptance-20261107'
```

Before and after checks, `git rev-parse HEAD` returned **b85631a88bc106b3676263f971d38400d5e5c243** and `git status --porcelain` was empty. No product code/config was edited. No working .env, database, storage or 1C settings were used. Pytest and the repository browser launcher provided disposable synthetic data/storage and isolated environment. Browser servers were started only after parent explicitly released ports 13000/18000. They were absent after launcher exit.

The ready Python interpreter was reused as authorized, with cwd in the new clone and no source-root PYTHONPATH override. Frontend node_modules was installed from the clone's declared lockfile; no external node_modules junction was used.

## Exact executed checks

From `D:/codex/worktrees/bank-statement-acceptance-20261107`:

```powershell
& 'D:/codex/worktrees/bank-statement-manager-sales/.venv/Scripts/python.exe' -m pip check
& 'D:/codex/worktrees/bank-statement-manager-sales/.venv/Scripts/python.exe' -m pytest tests/test_bank_parser.py tests/test_bank_foundation.py tests/test_bank_repository.py tests/test_bank_acceptance.py tests/auth/test_bank_api.py -q --strict-markers
```

- pip check: exit 0, **No broken requirements found**.
- Affected tests: exit 0, **110 passed in 41.95s**.
- 1758 existing datetime.utcnow deprecation warnings were emitted; no failed or skipped tests.

From `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web`:

```powershell
npm ci --offline
npm run build
$env:SM_TECHNO_TEST_PYTHON='D:/codex/worktrees/bank-statement-manager-sales/.venv/Scripts/python.exe'
npm run test:manager:e2e -- --grep 'bank statement imports six gross payments' --project=production-chromium-1600 --project=production-webkit-390
```

- npm ci: exit 0, **603 packages added**, 604 audited, approximately **7 minutes** of Windows cache extraction; command printed 0 vulnerabilities (offline install output, not an independent vulnerability assessment).
- Actual production build: exit 0; Next.js 16.4.3/Turbopack compiled in 7.4s, TypeScript completed in 14.5s, 26 routes generated.
- Real isolated FastAPI + production Next.js browser scenario: exit 0, **2 passed in 19.9s**; desktop Chromium 1600×1000 took 3.9s, mobile WebKit 390×844 took 10.3s. No app mocks. No page errors.
- No full broad suite was rerun by this acceptance agent; that belongs to parent verification scope.

## Observed main flow

The real browser scenario created a synthetic active employee and five CRM clients, configured explicit November conditions (plan 0, fixed 0, always, 5%), assigned one client through the actual CRM panel (others through authenticated API), confirmed a synthetic organization account through the actual import UI, uploaded an XLSX once, reviewed six operation cards and remuneration effects, selected ready operations and confirmed.

The authenticated HTTP control and the browser scenario both asserted:

- 6 incoming operations, 5 different payer INNs; credit **198,906,300 kopecks**, debit 0.
- All six ready; upload/preview itself left existing ledger sale count at 0.
- Six distinct existing manager_sales records with source bank_statement; gross sales **1,989,063.00 ₽**, commission and income **99,453.15 ₽** (9,945,315 kopecks).
- Bank date 2026-11-03 for invoice 216 despite invoice date 2026-09-09.
- Invoice 255 retained a null date and warning for ambiguous “З НОЯБРЯ”; no silent guessed correction.
- Two payments for the same payer remained separate; that client displayed both receipts.
- Replaying saved commit returned prior response without increasing count/totals. Renamed identical workbook returned the same upload ID. New key could not bypass already-accounted uniqueness (409 in HTTP control).
- Employee request for full original file returned 403.
- After dialog close, all six bank-source records appeared in the existing manager list.
- Mobile operation cards and client receipts fit their containers; confirmation button was in viewport, hit-testable and unobscured. Screenshots visually inspected.

## Assessment by original brief section

| Section | Result | Evidence / limitation |
| --- | --- | --- |
| 1. Goal and scope | Realized | Actual CRM assignment → common organization upload → preview → commit → existing manager ledger → CRM receipts passed in real browser and authenticated API. |
| 2. Study current code / plan | Partially assessed (process) | Acceptance checked committed branch/source and runnable declared stack. Development discovery/planning history was deliberately not read, so this process section is not re-certified. |
| 3. Accounting | Realized | Gross kopecks, bank calendar date, separate invoice date, 5% commission, explicit zero rate, missing terms and closed period scenarios passed in the affected checks. |
| 4. Assignment | Realized | Actual CRM save passed; history/backdating/removal, non-equal manager/user IDs, pending refresh, active/archive guards and non-transfer of old sales passed in foundation/repository checks. UI has required explanation, start date, history and pending count/period/amount. |
| 5. XLSX reading | Realized for synthetic contract; original unverified | Header shifts/leading identifiers/exact XML amounts/text money/formulas/period/direction/turnover mismatch/missing balances/corrupt or ambiguous formats/currency/limits passed. Original attached workbook was unavailable and was not tested. |
| 6. Matching and purpose | Realized | INN/checksum/KPP/duplicate cards/manual mismatch reasons/unknown client/nonbuyer and third-party classifications/invoice ambiguity passed. UI exposes client search, existing CRM creation link, classification, reason and unchanged bank details. |
| 7. Data and migration | Realized in isolated tests | Clean/repeated init and populated legacy migration preserving sale fields/sequence/snapshots passed. Immutable operation, separate provenance/decision/link and existing manager ledger were exercised. Working DB untouched. |
| 8. Duplicates | Realized | Same bytes renamed, overlap exports, changed purpose/probable repeats, distinct documents, ambiguous repetitions, old manual/onec one-to-one linking, cancellation and DB uniqueness scenarios passed. |
| 9. Confirmation/history | Realized | Preview creates no sales; partial selected commit preserves pending rows; stale state conflicts; concurrency; lost response retry; new key rejection; selected batch rollback; closed months and cancellation retention passed. Actual remuneration preview and commit passed. |
| 10. UI | Realized for main flow | Import/history/common organization account/reconciliation/operation details/manual decision consequences exist. Real CRM assignment and receipts plus existing manager bank source rendered. Desktop and exact 390×844 mobile scenario passed, screenshots inspected. Less common manual decision paths were functionally checked below UI via repository/API, not individually clicked in this short browser scenario. |
| 11. Rights and private files | Realized for affected functional boundaries | Admin-only endpoints, direct-ID file access, cross-manager shared-client receipt restriction and no DeepSeek/remote 1C requirement passed. This was not a new broad security audit. |
| 12. Control example | Realized synthetically | Exact six payments / five INNs / 198,906,300 kopecks / 9,945,315 commission, bank month, warning and no replay growth passed HTTP and browser assertions. Original unavailable. |
| 13. Tests / stages | Partially assessed (verification scope) | This clean-source acceptance ran 110 affected tests, actual install/build and 2 production browser checks. Parent owns broader regression/release proof; stage-by-stage development history not inspected. |
| 14. Delivery and restrictions | Partially assessed (delivery scope) | This report and screenshots supplied; clone tracked tree remains clean. No merge, publication, deployment or production changes performed by acceptance agent. Parent handles authorized final delivery separately. |

No required product surface was found missing. The partial labels above are evidence/scope limits, not observed broken functionality.

## Synthetic screenshots

Desktop:
- `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web/test-results/manager-production/manager-bank-import-bank-s-1d9aa-once-and-shows-CRM-receipts-production-chromium-1600/bank-preview-synthetic.png`
- `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web/test-results/manager-production/manager-bank-import-bank-s-1d9aa-once-and-shows-CRM-receipts-production-chromium-1600/bank-client-receipts-synthetic.png`

Mobile 390×844 CSS px:
- `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web/test-results/manager-production/manager-bank-import-bank-s-1d9aa-once-and-shows-CRM-receipts-production-webkit-390/bank-preview-synthetic.png`
- `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web/test-results/manager-production/manager-bank-import-bank-s-1d9aa-once-and-shows-CRM-receipts-production-webkit-390/bank-client-receipts-synthetic.png`

Playwright HTML report: `D:/codex/worktrees/bank-statement-acceptance-20261107/sm-techno-web/playwright-report/manager-production/index.html`.

## Remaining limits

1. Original real XLSX unavailable: only the synthetic format/control contract was verified.
2. Parent's full regression and publication/deployment checks are separate. Local functional acceptance does not prove a deployed runtime SHA.
3. No new product blocker was observed. No product repairs were needed or attempted.

Working-result verification was complete at **2026-11-07 17:24:56 Europe/Moscow**; report-writing afterward is reporting tail. This agent does not claim an exact request-to-result total because the original request start is tracked by the parent.
