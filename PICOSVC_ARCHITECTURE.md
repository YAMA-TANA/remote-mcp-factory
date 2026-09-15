# PicoSvc architecture

PicoSvc is a suite of tiny developer infrastructure products sharing one account, one billing identity, one dashboard, and one repository.

The existing Remote MCP Factory becomes **PicoSvc MCP**. Its Dynamic Worker / Sandbox runtime remains unchanged while PicoSvc Core is layered in front of it.

## Product catalog

| Product | Role | Suggested endpoint |
| --- | --- | --- |
| PicoSvc MCP | MCP hosting / stdio-to-Remote conversion | `mcp.picosvc.com` |
| PicoSvc Mock | Mock API | `mock.picosvc.com` |
| PicoSvc Hooks | Webhook inbox / replay | `hooks.picosvc.com` |
| PicoSvc RSS | Web to RSS | `rss.picosvc.com` |
| PicoSvc Mail | Email to Webhook | `*@in.picosvc.com` |
| PicoSvc Shot | Screenshot / PDF | `api.picosvc.com/v1/shot` |
| PicoSvc Fetch | URL to Markdown / metadata | `api.picosvc.com/v1/fetch` |
| PicoSvc QR | Dynamic QR / redirect | `qr.picosvc.com` |
| PicoSvc Cron | Cron execution / monitoring | `api.picosvc.com/v1/cron` |
| PicoSvc Functions | Tiny serverless functions | `fn.picosvc.com` |
| PicoSvc JSON | JSON API / tiny DB | `json.picosvc.com` |
| PicoSvc Files | R2-backed file delivery | `files.picosvc.com` |
| PicoSvc License | License key validation | `api.picosvc.com/v1/license` |
| PicoSvc Flags | Feature flags / remote config | `api.picosvc.com/v1/flags` |
| PicoSvc Monitor | Web page change monitoring | `api.picosvc.com/v1/monitor` |
| PicoSvc Forms | Form backend | `forms.picosvc.com` |

Marketing pages should stay on paths such as `picosvc.com/mock` and `picosvc.com/mcp`. Subdomains are reserved for runtime endpoints where they make URLs clearer or isolate traffic.

## Repository model

One GitHub monorepo, multiple deployable Workers:

```text
picosvc/
  apps/
    web/                    # picosvc.com / app.picosvc.com
  workers/
    core/                   # auth, account, entitlement, usage, billing adapters
    mock/
    hooks/
    rss/
    mail/
    shot/
    fetch/
    qr/
    cron/
    functions/
    json/
    files/
    license/
    flags/
    monitor/
    forms/
    mcp/                    # existing Remote MCP Factory runtime
  packages/
    auth/
    billing/
    usage/
    database/
    contracts/
    ui/
```

The current repository is migrated incrementally rather than physically moving every file at once. `src/picosvc-entry.ts` is now the front controller: PicoSvc Core routes are handled first and all existing MCP routes fall through to the legacy MCP entrypoint.

## Shared account model

Clerk remains the authentication authority. The existing identity model is retained:

```text
ownerId = active Clerk organization ID || Clerk user ID
```

Every product stores resources and usage against the same `ownerId`. This means a user signs in once and can enable multiple PicoSvc products without separate accounts.

Browser applications obtain a Clerk session token and send it as a Bearer token to the API. Do not depend on cross-subdomain cookies for API authentication.

## Entitlements

PicoSvc tiers are product-scoped rather than account-global:

```text
owner       product     tier
user_123    mcp         tiny
user_123    hooks       pro
user_123    qr          free
```

The migration `0006_picosvc_core.sql` adds:

- `product_entitlements` — active Free/Tiny/Pro tier per owner and product
- `product_usage_monthly` — generic product/metric monthly counters

This is intentionally separate from the existing MCP-only `billing_cache` and `usage_monthly` tables so the MCP service can continue working during migration.

## Billing direction

Target public pricing is product-scoped:

- Free: $0
- Tiny: $1/month
- Pro: $3/month

Known quotas are encoded in `src/picosvc/catalog.ts`. Products whose quotas have not been decided yet expose the tier prices with `limits: null`; no arbitrary limits are invented.

The next billing step is to map active Clerk Billing subscription items to `(product, tier)` entitlements, for example `mcp-tiny`, `hooks-pro`, and `qr-tiny`.

## API added in the core migration

- `GET /api/picosvc/catalog` — public product catalog and tier metadata
- `GET /api/picosvc/products/:slug` — one product definition
- `GET /api/picosvc/account` — authenticated product entitlements and current-month product usage

Existing MCP routes remain unchanged.

## Deployment direction

A single repository does **not** imply a single Worker. Keep deployment units small and isolate runtime concerns. PicoSvc Core should own account/billing/usage logic, while product Workers handle product traffic. Cloudflare Service Bindings can connect Workers internally when the products are split out.

MCP remains the exceptional heavy product because it needs Dynamic Workers and Sandbox fallback. Most other PicoSvc products should be ordinary Workers using shared D1/R2/Queues/Durable Objects only where needed.
