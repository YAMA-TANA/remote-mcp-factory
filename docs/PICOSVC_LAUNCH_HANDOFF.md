# PicoSvc post-merge launch handoff

Issue #30 is the implementation roadmap for the category-core PicoSvc feature set and its CI guardrails. Production/provider verification is intentionally tracked separately because it cannot be proven by repository CI alone.

## Merge gate for PR #31

PR #31 may merge when all repository workflows are green on the final head and the branch remains mergeable.

## Production launch gate (post-merge)

Do not enable or market paid production traffic until these are verified against the real production account:

1. Apply D1 migrations 0012–0028 to the production database and run a post-migration smoke check.
2. Deploy the Worker/Web build with the required D1, R2, Browser, Dynamic Worker and Sandbox bindings/secrets.
3. Verify a real $1 checkout and refund through Clerk/Stripe, including webhook-driven entitlement changes.
4. Verify standalone-vs-bundle entitlement precedence and downgrade behavior with real billing events.
5. Exercise real provider paths: Cloudflare Email Routing multipart mail, Browser screenshot, Dynamic Worker function secret injection/rollback, Sandbox-required MCP, scheduled Cron retry/notification, private Files signed upload/download and Forms Turnstile.
6. Configure Cloudflare account-level Browser/Sandbox spend notifications and verify the on-call destination.
7. Observe real bundle utilization/cost distribution before treating the $5/$22 bundle margin model as validated.
8. Publish and verify Terms, Privacy, AUP, refund, support and status URLs in production navigation.
9. Add/verify external synthetic polling of `/api/picosvc/health` from outside Cloudflare.

## Non-blocking hardening after merge

These improve operations but are not required to merge the implementation PR:

- Unified request-ID/error envelope across every legacy and PicoSvc route.
- Central structured-log sink/query beyond the bounded per-product histories already implemented.
- Generated OpenAPI specification and expanded curl cookbook for all 16 services.
- Provider-level orphan-object reconciliation for R2 in addition to bounded cleanup paths.
- Email notification provider integration for products that currently use webhook notifications or delivery audit records.

The production launch issue should own this list and link back to Issue #30 and PR #31.
