# PicoSvc architecture

PicoSvc is a suite of tiny developer infrastructure products sharing one account and one dashboard. Product usage and entitlements remain independent, while public paid pricing is standardized across the suite.

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

Marketing pages stay on `picosvc.com` with locale-prefixed paths such as `picosvc.com/ja/mock`, `picosvc.com/en/hooks`, and `picosvc.com/ja/pricing`. Subdomains are reserved for runtime endpoints where they make URLs clearer or isolate traffic.

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

The current repository is migrated incrementally rather than physically moving every file at once. `src/picosvc-entry.ts` is the front controller: PicoSvc Core routes are handled first and all existing MCP routes fall through to the legacy MCP entrypoint.

## Shared account model

Clerk remains the authentication authority. The existing identity model is retained:

```text
ownerId = active Clerk organization ID || Clerk user ID
```

Every product stores resources and usage against the same `ownerId`. This means a user signs in once and can enable multiple PicoSvc products without separate accounts.

Browser applications obtain a Clerk session token and send it as a Bearer token to the API. Do not depend on cross-subdomain cookies for API authentication.

## Billing model

Standalone product entitlements remain independent, but every PicoSvc service uses the same public paid prices:

| Public plan | Internal tier | Monthly price |
| --- | --- | ---: |
| Free | `free` | $0 |
| Pico | `tiny` | $1 per service |
| PicoPlus | `pro` | $5 per service |
| Custom | n/a | Contact PicoSvc |

The legacy/internal IDs `tiny` and `pro` are retained for database compatibility. Public UI must show **Pico** and **PicoPlus** instead.

Product-specific quotas still differ. One owner may have:

```text
owner       product     tier     source
user_123    mcp         tiny     standalone:mcp-tiny
user_123    hooks       pro      standalone:hooks-pro
user_123    qr          free     default
```

Here `mcp/tiny` means MCP Pico at $1/month and `hooks/pro` means Hooks PicoPlus at $5/month. Buying a standalone plan upgrades only that product.

`product_entitlements` stores standalone product grants and `product_usage_monthly` stores generic product/metric monthly counters.

## Bundles

Two concrete suite bundles are active:

```text
Bundle Pico — $5/month
  every PicoSvc product -> tiny (public name: Pico)

Bundle Pro — $22/month
  every PicoSvc product -> pro (public name: PicoPlus)
```

Migration `0008_picosvc_bundles.sql` provides `bundle_entitlements`. Multiple bundle grants can coexist with standalone subscriptions. Entitlement resolution uses the highest active tier for each product, so a standalone PicoPlus plan is not downgraded by Bundle Pico and vice versa.

The billing adapter writes:

- a standalone purchase to `product_entitlements`
- each product grant from a bundle to `bundle_entitlements`

Cancelling a standalone product does not cancel unrelated products. Cancelling a bundle removes only grants originating from that bundle.

Usage above PicoPlus, custom quotas, or negotiated business terms are handled through the contact channel rather than a fourth self-serve paid tier.

## Current catalog behavior

`src/picosvc/catalog.ts` exposes:

- `PICOSVC_PRODUCTS` — per-product status, endpoint, public plan labels, standardized prices, and product-specific quotas
- `PICOSVC_BILLING_MODEL` — declares USD monthly pricing, public tier labels, Custom contact behavior, and bundle support
- `PICOSVC_BUNDLES` — active Bundle Pico ($5/month) and Bundle Pro ($22/month) grants

MCP, Mock, and Hooks are currently active products. Planned products already inherit the same Pico $1 / PicoPlus $5 price model so they launch consistently; product-specific limits may remain unspecified until implementation.

## API

- `GET /api/picosvc/catalog` — public product catalog, standardized pricing model, and active bundle definitions
- `GET /api/picosvc/products/:slug` — one product definition
- `GET /api/picosvc/account` — authenticated standalone entitlements, bundle grants, and current-month product usage
- `/api/picosvc/mock/endpoints` — authenticated PicoSvc Mock management
- `/api/picosvc/hooks/inboxes` — authenticated webhook inbox management and monthly usage
- `/api/picosvc/hooks/inboxes/:id/events` — paginated webhook event inspection
- `/api/picosvc/hooks/events/:id` — event detail/delete
- `/api/picosvc/hooks/events/:id/replay` — replay a stored event to a permitted public HTTP(S) target
- `/hooks/:publicId/*` — public webhook receiver for an enabled inbox

Hooks stores request bodies up to 512 KiB, redacts authentication/cookie headers, and counts accepted inbound events against the owner’s monthly Hooks event quota. Deleting an event does not subtract already consumed usage. Replay does not count as a new inbound event.

Existing MCP routes remain unchanged.

## Legal and marketing pages

The web application publishes localized versions of:

- `/pricing` — public standalone and bundle pricing
- `/terms` — Terms of Service
- `/privacy` — Privacy Policy
- `/contact` — Contact & Support
- `/tokushoho` — Specified Commercial Transactions Act disclosure

The canonical pages live under `/en`, `/ja`, and `/zh-cn`; legacy non-prefixed routes remain compatibility entry points. Legal pages describe the independent-product model and bundle behavior, while exact public prices are surfaced on the Pricing page and final checkout.

## Deployment direction

A single repository does **not** imply a single Worker. Keep deployment units small and isolate runtime concerns. PicoSvc Core should own account/billing/usage logic, while product Workers handle product traffic. Cloudflare Service Bindings can connect Workers internally when the products are split out.

MCP remains the exceptional heavy product because it needs Dynamic Workers and Sandbox fallback. Most other PicoSvc products should be ordinary Workers using shared D1/R2/Queues/Durable Objects only where needed.
