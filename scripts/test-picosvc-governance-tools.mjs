import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enabledFlagsPayload, formConfigSnapshot, licenseExpirySummary, safeJsonDownload } from '../web/app/service-governance-tools-data.ts';

const form = formConfigSnapshot({
  allowedOrigins: ['https://example.com'], requiredFields: ['email'], honeypotField: '_site',
  webhookUrl: 'https://secret.example/hooks/token', successRedirect: 'https://example.com/thanks', requireTurnstile: true,
  submissions: ['SECRET'], owner: 'PRIVATE',
});
assert.deepEqual(form, {
  format: 'picosvc.forms.config.v1', allowedOrigins: ['https://example.com'], requiredFields: ['email'], honeypotField: '_site',
  successRedirect: 'https://example.com/thanks', requireTurnstile: true, webhookConfigured: true,
});
const formJson = safeJsonDownload(form);
assert.ok(!formJson.includes('secret.example') && !formJson.includes('SECRET') && !formJson.includes('PRIVATE'));

const now = new Date('2026-09-17T00:00:00Z');
const licenses = licenseExpirySummary([
  { id: 'active-no-expiry', expires_at: null, revoked: false },
  { id: 'soon', expires_at: '2026-09-20T00:00:00Z', revoked: false },
  { id: 'later', expires_at: '2026-10-10T00:00:00Z', revoked: false },
  { id: 'expired', expires_at: '2026-09-16T00:00:00Z', revoked: false },
  { id: 'revoked', expires_at: '2026-09-18T00:00:00Z', revoked: true },
], now);
assert.deepEqual({ active: licenses.active, expired: licenses.expired, revoked: licenses.revoked, within7Days: licenses.within7Days, within30Days: licenses.within30Days, noExpiry: licenses.noExpiry }, { active: 3, expired: 1, revoked: 1, within7Days: 1, within30Days: 2, noExpiry: 1 });
assert.equal(licenses.nextExpiry, '2026-09-20T00:00:00.000Z');

const flags = enabledFlagsPayload([
  { key: 'alpha', value: true, enabled: true, owner: 'SECRET' },
  { key: 'beta', value: { rollout: 50 }, enabled: 1 },
  { key: 'hidden', value: 'PRIVATE', enabled: false },
  { key: '', value: 'ignore', enabled: true },
]);
assert.deepEqual(flags, { flags: { alpha: true, beta: { rollout: 50 } } });
const flagsJson = safeJsonDownload(flags);
assert.ok(!flagsJson.includes('PRIVATE') && !flagsJson.includes('SECRET'));

const manager = readFileSync(new URL('../web/app/service-resource-detail.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../web/app/service-governance-tools.tsx', import.meta.url), 'utf8');
assert.match(manager, /FormsGovernanceTools/);
assert.match(manager, /LicenseGovernanceTools/);
assert.match(manager, /FlagsGovernanceTools/);
assert.match(panel, /webhookConfigured/);
assert.doesNotMatch(panel, /snapshot\.webhookUrl/);
assert.match(panel, /licenseExpirySummary/);
assert.match(panel, /enabledFlagsPayload/);
assert.match(panel, /role="alert"/);
console.log('PicoSvc governance tools: safe Forms config backup, license expiry summary, published Flags preview and routing OK.');
