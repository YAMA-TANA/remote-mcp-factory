# PicoSvc MCP fleet control room

The owner-authenticated `/ja/mcp/manage/`, `/en/mcp/manage/`, and `/zh-cn/mcp/manage/` Pages routes provide a cross-deployment operational view. The existing `/[locale]/mcp/app/` studio remains responsible for creating deployments, editing access settings and secrets, manual redeployment, and per-server advanced operations.

## What it does

- Fetch `GET /api/servers` once for the current Clerk owner/organization; search and filter by running (`enabled && status=ready`), needs attention (`enabled && status!=ready`), paused, or all.
- For the selected deployment only, fetch `GET /api/picosvc/mcp/servers/:id/metrics?days=30` and `GET /api/picosvc/mcp/servers/:id/logs?limit=30`. Show 30-day request/error counts, measured average duration, computed error rate, and up to 30 sanitized build/runtime events.
- Pause/resume an individual endpoint with the existing `PATCH /api/servers/:id` using only `{ "enabled": boolean }`. Pausing requires confirmation: clients may lose access. Refresh the server list after the mutation.

## Privacy and operational boundaries

- All requests use the current Clerk bearer token; the Worker enforces owner scope. On Clerk session/organization changes, the UI discards previous records immediately and suppresses stale results.
- Only known safe server fields are rendered: id, name, status, enabled, runtime label, branch and updated time. The panel omits repo URLs with query credentials, source code, bearer tokens, secret keys, raw error messages, full log messages, headers and payloads. Metrics and event responses are projected through allowlisted parsers.
- No scheduled polling, background deployment or bulk destructive action. This UI does not certify that an endpoint is live: the status and metrics are the values returned by the deployed Worker. Counts are historical and not an uptime SLA.
- `node --experimental-strip-types scripts/test-picosvc-mcp-fleet.mjs` covers safe projections, metrics validation, filtering, owner-safe API paths, pause confirmation and wiring; root CI runs the test. Web CI validates TypeScript and the Next.js static export.

## Release verification

Deploy the compatible Pages build and Worker, then verify a test owner's list, live MCP client connectivity, a queued/ready/failed deployment, a paused endpoint, 30-day metrics, log visibility, the owner/organization switch, all three locales and mobile rendering. Do not infer that a GitHub merge alone proves a working production MCP runtime.
