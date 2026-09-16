export type BillingTierId = 'free' | 'tiny' | 'pro';

export const TIER_LABELS: Record<BillingTierId, 'Free' | 'Pico' | 'PicoPlus'> = {
  free: 'Free',
  tiny: 'Pico',
  pro: 'PicoPlus',
};

export const PICOSVC_PRICING = {
  currency: 'USD',
  period: 'month',
  standalone: {
    pico: 1,
    picoPlus: 5,
  },
  bundles: {
    pico: 5,
    pro: 22,
  },
  custom: 'contact',
} as const;

export const PICOSVC_QUOTAS = [
  { service: 'MCP', free: '1 Edge MCP · 5k req · 20 builds', pico: '5 Edge MCP · 200k req · 200 builds', picoPlus: '25 MCP · 2 Sandbox slots · 10k active min · 500k req · 1k builds' },
  { service: 'Mock', free: '1 endpoint · 5 rules · 100 history · 1.5k req', pico: '10 endpoints · 50 rules · 1k history · 25k req', picoPlus: '100 endpoints · 500 rules · 10k history · 250k req' },
  { service: 'Hooks', free: '1 inbox · 500 events · 100 history', pico: '5 inboxes · 10k events · 1k history', picoPlus: '25 inboxes · 100k events · 10k history' },
  { service: 'RSS', free: '3 feeds · 24h refresh', pico: '20 feeds · 3h refresh', picoPlus: '100 feeds · 30m refresh' },
  { service: 'Mail', free: '1 route · 100 mails', pico: '5 routes · 2k mails', picoPlus: '25 routes · 20k mails' },
  { service: 'Shot', free: '50 shots', pico: '300 shots', picoPlus: '2k shots' },
  { service: 'Fetch', free: '100 requests', pico: '1k requests', picoPlus: '5k requests' },
  { service: 'QR', free: '5 dynamic QR · 1k scans', pico: '50 dynamic QR · 10k scans', picoPlus: '300 dynamic QR · 150k scans' },
  { service: 'Cron', free: '1 job · 2k runs', pico: '10 jobs · 30k runs', picoPlus: '50 jobs · 250k runs' },
  { service: 'Functions', free: '1 function · 10k invokes', pico: '5 functions · 100k invokes', picoPlus: '20 functions · 1M invokes' },
  { service: 'JSON', free: '1 store · 10k req', pico: '10 stores · 100k req', picoPlus: '50 stores · 1M req' },
  { service: 'Files', free: '1 space · 20 files · 100 MB', pico: '5 spaces · 1k files · 1 GB', picoPlus: '25 spaces · 10k files · 10 GB' },
  { service: 'License', free: '1 project · 10 keys · 1k checks', pico: '3 projects · 100 keys · 25k checks', picoPlus: '10 projects · 1k keys · 250k checks' },
  { service: 'Config', free: '1 project · 10 values · 50k req', pico: '3 projects · 100 values · 250k req', picoPlus: '10 projects · 500 values · 1M req' },
  { service: 'Monitor', free: '1 monitor · 750 checks · 60m min', pico: '20 monitors · 20k checks · 15m min', picoPlus: '100 monitors · 100k checks · 5m min' },
  { service: 'Forms', free: '3 forms · 100 submissions', pico: '20 forms · 2k submissions', picoPlus: '100 forms · 20k submissions' },
] as const;

export function tierLabel(tier: BillingTierId): string {
  return TIER_LABELS[tier];
}
