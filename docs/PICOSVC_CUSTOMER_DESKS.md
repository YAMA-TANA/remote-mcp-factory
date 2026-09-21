# Forms / License individual management consoles

This describes repository implementation and CI coverage, not a claim that production Pages/Worker is up to date or authenticated workflows have been exercised.

## Routes

| Service | Japanese | English / Chinese |
| --- | --- | --- |
| Forms | `/ja/forms/manage/` | `/en/forms/manage/`, `/zh-cn/forms/manage/` |
| License | `/ja/license/manage/` | `/en/license/manage/`, `/zh-cn/license/manage/` |

Both routes are static-exportable, Clerk-authenticated client consoles. The associated service workspace headers link to them. An account/organization change remounts the editor, discarding previously loaded data. The Worker verifies resource ownership on each request.

## Forms

- Select a form from a searchable inventory; copy its public POST endpoint.
- Load existing `GET /api/picosvc/forms/:id/config`, edit allowed **exact HTTPS origins**, required field names, honeypot name and Turnstile requirement, and save through `PUT /api/picosvc/forms/:id/config`. The existing webhook destination and success redirect are preserved in the PUT payload without being displayed. An empty allowed-origin list permits all origins; enabling Turnstile requires a configured Worker secret.
- Inspect up to 100 submission timestamps and abbreviated IDs via `GET /api/picosvc/forms/:id/search`. The optional text search searches submitted payload server-side, but the console deliberately drops the payload and headers from the response. It does not export PII. Delivery history via `GET /api/picosvc/forms/:id/deliveries` shows timestamp and HTTP status only, not destination or error body.
- Creating/deleting forms and editing webhook destinations remain in the existing detailed workspace. The Forms API does **not** currently offer a pause/resume PATCH route; the console does not pretend otherwise.

## License

- Select a project and list issued keys via `GET /api/picosvc/license/projects/:id/keys`; only the label, expiration and revoked state are retained in UI state. License key plaintext, metadata and customer references are not rendered.
- Select a key to retrieve up to 100 validation results and activation count from `/api/picosvc/license/keys/:id/validations` and `/activations`. Device hashes and raw unrecognized validation reasons are not displayed. The activation count is a count of returned records (capped at 100), **not** an exact count above 100.
- Revoke or restore a key with an explicit confirmation and `PATCH /api/picosvc/license/keys/:id`. Restoring a revoked key does not bypass expiry or activation limits. New key issuance, advanced rules and plaintext one-time credential handling remain in the existing workspace.

## Acceptance before claiming production-ready

1. Confirm current Pages and Worker revisions and D1 migrations; CI does not prove production deployment.
2. With two separate test accounts/organizations, verify switching removes form submissions, delivery records and license key history immediately.
3. Create a test form with an existing webhook destination and success redirect, change only allowed origins, and confirm both previously configured URLs remain unchanged. Test allowed-origin rejection, empty-origin behavior, and Turnstile secret configuration.
4. Submit synthetic non-PII form data, test search and delivery display, and verify raw payload, destination and delivery errors are never rendered or logged client-side.
5. Issue a test license, revoke and restore it, and verify validation outcomes, expiry and activation limits through the actual Worker. Ensure key plaintext, customer metadata and device hashes never appear in the new console.
6. Check translations, narrow screens, empty/error/expired-session states and existing service workspaces.

Regression coverage: `scripts/test-picosvc-customer-desks.mjs` in root CI; Web CI performs frontend TypeScript checking, existing UI regression tests, Next.js build and static export.
