import assert from 'node:assert/strict';
import {
  PICOSVC_BILLING_MODEL,
  PICOSVC_BUNDLES,
  PICOSVC_PRODUCTS,
} from '../src/picosvc/catalog.ts';

assert.equal(PICOSVC_BILLING_MODEL.currency, 'USD');
assert.equal(PICOSVC_BILLING_MODEL.billingPeriod, 'month');
assert.deepEqual(PICOSVC_BILLING_MODEL.tierLabels, {
  free: 'Free',
  tiny: 'Pico',
  pro: 'PicoPlus',
});
assert.equal(PICOSVC_BILLING_MODEL.customPlan.pricing, 'contact');

assert.ok(PICOSVC_PRODUCTS.length > 0);
for (const product of PICOSVC_PRODUCTS) {
  assert.equal(product.tiers.free.priceUsdMonthly, 0, `${product.slug}: Free must be $0`);
  assert.equal(product.tiers.tiny.displayName, 'Pico', `${product.slug}: tiny must display as Pico`);
  assert.equal(product.tiers.tiny.priceUsdMonthly, 1, `${product.slug}: Pico must be $1/month`);
  assert.equal(product.tiers.pro.displayName, 'PicoPlus', `${product.slug}: pro must display as PicoPlus`);
  assert.equal(product.tiers.pro.priceUsdMonthly, 5, `${product.slug}: PicoPlus must be $5/month`);
  assert.equal(product.customPlan.pricing, 'contact', `${product.slug}: larger usage must be contact`);
}

const bundlePico = PICOSVC_BUNDLES.find((bundle) => bundle.slug === 'bundle-pico');
const bundlePro = PICOSVC_BUNDLES.find((bundle) => bundle.slug === 'bundle-pro');
assert.ok(bundlePico, 'Bundle Pico must exist');
assert.ok(bundlePro, 'Bundle Pro must exist');
assert.equal(bundlePico.name, 'Bundle Pico');
assert.equal(bundlePico.priceUsdMonthly, 5);
assert.equal(bundlePico.status, 'active');
assert.equal(bundlePro.name, 'Bundle Pro');
assert.equal(bundlePro.priceUsdMonthly, 22);
assert.equal(bundlePro.status, 'active');

for (const product of PICOSVC_PRODUCTS) {
  assert.equal(bundlePico.grants[product.slug], 'tiny', `Bundle Pico must grant Pico for ${product.slug}`);
  assert.equal(bundlePro.grants[product.slug], 'pro', `Bundle Pro must grant PicoPlus for ${product.slug}`);
}

console.log(`Pricing OK: ${PICOSVC_PRODUCTS.length} products, Pico $1, PicoPlus $5, Bundle Pico $5, Bundle Pro $22.`);
