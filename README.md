# PicoSvc — small developer services, one account

PicoSvc combines **16 developer services** in one repository, a shared Clerk identity and a Cloudflare Worker front controller. The original Remote MCP Factory (GitHub → Remote MCP) is one of those services. The Next.js frontend is built separately for Cloudflare Pages.

> **Implementation vs production:** This repository contains implemented routes and automated tests. GitHub CI does not deploy Pages/Workers, apply production D1 migrations or prove the availability of the actual Browser, Sandbox, email, billing and DNS services. Check the live environment separately before making production-readiness claims.

## Documentation / ドキュメント

- **[Documentation index / ドキュメント一覧](docs/README.md)** — entry point and source-of-truth map.
- **[クイックスタート](docs/PICOSVC_QUICKSTART.md)** — log in, use the dashboard, create your first resource and store credentials safely.
- **[16サービス・APIガイド](docs/PICOSVC_API_GUIDE.md)** — management endpoint table and executable cURL examples for Mock, RSS, Cron, Monitor, Fetch, QR and Shot.
- **[運用・デプロイ手順](docs/PICOSVC_DEPLOYMENT.md)** — separate Pages, Worker and D1 rollout; Cloudflare's skipped-build message; production checks.
- **[Screenshot API](docs/SCREENSHOT_API.md)** — scoped API keys, browser settings, PNG/PDF output and smoke tests.
- **[Launch handoff](docs/PICOSVC_LAUNCH_HANDOFF.md)** — concrete service acceptance criteria and unresolved production verification.
- **[Billing model](docs/BILLING_MODEL.md)** — current Free, Pico, PicoPlus and bundle model. Historical MCP-only prices do **not** apply to PicoSvc.

## Products

| Product | Current source-level scope |
| --- | --- |
| MCP | GitHub MCP hosting and stdio-to-Remote conversion; Edge-first with Sandbox fallback |
| Mock | Configurable HTTP response endpoints |
| Hooks | Webhook inbox, inspection and manual replay |
| RSS | Public webpage to RSS feed extraction and refresh |
| Mail | Inbound email to HTTPS webhook (requires provider Email Routing) |
| Shot | Browser screenshot / PDF capture; scoped automation API keys |
| Fetch | Bounded URL to Markdown / metadata extraction |
| QR | Dynamic redirect and SVG QR code |
| Cron | Scheduled HTTP requests |
| Functions | Small JavaScript edge handlers |
| JSON | Bearer-protected JSON key/value stores |
| Files | R2-backed file spaces and access controls |
| License | License key issuance and validation |
| Flags | Remote configuration / feature flags |
| Monitor | Scheduled page-change checks and optional webhooks |
| Forms | Form submission backend |

Live quota and price data comes from the **deployed Worker** `GET /api/picosvc/catalog`; source defaults live in [`src/picosvc/catalog.ts`](src/picosvc/catalog.ts). Product-specific limits differ. The source-level standalone tiers are Free, Pico ($1/month/product) and PicoPlus ($5/month/product); bundles are documented in [Billing model](docs/BILLING_MODEL.md). Confirm the actual checkout price in the billing provider.

## Project layout

```text
src/picosvc-entry.ts      Worker entry point
src/picosvc/            Product APIs, runtime routes, quotas and security
web/                    Next.js static frontend for Cloudflare Pages
migrations/             D1 migrations
scripts/                Contract, simulated-behavior and smoke tests
docs/                   User guides, API examples and operator runbooks
wrangler.jsonc           Worker bindings, name and Cron Trigger
```

**Two deploys, not one:** frontend changes under `web/` need a successful **Pages** deployment. Backend changes under `src/` need a **Worker** deployment. Schema changes under `migrations/` need the correct production **D1 migration**. A passing GitHub Actions workflow alone does none of these. See the [runbook](docs/PICOSVC_DEPLOYMENT.md).

## Local development

Worker (repository root):

```bash
npm install
npm run typecheck
npm run dev
```

Web (in a second terminal):

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Edit `web/.env.local` for your own **Worker origin** and Clerk *publishable* key. Do not enable `ALLOW_DEV_AUTH` in production. The [web README](web/README.md) has the exact Pages build settings. Database initialization, remote migrations, secrets and production rollout are described in the [deployment runbook](docs/PICOSVC_DEPLOYMENT.md); **do not run database initialization against existing production data**.

## Authentication and credentials

Most management routes under `/api/picosvc/` and `/api/servers` require a Clerk session. Ownership uses the active Clerk Organization when available, otherwise the user. The `GET /api/picosvc/catalog` endpoint is public, while `GET /api/picosvc/account` requires a session. Public data-plane URLs (Mock, RSS, QR, etc.) have service-specific rules and quotas; a public URL does not mean unrestricted use.

PicoSvc MCP supports public endpoints and bearer-token protected endpoints. Protected tokens are shown when created/rotated and are stored as hashes. MCP deployment environment secrets are AES-GCM encrypted; management APIs list names instead of disclosing values. The Screenshot API has separate `pss_...` keys limited to that product; **do not reuse them as management credentials**.

The Worker needs provider secrets/variables appropriate to the features you enable. The Remote MCP / GitHub App configuration includes:

```text
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
DEPLOYMENT_SECRETS_KEY       # base64-encoded 32 random bytes
CLERK_JWT_KEY                # optional/recommended
CLERK_AUTHORIZED_PARTIES     # allowed application origins, if used
CLERK_SIGN_IN_URL            # optional
CLERK_PRICING_URL            # optional
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_SLUG
GITHUB_WEBHOOK_SECRET
GITHUB_OAUTH_CALLBACK_URL    # optional; see GitHub App settings
```

Generate the deployment encryption key locally with `openssl rand -base64 32` and store it as a Worker secret (`npx wrangler secret put DEPLOYMENT_SECRETS_KEY`). **Do not rotate it without a key-rotation migration**: existing encrypted deployment secrets depend on it. Do not commit any secret, installation token or sensitive webhook payload. `ALLOW_DEV_AUTH=true` is for local development only, never production. For security boundaries and operating constraints, see [SECURITY.md](SECURITY.md) and [deployment runbook](docs/PICOSVC_DEPLOYMENT.md).

## Remote MCP deployment workflow

1. Sign in with Clerk. Paste a **public repository URL**, or connect a private repository through the GitHub App at `/github`.
2. Select the branch, public/token visibility and any required encrypted environment secrets. For a private repository, authorize GitHub App installation access to the relevant repository.
3. The deployment pipeline clones/builds in an isolated Cloudflare Sandbox, selects an Edge-compatible Dynamic Worker or Sandbox fallback, and performs MCP `initialize` / `tools/list` health checks before considering it ready.
4. Use the issued MCP URL (typically `/mcp/<deployment-id>` on the configured MCP origin). Store the one-time protected bearer token securely.
5. GitHub App deployments may auto-rebuild on signed push webhooks for the configured repository and branch. Review build failures, access and quota status in management APIs rather than assuming a Git push makes every deployment ready.

GitHub App integrations include `/api/github/connect/start`, `/api/github/callback`, `/api/github/installations`, `/api/github/deploy` and the signature-verified `/api/github/webhook`. The installation ID alone is not authorization; the connection uses OAuth/PKCE and verifies the user's installation access. Configure the GitHub App's minimum required repository contents read permission and subscribed webhook events for your deployment workflow. Keep the GitHub App private key, OAuth client secret and webhook secret on the Worker. Repository source is untrusted code and must run inside isolated execution environments, not the management Worker.

## Contributing and testing

Run the relevant repository CI checks and update the matching documentation whenever an API path, field, quota, runtime requirement, secret or migration changes. Keep examples free of real credentials. A static export or typecheck is **not** a live acceptance test; use the [launch handoff](docs/PICOSVC_LAUNCH_HANDOFF.md) with controlled test resources for production verification.
