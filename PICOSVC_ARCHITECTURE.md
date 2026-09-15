# PicoSvc architecture

PicoSvc is a suite of tiny developer infrastructure products sharing one account and one dashboard while keeping billing and quotas independent by product.

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

The current repository is migrated incrementally rather than physically moving every file at once. `src/picosvc-entry.ts` is the front controller: PicoSvc Core routes are handled first and all existing MCP routes fall through to the legacy MCP entrypoint.

## Shared account model

Clerk remains the authentication authority. The existing identity model is retained:

```text
ownerId = active Clerk organization ID || Clerk user ID
```

Every product stores resources and usage against the same `ownerId`. This means a user signs in once and can enable multiple PicoSvc products without separate accounts.

Browser applications obtain a Clerk session token and send it as a Bearer token to the API. Do not depend on cross-subdomain cookies for API authentication.

## Billing model: independent products first

There is **no account-global PicoSvc paid tier**. Every service has its own subscription, price, quotas, and upgrade path.

For example, one owner may have:

```text
owner       product     tier     source
user_123    mcp         tiny     standalone:mcp-tiny
user_123    hooks       pro      standalone:hooks-pro
user_123    qr          free     default
```

Buying `mcp-tiny` upgrades MCP only. It does not unlock Mock, Hooks, RSS, or any other product.

`product_entitlements` stores the standalone product entitlement and `product_usage_monthly` stores generic product/metric monthly counters. The product catalog can reuse tier labels such as Free/Tiny/Pro, but those labels do **not** imply common pricing. Each product owns its own prices and limits.

Prices for products that have not been finalized should remain `null` in `src/picosvc/catalog.ts` instead of inheriting a suite-wide price.

## Bundles

PicoSvc can also sell discounted bundles without turning the whole suite into one plan. A bundle is simply a set of product grants, for example:

```text
bundle: starter-dev
  mock  -> tiny
  hooks -> tiny
  rss   -> tiny
```

A future checkout may price that combination below the sum of the three standalone subscriptions. The exact bundle composition and discount belong in the billing catalog and must not be inferred from product pricing.

Migration `0008_picosvc_bundles.sql` adds `bundle_entitlements`. Multiple bundle grants can coexist with standalone product subscriptions. Entitlement resolution uses the highest active tier granted for a product, so a direct Pro subscription is not accidentally downgraded by a Tiny bundle and vice versa.

The billing adapter should write:

- a standalone purchase to `product_entitlements`
- each product grant from a bundle to `bundle_entitlements`

This keeps cancellation and renewal logic explicit. Cancelling one standalone product does not cancel unrelated products, while cancelling a bundle removes only the grants originating from that bundle.

## Current catalog behavior

`src/picosvc/catalog.ts` exposes:

- `PICOSVC_PRODUCTS` — per-product status, endpoints, plans, prices, and quotas
- `PICOSVC_BILLING_MODEL` — declares billing as per-product with bundle support
- `PICOSVC_BUNDLES` — concrete bundle offers; kept empty until an actual bundle and price are approved

Known active pricing may be represented directly for MCP and Mock. Planned products may expose known quotas while leaving undecided paid prices as `null`.

## API

- `GET /api/picosvc/catalog` — public product catalog, per-product billing model, and active bundle definitions
- `GET /api/picosvc/products/:slug` — one product definition
- `GET /api/picosvc/account` — authenticated standalone entitlements, bundle grants, and current-month product usage

Existing MCP routes remain unchanged.

## Legal pages

The web application publishes:

- `/terms` — Terms of Service
- `/privacy` — Privacy Policy

Both documents reflect the independent-product billing model and optional bundles. Before paid public launch, verify the operator/legal entity, private support or privacy-contact channel, tax/commercial-disclosure requirements, and governing-law language for the actual business entity.

## Deployment direction

A single repository does **not** imply a single Worker. Keep deployment units small and isolate runtime concerns. PicoSvc Core should own account/billing/usage logic, while product Workers handle product traffic. Cloudflare Service Bindings can connect Workers internally when the products are split out.

MCP remains the exceptional heavy product because it needs Dynamic Workers and Sandbox fallback. Most other PicoSvc products should be ordinary Workers using shared D1/R2/Queues/Durable Objects only where needed.
