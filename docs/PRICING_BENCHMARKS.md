# PicoSvc pricing benchmarks and cost guardrails

Checked: 2026-09-22. The authoritative quotas are in `src/picosvc/catalog.ts`; this document mirrors those limits. Quotas for higher-risk products were reduced after reviewing Cloudflare's metered pricing and PicoSvc's actual request paths. **This is a model, not a verified billing statement or a guarantee of profitability.**

PicoSvc prices are unchanged:

- Free — $0
- Pico — $1/month per service
- PicoPlus — $5/month per service
- Bundle Pico — $5/month for Pico grants across the suite
- Bundle Pro — $22/month for PicoPlus grants across the suite
- Custom — contact

## Published quotas

| Service | Free | Pico ($1/mo) | PicoPlus ($5/mo) | Cost consideration |
| --- | --- | --- | --- | --- |
| MCP | 1 Edge MCP, 5k requests, 20 builds, no Sandbox | 5 Edge MCP, 75k requests, 200 builds, no Sandbox | 25 MCP, 2 Sandbox slots, 250k requests, 1k builds; 10k Sandbox active minutes | Parent and Dynamic Worker both consume resources; Sandbox may incur Container and Durable Object charges. |
| Mock | 1 endpoint, 1.5k requests | 10 endpoints, 25k requests | 100 endpoints, 250k requests | Usage counting and request history both write to D1. |
| Hooks | 1 inbox, 500 events, 100 retained | 5 inboxes, 10k events, 1k retained | 25 inboxes, 100k events, 10k retained | D1 event metadata and R2 PUT/DELETE operations. |
| RSS | 3 feeds, 150 checks, 10k requests, 24h minimum refresh | 20 feeds, 6k checks, 100k requests, 3h minimum refresh | 100 feeds, 40k checks, 250k requests, 30m minimum refresh | Scheduled checks and outbound fetches have costs beyond delivered RSS requests. |
| Mail | 1 route, 100 mails | 5 routes, 2k mails | 25 routes, 20k mails | Email Routing is free to receive; Worker/D1 operations are not. |
| Shot | 10 shots | 100 shots | 500 shots | Browser duration, not only request count, determines marginal cost. |
| Fetch | 10 requests | 200 requests | 1k requests | Markdown fetch uses Browser Run; metadata-only fetch does not. |
| QR | 5 dynamic QR, 1k scans | 50 dynamic QR, 10k scans | 300 dynamic QR, 150k scans | Redirect and scan counting incur Worker/D1 use. |
| Cron | 1 job, 2k runs | 10 jobs, 30k runs | 50 jobs, 250k runs | Scheduled invocations and run history consume Worker/D1 resources. |
| Functions | 1 function, 10k invokes | 5 functions, 40k invokes | 20 functions, 250k invokes | Parent/child Worker execution, usage counter, invocation-history insert and pruning all matter. |
| JSON | 1 store, 100 documents, 10 MB, 10k requests | 10 stores, 1k documents, 50 MB, 30k requests | 50 stores, 3k documents, 500 MB, 150k requests | Current capacity enforcement scans documents on writes; read volume depends on document count. |
| Files | 1 space, 20 files, 100 MB, 10k downloads | 5 spaces, 1k files, 1 GB, 100k downloads | 25 spaces, 10k files, 10 GB, 1M downloads | R2 operations, storage, and D1 usage checks. |
| License | 1 project, 10 keys, 1k validations | 3 projects, 100 keys, 25k validations | 10 projects, 1k keys, 250k validations | Public validation requests write usage counters. |
| Flags | 1 project, 10 flags, 50k requests | 3 projects, 100 flags, 250k requests | 10 projects, 500 flags, 1M requests | Every metered request currently writes a D1 usage counter. |
| Monitor | 1 monitor, 750 checks, 60m minimum | 20 monitors, 20k checks, 15m minimum | 100 monitors, 100k checks, 5m minimum | Outbound checks plus D1 writes. |
| Forms | 3 forms, 100 submissions | 20 forms, 2k submissions | 100 forms, 20k submissions | Submission history and pruning incur D1 operations. |

## Cloudflare marginal cost references

Prices and shared account-wide monthly included allocations must be applied across *all* PicoSvc customers and products, not separately per subscriber. The following rates are used in `scripts/test-picosvc-margin.mjs` as of its 2026-09-16 snapshot; check Cloudflare's current prices before revising the model.

- Workers Paid: $5/month account base; 10M requests and 30M CPU-ms included; marginal $0.30/M requests and $0.02/M CPU-ms.
- Dynamic Workers: 1,000 unique workers/month included, then $0.002 per worker per day; normal Workers usage also applies.
- Browser Run: 10 browser-hours/month included, then $0.09/browser-hour for Quick Actions.
- Containers: included memory/CPU/disk allocations, then billed by provisioned resource time. Related Durable Object usage and applicable network traffic are separate.
- D1: 25B rows read and 50M rows written included; marginal $0.001/M reads and $1/M writes; 5 GB storage included.
- R2 Standard: 10 GB-month, 1M Class A and 10M Class B operations included; marginal $0.015/GB-month, $4.50/M Class A and $0.36/M Class B; Internet egress is free.
- Inbound Email Routing: free for inbound email; Worker execution and storage are still metered.

Official documentation:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/dynamic-workers/pricing/
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/email-service/platform/pricing/

### Browser-duration sensitivity

The *request* caps above do not guarantee a browser-time ceiling. At $0.09 per hour after shared included hours, a customer using 200 Fetch calls averaging 60 seconds each consumes about $0.30 in marginal Browser Run charges; 1,000 calls averaging 60 seconds consume about $1.50. This excludes other request costs. Browser seconds should be metered using Cloudflare's actual duration signals and capped by tier before scaling up these plans. Avoid describing the assumed 5-second Fetch and 10-second Shot durations in the margin script as enforced ceilings.

### Margin test limitations

`node scripts/test-picosvc-margin.mjs` is a **simplified marginal-overage guard**, not a complete per-customer margin audit. Known omissions or undercounts include:

- Parent Worker invocation/CPU for nested Dynamic Worker execution where applicable.
- Functions' invocation-history insert plus pruning writes in addition to the usage-counter write.
- JSON's `COUNT`/`SUM` over documents on writes, including D1 rows read and index write amplification.
- Browser duration beyond the fixed 5-second Fetch and 10-second Shot assumptions, unsuccessful retries and unusually heavy pages.
- Container-related Durable Object operation/storage costs, possible container traffic charges, build and admin paths, operational support, tax, refunds, disputes and currency conversion.

Do not assert that a passing margin test proves that every plan, especially Bundle Pro under simultaneous maximum usage, is profitable. Compare measured Cloudflare account-wide usage and actual Stripe/Clerk receipts against real subscriber cohorts before changing limits upwards.

## Checkout economics

PicoSvc uses Clerk Billing over Stripe. The simplified model assumes Clerk Billing 0.7% plus Stripe Japan standard online-card 3.6%, or 4.3% of gross receipts. Additional fixed or variable fees, tax, refunds, disputes and FX can reduce realized revenue. Sources: https://clerk.com/pricing and https://stripe.com/jp/pricing .

## Enforcement and rollout

- `consumeUsage` enforces monthly limits with an atomic D1 UPSERT and a quota condition. Product and bundle entitlements both derive limits from `src/picosvc/catalog.ts`.
- Edge-only MCP applies to Free/Pico. PicoPlus supports at most two Sandbox MCPs; sandbox active minutes are metered separately.
- Browser-backed endpoints currently cap **requests**, not browser seconds. Real duration-based enforcement is a follow-up engineering task.
- Reducing a published limit may affect existing paid subscribers immediately upon deployment, including subscribers partway through their billing cycle. Review customer communications, grandfathering and applicable subscription terms before deploying new lower quotas to production.
