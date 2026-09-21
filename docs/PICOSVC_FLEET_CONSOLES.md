# PicoSvc Cron and Mail dedicated management consoles

Two new owner-authenticated Pages routes offer purpose-built, read-focused operation screens alongside the existing per-resource editors:

| Product | Localized route | Backend data | Supported actions |
| --- | --- | --- | --- |
| Cron | `/ja/cron/manage/` (`/en/`, `/zh-cn/`) | `GET /api/picosvc/cron/jobs`, `GET /api/picosvc/cron/jobs/:id/runs` | Search/filter jobs, inspect the selected job's latest 30 runs, pause/resume with `PATCH /api/picosvc/cron/jobs/:id` |
| Mail | `/ja/mail/manage/` (`/en/`, `/zh-cn/`) | `GET /api/picosvc/mail/routes`, `GET /api/picosvc/mail/routes/:id/events` | Search/filter routes, inspect the selected route's latest 30 deliveries, copy its assigned address, pause/resume with `PATCH /api/picosvc/mail/routes/:id` |

Each console shows current inventory and enabled/paused counts, and links to the existing product workspace for creating resources, full configuration, manual mail retry, deletion, and other advanced actions. Pausing requires confirmation. **Pausing a Mail route can prevent incoming email from being accepted/delivered**; it does not queue incoming mail for automatic restoration.

## Scope, privacy and cost

- Authenticate every request with the current Clerk session; backend endpoints enforce owner scope. Switching Clerk auth state invalidates prior list/history responses, and history from an earlier selected resource is discarded.
- The UI parses only allowlisted fields: resource ID, name, enabled state, Cron schedule/timezone/method/hostname/last-run timestamp, Mail receiving address/last-updated timestamp, and event status/HTTP code/time/duration/attempt count. It does **not** render Cron request headers or bodies, full destination URLs (which might contain access tokens), Mail webhook URLs, message sender, subject, text, HTML, attachment data, or arbitrary error strings.
- Lists make one request; viewing a resource makes one history request, **not an N+1 request for every job or route**. The selected history is capped to 30 entries. No scheduled polling or background task is created. This is not a cross-provider SLA or automatic delivery guarantee.
- `node --experimental-strip-types scripts/test-picosvc-fleet-consoles.mjs` checks safe parsing, filters, route validation, allowed actions, UI wiring and responsive layout; root CI runs it. Web CI checks TypeScript, existing workspaces, Next.js build and static export.

## Deployment acceptance (not established by CI)

Deploy the current Pages build and compatible Worker, then sign into each locale and verify: Cron jobs list, history and active/paused transitions; Mail route list, copy address, recent delivered/retry/failed events, and pause/resume; owner/organization switching with no stale data; mobile layout and navigation. Test a real Cron request and a real inbound email using test infrastructure, then confirm the resulting event state. **GitHub merge alone does not deploy Pages, configure Cloudflare Email Routing/MX, or prove live delivery.**
