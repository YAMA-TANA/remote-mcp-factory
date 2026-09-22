# PicoSvc resource cost gates

This document describes additional abuse and cost protection. The published monthly **request counts and subscription prices are unchanged**.

## Browser Run: Fetch (Markdown) and Shot

- One browser-backed request at a time **per owner per service** (Fetch and Shot each have their own slot). API-key Shot requests are mapped back to the same owner.
- After a browser action settles, a two-second cooldown prevents rapid repeated calls. A competing call receives HTTP `429` with `Retry-After`.
- Navigation timeout: up to 8 seconds. Screenshot/Markdown action timeout: up to 8 seconds. Optional selector and explicit wait each have up to 2 seconds. PDF timeout: up to 8 seconds. These are **stage deadlines, not a proven 20-second total wall-clock termination**; provider scheduling, network and other overhead can add time.
- Do not use `Promise.race()` with Browser Run: it can abandon a call while a billable browser is still running. The new code waits for the provider operation to settle under provider-owned stage timeouts. If the provider itself fails to honor its timeouts, a hard browser kill is not established here.
- Monthly browser-time budgets **per service**: Free 2 minutes, Pico 30 minutes, PicoPlus 3 hours. Each action reserves 20 seconds atomically before starting and settles against the provider's `X-Browser-Ms-Used` response header. Missing metering conservatively consumes the reservation. The response exposes `x-picosvc-browser-ms-used` when available.
- This cost gate does not apply to Fetch's metadata-only HTTP request; its existing abortable upstream fetch and response-size safeguards remain in effect.
- Blank screenshots no longer trigger an automatic second browser run. Callers may retry explicitly after the cooldown; the retry counts as another request.

## JSON

- On migration, backfill per-owner document counts and stored byte totals once. SQLite triggers then increment/decrement these counters for individual document INSERT, UPDATE, DELETE and store deletion, replacing the per-PUT all-documents `COUNT/SUM`.
- A shared indexed capacity check covers master-token, scoped-token and authenticated management writes. SQLite BEFORE triggers enforce current document/byte ceilings inside the actual write, including concurrent PUTs.
- JSON export pages consume the existing monthly JSON request allowance. Existing page/byte bounds remain unchanged.
- The legacy JSON guards still exist in the repository but are bypassed by the active entrypoint for relevant JSON PUT routes. Avoid reintroducing them in routing.

## Deployment and validation

1. Apply `migrations/0099_picosvc_resource_gates.sql` to D1 **before** deploying the Worker. The new guards intentionally fail closed when the new tables are missing.
2. Deploy the Worker and verify normal free/paid Fetch, Shot (session and API key), JSON master/scoped writes, JSON export and 429/402/504 behavior.
3. Review actual `X-Browser-Ms-Used` distribution and browser bills before changing time budgets. The budgets are initial protection settings, not a measured optimal customer entitlement.
4. Monitor JSON `rows_read`/`rows_written` and run migration/regression tests. This change removes the hot-path full scan; it does not guarantee that other queries elsewhere are always cheap.

This change is not a guaranteed complete end-to-end browser kill switch, nor a substitute for Cloudflare spending alerts and production load tests.
