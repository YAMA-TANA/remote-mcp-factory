import type { Locale } from './i18n-data';

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
  { slug: 'mcp', service: 'MCP', label: 'MCP', free: '1 Edge MCP · 5k req · 20 builds', pico: '5 Edge MCP · 200k req · 200 builds', picoPlus: '25 MCP · 2 Sandbox slots · 10k active min · 500k req · 1k builds' },
  { slug: 'mock', service: 'Mock', label: 'Mock API', free: '1 endpoint · 5 rules · 100 history · 1.5k req', pico: '10 endpoints · 50 rules · 1k history · 25k req', picoPlus: '100 endpoints · 500 rules · 10k history · 250k req' },
  { slug: 'hooks', service: 'Hooks', label: 'Webhook Inbox', free: '1 inbox · 500 events · 100 history', pico: '5 inboxes · 10k events · 1k history', picoPlus: '25 inboxes · 100k events · 10k history' },
  { slug: 'rss', service: 'RSS', label: 'Web → RSS', free: '3 feeds · 24h refresh', pico: '20 feeds · 3h refresh', picoPlus: '100 feeds · 30m refresh' },
  { slug: 'mail', service: 'Mail', label: 'Email → Webhook', free: '1 route · 100 mails', pico: '5 routes · 2k mails', picoPlus: '25 routes · 20k mails' },
  { slug: 'shot', service: 'Shot', label: 'Screenshot', free: '50 shots', pico: '300 shots', picoPlus: '2k shots' },
  { slug: 'fetch', service: 'Fetch', label: 'Web Fetch', free: '100 requests', pico: '1k requests', picoPlus: '5k requests' },
  { slug: 'qr', service: 'QR', label: 'Dynamic QR', free: '5 dynamic QR · 1k scans', pico: '50 dynamic QR · 10k scans', picoPlus: '300 dynamic QR · 150k scans' },
  { slug: 'cron', service: 'Cron', label: 'Cron', free: '1 job · 2k runs', pico: '10 jobs · 30k runs', picoPlus: '50 jobs · 250k runs' },
  { slug: 'functions', service: 'Functions', label: 'Functions', free: '1 function · 10k invokes', pico: '5 functions · 100k invokes', picoPlus: '20 functions · 1M invokes' },
  { slug: 'json', service: 'JSON', label: 'JSON Store', free: '1 store · 10k req', pico: '10 stores · 100k req', picoPlus: '50 stores · 1M req' },
  { slug: 'files', service: 'Files', label: 'Files', free: '1 space · 20 files · 100 MB', pico: '5 spaces · 1k files · 1 GB', picoPlus: '25 spaces · 10k files · 10 GB' },
  { slug: 'license', service: 'License', label: 'License', free: '1 project · 10 keys · 1k checks', pico: '3 projects · 100 keys · 25k checks', picoPlus: '10 projects · 1k keys · 250k checks' },
  { slug: 'flags', service: 'Config', label: 'Remote Config', free: '1 project · 10 values · 50k req', pico: '3 projects · 100 values · 250k req', picoPlus: '10 projects · 500 values · 1M req' },
  { slug: 'monitor', service: 'Monitor', label: 'Monitor', free: '1 monitor · 750 checks · 60m min', pico: '20 monitors · 20k checks · 15m min', picoPlus: '100 monitors · 100k checks · 5m min' },
  { slug: 'forms', service: 'Forms', label: 'Forms', free: '3 forms · 100 submissions', pico: '20 forms · 2k submissions', picoPlus: '100 forms · 20k submissions' },
] as const;

const QUOTA_LABELS: Record<Exclude<Locale, 'en'>, Record<string, string>> = {
  ja: {
    'Edge MCP': '個のEdge MCP', MCP: '個のMCP', 'Sandbox slots': '個のSandboxスロット', 'active min': '分の稼働時間',
    req: 'リクエスト', requests: 'リクエスト', builds: '回のビルド', endpoint: '個のエンドポイント', endpoints: '個のエンドポイント',
    rules: '件のルール', history: '件の履歴', inbox: '個の受信箱', inboxes: '個の受信箱', events: '件のイベント',
    feeds: '件のフィード', route: '本の受信ルート', routes: '本の受信ルート', mails: '通のメール', shots: '回の撮影',
    'dynamic QR': '個の動的QR', scans: '回のスキャン', job: '件のジョブ', jobs: '件のジョブ', runs: '回の実行',
    function: '個の関数', functions: '個の関数', invokes: '回の呼び出し', store: '個のJSONストア', stores: '個のJSONストア',
    space: '個の領域', spaces: '個の領域', files: '個のファイル', project: '件のプロジェクト', projects: '件のプロジェクト',
    keys: '個のキー', checks: '回の確認', values: '件の設定値', monitor: '件の監視対象', monitors: '件の監視対象',
    forms: '件のフォーム', submissions: '件の送信', MB: ' MB', GB: ' GB',
  },
  'zh-CN': {
    'Edge MCP': '个 Edge MCP', MCP: '个 MCP', 'Sandbox slots': '个 Sandbox 槽位', 'active min': '分钟运行时间',
    req: '次请求', requests: '次请求', builds: '次构建', endpoint: '个端点', endpoints: '个端点', rules: '条规则',
    history: '条历史记录', inbox: '个收件箱', inboxes: '个收件箱', events: '个事件', feeds: '个订阅源',
    route: '条收件路由', routes: '条收件路由', mails: '封邮件', shots: '次截图', 'dynamic QR': '个动态 QR', scans: '次扫描',
    job: '个任务', jobs: '个任务', runs: '次运行', function: '个函数', functions: '个函数', invokes: '次调用',
    store: '个 JSON 存储', stores: '个 JSON 存储', space: '个空间', spaces: '个空间', files: '个文件',
    project: '个项目', projects: '个项目', keys: '个密钥', checks: '次检查', values: '个配置值',
    monitor: '个监控项', monitors: '个监控项', forms: '个表单', submissions: '次提交', MB: ' MB', GB: ' GB',
  },
};

export function formatQuota(value: string, locale: Locale): string {
  if (locale === 'en') return value;
  const labels = QUOTA_LABELS[locale];
  return value.split(' · ').map((part) => {
    const refresh = part.match(/^(\d+)(h|m) refresh$/);
    if (refresh) return locale === 'ja'
      ? `${refresh[1]}${refresh[2] === 'h' ? '時間' : '分'}ごとに更新`
      : `每${refresh[1]}${refresh[2] === 'h' ? '小时' : '分钟'}更新`;
    const interval = part.match(/^(\d+)m min$/);
    if (interval) return locale === 'ja' ? `最短確認間隔 ${interval[1]}分` : `最短检查间隔 ${interval[1]} 分钟`;
    const match = part.match(/^(\d+(?:\.\d+)?[kM]?)(?:\s+)(.+)$/);
    if (!match) return part;
    const amountMatch = match[1].match(/^(\d+(?:\.\d+)?)([kM])$/);
    const amount = amountMatch
      ? (Number(amountMatch[1]) * (amountMatch[2] === 'k' ? 1_000 : 1_000_000)).toLocaleString(locale === 'ja' ? 'ja-JP' : 'zh-CN')
      : match[1];
    const label = labels[match[2]];
    if (!label) return `${amount} ${match[2]}`;
    return match[2] === 'MB' || match[2] === 'GB' ? `${amount}${label}` : `${amount}${label}`;
  }).join(' · ');
}

export function tierLabel(tier: BillingTierId): string {
  return TIER_LABELS[tier];
}
