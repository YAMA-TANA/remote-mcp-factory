'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import {
  deskPaths, filterDeskItems, parseActivationCount, parseDeskItems, parseFormDeliveries, parseFormSettings,
  parseFormSubmissions, parseLicenseKeys, parseValidations, prepareFormSettings, publicFormEndpoint,
  type CustomerDeskItem, type CustomerDeskService, type FormDelivery, type FormSettings, type FormSubmission,
  type LicenseEntry, type ValidationEntry,
} from './service-customer-desk-model';
import './service-fleet-console.css';
import './service-resource-desk.css';
import './service-customer-desk.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const WORDS = {
  ja: { forms: 'Forms 個別管理', license: 'License 個別管理', formsIntro: 'フォームごとの受信状況・配送結果・入力制限を管理します。', licenseIntro: 'プロジェクトごとのキー状態・検証履歴・有効化数を確認します。', home: '全体ダッシュボード', workspace: '作成・詳細設定', usage: '利用量・上限', login: 'ログインして個別管理を開く', config: '認証またはWorker APIが未設定です。', loading: '読み込み中…', error: '管理情報を取得できませんでした。', refresh: '一覧を更新', search: '名前で検索', all: 'すべて', enabled: '公開中', paused: '停止中', resources: '管理対象', empty: '対象がありません。', choose: '左の一覧から選択してください。', manage: '個別に管理', updated: '最終更新', yes: '有効', no: '無効', never: '記録なし', endpoint: '送信エンドポイント', copy: 'URLをコピー', copied: 'コピーしました', formsSettings: '受付設定', origin: '許可するHTTPSオリジン（1行につき1件、空欄ですべて許可）', fields: '必須フィールド（1行につき1件）', honey: 'ハニーポットのフィールド名', turnstile: 'Turnstile検証を必須にする', preserve: '既存のWebhook送信先と成功時のリダイレクトは変更せず保存します。', save: '受付設定を保存', unsaved: '未保存の変更があります。', saved: '受付設定を保存しました。', invalid: '入力内容を確認してください。', submissions: '受信履歴（本文は非表示）', searchSubmissions: '送信データを検索', searchAction: '検索', deliveries: 'Webhook配送履歴', deliveryOk: '成功', deliveryFail: '失敗・未達', noHistory: '履歴はありません。', received: '受信日時', status: 'HTTP', quota: '検索は最大100件。送信本文・メールアドレス・配送URLはこの画面に表示しません。', keys: 'ライセンスキー（キー文字列は非表示）', label: 'ラベル', active: '有効', revoked: '失効済み', expired: '期限切れ', expiry: '有効期限', selectKey: '履歴を見る', revoke: '失効させる', restore: '失効を解除', revokeConfirm: 'このキーを失効させますか？利用中のクライアントの検証が失敗するようになります。', restoreConfirm: 'キーの失効を解除しますか？有効期限・有効化上限などの条件は引き続き適用されます。', changed: 'キーの状態を更新しました。', validations: '検証履歴（直近100件）', activations: '有効化デバイス数（最大100件取得）', validationOk: '成功', validationFail: '失敗', sensitive: 'ライセンス文字列・顧客情報・デバイス識別子・生のエラーは表示しません。キーの新規発行と詳細編集は既存画面で行えます。', working: '処理中…' },
  en: { forms: 'Forms resource management', license: 'License resource management', formsIntro: 'Manage submission activity, delivery results, and intake controls for each form.', licenseIntro: 'Inspect key status, validation history and activation counts for each project.', home: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', login: 'Sign in to manage resources', config: 'Authentication or Worker API is not configured.', loading: 'Loading…', error: 'Could not load management data.', refresh: 'Refresh list', search: 'Search by name', all: 'All', enabled: 'Published', paused: 'Paused', resources: 'Resources', empty: 'No matching resources.', choose: 'Choose a resource from the list.', manage: 'Manage resource', updated: 'Last updated', yes: 'Enabled', no: 'Disabled', never: 'No record', endpoint: 'Submission endpoint', copy: 'Copy URL', copied: 'Copied', formsSettings: 'Intake settings', origin: 'Allowed HTTPS origins (one per line; blank allows all)', fields: 'Required fields (one per line)', honey: 'Honeypot field name', turnstile: 'Require Turnstile verification', preserve: 'Existing webhook destination and success redirect remain unchanged.', save: 'Save intake settings', unsaved: 'You have unsaved changes.', saved: 'Intake settings saved.', invalid: 'Check the entered settings.', submissions: 'Submission history (no payloads)', searchSubmissions: 'Search submitted data', searchAction: 'Search', deliveries: 'Webhook delivery history', deliveryOk: 'Delivered', deliveryFail: 'Failed / missing', noHistory: 'No history.', received: 'Received', status: 'HTTP', quota: 'Search returns up to 100 entries. Submission content, email addresses and delivery URLs are not displayed here.', keys: 'License keys (key strings hidden)', label: 'Label', active: 'Active', revoked: 'Revoked', expired: 'Expired', expiry: 'Expires', selectKey: 'View history', revoke: 'Revoke key', restore: 'Restore key', revokeConfirm: 'Revoke this key? Existing clients will fail validation.', restoreConfirm: 'Restore this key? Expiry and activation limits still apply.', changed: 'Key status updated.', validations: 'Validation history (up to 100)', activations: 'Activated devices (up to 100 returned)', validationOk: 'Valid', validationFail: 'Invalid', sensitive: 'Key strings, customer data, device IDs, and raw errors are hidden. Create keys and edit advanced settings in the existing workspace.', working: 'Working…' },
  'zh-CN': { forms: 'Forms 单项管理', license: 'License 单项管理', formsIntro: '管理各表单的提交记录、投递结果及接收限制。', licenseIntro: '查看各项目密钥状态、验证记录和激活数量。', home: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', login: '登录后管理资源', config: '身份验证或 Worker API 未配置。', loading: '加载中…', error: '无法加载管理数据。', refresh: '刷新列表', search: '按名称搜索', all: '全部', enabled: '已发布', paused: '已暂停', resources: '资源列表', empty: '没有符合条件的资源。', choose: '请从左侧选择资源。', manage: '管理此资源', updated: '最后更新', yes: '启用', no: '禁用', never: '无记录', endpoint: '提交端点', copy: '复制地址', copied: '已复制', formsSettings: '接收设置', origin: '允许的 HTTPS 来源（每行一项；留空表示全部允许）', fields: '必填字段（每行一项）', honey: '蜜罐字段名称', turnstile: '要求 Turnstile 验证', preserve: '原有 Webhook 目标与成功跳转地址保持不变。', save: '保存接收设置', unsaved: '存在未保存的更改。', saved: '接收设置已保存。', invalid: '请检查输入设置。', submissions: '提交记录（不显示内容）', searchSubmissions: '搜索提交数据', searchAction: '搜索', deliveries: 'Webhook 投递记录', deliveryOk: '成功', deliveryFail: '失败／未送达', noHistory: '暂无记录。', received: '接收时间', status: 'HTTP', quota: '每次最多返回100项。本界面不显示提交内容、邮箱及投递目标地址。', keys: '许可证密钥（隐藏密钥字符串）', label: '标签', active: '有效', revoked: '已撤销', expired: '已过期', expiry: '过期时间', selectKey: '查看记录', revoke: '撤销密钥', restore: '恢复密钥', revokeConfirm: '撤销该密钥？现有客户端将无法通过验证。', restoreConfirm: '恢复该密钥？到期时间和激活上限仍然适用。', changed: '密钥状态已更新。', validations: '验证记录（最多100条）', activations: '激活设备数（最多获取100条）', validationOk: '有效', validationFail: '无效', sensitive: '隐藏密钥内容、客户数据、设备标识及原始错误。请在现有工作台创建密钥及编辑高级设置。', working: '处理中…' },
} as const;
const displayDate = (value: string | null, locale: string, fallback: string) => { if (!value) return fallback; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : fallback; };
const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);

function Editor({ service, clerk }: { service: CustomerDeskService; clerk: Clerk }) {
  const { locale } = useI18n(); const t = WORDS[locale];
  const [items, setItems] = useState<CustomerDeskItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all'|'enabled'|'paused'>('all');
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [origins, setOrigins] = useState(''); const [fields, setFields] = useState(''); const [honeypot, setHoneypot] = useState(''); const [turnstile, setTurnstile] = useState(false);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [deliveries, setDeliveries] = useState<FormDelivery[]>([]);
  const [submissionQuery, setSubmissionQuery] = useState('');
  const [keys, setKeys] = useState<LicenseEntry[]>([]); const [selectedKeyId, setSelectedKeyId] = useState('');
  const [validations, setValidations] = useState<ValidationEntry[]>([]); const [activations, setActivations] = useState<number | null>(null);
  const [loading, setLoading] = useState(false); const [detailLoading, setDetailLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState(false);
  const listVersion = useRef(0); const detailVersion = useRef(0); const keyVersion = useRef(0);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk.session?.getToken();
    if (!API || !clerk.isSignedIn || !token) throw new Error('Authentication required');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk]);
  const reload = useCallback(async () => {
    const current = ++listVersion.current; setLoading(true); setError('');
    try {
      const result = parseDeskItems(await request(deskPaths(service).list), service);
      if (current !== listVersion.current) return;
      setItems(result); setSelectedId(previous => result.some(item => item.id === previous) ? previous : result[0]?.id || '');
    } catch (reason) {
      if (current === listVersion.current) { setItems([]); setSelectedId(''); setError(reason instanceof Error ? reason.message : t.error); }
    } finally { if (current === listVersion.current) setLoading(false); }
  }, [request, service, t.error]);
  useEffect(() => { void reload(); return () => { listVersion.current++; }; }, [reload]);
  const selected = items.find(item => item.id === selectedId) || null;
  useEffect(() => {
    const version = ++detailVersion.current; keyVersion.current++;
    setSettings(null); setSubmissions([]); setDeliveries([]); setKeys([]); setSelectedKeyId(''); setValidations([]); setActivations(null); setNotice(''); setCopied(false); setSubmissionQuery('');
    if (!selectedId) return;
    setDetailLoading(true);
    (async () => {
      try {
        const paths = deskPaths(service, selectedId);
        if (service === 'forms') {
          const [rawSettings, rawSubmissions, rawDeliveries] = await Promise.all([request(paths.config), request(paths.search), request(paths.deliveries)]);
          if (version !== detailVersion.current) return;
          const config = parseFormSettings(rawSettings); setSettings(config); setOrigins(config.allowedOrigins.join('\n')); setFields(config.requiredFields.join('\n')); setHoneypot(config.honeypotField); setTurnstile(config.requireTurnstile);
          setSubmissions(parseFormSubmissions(rawSubmissions).entries); setDeliveries(parseFormDeliveries(rawDeliveries));
        } else {
          const data = parseLicenseKeys(await request(paths.keys));
          if (version !== detailVersion.current) return;
          setKeys(data); setSelectedKeyId(data[0]?.id || '');
        }
      } catch (reason) { if (version === detailVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
      finally { if (version === detailVersion.current) setDetailLoading(false); }
    })();
    return () => { detailVersion.current++; };
  }, [selectedId, request, service, t.error]);
  useEffect(() => {
    const version = ++keyVersion.current; setValidations([]); setActivations(null);
    if (service !== 'license' || !selectedId || !selectedKeyId) return;
    (async () => {
      try {
        const paths = deskPaths(service, selectedId, selectedKeyId);
        const [history, devices] = await Promise.all([request(paths.validations), request(paths.activations)]);
        if (version !== keyVersion.current) return;
        setValidations(parseValidations(history)); setActivations(parseActivationCount(devices));
      } catch (reason) { if (version === keyVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
    })();
    return () => { keyVersion.current++; };
  }, [selectedId, selectedKeyId, service, request, t.error]);
  const dirty = Boolean(settings && (origins !== settings.allowedOrigins.join('\n') || fields !== settings.requiredFields.join('\n') || honeypot !== settings.honeypotField || turnstile !== settings.requireTurnstile));
  const visible = filterDeskItems(items, query, stateFilter);
  const endpoint = service === 'forms' && selected ? publicFormEndpoint(API, selected) : '';
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings || !selected || busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const prepared = prepareFormSettings({ ...settings, allowedOrigins: lines(origins), requiredFields: lines(fields), honeypotField: honeypot.trim(), requireTurnstile: turnstile });
      const current = detailVersion.current;
      const result = parseFormSettings(await request(deskPaths('forms', selected.id).config, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prepared) }));
      if (current !== detailVersion.current) return;
      setSettings(result); setOrigins(result.allowedOrigins.join('\n')); setFields(result.requiredFields.join('\n')); setHoneypot(result.honeypotField); setTurnstile(result.requireTurnstile); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.invalid); }
    finally { setBusy(false); }
  }
  async function searchSubmissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const current = detailVersion.current; setBusy(true); setError('');
    try {
      const path = `${deskPaths('forms', selected.id).search}?q=${encodeURIComponent(submissionQuery.trim().slice(0,100))}`;
      const rows = parseFormSubmissions(await request(path));
      if (current === detailVersion.current) setSubmissions(rows.entries);
    } catch (reason) { if (current === detailVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function toggleKey(entry: LicenseEntry) {
    if (!selected || busy || !window.confirm(entry.revoked ? t.restoreConfirm : t.revokeConfirm)) return;
    const current = detailVersion.current; setBusy(true); setError(''); setNotice('');
    try {
      await request(deskPaths('license', selected.id, entry.id).item, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked: !entry.revoked }) });
      const result = parseLicenseKeys(await request(deskPaths('license', selected.id).keys));
      if (current === detailVersion.current) { setKeys(result); setNotice(t.changed); }
    } catch (reason) { if (current === detailVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function copyEndpoint() {
    try { await navigator.clipboard.writeText(endpoint); setCopied(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
  }
  return <div className="shell resourceDeskBody customerDeskBody">
    {error && <p role="alert" className="fleetError">{error}</p>}{notice && <p role="status" className="fleetNotice">{notice}</p>}
    <section className="fleetSummary" aria-label={t.resources}><div><small>{t.resources}</small><strong>{items.length}</strong></div><div><small>{t.enabled}</small><strong>{items.filter(item => item.enabled).length}</strong></div><div><small>{t.paused}</small><strong>{items.filter(item => !item.enabled).length}</strong></div></section>
    <div className="resourceDeskGrid"><section className="fleetPanel resourceDeskInventory" aria-label={t.resources}>
      <div className="resourceDeskHeading"><h2>{t.resources}</h2><button type="button" disabled={busy || loading} onClick={() => { void reload(); }}>{loading ? t.loading : t.refresh}</button></div>
      <input value={query} maxLength={100} aria-label={t.search} placeholder={t.search} onChange={event => setQuery(event.target.value)}/>
      {service === 'forms' && <div className="resourceDeskFilters" role="group" aria-label={t.resources}>{(['all','enabled','paused'] as const).map(value => <button key={value} type="button" aria-pressed={stateFilter === value} onClick={() => setStateFilter(value)}>{t[value]}</button>)}</div>}
      {!visible.length ? <p>{loading ? t.loading : t.empty}</p> : <ul className="resourceDeskList">{visible.map(item => <li key={item.id}><button type="button" className={selectedId === item.id ? 'resourceDeskSelected' : ''} aria-pressed={selectedId === item.id} onClick={() => { if (dirty && !window.confirm(t.unsaved)) return; setSelectedId(item.id); }}><strong>{item.name}</strong><small>{t.updated}: {displayDate(item.updatedAt, locale, t.never)}</small><em>{t.manage} →</em></button></li>)}</ul>}
    </section><section className="fleetPanel resourceDeskDetail" aria-label={t.manage}><h2>{t.manage}</h2>
      {!selected ? <p>{t.choose}</p> : detailLoading ? <p role="status">{t.loading}</p> : <>
        <div className="resourceDeskMeta"><strong>{selected.name}</strong><small>{t.updated}: {displayDate(selected.updatedAt, locale, t.never)}</small></div>
        {service === 'forms' ? <>
          <div className="resourceDeskPublic"><strong>{t.endpoint}</strong><code>{endpoint}</code><button type="button" onClick={() => { void copyEndpoint(); }}>{copied ? t.copied : t.copy}</button></div>
          {settings && <form className="resourceDeskForm" onSubmit={event => { void saveSettings(event); }}><h3>{t.formsSettings}</h3><label>{t.origin}<textarea rows={3} maxLength={3000} value={origins} onChange={event => setOrigins(event.target.value)}/></label><label>{t.fields}<textarea rows={3} maxLength={2000} value={fields} onChange={event => setFields(event.target.value)}/></label><label>{t.honey}<input value={honeypot} maxLength={64} required onChange={event => setHoneypot(event.target.value)}/></label><label className="customerDeskCheckbox"><input type="checkbox" checked={turnstile} onChange={event => setTurnstile(event.target.checked)}/>{t.turnstile}</label><p>{t.preserve}</p><div className="resourceDeskActions"><button type="submit" disabled={busy || !dirty}>{busy ? t.working : t.save}</button></div>{dirty && <small role="status">{t.unsaved}</small>}</form>}
          <section className="resourceDeskFeedOps"><h3>{t.submissions}</h3><form className="customerDeskSearch" onSubmit={event => { void searchSubmissions(event); }}><input aria-label={t.searchSubmissions} placeholder={t.searchSubmissions} maxLength={100} value={submissionQuery} onChange={event => setSubmissionQuery(event.target.value)}/><button type="submit" disabled={busy}>{t.searchAction}</button></form><p>{t.quota}</p>{!submissions.length ? <p>{t.noHistory}</p> : <ul className="customerDeskEvents">{submissions.map(row => <li key={row.id}><span>{t.received}: {displayDate(row.receivedAt, locale, t.never)}</span><code>{row.id.slice(0,8)}</code></li>)}</ul>}</section>
          <section className="resourceDeskFeedOps"><h3>{t.deliveries}</h3>{!deliveries.length ? <p>{t.noHistory}</p> : <ul className="customerDeskEvents">{deliveries.map(row => <li key={row.id}><span>{row.delivered ? t.deliveryOk : t.deliveryFail} · {t.status}: {row.status ?? '—'}</span><small>{displayDate(row.at, locale, t.never)}</small></li>)}</ul>}</section>
        </> : <>
          <section className="resourceDeskFeedOps"><h3>{t.keys}</h3>{!keys.length ? <p>{t.noHistory}</p> : <ul className="customerDeskKeys">{keys.map(entry => <li key={entry.id}><div><strong>{entry.label}</strong><small>{entry.revoked ? t.revoked : entry.expired ? t.expired : t.active} · {t.expiry}: {displayDate(entry.expiresAt, locale, t.never)}</small></div><div className="resourceDeskActions"><button type="button" aria-pressed={selectedKeyId === entry.id} onClick={() => setSelectedKeyId(entry.id)}>{t.selectKey}</button><button type="button" disabled={busy} onClick={() => { void toggleKey(entry); }}>{entry.revoked ? t.restore : t.revoke}</button></div></li>)}</ul>}</section>
          {selectedKeyId && <section className="resourceDeskFeedOps"><h3>{t.validations}</h3><p>{t.activations}: {activations ?? t.loading}</p>{!validations.length ? <p>{t.noHistory}</p> : <ul className="customerDeskEvents">{validations.map(row => <li key={row.id}><span>{row.valid ? t.validationOk : t.validationFail} · {row.reason}</span><small>{displayDate(row.at, locale, t.never)}</small></li>)}</ul>}</section>}
          <p className="resourceDeskSafety">{t.sensitive}</p>
        </>}
      </>}
    </section></div>
  </div>;
}
export default function ServiceCustomerDesk({ service }: { service: CustomerDeskService }) {
  const { locale, localizedHref, messages } = useI18n(); const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null); const [ready, setReady] = useState(!KEY); const [signedIn, setSignedIn] = useState(false); const [revision, setRevision] = useState(0);
  const accountNode = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!KEY) return;
    let mounted = true; let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY); await instance.load({ ui }); if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      unsubscribe = instance.addListener(() => { if (mounted) { setSignedIn(Boolean(instance.isSignedIn)); setRevision(value => value + 1); } });
    }).catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current; clerk.mountUserButton(node); return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn, revision]);
  return <main className="fleetConsole resourceDesk customerDesk"><nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.home}</a><a href={localizedHref(`/${service}/app/`)}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher/>{signedIn ? <div ref={accountNode}/> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <header className="shell fleetHero"><span>PICOSVC / {service.toUpperCase()} / RESOURCE MANAGEMENT</span><h1>{t[service]}</h1><p>{service === 'forms' ? t.formsIntro : t.licenseIntro}</p></header>
    {!API || !KEY ? <p className="shell fleetError" role="alert">{t.config}</p> : !ready ? <p className="shell" role="status">{t.loading}</p> : !signedIn || !clerk ? <section className="shell fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <Editor key={revision} service={service} clerk={clerk}/>}
  </main>;
}
