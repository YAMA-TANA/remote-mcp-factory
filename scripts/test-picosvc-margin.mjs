import assert from 'node:assert/strict';
import { PICOSVC_BUNDLES, PICOSVC_PRODUCTS } from '../src/picosvc/catalog.ts';

// Conservative marginal-overage model. It deliberately assumes the account-wide
// Cloudflare included allocations have already been exhausted and, where practical,
// that every published quota is used in the most expensive supported way.
// Pricing snapshot: 2026-09-16.
const RATE = {
  workerRequest: 0.30 / 1_000_000,
  workerCpuMs: 0.02 / 1_000_000,
  dynamicWorkerDay: 0.002,
  d1Write: 1.00 / 1_000_000,
  d1StorageGbMonth: 0.75,
  r2ClassA: 4.50 / 1_000_000,
  r2ClassB: 0.36 / 1_000_000,
  r2StorageGbMonth: 0.015,
  browserHour: 0.09,
  containerMemoryGibSecond: 0.0000025,
  containerVcpuSecond: 0.000020,
  containerDiskGbSecond: 0.00000007,
};

// Clerk Billing 0.7% + Stripe Japan standard online-card 3.6%.
// Currency conversion, disputes, tax and support are intentionally outside this
// infrastructure gross-margin guard.
const PAYMENT_FEE_RATE = 0.043;
const MIN_STANDALONE_MARGIN = 0.15;
const GB = 1024 ** 3;

function numberLimit(limits, key) {
  const value = limits?.[key];
  return typeof value === 'number' ? value : 0;
}

function sandboxLiteMinuteCost() {
  const seconds = 60;
  return (0.25 * seconds * RATE.containerMemoryGibSecond)
    + ((1 / 16) * seconds * RATE.containerVcpuSecond)
    + (2 * seconds * RATE.containerDiskGbSecond);
}

function productMarginalCost(slug, limits) {
  const requests = numberLimit(limits, 'requests');
  switch (slug) {
    case 'mcp':
      return numberLimit(limits, 'mcps') * 30 * RATE.dynamicWorkerDay
        + requests * (RATE.workerRequest + 50 * RATE.workerCpuMs + RATE.d1Write)
        + numberLimit(limits, 'sandboxActiveMinutes') * sandboxLiteMinuteCost();
    case 'mock':
      // Usage counter + request-history insert + steady-state history pruning delete.
      return requests * (RATE.workerRequest + 5 * RATE.workerCpuMs + 3 * RATE.d1Write);
    case 'hooks': {
      const events = numberLimit(limits, 'events');
      const replays = numberLimit(limits, 'replays');
      const retainedBytes = numberLimit(limits, 'history') * numberLimit(limits, 'bodyBytes');
      // Assume every event is large enough for an R2 PUT and eventual DELETE.
      return events * (RATE.workerRequest + 3 * RATE.d1Write + 2 * RATE.r2ClassA)
        + replays * (RATE.workerRequest + 2 * RATE.d1Write)
        + (retainedBytes / GB) * RATE.r2StorageGbMonth;
    }
    case 'rss':
      return requests * (RATE.workerRequest + RATE.d1Write)
        + numberLimit(limits, 'checks') * 4 * RATE.d1Write;
    case 'mail':
      return numberLimit(limits, 'mails') * (RATE.workerRequest + 2 * RATE.d1Write);
    case 'shot': {
      const shots = numberLimit(limits, 'shots');
      return shots * (RATE.workerRequest + RATE.d1Write)
        + (shots * 10 / 3600) * RATE.browserHour;
    }
    case 'fetch':
      return requests * (RATE.workerRequest + RATE.d1Write)
        + (requests * 5 / 3600) * RATE.browserHour;
    case 'qr':
      return numberLimit(limits, 'scans') * (RATE.workerRequest + 2 * RATE.d1Write);
    case 'cron':
      return numberLimit(limits, 'runs') * (RATE.workerRequest + 3 * RATE.d1Write);
    case 'functions': {
      const invocations = numberLimit(limits, 'invocations');
      return numberLimit(limits, 'functions') * 30 * RATE.dynamicWorkerDay
        + invocations * (RATE.workerRequest + 10 * RATE.workerCpuMs + RATE.d1Write);
    }
    case 'json':
      // Worst case treats every request as a write plus the atomic usage write.
      return requests * (RATE.workerRequest + 3 * RATE.d1Write)
        + (numberLimit(limits, 'storageBytes') / GB) * RATE.d1StorageGbMonth;
    case 'files':
      return numberLimit(limits, 'downloads') * (RATE.workerRequest + RATE.d1Write + RATE.r2ClassB)
        + numberLimit(limits, 'files') * (RATE.workerRequest + RATE.d1Write + RATE.r2ClassA)
        + (numberLimit(limits, 'storageBytes') / GB) * RATE.r2StorageGbMonth;
    case 'license':
      return numberLimit(limits, 'validations') * (RATE.workerRequest + RATE.d1Write);
    case 'flags':
      return requests * (RATE.workerRequest + RATE.d1Write);
    case 'monitor':
      return numberLimit(limits, 'checks') * (RATE.workerRequest + 2 * RATE.d1Write);
    case 'forms':
      return numberLimit(limits, 'submissions') * (RATE.workerRequest + 3 * RATE.d1Write);
    default:
      throw new Error(`Missing margin model for ${slug}`);
  }
}

function netRevenue(price) {
  return price * (1 - PAYMENT_FEE_RATE);
}

function margin(price, cost) {
  return (netRevenue(price) - cost) / netRevenue(price);
}

const results = [];
for (const product of PICOSVC_PRODUCTS) {
  for (const tier of ['tiny', 'pro']) {
    const definition = product.tiers[tier];
    const cost = productMarginalCost(product.slug, definition.limits);
    const grossMargin = margin(definition.priceUsdMonthly, cost);
    results.push({ product: product.slug, tier, price: definition.priceUsdMonthly, cost, grossMargin });
    assert.ok(
      grossMargin >= MIN_STANDALONE_MARGIN,
      `${product.slug}/${tier} worst-case modeled gross margin ${(grossMargin * 100).toFixed(1)}% is below ${(MIN_STANDALONE_MARGIN * 100).toFixed(0)}%`,
    );
  }
}

for (const bundle of PICOSVC_BUNDLES) {
  const cost = PICOSVC_PRODUCTS.reduce((sum, product) => {
    const tier = bundle.grants[product.slug];
    return tier ? sum + productMarginalCost(product.slug, product.tiers[tier].limits) : sum;
  }, 0);
  const grossMargin = margin(bundle.priceUsdMonthly, cost);
  assert.ok(grossMargin > 0, `${bundle.slug} is negative under the all-products-at-cap stress test`);
  results.push({ product: bundle.slug, tier: 'bundle', price: bundle.priceUsdMonthly, cost, grossMargin });
}

for (const row of results) {
  console.log(`${row.product.padEnd(12)} ${String(row.tier).padEnd(6)} price=$${row.price.toFixed(2)} cost<=${row.cost.toFixed(3)} margin>=${(row.grossMargin * 100).toFixed(1)}%`);
}
console.log('PicoSvc margin guard OK: every standalone paid tier retains >=15% modeled marginal gross margin and both bundles remain positive under the simultaneous-cap stress test.');
