# Task 2 report — bounded pagination and metadata TTL

## Implementation

- Added instance-overridable `OneCClient.MAX_PAGES = 1000`. `_collect_all` now records every visited page URL, refuses a repeat before issuing another GET, and refuses page 1001 before issuing it.
- `odata.nextLink` and `@odata.nextLink` now resolve relative to the current page and must retain both the configured OData origin and the normalized OData base path. Rejections are safe `OneCPaginationError(method="GET")` messages with no URL query, payload, or credentials.
- Added a five-minute, instance-local metadata expiry timestamp. On expiry, a single helper clears the metadata XML root plus the entity-type, property-set, and property-type caches before the next metadata GET. The expiry check is reached before every derived-schema cache hit.
- No write retry, order recovery, API mapping, or recovery GET behavior was changed.

## TDD evidence

### RED

Added five focused tests before production changes:

1. Repeated `nextLink` loop.
2. Configured page limit.
3. Cross-origin `nextLink`.
4. Same-origin link outside the OData base path.
5. Metadata root and derived schema cache refresh after TTL.

The initial targeted pagination run failed under the old unbounded loop: the mocked second GET was reached and raised `StopIteration` instead of `OneCPaginationError`. The metadata TTL test then failed as expected with `{'OldField'}` returned after the clock advanced past five minutes, where `{'NewField'}` was required.

### GREEN

After the minimal implementation:

```text
python -m unittest -v tests.test_onec_transport_reliability.OneCTransportReliabilityTest.test_collect_all_rejects_a_repeated_next_link tests.test_onec_transport_reliability.OneCTransportReliabilityTest.test_collect_all_stops_at_configured_page_limit tests.test_onec_transport_reliability.OneCTransportReliabilityTest.test_collect_all_rejects_next_link_from_another_origin tests.test_onec_transport_reliability.OneCTransportReliabilityTest.test_collect_all_rejects_next_link_outside_odata_base_path tests.test_onec_transport_reliability.OneCTransportReliabilityTest.test_metadata_and_schema_caches_refresh_after_ttl
```

Result: `Ran 5 tests ... OK`.

## Final verification

```text
python -m py_compile stock_sync_desktop\onec_api.py
python -m unittest -v tests.test_onec_transport_reliability tests.test_onec_counterparty_payload tests.test_onec_item_lookup tests.test_clients_onec_sync tests.test_order_sync_recovery
git diff --check
```

Result: Python compilation succeeded; `Ran 55 tests in 13.785s`, `OK`; `git diff --check` returned no whitespace errors.

## Files

- `stock_sync_desktop/onec_api.py`
- `tests/test_onec_transport_reliability.py`
- `.superpowers/sdd/2026-09-07-onec-transport-reliability/task-2-report.md`

## Self-review

- Pagination has an explicit 1000-page default and can be overridden per client for deterministic tests/configuration.
- Loop, page-cap, foreign-origin, and same-origin/base-path escape paths raise the existing typed pagination error without exposing sensitive request data.
- A metadata expiry invalidates the entire schema-derived cache graph before reuse; fresh metadata produces fresh fields in the regression test.
- Existing transport, payload, lookup, CRM sync, and order recovery tests remain green, confirming legacy `_request`/`_request_raw` fake overrides still work and no write/recovery ownership was modified.

## Concerns

None identified in the Task 2 scope. The final verification is the relevant 55-test OneC/CRM/order subset; the repository-wide suite was not run for this scoped task.
