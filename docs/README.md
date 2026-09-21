# PicoSvc documentation / ドキュメント

PicoSvc is a suite of **16 developer services** sharing a Clerk account. This directory separates user instructions, API usage, operator procedures and implementation notes. Documentation describes the repository source, **not a guarantee that the corresponding Cloudflare deployment is current or fully verified**.

## Start here / はじめに

| What you need | Document |
| --- | --- |
| Sign in, create your first resource, understand credentials and quotas | [クイックスタート / Quickstart](PICOSVC_QUICKSTART.md) |
| Manage quotas across all services, investigate threshold alerts and export metadata-only CSV | [利用量・上限の専用管理画面 / Usage console](PICOSVC_USAGE_CONSOLE.md) |
| All 16 services: management endpoints, required creation fields, and working request examples | [サービス・APIガイド / Service and API guide](PICOSVC_API_GUIDE.md) |
| Deploy Pages and Worker, check D1 migrations, diagnose skipped builds | [運用・デプロイ / Deployment runbook](PICOSVC_DEPLOYMENT.md) |
| Screenshot-specific API keys and acceptance testing | [Screenshot API](SCREENSHOT_API.md) |
| Production acceptance checklist and known limitations | [Launch handoff](PICOSVC_LAUNCH_HANDOFF.md) |
| Current product catalog and architecture | [All services implementation](ALL_SERVICES_IMPLEMENTATION.md) |
| Standalone and bundle subscriptions | [Billing model](BILLING_MODEL.md) |
| Costs and pricing assumptions (not live prices) | [Pricing benchmarks](PRICING_BENCHMARKS.md) |
| Official vendor feature comparisons, limitations and acceptance gaps | [Competitor capability gaps](COMPETITOR_CAPABILITY_GAPS.md) |
| Future ideas, not necessarily released | [Roadmap](PICOSVC_ROADMAP.md) |

For the original Remote MCP deployment architecture, see the [repository README](../README.md). For the Cloudflare Pages-specific setup, see [web/README.md](../web/README.md).

## Source-of-truth rules

- **Available products and quotas:** [`src/picosvc/catalog.ts`](../src/picosvc/catalog.ts). The public `GET /api/picosvc/catalog` endpoint reflects the deployed Worker version, which may differ from `main`.
- **Frontend creation fields and collection paths:** [`web/app/service-ui-config.ts`](../web/app/service-ui-config.ts); Mock and Screenshot have dedicated workspaces.
- **Actual API behavior and route precedence:** [`src/picosvc/routes.ts`](../src/picosvc/routes.ts) and its imported handlers. Some legacy handlers coexist with newer ones; do not infer endpoints from filenames alone.
- **Deployment instructions:** [`wrangler.jsonc`](../wrangler.jsonc), [web/README.md](../web/README.md), and the [deployment runbook](PICOSVC_DEPLOYMENT.md). Cloudflare Dashboard settings are external and cannot be confirmed from GitHub alone.

When changing a service: update its API guide entry and examples, update deployment instructions if bindings or migrations change, and extend tests as needed. Do not mark a product as production-verified solely because GitHub CI passes.
