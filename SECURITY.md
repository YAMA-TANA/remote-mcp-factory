# PicoSvc security model / セキュリティ

PicoSvc accepts user-controlled URLs, webhooks, files and (for MCP/Functions) code. Treat submitted repositories, code, input and remote responses as **untrusted**. This page distinguishes **source-level controls** from **production launch requirements**. No claim here means that every control has been tested successfully against the live Cloudflare environment.

For user-facing credential handling, read the [quickstart](docs/PICOSVC_QUICKSTART.md) and [API guide](docs/PICOSVC_API_GUIDE.md); for infrastructure and acceptance checks, read the [deployment runbook](docs/PICOSVC_DEPLOYMENT.md) and [launch handoff](docs/PICOSVC_LAUNCH_HANDOFF.md).

## Controls implemented in the repository

- The management plane uses verified Clerk identity; the active Clerk Organization (when set) otherwise the user is the resource owner. Other authentication mechanisms (GitHub OAuth callback, signed GitHub webhook, per-resource bearer tokens and Screenshot-scoped API keys) are **not interchangeable**.
- Protected MCP tokens and other applicable service keys are stored as hashes; token values are displayed on creation/rotation and must be saved safely. MCP deployment environment secrets are AES-GCM encrypted at rest and management APIs return names, not plaintext values. Existing encrypted values depend on `DEPLOYMENT_SECRETS_KEY`.
- Untrusted MCP source is built/run through isolated Cloudflare Sandbox execution; the Worker control plane must not execute arbitrary submitted repository code. Edge-compatible MCPs can use a Dynamic Worker runtime. Real MCP `initialize` and `tools/list` checks are part of the deployment implementation.
- Product quotas and MCP rate limits limit resource use. Public access does **not** waive those limits or imply that a URL is private.
- Shared outbound URL validation rejects many internal/private targets and revalidates redirects. Individual handlers also enforce request or output limits; for example, Fetch caps output at 2 MiB and supports a deadline. These are layered protections, **not proof of complete SSRF/DNS-rebinding resistance**.
- `ALLOW_DEV_AUTH` is intended only for local development and must remain `false` in production.

Refer to [`src/picosvc/security.ts`](src/picosvc/security.ts), [`src/picosvc/fetch-reliable.ts`](src/picosvc/fetch-reliable.ts), [`src/picosvc/routes.ts`](src/picosvc/routes.ts), and the corresponding individual service handlers for behavior. A documented control may depend on a D1 migration, secret, binding or external provider configuration to work in production.

## Before opening public signup or claiming production readiness

Verify and record evidence for the following; some may already have partial implementation but are **not marked complete merely by source inspection**:

1. Egress restrictions / outbound-network policy for both Sandboxes and Browser Run. Test controlled private-address, redirect and DNS-rebinding cases; do not probe third-party private services.
2. Enforced build/run time, disk, memory, concurrency and provider spend limits. Configure alerts to reduce denial-of-wallet risk.
3. Abuse protections for spam, mining, scanning, malware, excessive requests and provider-account exhaustion.
4. Encryption-key handling and a tested rotation/recovery plan **before rotating** `DEPLOYMENT_SECRETS_KEY`; verify secrets never enter logs or frontend bundles.
5. Reproducible/pinned builds, artifact integrity and R2 snapshot retention as needed; do not assume rebuilds of mutable branches reproduce identical code.
6. End-to-end MCP Edge/Sandbox health and token rotation, source/branch pinning, deletion and orphaned resource cleanup.
7. Auditable deploy/rebuild/secret change/token rotation/visibility/deletion events with sensitive values redacted.
8. Per-product live tests for Email Routing, Screenshot, Fetch, Files access, Cron, billing/entitlements, Forms protection and other external dependencies.
9. D1 backup/restore and migration compatibility; verify the **actual target DB** prior to applying migrations.
10. Privacy, terms, acceptable-use, refund, support, incident-response and status procedures appropriate to the service.

The [launch handoff](docs/PICOSVC_LAUNCH_HANDOFF.md) is the operational acceptance checklist. CI passing and a healthy `/api/picosvc/health` alone do not satisfy it.

## Reporting and handling credentials

Do not include real tokens, private keys, request `Authorization` headers, mailbox contents or customer files in issue reports or screenshots. When filing a bug, provide a redacted request, sanitized response, HTTP status and `x-request-id` when present. Revoke/rotate credentials that have been exposed. Screenshot API keys are specific to Screenshot; do not put them in `NEXT_PUBLIC_` environment variables or reuse them for other products.
