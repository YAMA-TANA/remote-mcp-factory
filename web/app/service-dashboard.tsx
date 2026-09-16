'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

type ActionDef = { label: string; method: string; path: string; body?: unknown };

const ACTIONS: Record<GenericServiceSlug, ActionDef[]> = {
  mcp: [
    { label: 'List MCPs', method: 'GET', path: '/api/servers' },
    { label: 'Deploy MCP', method: 'POST', path: '/api/servers', body: { repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', visibility: 'token' } },
  ],
  rss: [
    { label: 'List feeds', method: 'GET', path: '/api/picosvc/rss/feeds' },
    { label: 'Create feed', method: 'POST', path: '/api/picosvc/rss/feeds', body: { name: 'Example feed', sourceUrl: 'https://example.com/' } },
  ],
  mail: [
    { label: 'List routes', method: 'GET', path: '/api/picosvc/mail/routes' },
    { label: 'Create route', method: 'POST', path: '/api/picosvc/mail/routes', body: { name: 'Inbound mail', webhookUrl: 'https://example.com/webhook' } },
  ],
  shot: [
    { label: 'Screenshot', method: 'POST', path: '/api/picosvc/shot', body: { url: 'https://example.com/', format: 'png', fullPage: true } },
    { label: 'PDF', method: 'POST', path: '/api/picosvc/shot', body: { url: 'https://example.com/', format: 'pdf' } },
  ],
  fetch: [
    { label: 'Markdown', method: 'POST', path: '/api/picosvc/fetch', body: { url: 'https://example.com/', format: 'markdown' } },
    { label: 'Metadata', method: 'POST', path: '/api/picosvc/fetch', body: { url: 'https://example.com/', format: 'metadata' } },
  ],
  qr: [
    { label: 'List QR links', method: 'GET', path: '/api/picosvc/qr/links' },
    { label: 'Create QR', method: 'POST', path: '/api/picosvc/qr/links', body: { name: 'My QR', targetUrl: 'https://example.com/' } },
  ],
  cron: [
    { label: 'List jobs', method: 'GET', path: '/api/picosvc/cron/jobs' },
    { label: 'Create job', method: 'POST', path: '/api/picosvc/cron/jobs', body: { name: 'Health check', cron: '*/15 * * * *', method: 'GET', targetUrl: 'https://example.com/' } },
  ],
  functions: [
    { label: 'List functions', method: 'GET', path: '/api/picosvc/functions/apps' },
    { label: 'Create function', method: 'POST', path: '/api/picosvc/functions/apps', body: { name: 'Hello function', code: "export default { async fetch(request) { return Response.json({ hello: 'world', url: request.url }); } };" } },
  ],
  json: [
    { label: 'List stores', method: 'GET', path: '/api/picosvc/json/stores' },
    { label: 'Create store', method: 'POST', path: '/api/picosvc/json/stores', body: { name: 'App data' } },
  ],
  files: [
    { label: 'List spaces', method: 'GET', path: '/api/picosvc/files/spaces' },
    { label: 'Create space', method: 'POST', path: '/api/picosvc/files/spaces', body: { name: 'Public assets' } },
  ],
  license: [
    { label: 'List projects', method: 'GET', path: '/api/picosvc/license/projects' },
    { label: 'Create project', method: 'POST', path: '/api/picosvc/license/projects', body: { name: 'Desktop app' } },
  ],
  flags: [
    { label: 'List projects', method: 'GET', path: '/api/picosvc/flags/projects' },
    { label: 'Create project', method: 'POST', path: '/api/picosvc/flags/projects', body: { name: 'Production flags' } },
  ],
  monitor: [
    { label: 'List monitors', method: 'GET', path: '/api/picosvc/monitor' },
    { label: 'Create monitor', method: 'POST', path: '/api/picosvc/monitor', body: { name: 'Homepage', targetUrl: 'https://example.com/', intervalMinutes: 15 } },
  ],
  forms: [
    { label: 'List forms', method: 'GET', path: '/api/picosvc/forms' },
    { label: 'Create form', method: 'POST', path: '/api/picosvc/forms', body: { name: 'Contact form' } },
  ],
};

const COPY = {
  en: {
    active: 'ACTIVE SERVICE', subtitle: 'Pico $1/mo · PicoPlus $5/mo · Bundle supported',
    signInTitle: 'Sign in to use this service', signInBody: 'One PicoSvc account works across every product. Your service tier and Bundle grants are applied automatically.',
    signIn: 'Sign in to PicoSvc', quick: 'Quick start', explorer: 'API explorer', explorerBody: 'Choose a common action, edit the request if needed, then run it against your PicoSvc account.',
    method: 'Method', path: 'API path', body: 'JSON body', run: 'Run request', running: 'Running…', result: 'Result', noBody: 'No request body', openResult: 'Open binary result', pricing: 'Pricing', back: 'All products', note: 'Public runtime URLs returned by create actions can be used directly from your apps.',
  },
  ja: {
    active: '利用可能', subtitle: 'Pico 月$1 · PicoPlus 月$5 · Bundle対応',
    signInTitle: 'このサービスを使うにはログイン', signInBody: 'PicoSvcは全製品で同じアカウントを使います。製品プランとBundle権限は自動で反映されます。',
    signIn: 'PicoSvcにログイン', quick: 'クイックスタート', explorer: 'APIエクスプローラー', explorerBody: 'よく使う操作を選び、必要ならrequestを編集して、そのままPicoSvc APIを実行できます。',
    method: 'Method', path: 'API path', body: 'JSON body', run: '実行', running: '実行中…', result: '結果', noBody: 'request bodyなし', openResult: 'バイナリ結果を開く', pricing: '料金', back: '全製品', note: '作成結果に返る公開runtime URLは、そのままアプリから利用できます。',
  },
  'zh-CN': {
    active: '现已可用', subtitle: 'Pico $1/月 · PicoPlus $5/月 · 支持 Bundle',
    signInTitle: '登录后使用此服务', signInBody: '所有 PicoSvc 产品共用一个账号，产品套餐和 Bundle 权限会自动应用。',
    signIn: '登录 PicoSvc', quick: '快速开始', explorer: 'API 调试台', explorerBody: '选择常用操作，按需编辑请求，然后直接调用你的 PicoSvc API。',
    method: 'Method', path: 'API path', body: 'JSON body', run: '运行请求', running: '运行中…', result: '结果', noBody: '无 request body', openResult: '打开二进制结果', pricing: '价格', back: '所有产品', note: '创建操作返回的公开 runtime URL 可直接用于你的应用。',
  },
} as const;

function jsonText(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

export default function ServiceDashboard({ service }: { service: GenericServiceSlug }) {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const c = messages.common;
  const info = SERVICE_INFO[service];
  const actions = ACTIONS[service];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [selected, setSelected] = useState(0);
  const [method, setMethod] = useState(actions[0].method);
  const [path, setPath] = useState(actions[0].path);
  const [body, setBody] = useState(jsonText(actions[0].body));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [binaryUrl, setBinaryUrl] = useState<string | null>(null);
  const userButtonRef = useRef<HTMLDivElement>(null);

  const configured = Boolean(API_URL && CLERK_KEY);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((error) => setResult(error instanceof Error ? error.message : String(error)));
    return () => { active = false; removeListener?.(); };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    return () => { if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current); };
  }, [clerk, signedIn]);

  useEffect(() => () => { if (binaryUrl) URL.revokeObjectURL(binaryUrl); }, [binaryUrl]);

  function choose(index: number) {
    const action = actions[index];
    setSelected(index);
    setMethod(action.method);
    setPath(action.path);
    setBody(jsonText(action.body));
    setResult('');
    if (binaryUrl) URL.revokeObjectURL(binaryUrl);
    setBinaryUrl(null);
  }

  async function run() {
    if (!signedIn || !clerk?.session) return;
    if (!API_URL) { setResult('NEXT_PUBLIC_FACTORY_API_URL is not configured.'); return; }
    setBusy(true);
    setResult('');
    if (binaryUrl) URL.revokeObjectURL(binaryUrl);
    setBinaryUrl(null);
    try {
      const token = await clerk.session.getToken();
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      let requestBody: string | undefined;
      if (!['GET', 'HEAD'].includes(method.toUpperCase()) && body.trim()) {
        JSON.parse(body);
        headers.set('content-type', 'application/json');
        requestBody = body;
      }
      const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, { method, headers, body: requestBody });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json();
        setResult(`${response.status} ${response.statusText}\n${JSON.stringify(payload, null, 2)}`);
      } else if (contentType.startsWith('image/') || contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
        const blob = await response.blob();
        setBinaryUrl(URL.createObjectURL(blob));
        setResult(`${response.status} ${response.statusText}\n${contentType}\n${blob.size} bytes`);
      } else {
        const text = await response.text();
        setResult(`${response.status} ${response.statusText}\n${text.slice(0, 200000)}`);
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight">
          <a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher />
          {signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> {t.active}</div>
        <h1>PicoSvc {info.name}</h1>
        <p className="lede">{info.role}. {t.subtitle}</p>
        <div className="flow"><span>Free</span><i>→</i><span>Pico $1</span><i>→</i><span>PicoPlus $5</span><i>→</i><span>Bundle</span></div>
      </section>

      {!signedIn ? (
        <section className="shell deploymentsSection">
          <div className="deployCard signinState"><div><strong>{t.signInTitle}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div>
          {!configured && <div className="notice" style={{ marginTop: 16 }}>Set NEXT_PUBLIC_FACTORY_API_URL and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.</div>}
        </section>
      ) : (
        <section className="shell deploymentsSection">
          <div className="sectionHead"><div><span className="kicker">{t.quick}</span><h2>{t.explorer}</h2></div></div>
          <p className="lede">{t.explorerBody}</p>
          <div className="runtime" style={{ marginBottom: 16 }}>
            {actions.map((action, index) => <button key={`${action.method}:${action.path}`} className={index === selected ? 'primary' : 'ghost'} onClick={() => choose(index)}>{action.label}</button>)}
          </div>
          <div className="deployCard">
            <div className="options">
              <label>{t.method}<select value={method} onChange={(event) => setMethod(event.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>
              <label>{t.path}<input value={path} onChange={(event) => setPath(event.target.value)} /></label>
            </div>
            <label>{t.body}</label>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} placeholder={t.noBody} style={{ width: '100%', marginTop: 8, padding: 14, borderRadius: 10, fontFamily: 'monospace' }} />
            <div style={{ marginTop: 14 }}><button className="primary" disabled={busy} onClick={run}>{busy ? t.running : t.run}</button></div>
          </div>
          <div className="deployCard" style={{ marginTop: 18 }}>
            <span className="kicker">{t.result}</span>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 560, overflow: 'auto' }}>{result || '—'}</pre>
            {binaryUrl && <p><a className="primary" href={binaryUrl} target="_blank" rel="noreferrer">{t.openResult}</a></p>}
            <p>{t.note}</p>
          </div>
        </section>
      )}
    </main>
  );
}
