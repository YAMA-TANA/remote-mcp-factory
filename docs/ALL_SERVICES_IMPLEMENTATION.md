# PicoSvc all-services implementation

PicoSvc runs sixteen developer services under one Clerk account and one Cloudflare Worker front controller.

## Active products

- MCP — MCP hosting / stdio → Remote conversion
- Mock — Mock API endpoints
- Hooks — Webhook inbox / inspect / replay
- RSS — monitored Web → RSS feeds
- Mail — Cloudflare Email Service `email()` handler → HTTPS webhook
- Shot — Browser Run screenshot / PDF
- Fetch — URL → Markdown / metadata
- QR — dynamic QR redirects with stable SVG codes
- Cron — scheduled HTTP jobs, driven by a minutely Worker Cron Trigger
- Functions — tiny JavaScript fetch handlers on Cloudflare Dynamic Workers
- JSON — Bearer-token protected key/value JSON stores
- Files — R2-backed public file delivery
- License — license-key issuance, revoke and public validation
- Flags — public feature-flag configuration endpoints
- Monitor — scheduled page-change checks with optional webhook notification
- Forms — public JSON / urlencoded form submissions

## Shared platform

All products use the same:

- Clerk identity (`ownerId = orgId || userId`)
- `product_entitlements`, `bundle_entitlements` and monthly usage counters
- Free / Pico / PicoPlus tiers
- Pico `$1/month` per service
- PicoPlus `$5/month` per service
- Bundle Pico `$5/month`
- Bundle Pro `$22/month`
- Custom usage via contact

Internal tier IDs remain `free`, `tiny`, `pro` for database compatibility; public labels are Free, Pico and PicoPlus.

## Clerk Billing plan slugs

PicoSvc automatically recognizes active Clerk Billing subscription items using these slugs:

```text
picosvc-mcp-pico
picosvc-mcp-picoplus
picosvc-mock-pico
picosvc-mock-picoplus
...
picosvc-forms-pico
picosvc-forms-picoplus

picosvc-bundle-pico
picosvc-bundle-pro
```

The same convention applies to all sixteen product slugs. Existing MCP slugs `pico`, `picoplus`, `pro`, and `team` remain migration-compatible. Billing subscriptions are lazily synchronized into PicoSvc entitlement tables with a five-minute cache.

The localized Pricing page mounts Clerk's official PricingTable for user or Organization plans, so configured Clerk plans open the normal Clerk checkout drawer.

## Cloudflare bindings

`wrangler.jsonc` configures:

- D1 `DB`
- R2 `ARTIFACTS`
- Dynamic Worker `LOADER`
- Browser Run `BROWSER`
- Sandbox
- one-minute Cron Trigger

Incoming Mail additionally requires Cloudflare Email Service / Email Routing to route `*@in.picosvc.com` to this Worker. DNS and Email Routing rules are account-level infrastructure and are not created by Worker source code.

## Database

- `0010_picosvc_all_services.sql` adds resources/events for the thirteen newly implemented services.
- `0011_picosvc_billing_sync.sql` adds the Clerk billing synchronization cache.

`npm run db:init` applies the base schema plus both migrations for a fresh database. Production uses `npm run db:migrate` after deploying the migrations.

## Safety limits

Outbound HTTP targets pass the shared public-URL policy: HTTP(S) only, no embedded credentials, localhost/local/internal/metadata names blocked, private IP literals blocked, standard ports only, and every redirect is revalidated.

Request/content caps are enforced for webhook bodies, JSON documents, form submissions, fetched pages, function code and R2 uploads. Product quotas are resolved from standalone or Bundle entitlements before billable operations.
