import { clerkIdentity } from '../auth.js';
import type { Env } from '../types.js';
import {
  PICOSVC_BILLING_MODEL,
  PICOSVC_BUNDLES,
  PICOSVC_PRODUCT_MAP,
  PICOSVC_PRODUCTS,
  type PicoSvcProductSlug,
} from './catalog.js';
import { automationManagementRoutes } from './automation-services.js';
import { configManagementRoutes } from './config-service.js';
import { cronAdvancedManagementRoutes } from './cron-advanced.js';
import { cronManagementRoutes } from './cron-service.js';
import { dataManagementRoutes } from './data-services.js';
import { filesAccessManagementRoutes } from './files-access.js';
import { formsAdvancedManagementRoutes } from './forms-advanced.js';
import { functionsAdvancedManagementRoutes } from './functions-advanced.js';
import { functionManagementRoutes } from './functions-service.js';
import { hooksAdvancedManagementRoutes } from './hooks-advanced.js';
import { hooksManagementRoutes } from './hooks.js';
import { jsonAdvancedManagementRoutes } from './json-advanced.js';
import { licenseAdvancedManagementRoutes } from './license-advanced.js';
import { mailAdvancedManagementRoutes } from './mail-advanced.js';
import { mailManualRetryGuard } from './mail-retry-guard.js';
import { mailManagementRoutes } from './mail-service.js';
import { mockAdvancedManagementRoutes } from './mock-advanced.js';
import { mockManagementRoutes } from './mock.js';
import { monitorAdvancedManagementRoutes } from './monitor-advanced.js';
import { utilityAdvancedManagementRoutes } from './utility-advanced.js';
import { utilityManagementRoutes } from './utility-services.js';
import { picoSvcUsageDashboard } from './usage-dashboard.js';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function monthKey(now = new Date()): string { return now.toISOString().slice(0, 7); }

export async function picoSvcRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  for (const handler of [
    picoSvcUsageDashboard,
    filesAccessManagementRoutes,
    formsAdvancedManagementRoutes,
    monitorAdvancedManagementRoutes,
    mailManualRetryGuard,
    mailAdvancedManagementRoutes,
    cronAdvancedManagementRoutes,
    functionsAdvancedManagementRoutes,
    hooksAdvancedManagementRoutes,
    hooksManagementRoutes,
    mockAdvancedManagementRoutes,
    mockManagementRoutes,
    utilityAdvancedManagementRoutes,
    utilityManagementRoutes,
    configManagementRoutes,
    jsonAdvancedManagementRoutes,
    licenseAdvancedManagementRoutes,
    dataManagementRoutes,
    functionManagementRoutes,
    cronManagementRoutes,
    automationManagementRoutes,
    mailManagementRoutes,
  ]) {
    const response = await handler(request, env);
    if (response) return response;
  }
  if (request.method === 'GET' && url.pathname === '/api/picosvc/catalog') {
    return json({ brand: 'PicoSvc', billing: PICOSVC_BILLING_MODEL, products: PICOSVC_PRODUCTS, bundles: PICOSVC_BUNDLES });
  }
  const productMatch = url.pathname.match(/^\/api\/picosvc\/products\/([a-z-]+)$/);
  if (request.method === 'GET' && productMatch) {
    const product = PICOSVC_PRODUCT_MAP.get(productMatch[1] as PicoSvcProductSlug);
    return product ? json(product) : json({ error: 'Unknown PicoSvc product' }, 404);
  }
  if (request.method === 'GET' && url.pathname === '/api/picosvc/account') {
    const identity = await clerkIdentity(request, env);
    if (!identity) return json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401);
    const entitlements = await env.DB.prepare(`SELECT product, tier, source, active, updated_at FROM product_entitlements WHERE owner=? ORDER BY product`).bind(identity.ownerId).all();
    let bundleEntitlements: unknown[] = [];
    try {
      const rows = await env.DB.prepare(`SELECT bundle, product, tier, source, active, updated_at FROM bundle_entitlements WHERE owner=? ORDER BY bundle, product`).bind(identity.ownerId).all();
      bundleEntitlements = rows.results || [];
    } catch { // Rolling deploy compatibility before migration 0008.
    }
    const usage = await env.DB.prepare(`SELECT product, metric, quantity, updated_at FROM product_usage_monthly WHERE owner=? AND month=? ORDER BY product, metric`).bind(identity.ownerId, monthKey()).all();
    return json({ userId: identity.userId, orgId: identity.orgId, ownerId: identity.ownerId, month: monthKey(), billing: PICOSVC_BILLING_MODEL, entitlements: entitlements.results, bundleEntitlements, usage: usage.results });
  }
  return null;
}
