# Remote MCP Factory

> Status: early MVP — Clerk auth, plan quotas, public/protected endpoints, and isolated Cloudflare Sandbox execution are implemented.

**GitHub → Remote MCP.** Paste a GitHub repository containing a stdio MCP server and get a remote Streamable HTTP endpoint running in an isolated Cloudflare Sandbox.

The product goal is deliberately Vercel-like: connect a repo, let the platform detect how it runs, deploy it, and receive a stable URL.

## Product flow

1. Sign in with **Clerk**.
2. Paste a public GitHub MCP repository URL.
3. Factory clones it into a dedicated Cloudflare Sandbox.
4. It detects Node/Python, installs dependencies, builds, and detects the stdio start command.
5. `mcp-proxy` exposes the original stdio MCP as Streamable HTTP.
6. Factory returns `/mcp/<deployment-id>`.
7. Choose **Public** or **Protected** access.
8. Usage is metered per owner and enforced against the current Clerk Billing plan.

## Access model

### Management plane

All `/api/*` management routes require a valid **Clerk session**. Ownership is keyed to the active Clerk Organization when present, otherwise the Clerk user ID.

Set these Worker secrets/variables:

```text
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
CLERK_JWT_KEY              # optional but recommended for networkless verification
CLERK_AUTHORIZED_PARTIES   # comma-separated app origins
CLERK_SIGN_IN_URL          # optional hosted/custom sign-in URL
CLERK_PRICING_URL          # optional pricing page URL
```

`ALLOW_DEV_AUTH=true` exists only for local development. Never enable it in production.

### MCP data plane

Each deployment has one of two visibility modes:

- **Public** — no credential is required to connect.
- **Protected** (`token`) — `Authorization: Bearer <token>` is required.

Protected tokens are generated once and only their SHA-256 hashes are stored. Owners can rotate tokens through the management API.

Public does **not** mean unlimited: every endpoint has Cloudflare short-window rate limits plus monthly plan quotas.

## Pricing model

The defaults intentionally resemble a Vercel-style free tier + paid capacity model. Prices are configured in Clerk Billing; code only maps plan slugs to entitlements.

| Plan | Suggested price | Active deployments | MCP requests / month | Builds / month |
| --- | ---: | ---: | ---: | ---: |
| Hobby | $0 | 1 | 5,000 | 20 |
| Pro | $20 / month | 10 | 250,000 | 200 |
| Team | $20 / seat / month | 50 | 1,000,000 | 1,000 |

Default Clerk plan slugs are `pro` and `team`; override with `CLERK_PRO_PLAN_SLUG` and `CLERK_TEAM_PLAN_SLUG`.

Clerk Billing currently handles recurring plans and seat billing, but not true usage-based/metered billing. The MVP therefore meters usage and hard-stops at the included quota. A later billing adapter can send overages to Stripe Billing without changing the deployment model.

## Supported in the MVP

- Public GitHub repositories
- Node MCPs using `package.json` scripts/bin
- Python MCPs using `pyproject.toml` / `requirements.txt`
- Manual stdio command override
- Public and bearer-protected Remote MCP endpoints
- Clerk user + Organization ownership
- Clerk Billing plan lookup with a short D1 cache
- Monthly deployment/request/build quotas
- Per-server and per-client Cloudflare rate limits
- One isolated Cloudflare Sandbox per MCP deployment

## Planned

- GitHub App integration for private repositories
- User-supplied encrypted environment secrets
- R2 build snapshots to avoid reinstalling after Sandbox sleep
- `tools/list` health checks before marking a build healthy
- GitHub webhook auto-deploy on push
- Deployment logs and analytics dashboard
- Custom domains
- True metered overage billing via a billing adapter
- Public directory/listing opt-in for discoverable MCPs

## Cloudflare setup

Sandbox/Containers require the appropriate Cloudflare Workers plan.

```bash
npm install
npx wrangler d1 create remote-mcp-factory
# Put the returned database_id into wrangler.jsonc
npx wrangler d1 execute remote-mcp-factory --remote --file=./schema.sql
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
# optional/recommended
npx wrangler secret put CLERK_JWT_KEY
npx wrangler deploy
```

Configure the same Worker/custom domain as an allowed Clerk application origin and set `CLERK_AUTHORIZED_PARTIES` accordingly.

## Example deployment

POST `/api/servers` while signed in:

```json
{
  "repoUrl": "https://github.com/YAMA-TANA/CALCULATE_MCP",
  "branch": "main",
  "visibility": "public"
}
```

or:

```json
{
  "repoUrl": "https://github.com/YAMA-TANA/CALCULATE_MCP",
  "branch": "main",
  "visibility": "token"
}
```

Protected deployments return a bearer token exactly when created/rotated. Store it securely.

## Security boundary

Repositories are arbitrary untrusted code. They execute inside separate Cloudflare Sandbox instances, not inside the control-plane Worker. See [SECURITY.md](./SECURITY.md) before exposing this service publicly.
