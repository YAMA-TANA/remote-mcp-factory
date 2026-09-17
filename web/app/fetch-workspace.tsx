'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { downloadTextResult, resultFilename, validatePublicInput } from './fetch-shot-results';
import './fetch-shot-ux.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type FetchFormat = 'markdown' | 'metadata';
type RecordValue = Record<string, unknown>;
type FetchResult = { payload: RecordValue; source: string; format: FetchFormat };
const TEXT = {
  en: { back: 'All services', pricing: 'Pricing', title: 'Extract content from a URL', intro: 'Read extracted Markdown directly, or inspect page metadata without digging through escaped JSON.', url: 'Public page URL', format: 'Output format', markdown: 'Markdown', metadata: 'Metadata', extract: 'Extract content', working: 'Extracting page…', signIn: 'Sign in to extract', signInBody: 'Sign in to use Fetch.', result: 'Extraction result', resultEmpty: 'Enter a public URL and extract a page to see its content here.', copy: 'Copy content', copied: 'Copied', raw: 'Show raw JSON', failed: 'Extraction failed', invalid: 'Enter a public HTTP(S) URL without embedded credentials or a fragment.', noConfig: 'The Fetch API or Clerk environment is not configured.', unauthorized: 'Your session expired. Please sign in again.', titleField: 'Title', description: 'Description', pageUrl: 'Page URL', canonical: 'Canonical URL', preview: 'Text preview', contentType: 'Content type', bytes: 'Bytes', empty: 'The API returned no readable content.', save: 'Save result', saved: 'Result downloaded.', privacy: 'Saved files may contain page content or sensitive URL query parameters. Review before sharing.', source: 'Result for', stale: 'Changing the form does not change the previous result.' },
  ja: { back: '全サービス', pricing: '料金', title: 'URLからコンテンツを抽出', intro: '抽出したMarkdown本文やページ情報を、エスケープされたJSONを読まずに確認できます。', url: '公開ページのURL', format: '出力形式', markdown: 'Markdown本文', metadata: 'ページ情報', extract: '抽出する', working: 'ページを抽出中…', signIn: 'ログインして抽出', signInBody: 'Fetchの利用にはログインが必要です。', result: '抽出結果', resultEmpty: '公開URLを入力して抽出すると、ここに結果が表示されます。', copy: '本文をコピー', copied: 'コピーしました', raw: '元のJSONを表示', failed: '抽出に失敗しました', invalid: '認証情報やフラグメントを含まない公開HTTP(S) URLを指定してください。', noConfig: 'Fetch APIまたはClerkの環境変数が未設定です。', unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。', titleField: 'タイトル', description: '説明', pageUrl: 'ページURL', canonical: '正規URL', preview: '本文プレビュー', contentType: 'コンテンツ形式', bytes: 'バイト数', empty: '読み取り可能なコンテンツが返されませんでした。', save: '結果を保存', saved: '結果を保存しました。', privacy: '保存ファイルにはページ本文やURLのクエリ情報が含まれる場合があります。共有前に確認してください。', source: '取得済みの結果', stale: '入力を変更しても、前回の取得結果は変わりません。' },
  'zh-CN': { back: '全部服务', pricing: '价格', title: '从 URL 提取内容', intro: '直接阅读提取的 Markdown 或网页元数据，无需查看转义后的 JSON。', url: '公开网页 URL', format: '输出格式', markdown: 'Markdown 正文', metadata: '网页元数据', extract: '提取内容', working: '正在提取网页…', signIn: '登录后提取', signInBody: '请登录以使用 Fetch。', result: '提取结果', resultEmpty: '输入公开 URL 并提取网页，结果会显示在这里。', copy: '复制正文', copied: '已复制', raw: '显示原始 JSON', failed: '提取失败', invalid: '请输入不含凭据或片段的公开 HTTP(S) URL。', noConfig: '尚未配置 Fetch API 或 Clerk 环境变量。', unauthorized: '登录已过期，请重新登录。', titleField: '标题', description: '描述', pageUrl: '网页 URL', canonical: '规范 URL', preview: '正文预览', contentType: '内容类型', bytes: '字节数', empty: 'API 未返回可阅读的内容。', save: '保存结果', saved: '结果已下载。', privacy: '保存的文件可能包含网页内容或敏感 URL 查询参数，请在分享前检查。', source: '已获取结果', stale: '修改输入不会改变上一次获取的结果。' },
} as const;

function record(value: unknown): RecordValue | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null; }
function field(value: unknown): string { return typeof value === 'string' ? value : ''; }
function errorMessage(value: unknown, status: number): string {
  const body = record(value);
  const nested = record(body?.error);
  return field(nested?.message) || field(body?.error) || field(body?.message) || `HTTP ${status}`;
}
const META_KEYS = ['schema', 'url', 'format', 'title', 'description', 'canonical', 'textPreview', 'contentType', 'bytes'] as const;
export function metadataSnapshot(payload: RecordValue): RecordValue {
  const snapshot: RecordValue = {};
  for (const key of META_KEYS) if (payload[key] !== undefined && payload[key] !== null) snapshot[key] = payload[key];
  return snapshot;
}

export default function FetchWorkspace() {
  const { locale, messages, localizedHref } = useI18n();
  const t = TEXT[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const userNode = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const [url, setUrl] = useState('https://example.com/');
  const [format, setFormat] = useState<FetchFormat>('markdown');
  const [result, setResult] = useState<FetchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; unsubscribe?.(); requestSequence.current += 1; };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !userNode.current) return;
    const node = userNode.current;
    clerk.mountUserButton(node);
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);
  useEffect(() => { if (!signedIn) { requestSequence.current += 1; setResult(null); setBusy(false); setNotice(''); } }, [signedIn]);

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const current = ++requestSequence.current;
    setBusy(true); setError(''); setNotice(''); setResult(null); setCopied(false);
    try {
      const target = validatePublicInput(url);
      if (!target) throw new Error(t.invalid);
      if (!API || !CLERK_KEY) throw new Error(t.noConfig);
      const token = await clerk?.session?.getToken();
      if (!token) throw new Error(t.unauthorized);
      const requestedFormat = format;
      const response = await fetch(`${API}/api/picosvc/fetch`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, format: requestedFormat }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, response.status));
      const data = record(payload);
      if (!data || data.format !== requestedFormat || (requestedFormat === 'markdown' && typeof data.markdown !== 'string')) throw new Error(t.empty);
      if (requestSequence.current === current) setResult({ payload: data, source: target, format: requestedFormat });
    } catch (reason) { if (requestSequence.current === current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (requestSequence.current === current) setBusy(false); }
  }

  const data = result?.payload ?? null;
  const markdown = field(data?.markdown);
  const isMarkdown = result?.format === 'markdown';
  const isMetadata = result?.format === 'metadata';
  const metadata = [
    { key: 'title', label: t.titleField }, { key: 'description', label: t.description },
    { key: 'url', label: t.pageUrl }, { key: 'canonical', label: t.canonical },
    { key: 'textPreview', label: t.preview }, { key: 'contentType', label: t.contentType },
    { key: 'bytes', label: t.bytes },
  ];

  function resultText(): string {
    if (!data) return '';
    return isMarkdown ? markdown : JSON.stringify(metadataSnapshot(data), null, 2);
  }
  async function copy() {
    if (!data) return;
    try { await navigator.clipboard.writeText(resultText()); setCopied(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function download() {
    if (!result) return;
    try {
      const extension = isMarkdown ? 'md' : 'json';
      downloadTextResult(resultText(), isMarkdown ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8', resultFilename('fetch', result.source, extension));
      setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <main className="servicePage fetchPage">
    <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><LanguageSwitcher />{signedIn ? <div className="userButton" ref={userNode} /> : <button type="button" className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="hero shell serviceHero"><div className="eyebrow"><span className="dot" /> PICOSVC / FETCH</div><h1>{t.title}</h1><p className="lede">{t.intro}</p></section>
    <section className="shell fetchWorkspace">
      {!API || !CLERK_KEY ? <div className="error" role="alert">{t.noConfig}</div> : null}
      <div className="fetchColumns"><section className="deployCard fetchFormPanel"><h2>{t.extract}</h2>{!signedIn ? <div className="fetchSignIn"><p>{t.signInBody}</p><button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : <form className="fetchForm" onSubmit={event => { void extract(event); }} aria-busy={busy}><label className="serviceField"><span>{t.url}</span><input type="url" required value={url} disabled={busy} placeholder="https://example.com/" onChange={event => setUrl(event.target.value)} /></label><label className="serviceField"><span>{t.format}</span><select value={format} disabled={busy} onChange={event => setFormat(event.target.value as FetchFormat)}><option value="markdown">{t.markdown}</option><option value="metadata">{t.metadata}</option></select></label><button type="submit" className="primary" disabled={busy || !API}>{busy ? t.working : t.extract}</button></form>}{error && <div className="error" role="alert"><strong>{t.failed}</strong><p>{error}</p></div>}</section>
      <section className="deployCard fetchResultPanel" aria-busy={busy}><div className="fetchResultHead"><h2>{t.result}</h2>{data && <div className="fetchResultActions"><button type="button" className="ghost" onClick={() => { void copy(); }}>{copied ? t.copied : t.copy}</button><button type="button" className="ghost" onClick={download}>{t.save} ↓</button></div>}</div>{busy ? <div className="fetchPending" role="status" aria-live="polite"><span className="fetchShotSpinner" aria-hidden="true" />{t.working}</div> : !data ? <p className="fetchEmpty">{t.resultEmpty}</p> : <><p className="fetchResultSource">{t.source}: <span>{result?.source}</span> · {isMarkdown ? t.markdown : t.metadata}. {t.stale}</p><div className="fetchResultContent">{isMarkdown ? <pre className="fetchMarkdown">{markdown || t.empty}</pre> : isMetadata ? <dl className="fetchMetadata">{metadata.map(item => { const value = data[item.key]; if (value == null || value === '') return null; const href = (item.key === 'url' || item.key === 'canonical') ? validatePublicInput(value as string) : null; return <div key={item.key}><dt>{item.label}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{href}</a> : String(value)}</dd></div>; })}</dl> : <pre className="fetchMarkdown">{JSON.stringify(data, null, 2)}</pre>}</div><p className="fetchResultPrivacy">{t.privacy}</p><details className="fetchRaw"><summary>{t.raw}</summary><pre>{JSON.stringify(data, null, 2)}</pre></details></>}{notice && <p role="status" className="fetchResultNotice">{notice}</p>}</section></div>
    </section>
  </main>;
}
