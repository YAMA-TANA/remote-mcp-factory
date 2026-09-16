# PicoSvc Screenshot API — setup and acceptance

The Screenshot product is an **HTTP API**, not a dashboard-only button. The dashboard at `/en/shot/`, `/ja/shot/`, or `/zh-cn/shot/` is a test console and a place to issue and revoke Screenshot-scoped API keys.

## Required deployment steps

From the repository root, apply the **additive D1 migration** and deploy the **Worker**, not only the Pages frontend:

```bash
npx wrangler d1 migrations apply remote-mcp-factory --remote
npx wrangler deploy
```

The migration `0029_picosvc_shot_api_keys.sql` creates `shot_api_keys`. Until it is applied, the API-key panel returns `503 api_keys_unavailable`. Verify that the Worker has a Browser Run binding named `BROWSER` and a D1 binding named `DB` (`wrangler.jsonc` defines both). The frontend's `NEXT_PUBLIC_FACTORY_API_URL` must be the **deployed Worker origin**, not the Pages site. Clerk configuration and allowed web origins must also match.

Changing only Cloudflare Pages does **not** deploy the updated `/api/picosvc/shot` backend.

## Start: create a key once

1. Sign in to PicoSvc and open **Screenshot → API keys**.
2. Create a named key and save the `pss_...` secret. It is shown only once; the database stores only its SHA-256 hash. Keys are limited to Screenshot and can be revoked in the same panel.
3. Store it in the **server/CI secret store**, never a public Next.js environment variable or client-side JavaScript.

```bash
export PICOSVC_SHOT_API_KEY='pss_YOUR_PRIVATE_KEY'
export PICOSVC_API_URL='https://YOUR_DEPLOYED_WORKER_ORIGIN'

curl --fail-with-body -sS -X POST "$PICOSVC_API_URL/api/picosvc/shot" \
  -H "Authorization: Bearer $PICOSVC_SHOT_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/","format":"png","waitUntil":"networkidle2","width":1280,"height":720,"fullPage":false,"waitMs":900}' \
  --output capture.png
```

This can run from a cron job, GitHub Actions, or your own backend. One API key has access **only** to Screenshot, not to other PicoSvc services or key-management routes. Each API request still consumes the owner's Screenshot quota. Key management itself requires a Clerk login session.

`POST /api/picosvc/shot` returns `image/png` or `application/pdf` bytes directly on success. It returns JSON containing `error.code` and `error.message` on failure; use `curl --fail-with-body` and check HTTP status rather than saving an error document as `capture.png`.

## Capture controls

| Field | Behavior |
| --- | --- |
| `url` | Required public HTTP(S) URL on port 80/443; local/private IPs are rejected. |
| `format` | `png` (default) or `pdf`. |
| `waitUntil` | Default `networkidle2`; also `networkidle0`, `load`, `domcontentloaded`. |
| `waitMs` | Extra delay after navigation (default 900ms; maximum 10 seconds). |
| `selector` | PNG only: wait until a given CSS element is visible before capturing. |
| `width`, `height` | Viewport, default 1280×720. |
| `fullPage` | PNG only; default `false`. |
| `timeoutMs` | Navigation/action limit, default/max 20 seconds. |

The API retries an all-white PNG once with stricter loading, then returns `422 blank_capture` if there is still no visible content. It does not claim that all errors can be automatically repaired: login-required pages, blocked bots, unreachable sites, and animations without stable content may require different inputs or may remain unsupported. Very large or unsupported PNG encodings are validated structurally but cannot always be evaluated for blankness.

## Production smoke test (uses one or two Screenshot quota units)

After applying the migration, deploying the Worker and creating a key, run:

```bash
PICOSVC_SHOT_API_KEY='pss_YOUR_PRIVATE_KEY' \
PICOSVC_API_URL='https://YOUR_DEPLOYED_WORKER_ORIGIN' \
node --experimental-strip-types scripts/smoke-picosvc-shot.mjs
```

Set `PICOSVC_SHOT_SMOKE_PDF=1` to test PDF as well. This is an **optional live test**; CI also tests PNG white/visible classification, output signature checks, route ordering and D1 migration syntax **without consuming real Browser Run time**. Neither CI nor a successful Pages build proves that a live authenticated capture works on production.

## Product-quality gate

Before marketing Screenshot as production-ready, verify a successful nonwhite capture of `https://example.com/`, successful capture of at least one JavaScript-heavy site, explicit `422` for a blank page, usable PNG/PDF downloads, key creation/use/revocation, error handling, and quota behavior against the deployed Worker. Repeat after Browser Run or Worker deployment changes. Use the same acceptance approach for each of the other PicoSvc services; a static UI build is not evidence of functional readiness.
