import type { SVGProps } from 'react';

/** Original, dependency-free vector icon family. Every glyph uses the same 64px grid. */
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
type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: ServiceIconName;
  size?: number;
  decorative?: boolean;
};

function Glyph({ name }: { name: ServiceIconName }) {
  switch (name) {
    case 'brand': return <><path d="M23 17h15a13 13 0 0 1 0 26H29v7"/><path d="M23 24h-7v12h13"/><rect x="10" y="18" width="12" height="12" rx="3" fill="#b8ff68" stroke="none"/><rect x="23" y="29" width="11" height="11" rx="3" fill="#b8ff68" stroke="none"/><rect x="10" y="38" width="12" height="12" rx="3" fill="#b8ff68" stroke="none"/></>;
    case 'mock': return <><rect x="11" y="13" width="42" height="38" rx="7"/><path d="M11 23h42M19 18h1M25 18h1"/><path d="m26 31-6 6 6 6m12-12 6 6-6 6m-4-14-4 16"/></>;
    case 'mcp': return <><path d="m32 17-15 25h30L32 17Z"/><circle cx="32" cy="15" r="6" fill="#b8ff68" stroke="none"/><circle cx="16" cy="45" r="6" fill="#b8ff68" stroke="none"/><circle cx="48" cy="45" r="6" fill="#b8ff68" stroke="none"/></>;
    case 'hooks': return <><path d="M36 15a9 9 0 0 0-18 0c0 13 21 10 21 24a11 11 0 0 1-22 0"/><path d="M37 24h13m-6-6 6 6-6 6"/><circle cx="27" cy="15" r="3" fill="#b8ff68" stroke="none"/></>;
    case 'rss': return <><circle cx="17" cy="47" r="5" fill="#b8ff68" stroke="none"/><path d="M14 30a20 20 0 0 1 20 20M14 16a34 34 0 0 1 34 34"/></>;
    case 'mail': return <><rect x="10" y="18" width="35" height="28" rx="5"/><path d="m12 21 16 13 15-13m2 6h9m-5-5 5 5-5 5"/></>;
    case 'shot': return <><rect x="10" y="12" width="44" height="40" rx="6"/><path d="M10 22h44M18 17h1m5 0h1m5 0h1M18 40l8-9 8 8 5-5 8 10H18Z"/><circle cx="42" cy="29" r="3" fill="#b8ff68" stroke="none"/></>;
    case 'fetch': return <><path d="M15 10h23l10 10v18M38 10v11h10M15 10v42h18M22 29h18M22 36h11"/><circle cx="44" cy="44" r="10"/><path d="M44 38v12m-5-5 5 5 5-5"/></>;
    case 'qr': return <><path d="M12 12h15v15H12zM17 17h5v5h-5zM37 12h15v15H37zM42 17h5v5h-5zM12 37h15v15H12zM17 42h5v5h-5zM36 37h5m6 0h5M36 43h5m6 0h5M36 49h5m6 0h5"/></>;
    case 'cron': return <><rect x="10" y="15" width="44" height="39" rx="6"/><path d="M10 26h44M22 10v10m20-10v10M19 34h5m7 0h5m-17 8h5"/><circle cx="42" cy="42" r="9" fill="#101b17"/><path d="M42 36v6l4 3"/></>;
    case 'functions': return <><path d="M22 12c-8 0-8 6-8 12v2c0 4-2 6-6 6 4 0 6 2 6 6v2c0 6 0 12 8 12M42 12c8 0 8 6 8 12v2c0 4 2 6 6 6-4 0-6 2-6 6v2c0 6 0 12-8 12"/><path d="m35 18-10 17h8l-4 12 11-19h-8z" fill="#b8ff68" stroke="none"/></>;
    case 'json': return <><path d="M16 10h23l9 9v35H16zM39 10v10h9M27 27c-4 0-4 3-4 5s-1 3-3 3c2 0 3 1 3 3s0 5 4 5M37 27c4 0 4 3 4 5s1 3 3 3c-2 0-3 1-3 3s0 5-4 5"/><circle cx="32" cy="35" r="2" fill="#b8ff68" stroke="none"/></>;
    case 'files': return <><path d="M9 19h17l6 7h23v22a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5zM14 19v-6h17l6 6h13v7"/></>;
    case 'license': return <><path d="m32 8 19 8v14c0 13-8 21-19 26-11-5-19-13-19-26V16z"/><circle cx="28" cy="30" r="5"/><path d="m32 34 10 10m-4-4-4 4m7-2-4 4"/></>;
    case 'flags': return <><path d="M12 17h40M12 32h40M12 47h40"/><rect x="35" y="10" width="12" height="14" rx="5" fill="#b8ff68" stroke="#101b17"/><rect x="17" y="25" width="12" height="14" rx="5" fill="#b8ff68" stroke="#101b17"/><rect x="35" y="40" width="12" height="14" rx="5" fill="#b8ff68" stroke="#101b17"/></>;
    case 'monitor': return <><path d="M7 32c7-12 15-18 25-18s18 6 25 18c-7 12-15 18-25 18S14 44 7 32Z"/><path d="M17 33h8l4-8 6 15 4-7h8"/></>;
    case 'forms': return <><rect x="14" y="8" width="36" height="48" rx="5"/><path d="M23 20h18M23 29h18M23 38h8m-9 8 4 4 9-11"/></>;
  }
}

export default function ServiceIcon({ name, size = 32, decorative = true, className, ...props }: Props) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size}
    className={className} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : LABELS[name]} fill="none" stroke="#b8ff68" strokeWidth="3.5"
    strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
    <rect x="1" y="1" width="62" height="62" rx="15" fill="#101b17" stroke="#315b3b" strokeWidth="2" />
    <Glyph name={name} />
  </svg>;
}
