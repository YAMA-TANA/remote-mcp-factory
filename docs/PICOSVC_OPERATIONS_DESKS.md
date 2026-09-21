# Functions / Monitor individual management desks

Source implementation (not a claim of live deployment): `web/app/service-operations-desk.tsx`, `web/app/service-operations-desk-model.ts`, and the static-exported route `web/app/[locale]/[service]/manage/page.tsx`.

## Entry points

- `/ja/functions/manage/`, `/en/functions/manage/`, `/zh-cn/functions/manage/`
- `/ja/monitor/manage/`, `/en/monitor/manage/`, `/zh-cn/monitor/manage/`
- Each product workspace links to its corresponding route. Pages require a signed-in Clerk session and the configured `NEXT_PUBLIC_FACTORY_API_URL` Worker. Switching user or organization remounts the editor and invalidates its in-flight list/detail requests.

## Functions

The console lists owner-scoped apps from `GET /api/picosvc/functions/apps`. A selected app loads up to 40 recent entries from `/apps/:id/logs` and the revision index from `/apps/:id/revisions`, not the app's source code or secret values. It supports renaming and pausing/resuming using `PATCH /apps/:id`, and restoring an older revision using `POST /apps/:id/rollback` after explicit confirmation. A rollback changes live code and creates a new revision; it does not automatically prove any deployment is healthy. Code editing, revision source viewing and secret configuration remain in the existing detailed workspace. The UI discards raw invocation error messages and source returned by other endpoints.

## Monitor

The console lists owner-scoped monitors from `GET /api/picosvc/monitor`; only the selected monitor requests `/monitor/:id/events` and `/monitor/:id/options`. It supports renaming, setting check interval (5–10080 minutes; the server enforces plan minima), pausing/resuming, and configuring content selector, ignored selector and supported strip pattern. Saving extraction options uses `PUT /monitor/:id/options` and **resets the stored comparison baseline**; the screen asks for confirmation. The first check after that reset will not generate a change event based on the former baseline. Optional manual extraction preview calls `POST /monitor/:id/preview` only after a confirmation that **one monitor check is consumed**. It shows a short hash of the extraction, not the extracted text. The history shows only event category, timestamp and webhook HTTP status; raw diffs, error messages and target/webhook URLs are not displayed here. Use the detailed workspace to change URLs.

## Release acceptance

1. Run root CI including `scripts/test-picosvc-operations-desks.mjs` and Web CI through Next.js build/static export for all 3 languages and both services.
2. Deploy compatible Pages and Worker versions. Authenticate with a test Clerk user, then switch organization/account and ensure no prior account's resource names, history or drafts persist.
3. Create two functions, confirm each has its own logs and revisions, test pause/resume, and restore an older revision in a test-only function; verify actual requests against the public endpoint. Do not roll back production code merely to test the UI.
4. Create both basic and advanced monitors; test pause/resume, interval plan minimum, options baseline reset, a permitted public-page preview and change/fetch-error history. Confirm the usage count increments once on preview and that webhook delivery works in the deployed environment.
5. Check small screens and keyboard interactions. CI cannot validate live Clerk, Cloudflare bindings, outbound networking or production invocation/notification delivery.

No database migration, pricing change or new Worker route is included in this management-screen change.
