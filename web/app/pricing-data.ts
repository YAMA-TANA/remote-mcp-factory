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

export function tierLabel(tier: BillingTierId): string {
  return TIER_LABELS[tier];
}
