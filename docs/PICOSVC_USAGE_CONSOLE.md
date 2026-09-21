# PicoSvc dedicated usage console

The authenticated `/ja/usage/`, `/en/usage/`, and `/zh-cn/usage/` Pages routes show owner-scoped results from the Worker `GET /api/picosvc/usage`. The console is accessible from every service workspace header and links back to the individual service's existing management UI. **The feature requires both the new Pages build and the already-implemented usage endpoint to be present in the deployed Worker.** A GitHub merge does not deploy either.

## Workflows

1. Sign in using the same Clerk account/organization as the resource owner. The console loads its inventory, storage and monthly counts from the authenticated API. It never uses guessed limits from the static pricing page.
2. Use **70% or more** or **At the limit** to see relevant quota dimensions, or search by service/metric. The alert summary links directly to the affected service workspace. Policy settings such as minimum refresh intervals are shown separately and never misrepresented as consumption.
3. Export only the currently visible dimensions as UTF-8 BOM CSV. Columns are month, product slug, tier, metric, kind, used, limit, remaining, percentage and threshold. No owner/user IDs, email, resource URL, request body, headers or credentials are exported. The export is generated in the browser; no extra server request is made.

A zero-allowance dimension with zero usage is not marked exhausted; an unexpected nonzero count against a zero allowance is marked at the limit. Monthly counters reset each month; inventory and storage counts are current. Alerts are based on **current usage**, not predictive spending notifications or emailed alerts.

## Checks and limitations

- `node --experimental-strip-types scripts/test-picosvc-usage-console.mjs` covers validation, thresholds (including zero allowance), product/metric filters, CSV metadata allowlist, malformed response rejection, and UI integration; root CI runs it.
- Web CI performs typecheck, workspace regressions and Next.js static build. Verify the live page while signed in on each locale, the owner/organization switch, a real 70%/90%/100% usage case, exported CSV, sign-out behavior and navigation after deploying Pages.
- The UI does not create quota increases, send alerts, charge money, auto-refresh, or certify live Cloudflare metering accuracy. The backend usage endpoint may still require staging/provider verification and operational cost monitoring.
