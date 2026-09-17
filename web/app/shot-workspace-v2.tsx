'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import './shot-workspace.css';
import './fetch-shot-ux.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type KeyInfo = { id: string; name: string; created_at: string; last_used_at: string | null };
type CaptureFormat = 'png' | 'pdf';
type Phase = 'idle' | 'authorizing' | 'rendering' | 'receiving' | 'success' | 'error';
type ApiError = { error?: string | { message?: string }; message?: string };
const TEXT = {
  en: { back: 'All services', pricing: 'Pricing', eyebrow: 'PICOSVC / SCREENSHOT API', title: 'Capture a page. Ship the image.', intro: 'Render a public URL as PNG or PDF. Try a capture here, then automate with a dedicated API key.', endpoint: 'API endpoint', capture: 'Test capture', keys: 'API keys', docs: 'Use from code', target: 'Website URL', format: 'Format', width: 'Width', height: 'Height', full: 'Capture full page', mode: 'When to capture', idle: 'Wait for network to settle (recommended)', strict: 'Wait for all network activity to stop', load: 'Wait for load event', dom: 'Wait for HTML only (fast, may be blank)', delay: 'Extra delay (milliseconds)', selector: 'Wait for CSS selector (optional)', selectorHelp: 'For a SPA, enter an element that appears when the page is ready, e.g. #app .content.', take: 'Capture screenshot', signing: 'Checking session…', running: 'Rendering the page…', receiving: 'Receiving the output file…', elapsed: 'Elapsed', seconds: 'sec', pendingHelp: 'Rendering may take some time. This is an activity indicator, not a completion percentage.', signIn: 'Sign in to capture', signInBody: 'Sign in to try captures and create API keys.', preview: 'Capture preview', download: 'Download', failed: 'Capture failed', tips: 'If the result is blank, wait for a CSS selector or increase the delay. Login-only pages require separate authentication.', keyTitle: 'Create a key for automation', keyIntro: 'Use a Shot-only API key from a terminal, CI, or backend. Never expose it in browser code or a public repository.', keyName: 'Key name', keyPlaceholder: 'Production / GitHub Actions', createKey: 'Create API key', keyWorking: 'Updating API keys…', oneTime: 'Copy this key now. It will never be displayed again.', copy: 'Copy', copied: 'Copied', dismiss: 'I saved my key', noKeys: 'No API keys yet.', revoke: 'Revoke', lastUsed: 'Last used', never: 'Never', sample: 'cURL — terminal or CI', example: 'JavaScript — server-side only', useKey: 'Set PICOSVC_SHOT_API_KEY to your generated key before running the examples.', ready: 'Capture complete. The file is ready.', noConfig: 'The Shot API or Clerk environment is not configured.', invalid: 'Enter a valid public HTTP(S) URL.', unauthorized: 'Your session expired. Please sign in again.', auto: 'After creating a key, you can capture without opening this dashboard.', empty: 'Your capture will appear here.' },
  ja: { back: '全サービス', pricing: '料金', eyebrow: 'PICOSVC / SCREENSHOT API', title: 'URLを画像に。APIで自動化。', intro: '公開ページをPNGまたはPDFに変換します。画面で撮影を試し、専用APIキーで自動化できます。', endpoint: 'APIエンドポイント', capture: '撮影テスト', keys: 'APIキー', docs: 'コードから使う', target: '撮影するURL', format: '出力形式', width: '横幅', height: '高さ', full: 'ページ全体を撮影', mode: '撮影するタイミング', idle: 'ネットワークが落ち着くまで待つ（推奨）', strict: '通信が完全に止まるまで待つ', load: 'loadイベントまで待つ', dom: 'HTMLの読み込みのみ（速いが白紙の可能性あり）', delay: '追加待機（ミリ秒）', selector: '表示を待つCSSセレクター（任意）', selectorHelp: 'SPAでは描画完了時に表示される要素を指定します。例：#app .content', take: '撮影する', signing: 'ログイン状態を確認中…', running: 'ページを撮影中…', receiving: '撮影ファイルを受信中…', elapsed: '経過時間', seconds: '秒', pendingHelp: '撮影には時間がかかる場合があります。進行表示は完了率を示すものではありません。', signIn: 'ログインして撮影', signInBody: 'ログインすると撮影テストとAPIキーの発行ができます。', preview: '撮影プレビュー', download: 'ファイルを保存', failed: '撮影に失敗しました', tips: '白紙の場合はCSSセレクターや追加待機を設定してください。ログイン必須ページには別途認証が必要です。', keyTitle: '自動化用APIキーを発行', keyIntro: 'Shot専用のAPIキーです。ターミナル・CI・サーバーから使用し、公開フロントエンドのコードやリポジトリには埋め込まないでください。', keyName: 'キーの名前', keyPlaceholder: '本番 / GitHub Actions', createKey: 'APIキーを作成', keyWorking: 'APIキーを更新中…', oneTime: 'キーは一度しか表示されません。今すぐ安全に保存してください。', copy: 'コピー', copied: 'コピーしました', dismiss: '保存したので閉じる', noKeys: 'APIキーはまだありません。', revoke: '無効化', lastUsed: '最終利用', never: '未使用', sample: 'cURL — ターミナル・CIから実行', example: 'JavaScript — サーバー側専用', useKey: '実行前に発行したキーを環境変数 PICOSVC_SHOT_API_KEY に設定してください。', ready: '撮影が完了しました。ファイルを保存できます。', noConfig: 'Shot APIまたはClerkの環境変数が未設定です。', invalid: '有効な公開HTTP(S) URLを入力してください。', unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。', auto: 'キー発行後は管理画面を開かずに撮影できます。', empty: '撮影結果はここに表示されます。' },
  'zh-CN': { back: '全部服务', pricing: '价格', eyebrow: 'PICOSVC / SCREENSHOT API', title: '把 URL 变成图像。通过 API 自动化。', intro: '将公开网页输出为 PNG 或 PDF。先在这里测试，再用专用 API 密钥自动截图。', endpoint: 'API 地址', capture: '截图测试', keys: 'API 密钥', docs: '代码调用', target: '网页 URL', format: '输出格式', width: '宽度', height: '高度', full: '整页截图', mode: '截图时机', idle: '等待网络稳定（推荐）', strict: '等待所有网络请求结束', load: '等待 load 事件', dom: '仅等待 HTML 加载（可能出现空白）', delay: '额外等待（毫秒）', selector: '等待 CSS 选择器（可选）', selectorHelp: '对于 SPA，请填写内容加载完毕后出现的元素，例如 #app .content。', take: '开始截图', signing: '正在验证登录状态…', running: '正在渲染网页…', receiving: '正在接收文件…', elapsed: '已用时间', seconds: '秒', pendingHelp: '渲染可能需要一段时间；此指示器不代表完成百分比。', signIn: '登录以截图', signInBody: '登录后可测试截图并创建 API 密钥。', preview: '截图预览', download: '下载文件', failed: '截图失败', tips: '若出现空白，请设置 CSS 选择器或增加等待时间。需要登录的网页必须另行认证。', keyTitle: '创建自动化 API 密钥', keyIntro: '这是 Shot 专用 API 密钥。请在终端、CI 或服务器使用，不要放进公开前端代码或仓库。', keyName: '密钥名称', keyPlaceholder: 'Production / GitHub Actions', createKey: '创建 API 密钥', keyWorking: '正在更新 API 密钥…', oneTime: '密钥仅显示一次，请立即妥善保存。', copy: '复制', copied: '已复制', dismiss: '已保存，关闭', noKeys: '还没有 API 密钥。', revoke: '撤销', lastUsed: '最后使用', never: '从未使用', sample: 'cURL — 终端或 CI', example: 'JavaScript — 仅限服务端', useKey: '运行前请将密钥设置为环境变量 PICOSVC_SHOT_API_KEY。', ready: '截图已完成，可以下载文件。', noConfig: '尚未配置 Shot API 或 Clerk 环境变量。', invalid: '请输入有效的公开 HTTP(S) URL。', unauthorized: '登录已过期，请重新登录。', auto: '创建密钥后，无需打开控制台即可截图。', empty: '截图结果会显示在这里。' },
} as const;

function apiError(body: unknown, status: number): string {
  if (body !== null && typeof body === 'object') {
    const data = body as ApiError;
    const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    if (message) return `${message} (HTTP ${status})`;
  }
  return `HTTP ${status}`;
}

export default function ShotWorkspace() {
  const { locale, messages, localizedHref } = useI18n();
  const t = TEXT[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const userNode = useRef<HTMLDivElement>(null);
  const fileRef = useRef('');
  const startedAt = useRef(0);
  const [url, setUrl] = useState('https://example.com/');
  const [format, setFormat] = useState<CaptureFormat>('png');
  const [resultFormat, setResultFormat] = useState<CaptureFormat>('png');
  const [width, setWidth] = useState('1280');
  const [height, setHeight] = useState('720');
  const [fullPage, setFullPage] = useState(false);
  const [waitUntil, setWaitUntil] = useState('networkidle2');
  const [waitMs, setWaitMs] = useState('900');
  const [selector, setSelector] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyName, setKeyName] = useState('My automation');
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [imageSize, setImageSize] = useState('');
  const [tab, setTab] = useState<'capture' | 'keys' | 'docs'>('capture');
  const endpoint = `${API}/api/picosvc/shot`;
  const pending = phase === 'authorizing' || phase === 'rendering' || phase === 'receiving';
  const phaseLabel = phase === 'authorizing' ? t.signing : phase === 'rendering' ? t.running : phase === 'receiving' ? t.receiving : phase === 'success' ? t.ready : '';

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !userNode.current) return;
    const node = userNode.current;
    clerk.mountUserButton(node);
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);
  useEffect(() => () => { if (fileRef.current) URL.revokeObjectURL(fileRef.current); }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await clerk?.session?.getToken();
    if (!API || !token) throw new Error(!API ? t.noConfig : t.unauthorized);
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(apiError(body, response.status));
    }
    return response;
  }, [clerk, t.noConfig, t.unauthorized]);
  const listKeys = useCallback(async () => {
    if (!signedIn || !clerk) return;
    try {
      const response = await request('/api/picosvc/shot/keys');
      const result = await response.json() as { keys?: KeyInfo[] };
      setKeys(Array.isArray(result.keys) ? result.keys : []);
      setKeyError('');
    } catch (reason) { setKeyError(reason instanceof Error ? reason.message : String(reason)); }
  }, [clerk, request, signedIn]);
  useEffect(() => { if (signedIn && clerk) void listKeys(); else { setKeys([]); setNewKey(''); } }, [clerk, signedIn, listKeys]);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setElapsed(0); startedAt.current = Date.now();
    setFileUrl(''); setImageSize(''); setPhase('authorizing');
    if (fileRef.current) { URL.revokeObjectURL(fileRef.current); fileRef.current = ''; }
    try {
      const target = new URL(url);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error(t.invalid);
      const token = await clerk?.session?.getToken();
      if (!API || !token) throw new Error(!API ? t.noConfig : t.unauthorized);
      setPhase('rendering');
      const response = await fetch(`${API}/api/picosvc/shot`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: target.href, format, width: Number(width), height: Number(height), fullPage, waitUntil, waitMs: Number(waitMs), ...(format === 'png' && selector.trim() ? { selector: selector.trim() } : {}) }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(apiError(body, response.status));
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/png') && !contentType.startsWith('application/pdf')) throw new Error('The renderer did not return an image or PDF.');
      setPhase('receiving');
      const blob = await response.blob();
      if (!blob.size) throw new Error('The renderer returned an empty file.');
      const next = URL.createObjectURL(blob);
      fileRef.current = next;
      setResultFormat(contentType.startsWith('application/pdf') ? 'pdf' : 'png');
      setFileUrl(next);
      setImageSize(response.headers.get('x-picosvc-image-size') || '');
      setPhase('success');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason)); setPhase('error');
    } finally { setBusy(false); }
  }
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (keyBusy || !keyName.trim()) return;
    setKeyBusy(true); setKeyError(''); setNewKey('');
    try {
      const response = await request('/api/picosvc/shot/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: keyName.trim() }) });
      const result = await response.json() as { token?: string };
      if (!result.token) throw new Error('The API did not return a key.');
      setNewKey(result.token); await listKeys();
    } catch (reason) { setKeyError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setKeyBusy(false); }
  }
  async function revoke(key: KeyInfo) {
    if (!window.confirm(`${t.revoke}: ${key.name}?`)) return;
    setKeyBusy(true); setKeyError('');
    try { await request(`/api/picosvc/shot/keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' }); await listKeys(); }
    catch (reason) { setKeyError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setKeyBusy(false); }
  }
  const curl = `curl --fail-with-body -sS -X POST '${endpoint}' \\\n  -H "Authorization: Bearer \$PICOSVC_SHOT_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  --data '${JSON.stringify({ url: url || 'https://example.com/', format, fullPage, waitUntil: 'networkidle2', waitMs: 900 })}' \\\n  --output capture.${format}`;
  const javascript = `const response = await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    Authorization: \`Bearer \${process.env.PICOSVC_SHOT_API_KEY}\`,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({ url: ${JSON.stringify(url || 'https://example.com/')}, format: '${format}', waitUntil: 'networkidle2' }),\n});\nif (!response.ok) throw new Error(await response.text());\nconst bytes = await response.arrayBuffer(); // Save or upload the PNG/PDF`;

  return <main className="shotPage">
    <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><LanguageSwitcher />{signedIn ? <div className="userButton" ref={userNode} /> : <button type="button" className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="shell shotHero"><div className="eyebrow"><span className="dot" />{t.eyebrow}</div><h1>{t.title}</h1><p className="lede">{t.intro}</p><div className="shotEndpoint"><div><small>{t.endpoint}</small><code>{endpoint}</code></div><button type="button" className="ghost" onClick={() => { void copy(endpoint); }}>{copied === endpoint ? t.copied : t.copy}</button></div></section>
    <section className="shell shotWorkspace">
      <div className="shotTabs" role="tablist" aria-label="Shot workspace">{([['capture', t.capture], ['keys', t.keys], ['docs', t.docs]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'shotTabActive' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {!API || !CLERK_KEY ? <div className="error" role="alert">{t.noConfig}</div> : null}
      {tab === 'capture' && <div className="shotColumns"><section className="deployCard"><div className="shotPanelHead"><span className="kicker">01 / CAPTURE</span><h2>{t.capture}</h2></div>{!signedIn ? <div className="shotSignIn"><p>{t.signInBody}</p><button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : <form className="shotForm" onSubmit={event => { void capture(event); }} aria-busy={busy}><fieldset className="shotFormFields" disabled={busy}><label className="serviceField"><span>{t.target}</span><input type="url" required placeholder="https://example.com" value={url} onChange={event => setUrl(event.target.value)} /></label><div className="shotFormPair"><label className="serviceField"><span>{t.format}</span><select value={format} onChange={event => setFormat(event.target.value as CaptureFormat)}><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label className="serviceField"><span>{t.mode}</span><select value={waitUntil} onChange={event => setWaitUntil(event.target.value)}><option value="networkidle2">{t.idle}</option><option value="networkidle0">{t.strict}</option><option value="load">{t.load}</option><option value="domcontentloaded">{t.dom}</option></select></label></div><div className="shotFormPair"><label className="serviceField"><span>{t.width}</span><input type="number" min="320" max="3840" required value={width} onChange={event => setWidth(event.target.value)} /></label><label className="serviceField"><span>{t.height}</span><input type="number" min="200" max="2160" required value={height} onChange={event => setHeight(event.target.value)} /></label></div>{format === 'png' && <label className="shotToggle"><input type="checkbox" checked={fullPage} onChange={event => setFullPage(event.target.checked)} />{t.full}</label>}<div className="shotFormPair"><label className="serviceField"><span>{t.delay}</span><input type="number" min="0" max="10000" step="100" required value={waitMs} onChange={event => setWaitMs(event.target.value)} /></label><label className="serviceField"><span>{t.selector}</span><input type="text" maxLength={300} placeholder="#app .content" value={selector} disabled={format === 'pdf'} onChange={event => setSelector(event.target.value)} /></label></div><p className="shotHelp">{t.selectorHelp}</p><button type="submit" className="primary" disabled={!API}>{busy ? t.running : t.take}</button></fieldset></form>}{error && <div className="error" role="alert"><strong>{t.failed}</strong><p>{error}</p><p>{t.tips}</p></div>}</section><section className="deployCard shotPreviewPanel" aria-busy={pending}><div className="shotPanelHead"><span className="kicker">02 / OUTPUT</span><h2>{t.preview}</h2></div>{pending ? <div className="shotProgress" role="status" aria-live="polite"><span className="fetchShotSpinner" aria-hidden="true" /><strong>{phaseLabel}</strong><span>{t.elapsed}: {elapsed} {t.seconds}</span><p>{t.pendingHelp}</p></div> : fileUrl ? <><div className="shotReadyMessage" role="status">✓ {t.ready}</div><div className="shotPreviewFrame">{resultFormat === 'png' ? <img src={fileUrl} alt={t.preview} /> : <div className="shotPdfReady"><span>PDF</span><p>{t.ready}</p></div>}</div><div className="shotPreviewActions"><span className="shotFileMeta">{resultFormat.toUpperCase()}{imageSize ? ` · ${imageSize}` : ''}</span><a className="primary" href={fileUrl} download={`picosvc-capture.${resultFormat}`}>{t.download} ↓</a></div></> : <div className="shotPreviewEmpty"><span aria-hidden="true">▧</span><p>{t.empty}</p></div>}</section></div>}
      {tab === 'keys' && <div className="shotColumns"><section className="deployCard"><div className="shotPanelHead"><span className="kicker">01 / AUTHENTICATION</span><h2>{t.keyTitle}</h2><p>{t.keyIntro}</p></div>{!signedIn ? <button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button> : <form className="shotForm" onSubmit={event => { void createKey(event); }}><label className="serviceField"><span>{t.keyName}</span><input value={keyName} maxLength={80} required placeholder={t.keyPlaceholder} onChange={event => setKeyName(event.target.value)} /></label><button className="primary" type="submit" disabled={keyBusy || !API}>{keyBusy ? t.keyWorking : t.createKey}</button></form>}{newKey && <div className="shotNewKey" role="status"><strong>{t.oneTime}</strong><code>{newKey}</code><div className="shotKeyActions"><button type="button" className="primary" onClick={() => { void copy(newKey); }}>{copied === newKey ? t.copied : t.copy}</button><button type="button" className="ghost" onClick={() => setNewKey('')}>{t.dismiss}</button></div></div>}{keyError && <div className="error" role="alert">{keyError}</div>}</section><section className="deployCard"><div className="shotPanelHead"><span className="kicker">02 / CREDENTIALS</span><h2>{t.keys}</h2></div>{!signedIn || !keys.length ? <p className="shotHelp">{t.noKeys}</p> : <div className="shotKeyList">{keys.map(key => <div className="shotKeyRow" key={key.id}><div><strong>{key.name}</strong><small>{t.lastUsed}: {key.last_used_at ? new Date(key.last_used_at).toLocaleString(locale) : t.never}</small></div><button className="ghost shotRevoke" type="button" disabled={keyBusy} onClick={() => { void revoke(key); }}>{t.revoke}</button></div>)}</div>}</section></div>}
      {tab === 'docs' && <div className="shotDocs"><div className="shotDocIntro"><span className="kicker">AUTOMATE / INTEGRATE</span><h2>{t.docs}</h2><p>{t.auto} {t.useKey}</p></div><section className="deployCard"><div className="shotCodeHead"><h3>{t.sample}</h3><button type="button" className="ghost" onClick={() => { void copy(curl); }}>{copied === curl ? t.copied : t.copy}</button></div><pre><code>{curl}</code></pre></section><section className="deployCard"><div className="shotCodeHead"><h3>{t.example}</h3><button type="button" className="ghost" onClick={() => { void copy(javascript); }}>{copied === javascript ? t.copied : t.copy}</button></div><pre><code>{javascript}</code></pre></section></div>}
    </section>
  </main>;
}
