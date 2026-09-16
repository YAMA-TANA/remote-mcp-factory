import type { ImgHTMLAttributes } from 'react';

/** One source of truth: every UI icon uses its standalone, hand-authored SVG asset. */
export const SERVICE_ICON_NAMES = [
  'mock', 'mcp', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr',
  'cron', 'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
] as const;
export type ServiceIconName = typeof SERVICE_ICON_NAMES[number] | 'brand';
const LABELS: Record<ServiceIconName, string> = {
  brand: 'PicoSvc', mock: 'Mock API', mcp: 'MCP', hooks: 'Webhook Inbox', rss: 'RSS',
  mail: 'Email to Webhook', shot: 'Screenshot', fetch: 'Web Fetch', qr: 'Dynamic QR',
  cron: 'Cron', functions: 'Functions', json: 'JSON Store', files: 'Files',
  license: 'License', flags: 'Feature Flags', monitor: 'Monitor', forms: 'Forms',
};
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  name: ServiceIconName;
  size?: number;
  decorative?: boolean;
};

export default function ServiceIcon({ name, size = 32, decorative = true, className, ...props }: Props) {
  const src = name === 'brand' ? '/icons/picosvc.svg' : `/icons/${name}.svg`;
  return <img src={src} alt={decorative ? '' : LABELS[name]}
    aria-hidden={decorative ? true : undefined} width={size} height={size}
    className={['picoServiceVector', className].filter(Boolean).join(' ')}
    decoding="async" draggable={false} {...props} />;
}
