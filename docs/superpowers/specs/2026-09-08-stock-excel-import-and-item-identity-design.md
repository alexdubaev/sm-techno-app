# Stock Excel import and item identity design

## Scope

This design implements the coupled audit items ТЗ 06 and ТЗ 07. It replaces the
current one-step stock-price import with a validate/preview/commit flow and
makes product matching explicit. It does not change the 1С catalogue sync,
storage-location-only workbooks, or the public order contract.

## Goals

- Reject non-finite and negative price/quantity values before any write.
- Make source duplicates and ambiguous product identity visible to the user;
  never silently merge them.
- Match imported products only by a valid 1С key or a normalized SKU, never by
  display name.
- Perform a successful stock import in one immediate SQLite transaction.
- Let the UI show the proposed result and require a confirmation before it
  calls commit.

## Identity contract

`normalized_sku` is the Unicode-NFKC, trimmed, case-folded SKU. Blank values
are not an identity and are rejected for ordinary stock rows. The database
stores it in `items.sku_normalized`; the migration backfills it from `sku`.

An imported row identifies an existing item in this order:

1. A supplied valid `onec_key` matches `items.onec_key`.
2. Otherwise its `normalized_sku` matches `items.sku_normalized`.

If both identifiers are supplied but resolve to different items, the row is a
conflict. If an existing 1С-linked item has the same normalized SKU but the
file supplies a different 1С key, it is a conflict. Item name is presentation
data only and is never used for matching.

The migration detects legacy normalized-SKU collisions before adding the
unique index. It records no partial migration: it raises a domain error naming
the colliding SKU and the administrator must resolve the duplicates. New and
updated local items validate the same normalized SKU and convert uniqueness
violations into the same domain error.

## Import contract

The parser returns typed rows with spreadsheet row numbers. Formula cells,
missing product name/SKU/quantity, non-finite values, negative price or
quantity, invalid 1С keys, and duplicate `(normalized_sku, warehouse)` source
rows are validation errors. A duplicate is rejected even if its values are
identical; aggregation is deliberately not implicit.

`POST /api/price/import/preview` accepts the workbook and returns a read-only
preview: `planHash`, row counts (`created`, `updated`, `unchanged`), errors,
and a bounded list of row diagnostics. It opens no write transaction.

`POST /api/price/import` accepts the workbook and the preview's `planHash`.
It reparses and validates the file, rejects a mismatched hash with HTTP 409,
then begins `BEGIN IMMEDIATE`, re-resolves identity, and either rolls back for
any conflict or applies all item/balance updates. It returns the committed
counts. Location-only files retain their dedicated import path and do not use
the ordinary product preview.

## UI and API behaviour

The price page uploads a selected ordinary stock workbook to preview first.
It renders counts and row errors, disables commit when any error exists, and
sends the captured file plus `planHash` only when the administrator confirms.
Changing or clearing the file invalidates the preview. Existing one-step
`importPriceFile` is replaced by distinct preview and commit client calls.

All invalid files result in safe Russian domain messages; raw SQLite errors,
tracebacks, source cell formulae, and database identifiers are not exposed.

## Tests

Backend tests cover finite-value validation, source duplicate rejection,
name-only non-match, normalized-SKU matching, conflicting 1С/SKU identity,
preview read-only behaviour, plan hash mismatch, and all-or-nothing rollback.
API tests cover the two multipart endpoints and their role guard. Frontend
tests cover preview, blocked commit, confirmation, and stale-preview reset.
