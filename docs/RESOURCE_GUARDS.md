# PicoSvc resource guards

These are execution safeguards, not changes to Free/Pico/PicoPlus monthly request quotas or prices.

## Browser-backed Fetch and Shot

- A single atomic D1 lease per account serializes Fetch Markdown and Shot across Worker isolates. Another request is rejected with HTTP 429 and `Retry-After` while one is active. Starts have a 2-second minimum spacing, and failed renders trigger a 10-second cooldown. A 3-minute lease expiry recovers from Worker termination. The lock is acquired **before** the monthly request quota is consumed.
- The account-scoped Cloudflare rate limiter also restricts Fetch/Shot bursts. Fetch metadata has no browser lease but is still rate limited and its upstream fetch/stream are abortable.
- Quick Actions have provider-side navigation and action timeouts. Fetch and Shot cap the caller's target deadline at 20 seconds and do not use a `Promise.race()` that returns before the billable Quick Action completes. Shot allows up to 1 second of explicit waiting, restricts viewport pixels, and no longer performs an implicit second browser capture for a blank image.
- The Browser Run binding does **not** expose a cancellation handle for Quick Actions. A 20-second response-time hard kill cannot be guaranteed during provider startup or when the provider overruns its own timers. The code awaits the provider result before releasing the lease; an abandoned Worker retains the lease until its expiry. For strict browser termination, migrate this execution path to an explicitly managed Puppeteer session and call `browser.close()` in `finally`.
- Browser Run's `X-Browser-Ms-Used` response header is logged for successful provider responses. It is not yet a reliable per-account cumulative billing meter for provider failures or abandoned executions; account-wide Cloudflare usage must still be monitored.

## JSON

- Migration `0031_picosvc_resource_guards.sql` backfills `json_store_usage` **once** and creates triggers that update document counts and UTF-8 byte totals on insert, update and delete, including Unicode values. Deleting a store cascades away its usage row.
- Both master and scoped write guards read usage across at most the owner's store rows rather than aggregating every JSON document for each PUT. Document byte and count quotas remain the same.
- Public JSON requests and managed document/export routes use the existing 600-requests-per-minute Cloudflare rate limiter, keyed by the presented authorization credential (or visitor IP for public reads). This is a burst throttle, not a per-account quota replacement.
- Each authenticated JSON export page now consumes the existing JSON monthly `requests` quota, and the export itself retains its 100-document / ~1 MiB page limits.
- Counter updates are atomic SQL triggers; pre-write quota checks still run separately from the document mutation, so highly concurrent writes may temporarily overshoot a hard storage/document plan limit. Fixing that completely requires combining the limit check with the write in one D1 transaction or trigger. The rate limiter is not a strict concurrency lock for JSON.

Run `wrangler d1 migrations apply remote-mcp-factory --remote` before deploying code that references the new tables; otherwise browser execution fails closed (HTTP 503), while JSON writes will fail until the migration is applied.
