# Remote MCP Factory

> Status: early MVP — Clerk auth, GitHub App private repos, push auto-deploy, plan quotas, public/protected endpoints, encrypted deployment secrets, Edge compilation, isolated Cloudflare Sandbox execution, and real MCP health checks are implemented.

**GitHub → Remote MCP.** Connect a public or private GitHub repository containing a stdio MCP server and get a remote Streamable HTTP endpoint running on Cloudflare Dynamic Workers when compatible, with an isolated Cloudflare Sandbox fallback for heavier MCPs.

The product goal is deliberately Vercel-like: connect a repo, let the platform detect how it runs, deploy it, and receive a stable URL. GitHub App deployments can redeploy automatically when their configured branch is pushed.

## Product flow

1. Sign in with **Clerk**.
2. For public repositories, paste a GitHub URL. For private repositories, install/connect the Factory **GitHub App** from `/github`.
3. Select a repository and optionally provide encrypted environment secrets such as API keys.
4. Factory mints a short-lived GitHub App installation token only when it needs repository access; installation tokens are not stored in D1.
5. Factory clones/analyzes the repository in a dedicated Cloudflare Sandbox, detects Node/Python, installs dependencies, builds, and detects the stdio start command.
6. Compatible Node MCPs compile to a Dynamic Worker; heavier/native MCPs stay on the Sandbox fallback.
7. Factory runs a real MCP `initialize` + `tools/list` health check before marking the deployment ready.
8. Factory returns `/mcp/<deployment-id>` with Public or Protected access.
9. For GitHub App deployments, signed `push` webhooks automatically rebuild the matching repository + branch. Pushes arriving during a build are coalesced into one follow-up build.
10. Usage is metered per owner and enforced against the current Clerk Billing plan.

## Access model

### Management plane

All normal `/api/*` management routes require a valid **Clerk session**. Ownership is keyed to the active Clerk Organization when present, otherwise the Clerk user ID. The GitHub OAuth callback is authorized by one-time PKCE/state records, and the GitHub webhook endpoint is authorized by its HMAC signature instead of Clerk.

Set these Worker secrets/variables:

```text
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
DEPLOYMENT_SECRETS_KEY     # base64-encoded 32 random bytes; required to store deployment env secrets
CLERK_JWT_KEY              # optional but recommended for networkless verification
CLERK_AUTHORIZED_PARTIES   # comma-separated app origins
CLERK_SIGN_IN_URL          # optional hosted/custom sign-in URL
CLERK_PRICING_URL          # optional pricing page URL

GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY     # GitHub-generated PKCS#1 PEM or PKCS#8 PEM
GITHUB_APP_SLUG
GITHUB_WEBHOOK_SECRET
GITHUB_OAUTH_CALLBACK_URL  # optional; defaults to <request-origin>/api/github/callback
```

Generate the deployment-encryption key locally with `openssl rand -base64 32`, then store it with `npx wrangler secret put DEPLOYMENT_SECRETS_KEY`. Do not rotate this key until a key-rotation migration exists; existing encrypted deployment secrets depend on it.

`ALLOW_DEV_AUTH=true` exists only for local development. Never enable it in production.

### MCP data plane

Each deployment has one of two visibility modes:

- **Public** — no credential is required to connect.
- **Protected** (`token`) — `Authorization: Bearer <token>` is required.

Protected tokens are generated once and only their SHA-256 hashes are stored. Owners can rotate tokens through the management API.

Public does **not** mean unlimited: every endpoint has Cloudflare short-window rate limits plus monthly plan quotas.

### Deployment environment secrets

Secret values are AES-GCM encrypted at rest. Management APIs never return decrypted values; they only return secret names. Runtime secrets are injected into both Dynamic Worker and Sandbox execution environments.

You can provide secrets during the initial deployment so MCPs that need an API key can pass their first health check:

```json
{
  "repoUrl": "https://github.com/example/example-mcp",
  "branch": "main",
  "visibility": "token",
  "secrets": {
    "EXAMPLE_API_KEY": "secret-value"
  }
}
```

Management endpoints:

```text
GET    /api/servers/:id/secrets                 # list names only
PUT    /api/servers/:id/secrets                 # upsert { "secrets": { "NAME": "value" } }
DELETE /api/servers/:id/secrets/:name           # remove one secret
```

Updating or deleting a secret invalidates the warm Edge runtime identity and stops a running Sandbox proxy so the next request starts with the new environment.

## GitHub App private repositories

The GitHub setup URL's `installation_id` is deliberately **not** trusted as proof of ownership. The user authorizes the GitHub App through OAuth + PKCE, and Factory calls GitHub's user-installations API to learn which installations that GitHub user can explicitly access. The short-lived GitHub user access token is discarded after this check.

After that, repository reads use GitHub App installation tokens. They expire quickly and are minted on demand. Private clone credentials live only in a temporary `.netrc` inside the isolated Sandbox and are removed in `finally` after `git clone`; they are never written into the repository URL or D1.

GitHub routes:

```text
GET  /github                                           # minimal connect/browse/deploy UI
GET  /api/github/config
POST /api/github/connect/start                         # OAuth + PKCE start
GET  /api/github/callback                              # OAuth callback
GET  /api/github/installations
GET  /api/github/installations/:id/repositories
POST /api/github/deploy                                # deploy selected App repository
POST /api/github/webhook                               # GitHub App webhook receiver
```

Example App-backed deployment:

```json
{
  "installationId": 12345678,
  "repositoryId": 987654321,
  "branch": "main",
  "visibility": "token",
  "autoDeploy": true,
  "secrets": {
    "EXAMPLE_API_KEY": "secret-value"
  }
}
```

For the GitHub App configuration, grant the minimum repository access required to clone source (`Contents: Read-only`, plus GitHub's implicit metadata access), subscribe to `Push`, `Installation`, and `Installation repositories`, set the webhook URL to `/api/github/webhook`, and configure the same value as `GITHUB_WEBHOOK_SECRET`. Configure the OAuth callback URL as `/api/github/callback` on the production origin.

Webhook request bodies are verified against `X-Hub-Signature-256` before D1 is touched. Delivery IDs are recorded to avoid duplicate rebuilds. Only a deployment whose installation ID, repository ID, and branch all match the push is rebuilt.

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
- **Private GitHub repositories through a GitHub App**
- **Push-triggered auto-deploy with webhook signature validation and duplicate-delivery protection**
- Node MCPs using `package.json` scripts/bin
- Python MCPs using `pyproject.toml` / `requirements.txt`
- Manual stdio command override
- Encrypted per-deployment environment secrets, including initial-build injection and post-deploy updates
- Edge-first runtime selection with isolated Linux Sandbox fallback
- Real `initialize` + `tools/list` health checks for both Edge and Sandbox runtimes
- Public and bearer-protected Remote MCP endpoints
- Clerk user + Organization ownership
- Clerk Billing plan lookup with a short D1 cache
- Monthly deployment/request/build quotas
- Per-server and per-client Cloudflare rate limits
- One isolated Cloudflare Sandbox per MCP deployment/fallback runtime

## Planned

- R2 build snapshots to avoid reinstalling after Sandbox sleep
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
# Existing databases:
npm run db:migrate

npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put DEPLOYMENT_SECRETS_KEY
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put GITHUB_APP_SLUG
npx wrangler secret put GITHUB_WEBHOOK_SECRET
# optional/recommended
npx wrangler secret put CLERK_JWT_KEY
npx wrangler deploy
```

Configure the same Worker/custom domain as an allowed Clerk application origin and set `CLERK_AUTHORIZED_PARTIES` accordingly.

## Example public deployment

POST `/api/servers` while signed in:

```json
{
  "repoUrl": "https://github.com/YAMA-TANA/CALCULATE_MCP",
  "branch": "main",
  "visibility": "public"
}
```

Protected deployments return a bearer token exactly when created/rotated. Store it securely.

## Security boundary

Repositories are arbitrary untrusted code. They execute inside separate Cloudflare Sandbox instances, not inside the control-plane Worker. GitHub App private keys, OAuth client secrets, webhook secrets, installation tokens, and deployment secrets must stay server-side. See [SECURITY.md](./SECURITY.md) before exposing this service publicly.
