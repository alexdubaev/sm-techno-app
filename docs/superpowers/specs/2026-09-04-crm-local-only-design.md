# CRM local-only data boundary

## Decision

CRM is a local workspace layered over the application's existing Clients
section and the imported 1C counterparty catalogue. A counterparty is created
in 1C only by the Clients section. CRM never creates, retries, or updates a
counterparty in 1C.

Existing 1C counterparties may be imported and assigned to a CRM workspace.
Once present in CRM, all additions and edits made in CRM stay in the local
database: company display data, contacts, notes, events, reminders, tabs,
assignments, colours, order, and CRM status metadata. They must not create a
CRM-to-1C queue job or mutate a 1C record.

## Data flow

```text
Clients section -> 1C -> existing import -> counterparties -> CRM assignment
                                               |
                                               +-> local CRM cards and workspace data

CRM edits ------------------------------------> local SQLite only
```

The existing 1C import remains the sole path from 1C to the local
counterparty catalogue. CRM must not use a second OData client, store, or
authentication mechanism.

## Behavioural rules

- Remove CRM UI actions that send or retry sending a client to 1C.
- Reject the CRM send/retry HTTP routes with a clear policy error so a stale
  browser client cannot bypass the UI.
- The CRM sync worker must not issue a remote request for any existing queued
  CRM create or update job. It marks a claimed/eligible job
  `blocked_capability` with an explanatory policy message instead.
- Editing an imported/linked CRM card persists locally and does not enqueue a
  `crm_sync_jobs` update. Editing a local CRM lead also remains local.
- Existing open conflict records remain historical/auditable. No new outbound
  CRM-to-1C conflict is created by a local CRM edit. Do not delete historical
  records or loosen their author/admin access rule.
- Do not change the established Clients-section creation flow or its 1C
  integration.
- No live 1C calls are authorized. Tests use temporary databases and fake
  clients only.

## Migration and compatibility

No schema migration is required for this policy. The existing CRM sync-job
status vocabulary already contains `blocked_capability`; use it for queued
jobs disabled by this policy. Existing API routes are retained only as guarded
responses to avoid accidental side effects from an older frontend.

## Verification

Tests must demonstrate that:

1. linked and local CRM-card edits write local fields without adding a CRM sync
   job;
2. CRM send/retry routes reject before a 1C client is built;
3. a due legacy CRM job is blocked without invoking fake 1C;
4. the CRM workspace no longer renders send/retry controls;
5. importing/linking and the existing Clients-section flow remain untouched.
