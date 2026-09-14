# Security model

Remote MCP Factory intentionally executes third-party code. Treat every submitted repository as hostile.

## Current boundaries

- Each deployment gets its own Cloudflare Sandbox identity/process/filesystem.
- The Worker control plane never `eval`s repository code.
- Management APIs require a verified Clerk identity.
- Deployment ownership is tied to the Clerk user or active Clerk Organization.
- Protected MCP tokens are stored only as SHA-256 hashes.
- MCP requests are rate-limited per server and per client identity.
- Monthly quotas cap request/build consumption by owner.
- GitHub URL and branch/subdirectory inputs are validated before shell use.

## Before public launch

The following are launch blockers for an open signup service:

1. Add egress controls or a documented outbound-network policy for Sandboxes.
2. Add hard build time, process, disk, and memory limits.
3. Add abuse controls for crypto-mining, scanners, spam, malware, and denial-of-wallet workloads.
4. Add encrypted secret storage before allowing user-provided MCP environment variables.
5. Add R2 snapshots with integrity/version metadata instead of trusting mutable rebuild state.
6. Pin source commits for reproducible deployments and show the deployed SHA.
7. Validate the MCP with `initialize` + `tools/list` before marking it ready.
8. Add deletion/cleanup flows for Sandbox data and deployment records.
9. Add audit logs for deploy, rebuild, token rotation, visibility change, and deletion.
10. Keep `ALLOW_DEV_AUTH=false` in production.

## Public vs Protected

`public` means the MCP endpoint itself requires no bearer credential. It does not bypass platform quotas, server-level rate limits, or owner billing limits.

`token` means callers must provide the generated deployment token. Rotation invalidates the previous token immediately.
