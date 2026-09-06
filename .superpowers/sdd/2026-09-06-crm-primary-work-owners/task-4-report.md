# Task 4 report: mobile primary-card status and verification

## RED

Added primary-tab mobile card coverage for a free client, one owner, two long owner names, three owners, wrapping constraints, and absence from a personal tab. The focused command failed as expected before the production implementation because no owner status was rendered:

```text
npx vitest run --config vitest.auth.config.ts tests/crm/mobile-detail.integration.test.tsx
4 failed | 21 passed
```

## GREEN and verification

```text
npx vitest run --config vitest.auth.config.ts tests/crm/mobile-detail.integration.test.tsx tests/crm/work-owners-status.integration.test.tsx
2 passed, 33 passed

npx tsc --noEmit
exit 0
```

## Changed files

- `sm-techno-web/components/crm/mobile/mobile-client-card.tsx`
- `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx`
- `sm-techno-web/tests/crm/mobile-detail.integration.test.tsx`

## Self-review

- Reused `WorkOwnersStatus` with its `mobile` variant; no owner-name formatting was duplicated.
- The workspace supplies `activeTab`, and the blue/green owner block renders only in `primary`, between city/INN and contact details.
- The block uses `min-w-0` plus arbitrary overflow wrapping, so long names do not expand the card.
- Client actions, card color selection, and other workspace behavior are unchanged.

## Implementation SHA

`f62811080b037436a83cc5a28b945d7894e583ac`

## Concerns

None.

## Review fix round 1

Added workspace-level integration coverage in `sm-techno-web/tests/crm/mobile-detail.integration.test.tsx`. It renders `MobileCrmWorkspace` with the real primary and personal active-tab paths, verifies the primary card has the owner status, confirms the `В работе:` block follows city/INN and precedes contacts, and asserts its blue/green informational styling plus wrapping constraints.

The new coverage was mutation-checked by temporarily removing the workspace `activeTab` forwarding. The focused test then failed because `В работе:` was absent; restoring the production line returned it to green.

```text
npx vitest run --config vitest.auth.config.ts tests/crm/mobile-detail.integration.test.tsx tests/crm/work-owners-status.integration.test.tsx
2 passed, 34 passed

npx tsc --noEmit
exit 0
```

No production behavior changed in this review round.
