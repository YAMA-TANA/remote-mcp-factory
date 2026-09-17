'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { captureResponseFormat, resultFilename, shotExamples, type CaptureFormat, validatePublicInput } from './fetch-shot-results';
import './shot-workspace.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type KeyInfo = { id: string; name: string; created_at: string; last_used_at: string | null };
type ErrorBody = { error?: string | { code?: string; message?: string }; message?: string };
const TEXT = {
  en: { back: 'All services', pricing: 'Pricing', eyebrow: 'PICOSVC / SCREENSHOT API', title: 'Capture a page. Ship the image.', intro: 'Render a public URL as PNG or PDF. Test interactively, then use your own API key to automate captures from a script or CI.', endpoint: 'API endpoint', capture: 'Test capture', keys: 'API keys', docs: 'Use from code', target: 'Website URL', format: 'Format', width: 'Width', height: 'Height', full: 'Capture full page', mode: 'When to capture', idle: 'Wait for network to settle (recommended)', strict: 'Wait for all network activity to stop', load: 'Wait for load event', dom: 'HTML loaded only (fast, may be blank)', delay: 'Extra delay (milliseconds)', selector: 'Wait for CSS selector (optional)', selectorHelp: 'For SPAs, enter an element that appears when the page is ready, e.g. #app .content.', take: 'Capture screenshot', running: 'Rendering page…', signIn: 'Sign in to capture', signInBody: 'Sign in once to try captures and create an API key for automation.', preview: 'Capture preview', download: 'Download', again: 'New capture', failed: 'Capture failed', tips: 'If the result is blank, use a CSS selector or a longer delay. Login-only pages cannot be rendered without authentication.', keyTitle: 'Create a key for automation', keyIntro: 'Use a Screenshot-only API key from your terminal, CI or backend. Do not put it in client-side JavaScript or public repositories.', keyName: 'Key name', keyPlaceholder: 'Production / GitHub Actions', createKey: 'Create API key', oneTime: 'Copy this key now. It will never be displayed again.', copy: 'Copy', copied: 'Copied', dismiss: 'I saved my key', noKeys: 'No API keys yet.', revoke: 'Revoke', lastUsed: 'Last used', never: 'Never', sample: 'cURL — run from a terminal or CI', example: 'JavaScript — server-side only', useKey: 'Set PICOSVC_SHOT_API_KEY to your generated secret before running this command.', ready: 'Your image is ready.', noConfig: 'The Screenshot API or Clerk environment is not configured.', retry: 'Retry', invalid: 'Enter a public HTTP(S) URL without credentials or a fragment.', unauthorized: 'Sign in again to continue.', auto: 'No dashboard clicks required after creating an API key.', source: 'Captured from', previous: 'Changing settings does not alter this capture.', invalidResponse: 'The renderer returned a missing or unexpected PNG/PDF response.' },
  ja: { back: '全サービス', pricing: '料金', eyebrow: 'PICOSVC / SCREENSHOT API', title: 'URLを画像に。APIで自動化。', intro: '公開ページをPNGまたはPDFにレンダリング。画面で試したら、専用APIキーでスクリプトやCIから自動撮影できます。', endpoint: 'APIエンドポイント', capture: '撮影テスト', keys: 'APIキー', docs: 'コードから使う', target: '撮影するURL', format: '出力形式', width: '横幅', height: '高さ', full: 'ページ全体を撮影', mode: '撮影するタイミング', idle: 'ネットワークが落ち着くまで待つ（推奨）', strict: '通信が完全に止まるまで待つ', load: 'loadイベントまで待つ', dom: 'HTMLの読込のみ（速いが白紙の可能性）', delay: '追加待機（ミリ秒）', selector: '表示を待つCSSセレクター（任意）', selectorHelp: 'SPAでは描画完了時に表示される要素を指定。例：#app .content', take: '撮影する', running: 'ページをレンダリング中…', signIn: 'ログインして撮影', signInBody: 'ログイン後、撮影テストと自動化用のAPIキー発行ができます。', preview: '撮影プレビュー', download: '画像を保存', again: '別のページを撮影', failed: '撮影に失敗しました', tips: '白紙になる場合はCSSセレクターや追加待機を設定してください。ログイン必須ページには別途認証が必要です。', keyTitle: '自動化用のキーを発行', keyIntro: 'Screenshot専用のキーです。ターミナル・CI・サーバーから使用し、ブラウザーの公開コードやGitHubに埋め込まないでください。', keyName: 'キーの名前', keyPlaceholder: '本番 / GitHub Actions', createKey: 'APIキーを作成', oneTime: 'キーは一度しか表示されません。今すぐ安全に保存してください。', copy: 'コピー', copied: 'コピーしました', dismiss: '保存したので閉じる', noKeys: 'APIキーはまだありません。', revoke: '無効化', lastUsed: '最終利用', never: '未使用', sample: 'cURL — ターミナル・CIから実行', example: 'JavaScript — サーバー側専用', useKey: '実行前にPICOSVC_SHOT_API_KEYに発行したキーを設定してください。', ready: '撮影が完了しました。', noConfig: 'Screenshot APIまたはClerkの環境変数が未設定です。', retry: '再試行', invalid: '認証情報やフラグメントを含まない公開HTTP(S) URLを指定してください。', unauthorized: 'ログインし直してください。', auto: 'キー発行後は管理画面での操作なしで利用できます。', source: '撮影したURL', previous: '設定を変更してもこの撮影結果は変わりません。', invalidResponse: '撮影APIから想定外のPNG／PDF応答が返されました。' },
  'zh-CN': { back: '全部服务', pricing: '价格', eyebrow: 'PICOSVC / SCREENSHOT API', title: '把 URL 变成图像。通过 API 自动化。', intro: '将公开网页渲染为 PNG 或 PDF。先在页面测试，再用专用 API 密钥从脚本或 CI 自动截图。', endpoint: 'API 地址', capture: '截图测试', keys: 'API 密钥', docs: '代码调用', target: '网页 URL', format: '输出格式', width: '宽度', height: '高度', full: '整页截图', mode: '截图时机', idle: '等待网络稳定（推荐）', strict: '等待所有网络请求结束', load: '等待 load 事件', dom: '仅等待 HTML（可能出现空白）', delay: '额外等待（毫秒）', selector: '等待 CSS 选择器（可选）', selectorHelp: '对于 SPA，请输入内容加载完成后出现的元素，例如 #app .content。', take: '开始截图', running: '正在渲染…', signIn: '登录以截图', signInBody: '登录后可测试截图并创建自动化 API 密钥。', preview: '截图预览', download: '下载', again: '重新截图', failed: '截图失败', tips: '若出现空白，请设置 CSS 选择器或增加等待时间。需要登录的网页必须另行提供认证。', keyTitle: '创建自动化密钥', keyIntro: '这是仅限 Screenshot 的 API 密钥。请用于终端、CI 或服务器，不要写入公开前端代码或仓库。', keyName: '密钥名称', keyPlaceholder: 'Production / GitHub Actions', createKey: '创建 API 密钥', oneTime: '密钥仅显示一次，请立即妥善保存。', copy: '复制', copied: '已复制', dismiss: '已保存，关闭', noKeys: '还没有 API 密钥。', revoke: '撤销', lastUsed: '最后使用', never: '从未', sample: 'cURL — 在终端或 CI 运行', example: 'JavaScript — 仅限服务端', useKey: '运行之前，请将生成的密钥存入 PICOSVC_SHOT_API_KEY 环境变量。', ready: '截图已完成。', noConfig: '尚未配置 Screenshot API 或 Clerk 环境变量。', retry: '重试', invalid: '请输入不含凭据或片段的公开 HTTP(S) URL。', unauthorized: '请重新登录。', auto: '创建密钥后，无需再打开控制台即可使用。', source: '截图来源', previous: '更改设置不会改变此截图。', invalidResponse: '渲染接口返回了缺失或意外的 PNG/PDF 内容。' },
} as const;

function apiError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const data = body as ErrorBody;
    const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    if (message) return `${message} (HTTP ${status})`;
  }
  return `Request failed (HTTP ${status})`;
}

export default function ShotWorkspace() {
  const { locale, messages, localizedHref } = useI18n();
  const t = TEXT[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const userNode = useRef<HTMLDivElement>(null);
  const captureSequence = useRef(0);
  const keysSequence = useRef(0);
  const [url, setUrl] = useState('https://example.com/');
  const [format, setFormat] = useState<CaptureFormat>('png');
  const [width, setWidth] = useState('1280');
  const [height, setHeight] = useState('720');
  const [fullPage, setFullPage] = useState(false);
  const [waitUntil, setWaitUntil] = useState('networkidle2');
  const [waitMs, setWaitMs] = useState('900');
  const [selector, setSelector] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyName, setKeyName] = useState('My automation');
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [capturedFormat, setCapturedFormat] = useState<CaptureFormat | null>(null);
  const [capturedSource, setCapturedSource] = useState('');
  const [imageSize, setImageSize] = useState('');
  const [tab, setTab] = useState<'capture' | 'keys' | 'docs'>('capture');
  const fileRef = useRef('');
  const endpoint = `${API}/api/picosvc/shot`;

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      stop = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; stop?.(); captureSequence.current += 1; keysSequence.current += 1; };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !userNode.current) return;
    const node = userNode.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);
  useEffect(() => {
    if (!signedIn) {
      captureSequence.current += 1; keysSequence.current += 1;
      if (fileRef.current) { URL.revokeObjectURL(fileRef.current); fileRef.current = ''; }
      setFileUrl(''); setCapturedFormat(null); setCapturedSource(''); setImageSize('');
      setKeys([]); setNewKey(''); setBusy(false); setKeyBusy(false);
    }
  }, [signedIn]);
  useEffect(() => () => { if (fileRef.current) URL.revokeObjectURL(fileRef.current); }, []);

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
    const current = ++keysSequence.current;
    try {
      const response = await request('/api/picosvc/shot/keys');
      const result = await response.json() as { keys?: KeyInfo[] };
      if (keysSequence.current === current) { setKeys(Array.isArray(result.keys) ? result.keys : []); setKeyError(''); }
    } catch (reason) { if (keysSequence.current === current) setKeyError(reason instanceof Error ? reason.message : String(reason)); }
  }, [clerk, request, signedIn]);
  useEffect(() => { if (signedIn && clerk) void listKeys(); }, [clerk, signedIn, listKeys]);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const current = ++captureSequence.current;
    setError(''); setBusy(true);
    try {
      const target = validatePublicInput(url);
      if (!target) throw new Error(t.invalid);
      const requestedFormat = format;
      const response = await request('/api/picosvc/shot', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, format: requestedFormat, width: Number(width), height: Number(height), fullPage: requestedFormat === 'png' && fullPage, waitUntil, waitMs: Number(waitMs), ...(requestedFormat === 'png' && selector.trim() ? { selector: selector.trim() } : {}) }),
      });
      const returnedFormat = captureResponseFormat(response.headers.get('content-type') || '');
      if (!returnedFormat || returnedFormat !== requestedFormat) throw new Error(t.invalidResponse);
      const blob = await response.blob();
      if (!blob.size) throw new Error(t.invalidResponse);
      if (captureSequence.current !== current) return;
      const next = URL.createObjectURL(blob);
      if (fileRef.current) URL.revokeObjectURL(fileRef.current);
      fileRef.current = next; setFileUrl(next); setCapturedFormat(returnedFormat); setCapturedSource(target);
      setImageSize(response.headers.get('x-picosvc-image-size') || '');
    } catch (reason) { if (captureSequence.current === current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (captureSequence.current === current) setBusy(false); }
  }
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (keyBusy || !keyName.trim()) return;
    const current = ++keysSequence.current;
    setKeyBusy(true); setKeyError(''); setNewKey('');
    try {
      const response = await request('/api/picosvc/shot/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: keyName.trim() }) });
      const result = await response.json() as { token?: string };
      if (!result.token) throw new Error('The API did not return a key.');
      if (keysSequence.current !== current) return;
      setNewKey(result.token);
      await listKeys();
    } catch (reason) { if (keysSequence.current === current) setKeyError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (signedIn) setKeyBusy(false); }
  }
  async function revoke(key: KeyInfo) {
    if (keyBusy || !window.confirm(`${t.revoke}: ${key.name}?`)) return;
    const current = ++keysSequence.current;
    setKeyBusy(true); setKeyError('');
    try {
      await request(`/api/picosvc/shot/keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' });
      if (keysSequence.current === current) await listKeys();
    } catch (reason) { if (keysSequence.current === current) setKeyError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (signedIn) setKeyBusy(false); }
  }
  const { curl, javascript } = shotExamples(endpoint, url, format, fullPage);

  return <main className="shotPage">
    <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><LanguageSwitcher />{signedIn ? <div className="userButton" ref={userNode} /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="shell shotHero"><div className="eyebrow"><span className="dot" />{t.eyebrow}</div><h1>{t.title}</h1><p className="lede">{t.intro}</p><div className="shotEndpoint"><div><small>{t.endpoint}</small><code>{endpoint || '/api/picosvc/shot'}</code></div><button type="button" className="ghost" onClick={() => { void copy(endpoint); }}>{copied === endpoint ? t.copied : t.copy}</button></div></section>
    <section className="shell shotWorkspace">
      <div className="shotTabs" role="tablist" aria-label="Screenshot workspace">{([['capture', t.capture], ['keys', t.keys], ['docs', t.docs]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'shotTabActive' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {!API || !CLERK_KEY ? <div className="error" role="alert">{t.noConfig}</div> : null}
      {tab === 'capture' && <div className="shotColumns"><section className="deployCard"><div className="shotPanelHead"><span className="kicker">01 / CAPTURE</span><h2>{t.capture}</h2></div>{!signedIn ? <div className="shotSignIn"><p>{t.signInBody}</p><button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : <form className="shotForm" onSubmit={event => { void capture(event); }} aria-busy={busy}><fieldset className="shotFormFields" disabled={busy}><label className="serviceField"><span>{t.target}</span><input type="url" required placeholder="https://example.com" value={url} onChange={event => setUrl(event.target.value)} /></label><div className="shotFormPair"><label className="serviceField"><span>{t.format}</span><select value={format} onChange={event => setFormat(event.target.value as CaptureFormat)}><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label className="serviceField"><span>{t.mode}</span><select value={waitUntil} onChange={event => setWaitUntil(event.target.value)}><option value="networkidle2">{t.idle}</option><option value="networkidle0">{t.strict}</option><option value="load">{t.load}</option><option value="domcontentloaded">{t.dom}</option></select></label></div><div className="shotFormPair"><label className="serviceField"><span>{t.width}</span><input type="number" min="320" max="3840" required value={width} onChange={event => setWidth(event.target.value)} /></label><label className="serviceField"><span>{t.height}</span><input type="number" min="200" max="2160" required value={height} onChange={event => setHeight(event.target.value)} /></label></div>{format === 'png' && <label className="shotToggle"><input type="checkbox" checked={fullPage} onChange={event => setFullPage(event.target.checked)} />{t.full}</label>}<div className="shotFormPair"><label className="serviceField"><span>{t.delay}</span><input type="number" min="0" max="10000" step="100" required value={waitMs} onChange={event => setWaitMs(event.target.value)} /></label><label className="serviceField"><span>{t.selector}</span><input type="text" maxLength={300} placeholder="#app .content" value={selector} disabled={format === 'pdf'} onChange={event => setSelector(event.target.value)} /></label></div><p className="shotHelp">{t.selectorHelp}</p><button type="submit" className="primary" disabled={!API}>{busy ? t.running : t.take}</button></fieldset></form>}{error && <div className="error" role="alert"><strong>{t.failed}</strong><p>{error}</p><p>{t.tips}</p></div>}</section><section className="deployCard shotPreviewPanel"><div className="shotPanelHead"><span className="kicker">02 / OUTPUT</span><h2>{t.preview}</h2></div>{fileUrl && capturedFormat ? <><div className="shotPreviewFrame">{capturedFormat === 'png' ? <img src={fileUrl} alt="Screenshot preview" /> : <div className="shotPdfReady"><span>PDF</span><p>{t.ready}</p></div>}</div><p className="shotCaptureSource">{t.source}: {capturedSource} · {t.previous}</p><div className="shotPreviewActions"><span className="shotFileMeta">{capturedFormat.toUpperCase()}{imageSize ? ` · ${imageSize}` : ''}</span><a className="primary" href={fileUrl} download={resultFilename('capture', capturedSource, capturedFormat)}>{t.download} ↓</a></div></> : <div className="shotPreviewEmpty"><span aria-hidden="true">▧</span><p>{busy ? t.running : t.tips}</p></div>}</section></div>}
      {tab === 'keys' && <div className="shotColumns"><section className="deployCard"><div className="shotPanelHead"><span className="kicker">01 / AUTHENTICATION</span><h2>{t.keyTitle}</h2><p>{t.keyIntro}</p></div>{!signedIn ? <button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button> : <form className="shotForm" onSubmit={event => { void createKey(event); }}><label className="serviceField"><span>{t.keyName}</span><input value={keyName} maxLength={80} required placeholder={t.keyPlaceholder} onChange={event => setKeyName(event.target.value)} /></label><button className="primary" type="submit" disabled={keyBusy || !API}>{keyBusy ? t.running : t.createKey}</button></form>}{newKey && <div className="shotNewKey" role="status"><strong>{t.oneTime}</strong><code>{newKey}</code><div className="shotKeyActions"><button type="button" className="primary" onClick={() => { void copy(newKey); }}>{copied === newKey ? t.copied : t.copy}</button><button type="button" className="ghost" onClick={() => setNewKey('')}>{t.dismiss}</button></div></div>}{keyError && <div className="error" role="alert">{keyError}</div>}</section><section className="deployCard"><div className="shotPanelHead"><span className="kicker">02 / CREDENTIALS</span><h2>{t.keys}</h2></div>{!signedIn || !keys.length ? <p className="shotHelp">{t.noKeys}</p> : <div className="shotKeyList">{keys.map(key => <div className="shotKeyRow" key={key.id}><div><strong>{key.name}</strong><small>{t.lastUsed}: {key.last_used_at ? new Date(key.last_used_at).toLocaleString(locale) : t.never}</small></div><button className="ghost shotRevoke" type="button" disabled={keyBusy} onClick={() => { void revoke(key); }}>{t.revoke}</button></div>)}</div>}</section></div>}
      {tab === 'docs' && <div className="shotDocs"><div className="shotDocIntro"><span className="kicker">AUTOMATE / INTEGRATE</span><h2>{t.docs}</h2><p>{t.auto} {t.useKey}</p></div><section className="deployCard"><div className="shotCodeHead"><h3>{t.sample}</h3><button className="ghost" onClick={() => { void copy(curl); }}>{copied === curl ? t.copied : t.copy}</button></div><pre><code>{curl}</code></pre></section><section className="deployCard"><div className="shotCodeHead"><h3>{t.example}</h3><button className="ghost" onClick={() => { void copy(javascript); }}>{copied === javascript ? t.copied : t.copy}</button></div><pre><code>{javascript}</code></pre></section></div>}
    </section>
  </main>;
}
