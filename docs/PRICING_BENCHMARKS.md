# PicoSvc pricing benchmarks

Checked: 2026-09-16

PicoSvc keeps one public price model across the suite:

- Free — $0
- Pico — $1/month per service
- PicoPlus — $5/month per service
- Bundle Pico — $5/month for Pico grants across the suite
- Bundle Pro — $22/month for PicoPlus grants across the suite
- Custom — contact

The quotas below are intentionally not simple copies of competitors. They use public competitor plans as anchors, then apply a lower ceiling where PicoSvc's implementation has a meaningful marginal Cloudflare cost (Browser Run, Dynamic Workers, D1 writes, or persistent storage).

## Published quotas

| Service | Free | Pico ($1/mo) | PicoPlus ($5/mo) | Main benchmark / rationale |
| --- | --- | --- | --- | --- |
| MCP | 1 MCP, 5k requests, 20 builds | 5 MCP, 250k requests, 200 builds | 25 MCP, 1M requests, 1k builds | Keep the existing Remote MCP capacity model. Dynamic Worker count is the important cost guardrail. |
| Mock | 1 endpoint, 1.5k requests | 10 endpoints, 25k requests | 100 endpoints, 250k requests | Beeceptor Free is 50 req/day and 3 rules; $10 Individual is 15k req/month per endpoint and 50 rules. PicoSvc uses account-wide request limits at a much lower price. |
| Hooks | 1 inbox, 500 events, 100 retained | 5 inboxes, 10k events, 1k retained | 25 inboxes, 100k events, 10k retained | Webhook.site Basic is $9 for 1 URL and 1k request history; Pro is $27 for 50 URLs and 10k history. Retained history is capped separately from monthly accepted events. |
| RSS | 3 feeds, 24h refresh | 20 feeds, 3h refresh | 100 feeds, 30m refresh | FetchRSS Free is 5 feeds / 24h; $4.95 is 25 / 3h; $9.95 is 100 / 30m. PicoSvc closely follows these operating points at lower prices. |
| Mail | 1 route, 100 mails | 5 routes, 2k mails | 25 routes, 20k mails | Developer inbound-mail services commonly expose a small free allowance. Cloudflare inbound routing keeps PicoSvc's marginal receive cost low. |
| Shot | 50 shots | 300 shots | 2k shots | ScreenshotOne Free is 100; Basic is $17 for 2k. PicoSvc's paid ceiling accounts for Browser Run duration cost. |
| Fetch | 100 requests | 1k requests | 5k requests | Firecrawl Free is 1k credits and Hobby is $19 for 5k. PicoSvc is cheaper and narrower, so 5k is the PicoPlus ceiling. |
| QR | 5 dynamic QR, 1k scans | 50 dynamic QR, 10k scans | 300 dynamic QR, 150k scans | QRCodeChimp Free is 10 / 1k scans; Starter $9.99 is 50 / 10k; Pro $19.99 is 300 / 150k. |
| Cron | 1 job, 2k runs | 10 jobs, 30k runs | 50 jobs, 250k runs | EasyCron Free allows 200 executions/day at 20-minute minimum; its $24/year plan allows 8k/day and 1-minute interval. PicoSvc uses monthly account-wide run caps. |
| Functions | 1 function, 10k invokes | 5 functions, 100k invokes | 20 functions, 1M invokes | Deno Deploy Free is much more generous, but PicoSvc uses per-function Dynamic Workers whose daily unique-worker charge creates a real marginal cost. |
| JSON | 1 store, 10k requests | 10 stores, 100k requests | 50 stores, 1M requests | JSONBin Free exposes 10k requests and its paid tier is materially more expensive. D1 makes moderate request volumes inexpensive, but writes are still metered. |
| Files | 1 space, 20 files, 100 MB | 5 spaces, 1k files, 1 GB | 25 spaces, 10k files, 10 GB | Uploadcare Free is 1 GB storage / 5 GB traffic. PicoSvc is a simpler R2-backed object service, so storage is explicit and delivery remains simple. |
| License | 1 project, 10 keys, 1k validations | 3 projects, 100 keys, 25k validations | 10 projects, 1k keys, 250k validations | Cryptlex Starter is $100/month with 3 products, 1k active activations and 100k API requests. PicoSvc is deliberately much simpler and cheaper. |
| Flags | 1 project, 10 flags, 50k requests | 3 projects, 100 flags, 250k requests | 10 projects, 500 flags, 1M requests | ConfigCat Free includes 10 flags per product and millions of config downloads. PicoSvc request caps are lower because every fetch is currently metered through D1. |
| Monitor | 1 monitor, 750 checks, 60m minimum | 20 monitors, 20k checks, 15m minimum | 100 monitors, 100k checks, 5m minimum | changedetection.io starts around $8.99/month with thousands of watches. PicoSvc keeps tighter check limits to bound outbound fetch and D1 write cost. |
| Forms | 3 forms, 100 submissions | 20 forms, 2k submissions | 100 forms, 20k submissions | Formspark Free is 10 forms / 250 submissions; a $25 one-time bundle is 100 forms / 50k submissions. Formspree Free starts at 50 submissions/month. |

## Competitor sources

- Beeceptor pricing: https://beeceptor.com/pricing/
- Webhook.site plans: https://docs.webhook.site/pro.html and https://webhook.site/register
- FetchRSS pricing: https://fetchrss.com/prices
- ScreenshotOne pricing: https://screenshotone.com/pricing/
- Firecrawl pricing: https://www.firecrawl.dev/pricing
- QRCodeChimp pricing: https://www.qrcodechimp.com/pricing
- EasyCron plans: https://www.easycron.com/user/register
- Deno Deploy pricing: https://deno.com/deploy/pricing
- Uploadcare pricing: https://uploadcare.com/pricing/
- Cryptlex pricing: https://cryptlex.com/pricing
- ConfigCat limits: https://configcat.com/docs/subscription-plan-limits/
- Formspark pricing: https://formspark.io/pricing/
- Formspree account limits: https://help.formspree.io/articles/account-management/account-limits

## Cloudflare cost guardrails

Current public Cloudflare pricing used for the guardrail check:

- Dynamic Workers: 1,000 unique Dynamic Workers/month included, then $0.002 per Dynamic Worker per day; Workers request/CPU allocations also apply.
- Browser Run on Workers Paid: 10 browser-hours/month included, then $0.09/browser-hour for Quick Actions.
- R2 Standard: 10 GB-month included; then $0.015/GB-month, with no Internet egress charge.

Sources:

- https://developers.cloudflare.com/dynamic-workers/pricing/
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/r2/pricing/

### Useful upper-bound checks

These are not accounting forecasts; they are sanity checks assuming the shared included allocation has already been consumed.

- 5 always-used Dynamic Workers: `5 × 30 × $0.002 ≈ $0.30/month`.
- 20 always-used Dynamic Workers: `20 × 30 × $0.002 ≈ $1.20/month`.
- 25 always-used Dynamic Workers: `25 × 30 × $0.002 ≈ $1.50/month`.
- 2,000 screenshots averaging 10 seconds of browser duration: about 5.6 browser-hours, or about $0.50 at the marginal Browser Run rate.
- 5,000 browser-backed fetches averaging 5 seconds: about 6.9 browser-hours, or about $0.63 at the marginal Browser Run rate.
- 10 GB of R2 Standard storage above the shared free allocation: about $0.15/month before operation charges.

This is why the $1 tier is conservative for Dynamic Worker count and Browser Run calls, while D1/R2-oriented products can offer substantially larger request/resource quotas.

## Enforcement notes

- Monthly usage consumption uses an atomic D1 `UPSERT ... WHERE ... RETURNING` guard so concurrent requests cannot simply race past the configured monthly quota.
- Mock requests, Dynamic QR scans and RSS refreshes are explicitly metered.
- Hooks limits both monthly accepted events and retained event history, and also caps inbox count.
- Files caps spaces, file count and total stored bytes. Space deletion paginates through the entire R2 prefix to avoid orphaning objects above one list page.
- License and Flags cap project count in addition to keys/flags and public runtime requests.
- Monitor enforces the tier minimum interval both when configuring a monitor and when the scheduler evaluates existing monitors.
