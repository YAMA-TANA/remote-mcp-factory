# QR / RSS 個別管理画面（source implementation）

The QR and RSS resource desks are static-export-compatible, owner-authenticated Pages views. This describes repository source, **not production availability**. Japanese: `/ja/qr/manage/` and `/ja/rss/manage/`; English: `/en/qr/manage/`, `/en/rss/manage/`; Chinese: `/zh-cn/qr/manage/`, `/zh-cn/rss/manage/`. Each product's existing workspace links to its desk and remains the place to create new resources.

## QR

- Search/select a link, see status and accumulated scans, copy its public redirect URL, inspect its QR SVG while enabled.
- Edit name or destination with `PATCH /api/picosvc/qr/links/:id`. The destination URL can contain a query string, so it appears only in the authenticated edit field; the resource list exposes only its hostname. Avoid using secrets in URLs.
- Pause/resume via owner-scoped PATCH. Pausing can break printed QR codes immediately; a confirmation is required. No bulk toggle, deletion or unsupported historical scan chart is claimed. The scan count is cumulative, not a time series.

## RSS

- Search/select a feed, copy its public XML URL, inspect last check, edit name/source and the five article extraction selectors.
- POST `.../preview` previews **saved** settings without changing persisted settings. POST `.../refresh` updates entries based on saved settings. Each call spends one RSS check and prompts for confirmation. The desk disables these actions while edits are unsaved. Preview only displays item titles and the hostnames of their links; raw HTML, descriptions, page bodies and query strings are discarded by the UI projection.
- Pause/resume changes owner-scoped enabled state and may prevent RSS readers from accessing XML while paused. The desk does not claim guaranteed feed delivery or instantaneous scheduling.

## Release acceptance

1. GitHub root CI: `node --experimental-strip-types scripts/test-picosvc-resource-desks.mjs`, root typecheck. Web CI: Next.js typecheck, build and static export. Check existing tests remain green.
2. Deploy a compatible Pages build and Worker. Confirm both services render with a signed-in account in all three locales, and each service workspace links to its desk. Test phone-width layout.
3. QR: create a test link via the existing studio, change its destination in the desk, scan the public URL, check destination and cumulative count, pause/restart and check access. Do not test on production printed QR codes.
4. RSS: create a public test feed, update CSS selector, save, preview and refresh with enough quota, check newly generated XML and next scheduled run. Confirm errors and quota exhaustion are handled.
5. Switch Clerk account and organization while each desk is open, and verify the old inventory, URL editor, preview and result are not retained. Verify unauthenticated access does not reveal resources.

No database migration, subscription change, Worker behavior change or production deployment is included in this UI PR. Backend URL validation and authorization remain authoritative; the UI's local validation is for fast feedback only.
