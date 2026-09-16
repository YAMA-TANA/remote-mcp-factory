# PicoSvc deployment and product-quality handoff

Repository CI checks types, contracts, selected simulated service behavior and static HTML generation. **It does not deploy the Worker, apply D1 migrations or verify that a real provider returns usable content.** Do not treat a green CI run as production acceptance for all 16 services.

## Required deployment order

1. Back up and inspect the production D1 migration history. Apply pending migrations through **0029** (`0027_picosvc_monitor_advanced.sql` enables tracked Monitor errors and events; `0029_picosvc_shot_api_keys.sql` enables Screenshot-scoped API keys). Use `npx wrangler d1 migrations apply remote-mcp-factory --remote` from the repository root; check the actual target database before confirming a production migration.
2. Deploy the **Worker** from this repository using `npx wrangler deploy`. A Cloudflare Pages UI deploy alone does **not** update the Screenshot, RSS or Monitor API. Confirm `DB`, `BROWSER`, R2, Dynamic Worker and Sandbox bindings and the required secrets on the Worker.
3. Deploy the **Pages frontend** using the `web` root, `npm run build` and `out` output. Check `NEXT_PUBLIC_FACTORY_API_URL` points to the deployed Worker origin and that the Worker `WEB_ORIGINS` includes the actual Pages/custom origin.
4. From outside Cloudflare, check `GET /api/picosvc/health` returns HTTP 200, then sign in on Pages and verify the account context and quotas. The health endpoint does not prove individual product features work.

## Real functional acceptance (not yet established by CI)

| Product | Production test | Failure signal |
| --- | --- | --- |
| Screenshot | Issue a scoped API key, capture `https://example.com/` and a JavaScript-heavy page, verify image pixels and downloaded PDF, then revoke the key. See [`SCREENSHOT_API.md`](SCREENSHOT_API.md). | Empty/white PNG, PDF containing error JSON, missing Browser binding, key revocation not enforced. |
| RSS | Create a feed from a reachable public page; verify `initialStatus=ready`, `initialItems>0`, and fetch the resulting `.xml`. Try a broken/blocked URL and check that HTTP 422 is shown and no ghost feed remains. | HTTP 201 with an empty/unreadable feed, silent initial fetch failure, orphaned feed. |
| Monitor | Create a monitor and verify that it appears as tracked. Run the scheduled Worker (or wait for its configured cron), confirm `/events` records fetch errors separately from changes, and inspect the diagnostic panel in `/ja/monitor/`. | No scheduled checks, hidden HTTP failure, duplicate legacy/advanced checks, missing migration 0027. |
| Billing | Perform a real $1 checkout and refund via Clerk/Stripe; verify webhook-driven entitlements and bundle precedence. | Paid access unchanged, improper downgrade or duplicate charges. |

For RSS, a failed initial fetch may still consume a monthly check because upstream/provider work was attempted. Do not blindly refund quota without proof the specific request was charged; concurrent requests may share the same monthly counter.

## Additional launch gates

Verify Cloudflare Email Routing multipart mail, private Files signed upload/download, Functions secret injection and rollback, MCP edge/Sandbox paths, Cron retry/notification and Forms Turnstile. Configure account-level Browser/Sandbox spend alerts and an external synthetic health monitor. Publish and verify Terms, Privacy, AUP, refund, support and status URLs. Observe real bundle usage/cost rather than treating a modeled margin as production profit.

## Follow-up engineering

- Unify structured error payloads and request IDs in legacy routes; `/api/picosvc/` now supplies `x-request-id`, but older `/api/servers` and public runtime routes remain separate.
- Add real provider-backed E2E tests in a safe staging environment (with seeded test accounts, bounded spend and cleanup), not just regex/source-contract checks.
- Generate a complete OpenAPI specification and curl cookbook for all supported services.
- Improve provider-level orphaned R2-object reconciliation, notifications, and operational logs.

The implementation roadmap is tracked in [Issue #30](https://github.com/YAMA-TANA/remote-mcp-factory/issues/30). Production/provider verification remains a separate acceptance requirement.
