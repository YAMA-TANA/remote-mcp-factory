# Flags / Files 個別管理画面

This document describes repository source, **not confirmed production behavior**. The pages are authenticated Clerk clients using the configured `NEXT_PUBLIC_FACTORY_API_URL` Worker API. No new Worker routes, database migration, pricing changes or production release are included.

## Routes and navigation

| Service | Japanese | English | Chinese |
| --- | --- | --- | --- |
| Flags | `/ja/flags/manage/` | `/en/flags/manage/` | `/zh-cn/flags/manage/` |
| Files | `/ja/files/manage/` | `/en/files/manage/` | `/zh-cn/files/manage/` |

Both pages are linked from the respective `/[locale]/[service]/app/` workspace. The existing workspace remains the place to create projects/spaces and perform operations not supported by these desks.

## Flags

- Load owner-scoped projects from `GET /api/picosvc/flags/projects`. Fetch flags **only for the selected project** from `GET /api/picosvc/flags/projects/:id/flags`.
- Add or edit a flag with `PUT /api/picosvc/flags/projects/:id/flags` (`key`, JSON `value`, `enabled`); toggle using the same endpoint **with its existing value**, never omit `value`, because the API otherwise overwrites the value with `false`. Confirm before disabling. Key renames are not directly supported by the backend: create a new key and delete the old one explicitly.
- Delete a flag using `DELETE /api/picosvc/flags/projects/:id/flags/:key` after confirmation. The public `/flags/:publicId` response returns enabled flags and **consumes a request quota**; this desk only copies its URL and does not call it to test flags.
- Validate a flag key, bounded JSON input and response size. Reject JSON `null` in writes because the existing backend uses `body.value ?? false`, which changes null into false. Flags are **public configuration**; do not store credentials or private personal information in flag values.

## Files

- List owner-scoped spaces using `GET /api/picosvc/files/spaces`. Fetch up to 500 object **metadata** rows for the selected space using `GET /api/picosvc/files/spaces/:id/objects`, including total storage use and quota. The list is bounded to the backend's latest 500 objects: it is **not an exhaustive listing** above that count.
- Upload a selected file up to 10 MiB via `PUT /api/picosvc/files/spaces/:id/object?path=...`, validating the relative path and asking before overwriting a path shown in the loaded list. An object outside the 500 returned rows might already exist; the API still applies its normal overwrite semantics. Check storage quota and errors returned by the Worker.
- Delete the selected object with `DELETE .../object?path=...` only after confirmation. This is permanent and may invalidate a public URL. Show/copy `/files/:publicId/:path` only for spaces reported enabled. Do not fetch or render object bodies, ETags, private headers or raw storage records.
- Public files should not include secret content. File uploads preserve the browser file MIME type (defaulting to `application/octet-stream`), and the public file server returns that content type; review uploaded HTML/script content and your threat model before making a space public.

## Safety / release verification

- Each API call uses a fresh Clerk session token, `cache: no-store` and redirect rejection. Switching account/organization remounts and clears the editor; changing project invalidates outstanding detail requests. A mutation requires a valid resource ID/path and confirmation for destructive actions.
- `scripts/test-picosvc-flags-files-desks.mjs` validates response allowlists, invalid IDs/paths, JSON input, URL construction and UI safety wiring in root CI. Web CI checks TS, UI regressions, Next.js build and static export.
- **Production acceptance remains outstanding:** with two real Clerk accounts, verify no cross-owner visibility; create/change/disable/delete a test flag and verify published JSON; upload/download/overwrite/delete a small file, check disabled-space behavior, quota rejection and storage counters; verify all three locale routes on the actual Pages deployment. Use disposable resources only.
