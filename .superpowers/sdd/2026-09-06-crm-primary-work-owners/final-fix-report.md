# Final review fix report

Status: requested Important findings addressed.

## Changes

- `WorkOwnersStatus` shows `В работе у N сотрудников` for three or more mobile owners and for occupied cards at viewport widths of 360px or less. A button opens the complete normalized list. Wider mobile views retain one/two names and free clients retain `Свободен`.
- The existing shared Base UI popover supplies a portal, viewport collision positioning, outside dismissal, keyboard operation, and focus return. The trigger has `aria-controls` matching the dialog ID; the dialog has an accessible title. Width is bounded by the viewport, height by available space, and long names wrap inside a scrollable list.
- Mobile company and contact sections are sibling open buttons around the owner block. The owner disclosure is never nested inside an open-card button, and opening it does not open the card.
- Added behavioral tests for portal placement outside table overflow, trigger/dialog linkage, keyboard opening and Escape focus return, inside/outside interaction, compact mobile status, narrow viewport changes, and independent mobile disclosure.
- Added a real workspace/cache integration test: a successful assignment move changes the primary API result, the displayed owner updates, and the real cache stores the new owner plus order version.
- Added an endpoint test spying around the real repository method: one call receives every returned client ID and the response contains the real owner arrays.

## RED evidence

Before production edits, the new portal test failed because the list remained inside the table container; narrow-mobile and three-owner-mobile tests failed because no disclosure button existed.

The move/cache test and endpoint test cover already-correct behavior and initially passed. Mutation checks proved they detect regressions:

- Omitting the primary reload made the move test fail because `Оператор` never appeared.
- Replacing the endpoint batch lookup with per-card lookups made the batch test fail with `1 != 4`.

Both mutations were restored. Neither `crm-workspace.tsx` nor `stock_sync_api.py` has a final production diff from this wave.

## Verification

- `npx vitest run --config vitest.auth.config.ts tests/crm/work-owners-status.integration.test.tsx tests/crm/mobile-detail.integration.test.tsx`: 37 passed, 2 files.
- `npx tsc --noEmit`: exit 0.
- `node --test tests/crm-page.test.mjs`: 48 passed.
- `.venv/Scripts/python.exe -m unittest` with `CrmApiTest.test_primary_endpoint_loads_work_owners_once_for_all_returned_clients`, `test_work_owner_repository_batches_large_client_id_inputs_in_one_query`, `test_primary_list_serializes_active_work_owners_without_private_user_fields`, and `test_primary_work_owner_survives_move_and_disappears_after_archive_or_admin_deletion`: 4 passed.
- `git diff --check`: exit 0.

An extra attempt to run `tests/crm-sync-lifecycle.test.mjs` was blocked by the pre-existing custom test loader: it resolves all `@/` imports with a `.ts` suffix and cannot load the existing `components/crm/messenger-links.tsx`. That harness was not changed in this wave. No live browser geometry check was performed; portal behavior and interaction were verified in React/jsdom, with collision handling delegated to the installed shared popover primitive.

## Scope

Only the two owner UI components, their two integration-test files, the API test file, and this report belong to the fix commit. Existing handoff, Next environment, and VPS plan changes are preserved and excluded.
