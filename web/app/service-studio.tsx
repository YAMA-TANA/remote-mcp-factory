'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';
import { SERVICE_UI, initialServiceForm, serviceRequestBody, type Field } from './service-ui-config';
import ServiceAdvancedDetail from './service-advanced-detail';
import ServiceResourceDetail from './service-resource-detail';
import { workspaceApiError, workspaceIsActive, workspaceIsSecret, workspaceMatches, workspaceObject, workspaceString, type WorkspaceResource } from './workspace-helpers';
import './service-studio.css';

type StudioSlug = Exclude<GenericServiceSlug, 'fetch' | 'shot' | 'hooks'>;
type Language = 'en' | 'ja' | 'zh-CN';
type StudioDescription = { heading: string; intro: string; first: string; second: string; third: string; action: string; item: string; empty: string };
const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const BASIC = new Set<StudioSlug>(['json', 'files', 'license', 'flags', 'forms']);
const DESCRIPTIONS: Record<StudioSlug, Record<Language, StudioDescription>> = {
  mcp: {
    en: { heading: 'Deploy a remote MCP server', intro: 'Choose a GitHub repository, branch and endpoint access. Manage deployments and credentials separately after creation.', first: 'Repository', second: 'Deployment settings', third: 'Remote endpoints', action: 'Deploy server', item: 'Deployment', empty: 'No servers yet. Start with a GitHub repository.' },
    ja: { heading: 'GitHubからMCPをデプロイ', intro: 'リポジトリとブランチを指定してRemote MCPを作成。公開範囲・シークレットはデプロイ後に管理できます。', first: 'リポジトリ', second: 'デプロイ設定', third: 'Remote MCPの接続先', action: 'MCPをデプロイ', item: 'デプロイ', empty: 'サーバーはまだありません。GitHubリポジトリを指定してください。' },
    'zh-CN': { heading: '部署远程 MCP 服务', intro: '选择 GitHub 仓库、分支和访问方式。部署后可管理密钥与端点。', first: '仓库', second: '部署设置', third: '远程端点', action: '部署 MCP', item: '部署', empty: '还没有服务器。请先输入 GitHub 仓库。' },
  },
  rss: {
    en: { heading: 'Turn a page into an RSS feed', intro: 'Start with the source page. Fine-tune article selectors only if automatic extraction needs help.', first: 'Source page', second: 'Article extraction', third: 'Published feeds', action: 'Create feed', item: 'Feed', empty: 'No feeds yet. Add a public page to begin.' },
    ja: { heading: 'WebページをRSSフィードに変換', intro: 'まず元のページを指定。記事の自動抽出が合わないときだけCSSセレクターを調整します。', first: '取得元ページ', second: '記事の抽出設定', third: '公開中のフィード', action: 'フィードを作成', item: 'フィード', empty: 'フィードはまだありません。取得元のページを指定してください。' },
    'zh-CN': { heading: '将网页转换为 RSS', intro: '先输入来源网页，仅在自动提取不准确时调整文章选择器。', first: '来源网页', second: '文章提取', third: '已发布的订阅源', action: '创建订阅源', item: '订阅源', empty: '还没有订阅源。' },
  },
  mail: {
    en: { heading: 'Forward incoming mail to a webhook', intro: 'Create a route, then copy its inbound address and inspect delivery events in its management panel.', first: 'Incoming route', second: 'Delivery destination', third: 'Mail routes', action: 'Create mail route', item: 'Mail route', empty: 'No mail routes yet.' },
    ja: { heading: '受信メールをWebhookへ転送', intro: '転送先を登録して受信用アドレスを発行。配信履歴はルートごとの管理画面で確認します。', first: '受信ルート', second: '転送先', third: 'メールルート', action: 'メールルートを作成', item: 'メールルート', empty: 'メールルートはまだありません。' },
    'zh-CN': { heading: '将来信转发到 Webhook', intro: '设置转发目标，然后在管理页获取收件地址并查看投递记录。', first: '邮件路由', second: '转发目标', third: '邮件路由', action: '创建路由', item: '路由', empty: '还没有邮件路由。' },
  },
  qr: {
    en: { heading: 'Create a QR code you can redirect', intro: 'The printed QR stays the same. Update its destination later without replacing the code.', first: 'Link identity', second: 'Redirect destination', third: 'Dynamic QR codes', action: 'Create QR link', item: 'QR link', empty: 'No QR links yet.' },
    ja: { heading: '行き先を後から変えられるQRコード', intro: '印刷したQRコードはそのままに、リンク先を変更できます。まず名前と行き先を登録してください。', first: 'QRコードの名前', second: '転送先URL', third: '作成済みQRコード', action: 'QRコードを作成', item: 'QRコード', empty: 'QRコードはまだありません。' },
    'zh-CN': { heading: '创建可更改目标的二维码', intro: '无需重新打印二维码，后续可随时调整跳转目标。', first: '二维码名称', second: '跳转目标', third: '动态二维码', action: '创建二维码', item: '二维码', empty: '还没有二维码。' },
  },
  cron: {
    en: { heading: 'Schedule an HTTP request', intro: 'Choose a UTC schedule, request method and destination. Add headers or a body only when required.', first: 'Schedule (UTC)', second: 'HTTP request', third: 'Scheduled jobs', action: 'Schedule job', item: 'Job', empty: 'No scheduled jobs yet.' },
    ja: { heading: 'HTTPリクエストを定期実行', intro: '実行間隔（UTC）と送信先を指定。必要な場合だけヘッダーと本文を追加します。', first: '実行スケジュール（UTC）', second: '送信するHTTPリクエスト', third: '定期実行ジョブ', action: 'ジョブを登録', item: 'ジョブ', empty: 'ジョブはまだありません。' },
    'zh-CN': { heading: '定时发送 HTTP 请求', intro: '设置 UTC 时间表和目标，仅在需要时添加请求头与正文。', first: '时间表（UTC）', second: 'HTTP 请求', third: '定时任务', action: '创建任务', item: '任务', empty: '还没有任务。' },
  },
  functions: {
    en: { heading: 'Publish an edge function', intro: 'Name a function and write its JavaScript fetch handler. Open the deployment to manage source revisions.', first: 'Function identity', second: 'JavaScript editor', third: 'Deployed functions', action: 'Publish function', item: 'Function', empty: 'No functions yet.' },
    ja: { heading: 'JavaScriptをエッジに公開', intro: '関数名とfetchハンドラーを入力して公開。作成後は関数ごとにコードを編集できます。', first: '関数名', second: 'JavaScriptエディター', third: '公開済みの関数', action: '関数を公開', item: '関数', empty: '関数はまだありません。' },
    'zh-CN': { heading: '发布边缘函数', intro: '编写 JavaScript fetch 处理器，发布后可管理源代码。', first: '函数名称', second: 'JavaScript 编辑器', third: '已发布函数', action: '发布函数', item: '函数', empty: '还没有函数。' },
  },
  json: {
    en: { heading: 'Create a JSON document store', intro: 'Create a private store, save its one-time token, then read and edit documents in the store panel.', first: 'Store name', second: 'Private document access', third: 'JSON stores', action: 'Create store', item: 'Store', empty: 'No stores yet.' },
    ja: { heading: 'JSONドキュメントを保存・管理', intro: 'ストアを作成し、初回だけ表示されるトークンを保存。ドキュメントの読み書きはストア内で行います。', first: 'ストア名', second: 'ドキュメントへのアクセス', third: 'JSONストア', action: 'ストアを作成', item: 'ストア', empty: 'ストアはまだありません。' },
    'zh-CN': { heading: '创建 JSON 文档存储', intro: '创建私有存储并保存仅显示一次的密钥，然后管理文档。', first: '存储名称', second: '私有访问', third: 'JSON 存储', action: '创建存储', item: '存储', empty: '还没有存储。' },
  },
  files: {
    en: { heading: 'Create a space for your files', intro: 'Organize uploads into a space. Use its management panel to upload and inspect individual objects.', first: 'File space', second: 'Upload workflow', third: 'File spaces', action: 'Create space', item: 'Space', empty: 'No file spaces yet.' },
    ja: { heading: 'ファイルの保存スペースを作成', intro: 'スペースごとにファイルを整理。作成後の管理画面からアップロードと公開URLの確認ができます。', first: 'スペース名', second: 'ファイルの公開と共有', third: 'ファイルスペース', action: 'スペースを作成', item: 'スペース', empty: 'スペースはまだありません。' },
    'zh-CN': { heading: '创建文件空间', intro: '按空间组织文件，在管理页上传并查看对象。', first: '空间名称', second: '上传流程', third: '文件空间', action: '创建空间', item: '空间', empty: '还没有空间。' },
  },
  license: {
    en: { heading: 'Issue keys for a software product', intro: 'Create a project first. Issue, validate and revoke license keys inside that project.', first: 'Product', second: 'License lifecycle', third: 'License projects', action: 'Create project', item: 'Project', empty: 'No license projects yet.' },
    ja: { heading: 'ソフトウェアのライセンスキーを管理', intro: '製品ごとにプロジェクトを作成。キーの発行・検証・無効化はプロジェクト内で行います。', first: '製品・プロジェクト', second: 'ライセンスの運用', third: 'ライセンスプロジェクト', action: 'プロジェクトを作成', item: 'プロジェクト', empty: 'プロジェクトはまだありません。' },
    'zh-CN': { heading: '管理软件许可证密钥', intro: '先创建产品项目，然后在项目内发放、验证和撤销密钥。', first: '产品', second: '许可证流程', third: '许可证项目', action: '创建项目', item: '项目', empty: '还没有许可证项目。' },
  },
  flags: {
    en: { heading: 'Manage feature flags by project', intro: 'Separate environments into projects. Add and edit individual flags in the project panel.', first: 'Application environment', second: 'Configuration workflow', third: 'Configuration projects', action: 'Create project', item: 'Project', empty: 'No configuration projects yet.' },
    ja: { heading: '機能フラグを環境ごとに管理', intro: '本番・開発など環境別にプロジェクトを作成。個々のフラグはプロジェクト内で編集します。', first: 'アプリ・環境', second: '設定の運用', third: '設定プロジェクト', action: 'プロジェクトを作成', item: 'プロジェクト', empty: '設定プロジェクトはまだありません。' },
    'zh-CN': { heading: '按项目管理功能开关', intro: '将生产和开发环境分开，在项目内管理单个功能开关。', first: '应用环境', second: '配置流程', third: '配置项目', action: '创建项目', item: '项目', empty: '还没有配置项目。' },
  },
  monitor: {
    en: { heading: 'Watch a page for changes', intro: 'Choose a public page and check interval. Add an optional webhook to receive change notifications.', first: 'Page to monitor', second: 'Check frequency & alerts', third: 'Page monitors', action: 'Create monitor', item: 'Monitor', empty: 'No monitors yet.' },
    ja: { heading: 'Webページの変更を監視', intro: '監視するURLと確認間隔を指定。変更通知が必要なときだけWebhookを登録します。', first: '監視対象', second: '監視間隔と通知', third: '監視中のページ', action: '監視を開始', item: '監視', empty: '監視対象はまだありません。' },
    'zh-CN': { heading: '监测网页变更', intro: '设置监测 URL 和检查间隔，可选用 Webhook 接收通知。', first: '目标网页', second: '频率和通知', third: '网页监测', action: '创建监测', item: '监测', empty: '还没有监测项。' },
  },
  forms: {
    en: { heading: 'Collect form submissions', intro: 'Create a form endpoint. View incoming submissions inside the form management panel.', first: 'Form identity', second: 'Submission flow', third: 'Forms', action: 'Create form', item: 'Form', empty: 'No forms yet.' },
    ja: { heading: 'フォームの送信先を作成', intro: 'バックエンドを実装せずに投稿を受信。フォーム作成後に送信先URLと受信履歴を確認できます。', first: 'フォーム名', second: '投稿の受信', third: '作成済みフォーム', action: 'フォームを作成', item: 'フォーム', empty: 'フォームはまだありません。' },
    'zh-CN': { heading: '接收表单提交', intro: '创建表单端点，在管理页面查看收到的提交。', first: '表单名称', second: '提交流程', third: '表单', action: '创建表单', item: '表单', empty: '还没有表单。' },
  },
};
const UI = {
  en: { back: 'All services', pricing: 'Pricing', create: 'Create', resources: 'Resources', guide: 'How it works', manage: 'Open workspace', close: 'Close', refresh: 'Refresh', loading: 'Loading…', signIn: 'Sign in to continue', signInHelp: 'Sign in with your PicoSvc account to create and manage resources.', noConfig: 'The API or Clerk configuration is missing.', search: 'Search resources by name, URL or ID', noMatch: 'No matching resources.', reset: 'Clear filters', all: 'All', active: 'Active', paused: 'Paused', oneTime: 'One-time credentials: save them securely now. They cannot be recovered.', hide: 'Hide', show: 'Reveal', copy: 'Copy', copied: 'Copied', created: 'Created successfully', failed: 'Could not complete this operation.', edit: 'Manage', hint: 'After creation, open the resource to configure and inspect it.', details: 'Resource details', advanced: 'Advanced options', optional: 'Optional', route: 'Endpoint', status: 'Status' },
  ja: { back: '全サービス', pricing: '料金', create: '新規作成', resources: 'リソース', guide: '使い方', manage: '管理画面を開く', close: '閉じる', refresh: '更新', loading: '読み込み中…', signIn: 'ログインして利用する', signInHelp: 'PicoSvcのアカウントでログインすると、作成と管理ができます。', noConfig: 'APIまたはClerkの設定がありません。', search: '名前・URL・IDで検索', noMatch: '一致するリソースはありません。', reset: '絞り込みを解除', all: 'すべて', active: '稼働中', paused: '停止中', oneTime: '認証情報は一度しか表示されません。今すぐ安全に保存してください。', hide: '隠す', show: '表示', copy: 'コピー', copied: 'コピーしました', created: '作成しました', failed: '操作に失敗しました。', edit: '管理する', hint: '作成後、各リソースを開いて詳細を設定・確認できます。', details: 'リソース詳細', advanced: '詳細設定', optional: '任意', route: '接続先', status: '状態' },
  'zh-CN': { back: '所有服务', pricing: '价格', create: '新建', resources: '资源', guide: '使用方法', manage: '打开管理页', close: '关闭', refresh: '刷新', loading: '加载中…', signIn: '登录后继续', signInHelp: '登录 PicoSvc 后即可创建和管理资源。', noConfig: '缺少 API 或 Clerk 配置。', search: '按名称、URL 或 ID 搜索', noMatch: '没有匹配的资源。', reset: '清除筛选', all: '全部', active: '运行中', paused: '已暂停', oneTime: '凭证仅显示一次，请立即妥善保存。', hide: '隐藏', show: '显示', copy: '复制', copied: '已复制', created: '创建成功', failed: '操作失败。', edit: '管理', hint: '创建后可进入单个资源的管理页查看详情。', details: '资源详情', advanced: '高级设置', optional: '可选', route: '端点', status: '状态' },
} as const;
const JA_FIELDS: Record<string, string> = { repoUrl: 'GitHubリポジトリURL', branch: 'ブランチ', visibility: '接続権限', name: '名前', sourceUrl: '取得元ページURL', itemSelector: '記事の要素', titleSelector: 'タイトルの要素', linkSelector: 'リンクの要素', contentSelector: '本文の要素', dateSelector: '公開日の要素', webhookUrl: 'Webhook URL', targetUrl: '転送先URL', cron: 'Cron式（UTC）', method: 'HTTPメソッド', headers: 'リクエストヘッダー（JSON）', body: 'リクエスト本文', code: 'JavaScriptソース', intervalMinutes: '確認間隔（分）' };
const ZH_FIELDS: Record<string, string> = { repoUrl: 'GitHub 仓库 URL', branch: '分支', visibility: '访问方式', name: '名称', sourceUrl: '来源网页 URL', itemSelector: '文章选择器', titleSelector: '标题选择器', linkSelector: '链接选择器', contentSelector: '内容选择器', dateSelector: '日期选择器', webhookUrl: 'Webhook URL', targetUrl: '跳转目标 URL', cron: 'Cron 表达式（UTC）', method: 'HTTP 方法', headers: '请求头（JSON）', body: '请求正文', code: 'JavaScript 源码', intervalMinutes: '检查间隔（分钟）' };
const URL_KEYS = ['endpoint', 'url', 'publicUrl', 'baseUrl', 'validationUrl', 'feedUrl', 'runtimeUrl', 'publicEndpoint', 'webhookUrl', 'redirectUrl', 'mcpUrl', 'inboundAddress', 'emailAddress'] as const;
const asText = workspaceString;
function itemName(item: WorkspaceResource, fallback: string): string { return asText(item.name || item.label || item.repo_url || item.repoUrl || item.source_url || item.sourceUrl || item.id || fallback); }
function availableLinks(item: WorkspaceResource, service: StudioSlug): Array<{ key: string; url: string }> {
  const links: Array<{ key: string; url: string }> = [];
  for (const key of URL_KEYS) {
    const value = item[key];
    if (typeof value !== 'string') continue;
    try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some(part => workspaceIsSecret(part))) continue; links.push({ key, url: value }); }
    catch { /* Email addresses and relative paths are not public URLs. */ }
  }
  if (service === 'qr' && API && typeof item.public_id === 'string') links.push({ key: 'QR SVG', url: `${API}/q/${encodeURIComponent(item.public_id)}.svg` });
  return links;
}

export default function ServiceStudio({ service }: { service: StudioSlug }) {
  const { locale, localizedHref, messages } = useI18n();
  const t = UI[locale]; const copy = DESCRIPTIONS[service][locale]; const config = SERVICE_UI[service];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [authReady, setAuthReady] = useState(!CLERK_KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => initialServiceForm(service));
  const [items, setItems] = useState<WorkspaceResource[]>([]);
  const [selected, setSelected] = useState<WorkspaceResource | null>(null);
  const [created, setCreated] = useState<WorkspaceResource | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const userNode = useRef<HTMLDivElement>(null);
  const detailNode = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let mounted = true; let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setAuthReady(true);
      stop = instance.addListener(() => { if (mounted) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (mounted) { setError(reason instanceof Error ? reason.message : String(reason)); setAuthReady(true); } });
    return () => { mounted = false; stop?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !userNode.current) return;
    const node = userNode.current; clerk.mountUserButton(node);
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);

  const api = useCallback(async (path: string, init: RequestInit = {}): Promise<{ payload: unknown; blob?: Blob }> => {
    if (!API) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    if (!path.startsWith('/api/picosvc/') && path !== '/api/servers' && !path.startsWith('/api/servers/')) throw new Error('Invalid API route.');
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error(locale === 'ja' ? 'セッションの期限が切れました。ログインし直してください。' : 'Session expired. Please sign in again.');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers });
    const type = response.headers.get('content-type') || '';
    if (response.ok && (type.startsWith('image/') || type.includes('application/pdf') || type.includes('application/octet-stream'))) return { payload: { status: response.status, contentType: type }, blob: await response.blob() };
    const raw = await response.text(); let payload: unknown = raw;
    if (raw && (type.includes('json') || raw.startsWith('{') || raw.startsWith('['))) { try { payload = JSON.parse(raw) as unknown; } catch { /* Keep diagnostics. */ } }
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return { payload };
  }, [clerk, locale]);
  const refresh = useCallback(async () => {
    if (!signedIn || !config.listPath) return;
    setLoading(true); setError('');
    try {
      const payload = (await api(config.listPath)).payload;
      const data = workspaceObject(payload);
      const entries = Array.isArray(payload) ? payload : data?.[config.collection || ''];
      if (!Array.isArray(entries)) throw new Error(`Unexpected API response: ${config.collection || 'resources'} is not an array.`);
      const next = entries.filter((entry): entry is WorkspaceResource => workspaceObject(entry) !== null);
      setItems(next);
      setSelected(old => old ? next.find(entry => asText(entry.id) === asText(old.id)) || null : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [api, config.collection, config.listPath, signedIn]);
  useEffect(() => { if (signedIn && clerk) void refresh(); else { setItems([]); setSelected(null); setCreated(null); setRevealed({}); } }, [signedIn, clerk, refresh]);
  async function copyValue(value: string): Promise<void> {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function create(): Promise<void> {
    if (busy) return;
    setBusy(true); setError(''); setCreated(null); setRevealed({});
    try {
      const body = serviceRequestBody(service, form);
      const response = await api(config.createPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = workspaceObject(response.payload);
      if (!result) throw new Error('The API did not return resource details.');
      setCreated(result);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  function field(key: string, options: { rows?: number; note?: string } = {}) {
    const spec = config.fields.find(entry => entry.key === key) as Field | undefined;
    if (!spec) return null;
    const label = locale === 'ja' ? JA_FIELDS[key] || spec.label : locale === 'zh-CN' ? ZH_FIELDS[key] || spec.label : spec.label;
    const value = form[key] || '';
    const change = (next: string) => setForm(previous => ({ ...previous, [key]: next }));
    return <label className="studioField" key={key}><span>{label}{spec.required ? ' *' : ''}</span>
      {spec.kind === 'select' ? <select value={value} onChange={event => change(event.target.value)}>{(spec.options || []).map(option => <option value={option} key={option}>{option}</option>)}</select>
        : spec.kind === 'checkbox' ? <span className="studioCheckbox"><input type="checkbox" checked={value === 'true'} onChange={event => change(String(event.target.checked))} />{label}</span>
        : spec.kind === 'code' || spec.kind === 'json' || options.rows ? <textarea rows={options.rows || (spec.kind === 'code' ? 10 : 4)} spellCheck={false} required={spec.required} placeholder={spec.placeholder} value={value} onChange={event => change(event.target.value)} />
        : <input type={spec.kind === 'url' ? 'url' : spec.kind === 'number' ? 'number' : 'text'} required={spec.required} min={key === 'intervalMinutes' ? 5 : undefined} max={key === 'intervalMinutes' ? 10080 : undefined} step={spec.kind === 'number' ? 1 : undefined} placeholder={spec.placeholder} value={value} onChange={event => change(event.target.value)} />}
      {(options.note || (locale === 'en' ? spec.help : '')) && <small>{options.note || spec.help}</small>}
    </label>;
  }
  function section(label: string, content: React.ReactNode, key: string) { return <div className="studioFormSection" key={key}><div className="studioSectionLabel">{label}</div>{content}</div>; }
  function composer() {
    switch (service) {
      case 'mcp': return <>{section(copy.first, <>{field('repoUrl')}<p className="studioInlineHint">{locale === 'ja' ? 'リポジトリのトップページURLを使用します。ファイル・ブランチのURLは指定できません。' : 'Use the repository root URL, not a file or branch URL.'}</p></>, 'repo')}{section(copy.second, <div className="studioPair">{field('branch')}{field('visibility')}</div>, 'settings')}</>;
      case 'rss': return <>{section(copy.first, field('sourceUrl'), 'source')}{section(copy.second, <details className="studioDisclosure"><summary>{locale === 'ja' ? 'CSSセレクターを指定する（必要な場合のみ）' : 'Customize CSS selectors (optional)'}</summary><div className="studioSelectorGrid">{['itemSelector', 'titleSelector', 'linkSelector', 'contentSelector', 'dateSelector'].map(key => field(key))}</div></details>, 'selectors')}{section(locale === 'ja' ? 'フィード名' : 'Feed name', field('name'), 'name')}</>;
      case 'mail': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <>{field('webhookUrl')}<p className="studioInlineHint">{locale === 'ja' ? '転送先はPOSTリクエストを受け付け、2xxを返すHTTPSエンドポイントにしてください。' : 'Use a reachable HTTPS endpoint that accepts POST and returns 2xx.'}</p></>, 'destination')}</>;
      case 'qr': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <>{field('targetUrl')}{form.targetUrl && <div className="studioUrlPreview"><span>QR →</span><code>{form.targetUrl}</code></div>}</>, 'destination')}</>;
      case 'cron': return <>{section(copy.first, <>{field('name')}{field('cron')}<div className="studioPresets" role="group" aria-label="Cron presets">{([['*/15 * * * *', locale === 'ja' ? '15分ごと' : 'Every 15 min'], ['0 * * * *', locale === 'ja' ? '毎時' : 'Hourly'], ['0 0 * * *', locale === 'ja' ? '毎日0:00 UTC' : 'Daily 00:00 UTC']] as const).map(([expression, label]) => <button key={expression} type="button" aria-pressed={form.cron === expression} onClick={() => setForm(previous => ({ ...previous, cron: expression }))}>{label}</button>)}</div></>, 'schedule')}{section(copy.second, <><div className="studioPair">{field('method')}{field('targetUrl')}</div><details className="studioDisclosure"><summary>{locale === 'ja' ? 'ヘッダー・本文を設定する' : 'Request headers and body'}</summary>{field('headers')}{form.method !== 'GET' ? field('body', { rows: 5 }) : <p className="studioInlineHint">GET requests do not send a body.</p>}</details></>, 'http')}</>;
      case 'functions': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <>{field('code', { rows: 15 })}<button className="studioSecondary" type="button" onClick={() => setForm(previous => ({ ...previous, code: "export default { async fetch(request) { return Response.json({ hello: 'world', url: request.url }); } };" }))}>{locale === 'ja' ? 'サンプルコードを挿入' : 'Insert sample code'}</button></>, 'editor')}</>;
      case 'json': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <div className="studioProcess"><code>Store → documents / {'{key}'}</code><p>{locale === 'ja' ? '作成時のトークンを必ず保存してください。ドキュメントの読み書きは作成後の管理画面から行えます。' : 'Save the one-time token. Read and edit documents after creating the store.'}</p></div>, 'help')}</>;
      case 'files': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <div className="studioProcess"><p>{locale === 'ja' ? '作成後、スペースの管理画面でファイルを選択・アップロードし、公開範囲とURLを確認してください。' : 'After creation, open the space to upload files and review their public URLs.'}</p></div>, 'help')}</>;
      case 'license': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <div className="studioProcess"><span>{locale === 'ja' ? 'プロジェクト作成 → キー発行 → 検証・無効化' : 'Project → issue keys → validate / revoke'}</span></div>, 'help')}</>;
      case 'flags': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <div className="studioProcess"><span>{locale === 'ja' ? '開発環境と本番環境は別のプロジェクトに分けると管理しやすくなります。' : 'Use separate projects for development and production.'}</span></div>, 'help')}</>;
      case 'monitor': return <>{section(copy.first, <>{field('name')}{field('targetUrl')}</>, 'target')}{section(copy.second, <><div className="studioPair">{field('intervalMinutes')}{field('webhookUrl')}</div><p className="studioInlineHint">{locale === 'ja' ? '契約プランによって最短間隔が異なります。Webhookを空欄にすると通知せずに監視します。' : 'Minimum intervals depend on your plan. Leave the webhook blank to monitor without notifications.'}</p></>, 'alerts')}</>;
      case 'forms': return <>{section(copy.first, field('name'), 'name')}{section(copy.second, <div className="studioProcess"><span>{locale === 'ja' ? 'フォーム作成 → 送信先URLを取得 → 投稿履歴を確認' : 'Create form → copy endpoint → inspect submissions'}</span></div>, 'help')}</>;
    }
  }
  function itemSummary(item: WorkspaceResource): string {
    const values: Record<StudioSlug, unknown> = {
      mcp: item.repo_url || item.repoUrl || item.status,
      rss: item.source_url || item.sourceUrl || item.feedUrl,
      mail: item.webhook_url || item.webhookUrl || item.address,
      qr: item.target_url || item.targetUrl,
      cron: item.cron_expression || item.cron || item.target_url,
      functions: item.runtimeUrl || item.endpoint || item.status,
      json: item.created_at || item.createdAt,
      files: item.created_at || item.createdAt,
      license: item.created_at || item.createdAt,
      flags: item.created_at || item.createdAt,
      monitor: item.target_url || item.targetUrl,
      forms: item.endpoint || item.created_at || item.createdAt,
    };
    return asText(values[service] || '');
  }
  const active = items.filter(workspaceIsActive).length;
  const filtered = items.filter(item => workspaceMatches(item, search) && (filter === 'all' || (filter === 'active' ? workspaceIsActive(item) : !workspaceIsActive(item))));
  return <main className={`studioPage studio-${service}`}>
    <nav className="studioTop shell"><a href={localizedHref('/')}>← {t.back}</a><span>{SERVICE_INFO[service].name} / PicoSvc</span><div className="studioTopRight"><a href={localizedHref('/pricing')}>{t.pricing}</a><LanguageSwitcher />{signedIn ? <div ref={userNode} /> : <button type="button" className="studioSecondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <header className="studioHero shell"><div className="studioEyebrow">PICOSVC / {service.toUpperCase()}</div><h1>{copy.heading}</h1><p>{copy.intro}</p><div className="studioHeroChips"><span>{copy.first}</span><span aria-hidden="true">→</span><span>{copy.second}</span><span aria-hidden="true">→</span><span>{copy.third}</span></div></header>
    <div className="shell studioMain">
      {!API || !CLERK_KEY ? <div className="studioError" role="alert">{t.noConfig}</div> : null}
      {error && <div className="studioError" role="alert">{t.failed} {error}</div>}
      {!authReady ? <div className="studioSignIn" role="status">{t.loading}</div> : !signedIn ? <div className="studioSignIn"><h2>{t.signIn}</h2><p>{t.signInHelp}</p><button className="primary" type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : <>
        <div className="studioColumns"><section className="studioCard studioComposer" aria-label={t.create}><div className="studioCardHeading"><span>01 / {t.create}</span><h2>{copy.action}</h2></div><form onSubmit={event => { event.preventDefault(); void create(); }}><fieldset disabled={busy}>{composer()}<div className="studioSubmit"><button className="primary" type="submit">{busy ? t.loading : copy.action} →</button><small>{t.hint}</small></div></fieldset></form>
          {created && <div className="studioCreated" role="status"><div className="studioCreatedHead"><strong>✓ {t.created}</strong><button type="button" className="studioSecondary" onClick={() => { setCreated(null); setRevealed({}); }}>{t.close}</button></div>{workspaceObject(created) && Object.entries(created).map(([key, value]) => {
            if (value === null || value === undefined || typeof value === 'object' || key === 'tier') return null;
            const text = asText(value); if (!text) return null;
            const secret = workspaceIsSecret(key);
            return <div className="studioCreatedRow" key={key}><span>{key}{secret ? ` · ${t.oneTime}` : ''}</span><code>{secret && !revealed[key] ? '••••••••••••' : text}</code>{secret && <button type="button" className="studioSecondary" aria-pressed={Boolean(revealed[key])} onClick={() => setRevealed(old => ({ ...old, [key]: !old[key] }))}>{revealed[key] ? t.hide : t.show}</button>}<button type="button" className="studioSecondary" onClick={() => { void copyValue(text); }}>{copied === text ? t.copied : t.copy}</button></div>;
          })}</div>}
        </section>
        <section className="studioCard studioInventory" aria-label={copy.third}><div className="studioInventoryHeader"><div><span>02 / {t.resources}</span><h2>{copy.third} <small>{items.length}</small></h2></div><button type="button" className="studioSecondary" disabled={loading} onClick={() => { void refresh(); }}>{loading ? t.loading : t.refresh}</button></div><label className="studioSearch"><span className="srOnly">{t.search}</span><input type="search" placeholder={t.search} value={search} onChange={event => setSearch(event.target.value)} /></label><div className="studioFilters" role="group" aria-label={t.resources}>{(['all', 'active', 'paused'] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t[key]} <span>{key === 'all' ? items.length : key === 'active' ? active : items.length - active}</span></button>)}</div>
          {loading && !items.length ? <p role="status" className="studioEmpty">{t.loading}</p> : !items.length ? <p className="studioEmpty">{copy.empty}</p> : !filtered.length ? <div className="studioEmpty">{t.noMatch}<button className="studioSecondary" type="button" onClick={() => { setSearch(''); setFilter('all'); }}>{t.reset}</button></div> : <div className="studioItems">{filtered.map((item, index) => { const id = asText(item.id || index); const title = itemName(item, `${copy.item} ${index + 1}`); const links = availableLinks(item, service); return <article className={`studioItem ${selected && asText(selected.id) === id ? 'studioItemSelected' : ''}`} key={id}><div className="studioItemTop"><div><span>{copy.item}</span><h3>{title}</h3><p>{itemSummary(item)}</p></div><span className={workspaceIsActive(item) ? 'studioStateOn' : 'studioStateOff'}>{workspaceIsActive(item) ? t.active : t.paused}</span></div>{service === 'qr' && links.find(link => link.key === 'QR SVG') && <img className="studioQR" src={links.find(link => link.key === 'QR SVG')!.url} alt={`${title} QR`} />}{links.slice(0, 2).map(link => <div className="studioLink" key={link.key}><span>{link.key}</span><a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a><button type="button" className="studioSecondary" onClick={() => { void copyValue(link.url); }}>{copied === link.url ? t.copied : t.copy}</button></div>)}<div className="studioItemActions"><code>{asText(item.public_id || item.publicId || item.id)}</code><button type="button" className="studioSecondary" aria-expanded={selected && asText(selected.id) === id} onClick={() => { setSelected(item); requestAnimationFrame(() => detailNode.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{t.manage} →</button></div></article>; })}</div>}
        </section></div>
        {selected && <div className="studioDetail" ref={detailNode}><div className="studioDetailHeading"><span>03 / {t.details}</span><button className="studioSecondary" type="button" onClick={() => setSelected(null)}>{t.close} ×</button></div>{BASIC.has(service) ? <ServiceResourceDetail key={`${service}:${asText(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} /> : <ServiceAdvancedDetail key={`${service}:${asText(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} />}</div>}
      </>}
    </div>
  </main>;
}
