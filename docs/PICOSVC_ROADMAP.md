# PicoSvc Product & Launch Roadmap

> Status: living launch plan. This document defines what PicoSvc must be able to do before its low prices are compared directly with specialist competitors.
>
> Pricing principle: **do not compare quota counts unless the core job-to-be-done is materially comparable.** PicoSvc does not need full enterprise feature parity; it does need the small set of capabilities that make each service useful in a real developer workflow.

## 1. Product doctrine

PicoSvc is a suite of tiny developer services under one account and one billing relationship.

Target public model:

- Free — useful evaluation tier.
- Pico — $1/month per service.
- PicoPlus — $5/month per service.
- Bundle Pico — $5/month for Pico access across the suite.
- Bundle Pro — $22/month for PicoPlus access across the suite.
- Custom — contact / negotiated limits.

The bundle prices intentionally rely on **statistical multiplexing**: real customers will not consume 100% of all 16 products at the same time. Do not price bundles by summing every product's theoretical maximum cost. Instead, maintain hard per-product guardrails, observe real utilization, and react to aggregate cost data.

### Rules for every product

A product is launch-ready only when all of the following are true:

- [ ] Its public name and description match what the implementation actually does.
- [ ] Its primary job-to-be-done can be completed without a workaround.
- [ ] It has the 2–5 core capabilities users reasonably expect from the category.
- [ ] Expensive dimensions are hard-capped in code, not only documented.
- [ ] Monthly metering cannot be raced by concurrent requests.
- [ ] Persistent data cannot grow without a plan-aware bound or retention rule.
- [ ] Public/read traffic that can create cost is metered or intentionally free because the cost model supports it.
- [ ] Error states return useful HTTP status codes and stable machine-readable errors.
- [ ] There is an end-to-end test for the happy path and at least one quota/failure path.
- [ ] Pricing copy distinguishes account-wide limits from per-resource limits.
- [ ] The product page states important exclusions instead of implying specialist-level parity.

## 2. Positioning: compete on the core 80%, not the last 20%

PicoSvc should beat specialist products on **simplicity + price + unified account**, not attempt to reproduce every enterprise capability.

### What “competitive enough” means

For each product, identify:

1. **Core job** — why a developer opens the product at all.
2. **Category expectations** — features whose absence makes the product feel incomplete.
3. **Advanced specialist features** — useful, but not required for PicoSvc launch.
4. **Cost traps** — features or quotas that can destroy the $1/$5 economics.

Only after (1) and (2) are satisfied should PicoSvc use direct quota comparisons in marketing.

## 3. Current foundation

The following foundations already exist or are being landed in the quota/guardrail work:

- [x] One PicoSvc repository / shared account model.
- [x] Clerk identity shared across services (`owner = active org || user`).
- [x] Unified product catalog with Free / Pico / PicoPlus limits.
- [x] Bundle entitlement model.
- [x] Main PicoSvc Worker routes service traffic by path.
- [x] D1-backed generic usage accounting.
- [x] Atomic monthly usage consumption using conditional UPSERT/RETURNING.
- [x] R2 available for object/blob storage.
- [x] Browser Run binding available for browser-backed products.
- [x] Dynamic Worker loader available for Functions / Edge MCP execution.
- [x] Sandbox/Container path available for MCPs that cannot run at the edge.
- [x] Public pricing matrix exists.
- [x] Competitor/cost benchmark document exists (`docs/PRICING_BENCHMARKS.md`).
- [x] Free/Pico MCP tiers are protected from automatic Sandbox cost.
- [ ] All newly published secondary quota dimensions are enforced in runtime code.
- [ ] All service E2E tests run on the main CI path.
- [ ] Production observability / cost attribution is complete.

---

# 4. Milestones

## M0 — Finish quota and cost guardrails

Goal: no product can create an obvious unbounded Cloudflare bill.

### Global

- [ ] Finish runtime enforcement for every metric present in `catalog.ts`.
- [ ] Add a regression test for every enforced quota key.
- [ ] Add plan downgrade tests for persistent resources.
- [ ] Add a single cost-model document/table that maps each product to Workers / D1 / R2 / Browser / Dynamic Workers / Containers.
- [ ] Record both **monthly usage** and **retained state** separately.
- [ ] Record per-product usage in a way that can later be aggregated by bundle.

### Known cost work

- [ ] Hooks: move large/raw bodies to R2; keep searchable metadata/previews in D1.
- [ ] Hooks: enforce body-size and replay limits.
- [ ] RSS: meter public feed delivery if it becomes material.
- [ ] Mail: enforce retained history and prune automatically.
- [ ] Cron: enforce retained execution history and prune automatically.
- [ ] JSON: enforce total document count and total stored bytes.
- [ ] Files: enforce public/private download quota where appropriate.
- [ ] Forms: enforce retained submission history and body-size ceiling.
- [ ] Functions: add a product-level CPU budget / runtime timeout and verify Dynamic Worker limits are actually enforced.
- [ ] MCP Sandbox: meter active minutes, not just Sandbox slot count.
- [ ] Add hard request/body ceilings before expensive Browser or Sandbox work begins.

### Exit gate

- [ ] A synthetic “max-plan abuse” test cannot exceed the documented resource ceilings.
- [ ] The cost model shows >40% gross margin for each standalone paid plan under its designed worst-case assumptions.
- [ ] Bundle economics are evaluated using observed/expected utilization distributions, not 100% simultaneous use of every service.

---

## M1 — Reach minimum competitive quality for the highest-value products

Goal: the services we market aggressively must complete the same core job as the specialist benchmark.

Priority order:

1. RSS
2. Mock
3. Forms
4. Monitor
5. Hooks
6. Shot
7. Cron
8. QR

These have the biggest gap between a simple implementation and what users commonly expect from the category.

---

# 5. Per-service roadmap

## 5.1 MCP Hosting

**Positioning:** deploy GitHub/stdio MCP servers as Remote MCP with an Edge-first path and Sandbox fallback on higher tiers.

**Benchmark category:** MCP hosting/deployment platforms.

### Launch core

- [x] GitHub-backed build path.
- [x] Edge compatibility path.
- [x] Sandbox fallback infrastructure.
- [x] Edge-only cost guard for low tiers.
- [ ] Clear build/runtime logs in the dashboard.
- [ ] Deployment status timeline: queued/building/ready/error.
- [ ] Environment/secrets management per MCP.
- [ ] Rebuild/redeploy button and immutable build identifier.
- [ ] Request/error counters per MCP.
- [ ] Active-minute accounting for Sandbox MCPs.
- [ ] Explicit compatibility reason when a repo requires Sandbox.

### Post-launch specialist features

- [ ] Custom domains.
- [ ] Multi-region controls.
- [ ] Team deploy approvals.
- [ ] Rollback between historical builds.

### Quality gate

- [ ] Real-corpus build regression test covers Edge-compatible, Edge-transformable, and Sandbox-required repos.
- [ ] No silent Edge→Sandbox fallback on a tier that does not include Sandbox.

---

## 5.2 Mock API

**Positioning:** inexpensive behavioral mock endpoints for frontend/integration development.

**Benchmark:** Beeceptor-class mock servers.

Beeceptor's category core includes request matching, stateful behavior, and controlled latency/failure simulation. PicoSvc should not market request-count superiority until the first set below exists.

### Launch core

- [x] Create endpoint.
- [x] Return configured response.
- [x] Monthly request metering.
- [ ] Request inspector/history.
- [ ] Conditional matching by method/path/query/header/body.
- [ ] Multiple ordered rules per endpoint.
- [ ] Configurable status code and headers.
- [ ] Fixed response delay.
- [ ] Failure/error injection.
- [ ] Basic templating from request fields.
- [ ] OpenAPI import -> generated basic mock routes.

### Nice-to-have

- [ ] Stateful CRUD collections.
- [ ] Counters / sequence responses.
- [ ] Proxy/forward unmatched requests.
- [ ] Random/load-dependent latency profiles.

### Quality gate

- [ ] A frontend app can replace a missing REST backend using PicoSvc Mock without custom code.
- [ ] Inspector displays the exact request that selected each rule.

---

## 5.3 Hooks / Webhook Inbox

**Positioning:** receive, inspect, replay and forward webhooks.

**Benchmark:** Webhook.site-class inboxes.

### Launch core

- [x] Public inbox URL.
- [x] Event retention.
- [x] Manual replay path.
- [x] Monthly event metering.
- [ ] Full-text / field search and filters.
- [ ] Filter by method/status/date/header/body text.
- [ ] Configurable custom response status/body/headers.
- [ ] Automatic forwarding to one target URL.
- [ ] Forward/replay attempt status and response preview.
- [ ] Webhook signature verification helpers for common HMAC patterns.
- [ ] Raw body in R2 with bounded D1 metadata.
- [ ] Replay quota/body-size enforcement.

### Nice-to-have

- [ ] Multiple forwarding rules.
- [ ] Transform scripts.
- [ ] CLI/local tunnel forwarding.
- [ ] CSV/JSON export.

### Quality gate

- [ ] User can debug a Stripe/GitHub-style webhook end to end: receive -> inspect -> filter -> replay/forward.

---

## 5.4 RSS / Web -> RSS

**Positioning:** turn an article/listing page into a real RSS/Atom-style feed, not merely a page-change notification feed.

**Benchmark:** FetchRSS-class Web->RSS tools.

### P0 launch core

- [ ] Item selector.
- [ ] Title selector.
- [ ] Link selector with relative URL resolution.
- [ ] Description/content selector.
- [ ] Published-date selector when available.
- [ ] Auto-detect common article/list structures.
- [ ] Preview extracted items before saving.
- [ ] Stable GUID generation / deduplication.
- [ ] Correctly preserve multiple entries from a page.
- [ ] Tier-aware refresh interval.
- [ ] Fetch/check quota and public-feed request quota.
- [ ] Useful parsing failure diagnostics.

### Nice-to-have

- [ ] Image selector.
- [ ] CSS cleanup/exclusion selectors.
- [ ] JavaScript-rendered extraction via Browser Run as an explicit expensive mode.
- [ ] Feed filters.

### Quality gate

- [ ] Test fixtures for news list, blog, ecommerce list, and pagination page produce multiple stable items.
- [ ] Marketing does not call it generic Web->RSS until this gate passes.

---

## 5.5 Mail / Email -> Webhook

**Positioning:** inbound developer email route that produces a structured webhook.

### Launch core

- [x] Inbound route/address model.
- [x] Forward event to webhook.
- [ ] MIME parsing.
- [ ] Separate `text/plain` and `text/html` fields.
- [ ] Parsed From/To/Cc/Subject/Message-ID.
- [ ] Attachment metadata.
- [ ] Attachment bodies stored in R2 with signed retrieval.
- [ ] HMAC signature on outgoing webhook.
- [ ] Retry policy with bounded attempts/backoff.
- [ ] Delivery status/history.
- [ ] Retention pruning.

### Nice-to-have

- [ ] Spam scoring/headers.
- [ ] Custom domains.
- [ ] Rules by sender/subject.

### Quality gate

- [ ] Real multipart email with attachment arrives as deterministic structured JSON and can be verified by the receiver.

---

## 5.6 Shot / Screenshot API

**Positioning:** straightforward screenshot/PDF rendering API for developers who do not need a full browser automation platform.

**Benchmark:** ScreenshotOne-class screenshot APIs.

### Launch core

- [x] URL -> PNG.
- [x] URL -> PDF.
- [x] Monthly shot metering.
- [ ] Width/height/device scale.
- [ ] Full-page toggle.
- [ ] `waitUntil` / deterministic wait strategy.
- [ ] Bounded delay.
- [ ] CSS selector / element screenshot.
- [ ] Custom request headers.
- [ ] Cookies.
- [ ] JPEG/WebP output where Browser Run supports it economically.
- [ ] Hard timeout before pathological pages consume excessive browser time.

### Nice-to-have

- [ ] Hide/remove selectors.
- [ ] Light/dark media emulation.
- [ ] Cache controls.
- [ ] Async render + webhook.
- [ ] Ad/cookie-banner blocking.

### Explicit non-goals for launch

- [ ] Geo proxy fleet.
- [ ] Full anti-bot/stealth product parity.
- [ ] Video capture.

### Quality gate

- [ ] Screenshot of a dynamic app can wait for readiness and target one element without custom browser code.

---

## 5.7 Fetch / URL -> Markdown & Metadata

**Positioning:** deliberately narrow. This is **not Firecrawl**. It is a cheap single-URL conversion endpoint.

### Launch core

- [x] Public URL validation / SSRF guard.
- [x] Metadata mode.
- [x] Browser-backed Markdown mode.
- [x] Monthly request metering.
- [ ] Consistent output schema.
- [ ] Include final/canonical URL and HTTP metadata.
- [ ] Optional readable-content extraction.
- [ ] Hard browser timeout.
- [ ] Body/output-size ceilings.
- [ ] Clear error category: blocked, timeout, upstream, parse, quota.

### Explicit non-goals

- [ ] General site crawler.
- [ ] Search engine.
- [ ] Multi-page recursive crawl.
- [ ] LLM structured extraction platform.
- [ ] Long-lived browser sessions.

### Quality gate

- [ ] Product page says “URL -> Markdown / metadata API” and does not use crawl/extract language that implies Firecrawl parity.

---

## 5.8 Dynamic QR

**Positioning:** cheap editable redirect QR with useful analytics.

**Benchmark:** QRCodeChimp-class dynamic QR, while avoiding a full design/marketing suite.

### Launch core

- [x] Dynamic redirect target.
- [x] SVG QR generation.
- [x] Scan count.
- [ ] Daily scan time series.
- [ ] Country/region aggregate when safely available from request metadata.
- [ ] Device/user-agent category.
- [ ] Referrer aggregate.
- [ ] Downloadable PNG/SVG.
- [ ] Basic color/size/error-correction options.
- [ ] Analytics retention limits.

### Nice-to-have

- [ ] Custom short slug.
- [ ] Custom domain.
- [ ] Logo embedding.
- [ ] Bulk creation/import.

### Quality gate

- [ ] User can create an editable QR and answer “how many people scanned it, roughly when, and from what device/referrer class?”

---

## 5.9 Cron

**Positioning:** tiny reliable HTTP scheduler.

**Benchmark:** EasyCron-class HTTP cron.

### Launch core

- [x] Scheduled HTTP execution.
- [x] Run metering.
- [ ] Time zone support.
- [ ] HTTP method, headers and body.
- [ ] Success criteria by expected HTTP status.
- [ ] Request timeout.
- [ ] Retry count/backoff.
- [ ] Failure webhook/email notification.
- [ ] Execution duration/status/body-preview history.
- [ ] Retention pruning.
- [ ] Disable job automatically after configurable repeated failures.

### Nice-to-have

- [ ] Cron expression helper.
- [ ] Jitter/window execution.
- [ ] Dependency chains.

### Quality gate

- [ ] User can schedule a production webhook and be notified when it fails without watching the dashboard.

---

## 5.10 Functions

**Positioning:** tiny edge JS functions, not a general-purpose serverless cloud.

### Launch core

- [x] Create JS function.
- [x] Dynamic Worker execution.
- [x] Invocation metering.
- [x] Code-size ceiling.
- [ ] Hard CPU/runtime ceiling aligned with plan economics.
- [ ] Environment variables/secrets.
- [ ] Basic logs: request id, status, duration, error.
- [ ] Version/revision id.
- [ ] Rollback to previous revision.
- [ ] Explicit limits for subrequests and response size.
- [ ] Build/runtime error UX.

### Explicit non-goals

- [ ] Full npm build platform at launch.
- [ ] Long-running workers.
- [ ] Stateful compute product.

### Quality gate

- [ ] A small webhook transform/API glue function can be deployed, debugged and rolled back without leaving PicoSvc.

---

## 5.11 JSON

**Positioning:** tiny authenticated/public JSON document API.

### Launch core

- [x] Stores and documents.
- [x] Request metering.
- [ ] Enforce total document count.
- [ ] Enforce total storage bytes.
- [ ] Public/private store mode.
- [ ] Read/write API keys or scoped tokens.
- [ ] Optimistic concurrency (`ETag`/version) to avoid blind overwrite.
- [ ] Document-level metadata/version timestamp.
- [ ] Bulk export.

### Nice-to-have

- [ ] JSON Schema validation.
- [ ] Version history.
- [ ] TTL documents.
- [ ] Query/filter endpoint.

### Quality gate

- [ ] Safe for a small app to store configuration/content without accidental public write access or unbounded growth.

---

## 5.12 Files

**Positioning:** tiny object/file hosting API, not Uploadcare.

### Launch core

- [x] R2-backed storage.
- [x] Space/file/storage limits.
- [ ] Download metering/guardrail.
- [ ] Public/private object mode.
- [ ] Signed time-limited download URL.
- [ ] Signed/direct upload URL so large files do not proxy through the app Worker unnecessarily.
- [ ] Content-Type and Content-Disposition metadata.
- [ ] Cache-Control metadata.
- [ ] List/paginate/delete reliably.
- [ ] Prevent orphaned R2 objects on space deletion.

### Explicit non-goals

- [ ] Full image CDN/transformation suite.
- [ ] Media DAM/workflow product.
- [ ] Video processing.

### Quality gate

- [ ] Small app can safely upload a private asset directly and later hand a temporary download link to a user.

---

## 5.13 License Keys

**Positioning:** rename/describe as a **License Key API**, not an enterprise licensing platform.

### Launch core

- [x] Project model.
- [x] Issue keys.
- [x] Expiry/revoke/validate basics.
- [ ] Key metadata / customer reference.
- [ ] Activation count ceiling.
- [ ] Optional machine/device binding using a client-supplied fingerprint hash.
- [ ] Idempotent validation endpoint.
- [ ] Validation audit/history with bounded retention.
- [ ] Signing/verification strategy documented.

### Explicit non-goals

- [ ] Floating license server at launch.
- [ ] Offline cryptographic license file system.
- [ ] Enterprise entitlement catalog.
- [ ] Full native SDK matrix.

### Quality gate

- [ ] Indie desktop/SaaS developer can issue, validate, expire and revoke a product key safely.

---

## 5.14 Flags / Remote Config

**Decision required:** either implement real feature-flag semantics or rename the product to **Remote Config**.

ConfigCat-class flags include user targeting and sticky percentage rollouts. A plain key/value endpoint should not be marketed as equivalent.

### Option A — keep “Flags”

- [ ] Boolean/string/number variants.
- [ ] Environments (at least development/production).
- [ ] User/context object on evaluation.
- [ ] Targeting rules on user attributes.
- [ ] Deterministic sticky percentage rollout.
- [ ] Stable evaluation algorithm with cross-runtime test vectors.
- [ ] Default/fallback value.
- [ ] Evaluation endpoint designed to be cache/CDN friendly.

### Option B — rename to “Remote Config”

- [ ] Update catalog role/name/copy.
- [ ] Keep simple key/value retrieval.
- [ ] Add environment namespaces.
- [ ] Add version/ETag and cache semantics.

### Quality gate

- [ ] Never advertise “feature flags” unless user targeting + sticky rollout are implemented.

---

## 5.15 Monitor

**Positioning:** simple web change monitor with stable targeting of page content.

**Benchmark:** changedetection.io-class monitoring, but much narrower.

### Launch core

- [x] URL monitor and recurring check.
- [x] Tier-aware interval minimum.
- [ ] CSS selector targeting.
- [ ] Ignore/exclude selector(s).
- [ ] Regex/text include/exclude rules.
- [ ] Normalized text mode so timestamps/whitespace do not trigger noise.
- [ ] Human-readable diff preview.
- [ ] Webhook notification.
- [ ] Email notification if operationally practical.
- [ ] Failure vs content-change distinction.
- [ ] Consecutive-error handling.

### Nice-to-have

- [ ] Browser-rendered check mode.
- [ ] Visual screenshot diff.
- [ ] Logged-in/browser-step monitoring.

### Quality gate

- [ ] Typical dynamic site can be monitored without false-positive alerts from unrelated page chrome/timestamps.

---

## 5.16 Forms

**Positioning:** tiny backend for static-site forms.

**Benchmark:** Formspark/Formspree-class basic submission handling.

### Launch core

- [x] Public form endpoint.
- [x] Submission persistence.
- [x] Submission metering.
- [ ] Turnstile support.
- [ ] Honeypot/basic bot filtering.
- [ ] Allowed-origin/domain restrictions.
- [ ] Field validation rules: required/type/max length.
- [ ] Email notification.
- [ ] Webhook forwarding.
- [ ] Success redirect / JSON mode.
- [ ] Submission history search/export.
- [ ] Retention pruning and body-size ceiling.

### Nice-to-have

- [ ] Autoresponder.
- [ ] Slack/Discord notification presets.
- [ ] File upload integration via PicoSvc Files.

### Quality gate

- [ ] Static HTML site can ship a contact form with spam protection and notification without writing backend code.

---

# 6. Cross-product platform roadmap

## Authentication and authorization

- [x] Shared Clerk account.
- [x] User/org owner abstraction.
- [ ] Verify every management route is owner-scoped.
- [ ] Add security tests attempting cross-owner reads/writes/deletes.
- [ ] API token support for non-browser management clients.
- [ ] Scope tokens by product/action where practical.
- [ ] Rotate/revoke tokens.

## Billing and entitlements

- [x] Per-product plan model.
- [x] Bundle entitlement concept.
- [ ] Formalize exact bundle precedence when a user owns both bundle + individual product plan.
- [ ] Billing downgrade behavior for resources over the new limit.
- [ ] Grace period/read-only behavior instead of destructive deletion.
- [ ] Usage page showing `used / limit` for all metered dimensions.
- [ ] Alert at 70%, 90%, 100%.
- [ ] Upgrade CTA from quota errors.

## Cost control

- [x] Atomic D1 monthly usage guard.
- [ ] Per-service marginal cost model committed to the repo.
- [ ] Track Browser seconds by service/customer.
- [ ] Track Sandbox active minutes by customer/MCP.
- [ ] Track Dynamic Worker invocations and estimated CPU.
- [ ] Track R2 bytes/object ops by product where measurable.
- [ ] Track D1 storage and write-heavy products.
- [ ] Add aggregate “estimated infra cost” internal report.
- [ ] Add bundle utilization report: services touched/customer/month and utilization % by service.
- [ ] Review pricing only from real aggregate utilization, not maximum theoretical sum.

## Reliability

- [ ] Stable request IDs returned in errors.
- [ ] Structured logs with product/owner/resource/request id.
- [ ] Error-rate and latency dashboards by service.
- [ ] Synthetic health check for every public service endpoint.
- [ ] Alarm on abnormal Browser/Sandbox spend or execution time.
- [ ] D1 migration smoke test in CI.
- [ ] R2 cleanup/orphan test.
- [ ] Retry/idempotency rules documented for webhook-like products.

## Security

- [x] Public URL validation exists for browser/fetch paths.
- [ ] Centralize SSRF policy and test IPv4/IPv6/private/range/redirect bypasses.
- [ ] Global request-body ceiling before parsing.
- [ ] Product-specific body ceilings.
- [ ] Sanitize reflected headers/content.
- [ ] Signed outgoing webhook option for Hooks/Mail/Forms/Monitor/Cron notifications.
- [ ] Rate limit unauthenticated public endpoints by resource/IP where abuse is plausible.
- [ ] Secret fields encrypted/handled separately from normal configuration.
- [ ] Dependency/security scan in CI.

## Developer experience

- [ ] Unified API conventions across all services.
- [ ] Consistent pagination.
- [ ] Consistent error JSON (`code`, `message`, `requestId`, optional `limit/used`).
- [ ] Generated OpenAPI documentation for PicoSvc management/runtime APIs.
- [ ] Copyable curl examples for every service.
- [ ] Minimal JS/TS examples.
- [ ] Dashboard empty states create a working first resource in <2 minutes.
- [ ] Destructive actions require confirmation.

---

# 7. Testing roadmap

## Unit/static

- [x] Pricing/catalog regression script exists.
- [ ] Every catalog metric has a corresponding enforcement assertion.
- [ ] Product capability tests for selector/rule/evaluation algorithms.

## Integration

- [ ] Ephemeral/local D1 migrations from zero.
- [ ] R2 object lifecycle tests.
- [ ] Browser-backed Shot/Fetch/RSS fixtures.
- [ ] Dynamic Worker Functions test.
- [ ] MCP Edge build/run test.
- [ ] MCP Sandbox-required build/run test.

## End-to-end user journeys

- [ ] Sign up -> create Mock -> call it -> see inspector.
- [ ] Create Hooks inbox -> send webhook -> replay/forward.
- [ ] Create RSS feed -> preview multiple items -> retrieve feed.
- [ ] Configure Mail -> receive multipart email -> webhook receives parsed payload.
- [ ] Take element screenshot with wait/header/cookie options.
- [ ] Create QR -> scan -> analytics increments.
- [ ] Create Cron -> target fails -> retry + notification visible.
- [ ] Deploy Function -> invoke -> inspect log -> rollback.
- [ ] Create private JSON/File resource -> verify unauthorized access fails.
- [ ] Create License key -> validate -> revoke -> validation fails.
- [ ] Flags: targeting/rollout test OR Remote Config rename test.
- [ ] Monitor selector -> content changes -> diff notification.
- [ ] Form submission -> spam guard -> email/webhook notification.

## Quota/abuse

- [ ] Concurrent requests cannot exceed monthly limit materially.
- [ ] Concurrent resource creates cannot exceed count limits materially.
- [ ] Payload too large is rejected before expensive processing.
- [ ] Retention pruners keep the newest allowed records.
- [ ] Downgraded accounts cannot keep consuming paid-only expensive runtime.

---

# 8. Pricing and margin roadmap

## Principle

Do not optimize for “100% of PicoPlus on all 16 products simultaneously.” Bundle economics depend on real utilization concentration. Keep per-product guardrails safe, then use measured aggregate usage.

### Before public paid launch

- [ ] Recalculate standalone worst-case marginal cost for every paid tier.
- [ ] Target >=40% gross margin for a user intentionally maximizing a single standalone plan within documented assumptions.
- [ ] Validate Browser duration assumptions using actual P50/P90/P99 data.
- [ ] Validate Function CPU assumptions using actual P50/P90/P99 data.
- [ ] Validate MCP Sandbox active-time assumptions with real workloads.
- [ ] Include payment-processing/Billing percentage fees.
- [ ] Keep a separate sensitivity line for FX conversion.

### Bundle policy

Keep provisional prices:

- Bundle Pico: **$5/month**.
- Bundle Pro: **$22/month**.

Do not raise them merely because the sum of all theoretical product maxima is expensive.

Instead monitor:

- [ ] Mean and P95 number of distinct services used per bundle customer/month.
- [ ] Mean and P95 utilization % per used service.
- [ ] P95 estimated infrastructure cost per Bundle Pico customer.
- [ ] P95 estimated infrastructure cost per Bundle Pro customer.
- [ ] Gross margin by cohort.
- [ ] Abusive/outlier workloads separately from normal cohorts.

### Pricing review trigger

Revisit limits/prices when either:

- [ ] P95 bundle gross margin falls below the target band for a sustained cohort.
- [ ] A single product's P95 cost materially exceeds its designed cost envelope.
- [ ] Cloudflare or billing-provider pricing changes materially.
- [ ] A feature addition changes the cost shape (e.g. Browser/Sandbox use).

Prefer reducing the expensive dimension or adding a specific expensive-feature allowance before globally raising bundle prices.

---

# 9. Marketing truthfulness gates

Do not publish a direct competitor quota comparison for a product until its category-core gate passes.

- [ ] Mock: rule matching + inspector + delay/failure.
- [ ] Hooks: inspect/search + custom response + forwarding/replay.
- [ ] RSS: multiple-item extraction with selectors/auto-detect.
- [ ] Mail: MIME parse + attachment handling + signed/retried delivery.
- [ ] Shot: viewport + wait + selector + headers/cookies.
- [ ] Fetch: market as single-URL Markdown/metadata, not Firecrawl replacement.
- [ ] QR: useful analytics beyond lifetime scan count.
- [ ] Cron: retries + failures + notifications + timezone.
- [ ] Functions: runtime limits + secrets + logs/versioning.
- [ ] JSON: storage bound + access control + concurrency/version semantics.
- [ ] Files: private mode + signed upload/download.
- [ ] License: market as License Key API unless advanced licensing is added.
- [ ] Flags: implement targeting + sticky rollout OR rename Remote Config.
- [ ] Monitor: selector/ignore + meaningful diff/notifications.
- [ ] Forms: spam protection + notifications/webhook + validation.
- [ ] MCP: logs/secrets/status + real-corpus reliability.

---

# 10. Launch sequence

## Gate A — Cost safe

- [ ] M0 complete.
- [ ] Every published quota enforced.
- [ ] No unbounded persistent body/history paths.
- [ ] Browser/Sandbox/Functions have hard runtime ceilings.

## Gate B — Product honest

- [ ] All P0 service naming/positioning decisions complete.
- [ ] RSS is a true multi-item Web->RSS product.
- [ ] Flags decision completed.
- [ ] Fetch/Files/License copy explicitly sets narrower scope.

## Gate C — Competitive core

- [ ] M1 products pass their quality gates.
- [ ] Other products pass minimum launch core or are marked Beta.
- [ ] Direct competitor comparisons are only shown for comparable jobs.

## Gate D — Reliability

- [ ] Main CI green.
- [ ] Web CI green.
- [ ] MCP real-corpus/edge/full-binary workflows green or failures triaged and documented.
- [ ] E2E happy path for every public service.
- [ ] Security abuse suite passes.

## Gate E — Paid launch

- [ ] Stripe/Clerk production billing verified with real $1 and bundle checkout/refund flow.
- [ ] Usage dashboard and quota errors verified.
- [ ] Margin/cost telemetry operational.
- [ ] Terms/privacy/acceptable-use/refund/support copy published.
- [ ] Status/support contact path published.

---

# 11. Post-launch roadmap

## First data-driven review

- [ ] Rank products by active users, paid conversion, usage depth and support burden.
- [ ] Rank products by gross-margin contribution, not just revenue.
- [ ] Identify services with high sign-up but low successful first-use rate.
- [ ] Identify missing feature requests that block real workflows.
- [ ] Identify quota limits that users hit vs limits nobody approaches.
- [ ] Compare actual bundle service-count distribution against assumptions.

## Invest deeper only where usage proves demand

Potential specialist expansions:

- Mock: stateful simulation / contract testing.
- Hooks: transform workflows / local forwarding.
- RSS: browser extraction / filters.
- Shot: async pipeline / cache / advanced rendering controls.
- QR: design/custom-domain suite.
- Functions: packages/builds/custom domains.
- Flags: SDKs/segments/audit logs.
- Monitor: browser steps / visual diff.
- Forms: integrations/autoresponders/files.

Do **not** automatically expand all 16 products. PicoSvc wins if each product remains small, understandable and cheap.

---

# 12. Master checklist

## P0 — before calling pricing “final”

- [ ] Finish all catalog/runtime quota enforcement.
- [ ] Hooks body storage -> R2.
- [ ] JSON document/storage cap enforcement.
- [ ] Files download enforcement.
- [ ] Mail/Cron/Forms retention pruning.
- [ ] Functions CPU/runtime guard.
- [ ] MCP Sandbox active-minute guard.
- [ ] RSS real item extraction.
- [ ] Flags: implement targeting/rollout or rename Remote Config.
- [ ] Product descriptions audited against actual behavior.
- [ ] Standalone cost/margin model re-run after feature changes.

## P1 — competitive core

- [ ] Mock inspector + rules + delay/error.
- [ ] Hooks search + custom response + forwarding.
- [ ] Forms Turnstile + validation + notification/webhook.
- [ ] Monitor selector + ignore + diff + notifications.
- [ ] Shot viewport + wait + selector + headers/cookies.
- [ ] Cron timezone + retry + failure notification.
- [ ] QR analytics.
- [ ] Mail MIME + attachments + signed/retried webhook.
- [ ] MCP logs + secrets + deployment status.
- [ ] Functions logs + secrets + version/rollback.
- [ ] JSON access controls/version semantics.
- [ ] Files signed upload/download/private mode.
- [ ] License key metadata/activation safety.

## P1 — quality/platform

- [ ] E2E suite for all products.
- [ ] Quota abuse/concurrency suite.
- [ ] Cross-owner authorization suite.
- [ ] Structured logs/request IDs.
- [ ] Health checks/alerts.
- [ ] OpenAPI/curl docs.
- [ ] Usage dashboard + quota warnings.
- [ ] Bundle cost/utilization telemetry.

## P2 — after launch, only if demand proves it

- [ ] Advanced Mock statefulness.
- [ ] Hooks transforms/local tunnel.
- [ ] Browser-backed RSS extraction.
- [ ] Advanced Shot stealth/proxy-like features only if economics justify them.
- [ ] QR custom domains/design/bulk.
- [ ] Functions package/build platform.
- [ ] Full Flags SDK ecosystem.
- [ ] Monitor browser steps/visual diff.
- [ ] Forms richer integrations.

---

## Decision log

- **2026-09-16:** Quota counts alone are not sufficient for competitor comparisons. Product quality/core capability parity becomes a formal pricing/marketing gate.
- **2026-09-16:** Bundle Pico $5 and Bundle Pro $22 remain provisional targets; do not raise them based on the impossible assumption that one customer consumes 100% of all 16 PicoPlus products simultaneously.
- **2026-09-16:** PicoSvc will deliberately keep some products narrower than category leaders (notably Fetch, Files, License Keys, Functions). Their names/copy must set the correct expectation instead of claiming full specialist parity.
