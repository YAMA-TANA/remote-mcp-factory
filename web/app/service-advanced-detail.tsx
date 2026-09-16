'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { GenericServiceSlug } from './service-data';

type Data = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { service: GenericServiceSlug; resource: Data; api: Api; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Field = { key: string; label: string; source?: string; kind?: 'text' | 'url' | 'number' | 'select' | 'json' | 'code' | 'check'; choices?: string[]; optional?: boolean };
type Definition = { base: (id: string) => string; fields: Field[]; activity?: { path: (id: string) => string; key: string; title: string }; allowDelete?: boolean };
const field = (key: string, label: string, kind: Field['kind'] = 'text', source?: string): Field => ({ key, label, kind, source });
const DEFINITIONS: Partial<Record<GenericServiceSlug, Definition>> = {
  qr: { base: id => `/api/picosvc/qr/links/${id}`, fields: [field('name', 'Name'), field('targetUrl', 'Destination URL', 'url', 'target_url'), field('enabled', 'Enabled', 'check')], allowDelete: true },
  rss: { base: id => `/api/picosvc/rss/feeds/${id}`, fields: [field('name', 'Feed name'), field('sourceUrl', 'Source URL', 'url', 'source_url'), field('enabled', 'Enabled', 'check'), ...['item', 'title', 'link', 'content', 'date'].map(key => field(`${key}Selector`, `${key} CSS selector (optional)`, 'text', `${key}_selector`))], allowDelete: true },
  mail: { base: id => `/api/picosvc/mail/routes/${id}`, fields: [field('name', 'Route name'), field('webhookUrl', 'Destination webhook', 'url', 'webhook_url'), field('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/mail/routes/${id}/events`, key: 'events', title: 'Delivery history' }, allowDelete: true },
  cron: { base: id => `/api/picosvc/cron/jobs/${id}`, fields: [field('name', 'Job name'), field('cron', 'Cron (UTC)', 'text', 'cron_expression'), field('method', 'HTTP method', 'select'), field('targetUrl', 'Destination URL', 'url', 'target_url'), field('headers', 'Request headers (JSON)', 'json', 'headers_json'), field('body', 'Request body', 'code'), field('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/cron/jobs/${id}/runs`, key: 'runs', title: 'Run history' }, allowDelete: true },
  monitor: { base: id => `/api/picosvc/monitor/${id}`, fields: [field('name', 'Monitor name'), field('targetUrl', 'Page URL', 'url', 'target_url'), field('webhookUrl', 'Webhook (optional)', 'url', 'webhook_url'), field('intervalMinutes', 'Interval in minutes', 'number', 'interval_minutes'), field('enabled', 'Enabled', 'check')], allowDelete: true },
  functions: { base: id => `/api/picosvc/functions/apps/${id}`, fields: [field('name', 'Function name'), field('code', 'JavaScript source', 'code'), field('enabled', 'Enabled', 'check')], allowDelete: true },
  hooks: { base: id => `/api/picosvc/hooks/inboxes/${id}`, fields: [field('name', 'Inbox name'), field('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/hooks/inboxes/${id}/events?limit=50`, key: 'events', title: 'Received webhooks' }, allowDelete: true },
  mcp: { base: id => `/api/servers/${id}`, fields: [field('visibility', 'Access', 'select'), field('enabled', 'Enabled', 'check')] },
};
const ALLOWED = new Set(['https:', 'http:']);
function rec(value: unknown): Data | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null; }
function str(value: unknown): string { return value === null || value === undefined ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
function getInitial(resource: Data, fields: Field[]): Record<string, string> {
  return Object.fromEntries(fields.map(f => {
    let value = resource[f.key] ?? resource[f.source || f.key];
    if (f.kind === 'check') value = value === undefined ? true : !(value === false || value === 0 || value === '0');
    if (f.kind === 'json') { try { value = JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value ?? {}, null, 2); } catch { value = '{}'; } }
    return [f.key, str(value)];
  }));
}
function safeUrl(value: string): boolean { try { return ALLOWED.has(new URL(value).protocol); } catch { return false; } }
function failure(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }
function activityTitle(item: Data): string { return str(item.method || item.subject || item.path || item.response_status || item.id || item.key); }
function activityTime(item: Data): string { return str(item.receivedAt || item.received_at || item.ran_at || item.created_at); }

export default function ServiceAdvancedDetail({ service, resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n();
  const ja = locale === 'ja';
  const def = DEFINITIONS[service];
  const id = str(resource.id);
  const [current, setCurrent] = useState<Data>(resource);
  const [values, setValues] = useState<Record<string, string>>(() => getInitial(resource, def?.fields || []));
  const [tab, setTab] = useState<'settings' | 'activity' | 'security'>('settings');
  const [activity, setActivity] = useState<Data[]>([]);
  const [nextBefore, setNextBefore] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Data | null>(null);
  const [replayUrl, setReplayUrl] = useState('');
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretNames, setSecretNames] = useState<string[]>([]);
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [response, setResponse] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const base = def?.base(encodeURIComponent(id)) || '';
  const name = str(current.name || current.repo_url || id);

  const load = useCallback(async () => {
    if (!def || !id) return;
    setLoading(true); setError('');
    try {
      if (service === 'functions' || service === 'hooks') {
        const detail = rec((await api(base)).payload);
        if (!detail) throw new Error('Unexpected detail response.');
        setCurrent(detail); setValues(getInitial(detail, def.fields));
      }
      if (def.activity) {
        const result = rec((await api(def.activity.path(encodeURIComponent(id)))).payload);
        const items = result?.[def.activity.key];
        if (!Array.isArray(items)) throw new Error(`Missing ${def.activity.key} in activity response.`);
        setActivity(items.filter((entry): entry is Data => rec(entry) !== null));
        setNextBefore(str(result?.nextBefore));
      }
      if (service === 'mcp') {
        const result = rec((await api(`${base}/secrets`)).payload);
        if (!Array.isArray(result?.names)) throw new Error('Missing secret names in MCP response.');
        setSecretNames(result.names.filter((value): value is string => typeof value === 'string'));
      }
    } catch (reason) { setError(failure(reason)); }
    finally { setLoading(false); }
  }, [api, base, def, id, service]);
  useEffect(() => { setCurrent(resource); setValues(getInitial(resource, def?.fields || [])); setActivity([]); setSelectedEvent(null); setOneTimeToken(''); void load(); }, [resource, load, def]);

  async function execute(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice(''); setResponse(null);
    try { await operation(); } catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!def) return;
    await execute(async () => {
      const body: Data = {};
      for (const f of def.fields) {
        const text = values[f.key] || '';
        if (f.kind === 'check') body[f.key] = text === 'true';
        else if (f.kind === 'number') {
          if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${f.label}: invalid number`);
          body[f.key] = Number(text);
        } else if (f.kind === 'json') {
          const parsed = JSON.parse(text || '{}') as unknown;
          if (!rec(parsed)) throw new Error(`${f.label}: expected a JSON object`);
          body[f.key] = parsed;
        } else if (f.kind === 'url' && !text.trim() && f.key === 'webhookUrl' && service === 'monitor') body[f.key] = null;
        else {
          if (f.kind === 'url' && !safeUrl(text)) throw new Error(`${f.label}: enter a valid HTTP(S) URL`);
          body[f.key] = text;
        }
      }
      const result = rec((await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).payload);
      setCurrent(prev => ({ ...prev, ...body, ...result }));
      setNotice(ja ? '変更を保存しました。' : 'Changes saved.');
      onChanged();
    });
  }
  async function remove() {
    if (!def?.allowDelete || !window.confirm(ja ? `「${name}」を完全に削除しますか？ 元に戻せません。` : `Permanently delete “${name}”? This cannot be undone.`)) return;
    await execute(async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  async function action(path: string, label: string) {
    await execute(async () => { setResponse((await api(path, { method: 'POST' })).payload); setNotice(label); onChanged(); });
  }
  async function olderEvents() {
    if (!def?.activity || !nextBefore || busy) return;
    await execute(async () => {
      const url = new URL(def.activity!.path(encodeURIComponent(id)), 'https://example.invalid');
      url.searchParams.set('before', nextBefore);
      const payload = rec((await api(`${url.pathname}${url.search}`)).payload);
      if (!Array.isArray(payload?.events)) throw new Error('Missing webhook events.');
      setActivity(old => [...old, ...payload.events.filter((entry): entry is Data => rec(entry) !== null)]);
      setNextBefore(str(payload.nextBefore));
    });
  }
  async function inspectEvent(item: Data) {
    if (service !== 'hooks') { setSelectedEvent(item); return; }
    await execute(async () => {
      const detail = rec((await api(`/api/picosvc/hooks/events/${encodeURIComponent(str(item.id))}`)).payload);
      if (!detail) throw new Error('Could not load event.');
      // Show the already-redacted headers and short preview. Never automatically decode arbitrary binary bodies.
      setSelectedEvent({ ...detail, bodyBase64: undefined });
    });
  }
  async function replayEvent() {
    if (!selectedEvent || !safeUrl(replayUrl)) { setError(ja ? '公開HTTPS URLを指定してください。' : 'Provide a public HTTP(S) replay URL.'); return; }
    if (!window.confirm(ja ? `このイベントを ${replayUrl} に再送しますか？` : `Replay this event to ${replayUrl}?`)) return;
    await execute(async () => { setResponse((await api(`/api/picosvc/hooks/events/${encodeURIComponent(str(selectedEvent.id))}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: replayUrl }) })).payload); setNotice(ja ? '再送結果' : 'Replay result'); });
  }
  async function rotateToken(path: string) {
    if (!window.confirm(ja ? '現在の認証トークンは無効になります。更新しますか？' : 'This invalidates the existing token. Rotate it?')) return;
    await execute(async () => {
      const payload = rec((await api(path, { method: 'POST' })).payload);
      const token = str(payload?.bearerToken);
      if (!token) throw new Error('API returned no bearer token.');
      setOneTimeToken(token); setNotice(ja ? '新しいトークンを安全な場所に保存してください。再表示できません。' : 'Save the new token securely now. It will not be shown again.');
    });
  }
  async function saveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await execute(async () => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretName)) throw new Error('Invalid environment variable name.');
      const payload = rec((await api(`${base}/secrets`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secrets: { [secretName]: secretValue } }) })).payload);
      setSecretNames(Array.isArray(payload?.names) ? payload.names.filter((entry): entry is string => typeof entry === 'string') : []);
      setSecretName(''); setSecretValue(''); setNotice(ja ? 'シークレットを保存しました。ランタイムは再起動されます。' : 'Secret saved. Runtime will restart.');
    });
  }
  async function deleteSecret(item: string) {
    if (!window.confirm(ja ? `${item} を削除しますか？` : `Delete ${item}?`)) return;
    await execute(async () => {
      const payload = rec((await api(`${base}/secrets/${encodeURIComponent(item)}`, { method: 'DELETE' })).payload);
      setSecretNames(Array.isArray(payload?.names) ? payload.names.filter((entry): entry is string => typeof entry === 'string') : []);
      setNotice(ja ? '削除しました。' : 'Secret deleted.');
    });
  }
  if (!def) return null;
  const isActivity = Boolean(def.activity);
  return <section className="deployCard serviceDetail serviceAdvanced" aria-label={`${name} advanced management`}>
    <header className="serviceAdvancedHead"><div><span className="kicker">PICOSVC / {service.toUpperCase()}</span><h2>{name}</h2><p>{ja ? '設定・履歴・認証を管理' : 'Manage settings, activity and access'}</p></div><button className="ghost" type="button" onClick={onClose}>{ja ? '閉じる' : 'Close'} ×</button></header>
    <div className="serviceTabs" role="tablist" aria-label="Management sections">
      <button role="tab" type="button" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>{ja ? '設定' : 'Settings'}</button>
      {isActivity && <button role="tab" type="button" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>{ja ? '履歴' : 'Activity'} <span>{activity.length}</span></button>}
      {(service === 'mcp' || service === 'json') && <button role="tab" type="button" aria-selected={tab === 'security'} className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>{ja ? '認証' : 'Security'}</button>}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <div className="success" role="status">{notice}</div>}
    {loading && <p className="serviceMuted" role="status">{ja ? 'データ取得中…' : 'Loading details…'}</p>}
    {tab === 'settings' && <div className="serviceAdvancedGrid"><form className="serviceInnerForm serviceEditForm" onSubmit={event => { void save(event); }}>
      <h3>{ja ? 'リソース設定' : 'Resource settings'}</h3>
      {def.fields.map(f => <label className="serviceField" key={f.key}><span>{f.label}</span>{f.kind === 'check' ? <span className="serviceCheck"><input type="checkbox" checked={values[f.key] === 'true'} onChange={event => setValues(old => ({ ...old, [f.key]: String(event.target.checked) }))} /> {values[f.key] === 'true' ? ja ? '有効' : 'Active' : ja ? '停止中' : 'Paused'}</span> : f.kind === 'select' ? <select value={values[f.key] || ''} onChange={event => setValues(old => ({ ...old, [f.key]: event.target.value }))}>{(f.choices || (f.key === 'visibility' ? ['token', 'public'] : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])).map(choice => <option key={choice}>{choice}</option>)}</select> : f.kind === 'code' || f.kind === 'json' ? <textarea rows={f.kind === 'code' ? 10 : 5} spellCheck={false} value={values[f.key] || ''} onChange={event => setValues(old => ({ ...old, [f.key]: event.target.value }))} /> : <input type={f.kind === 'number' ? 'number' : f.kind === 'url' ? 'url' : 'text'} value={values[f.key] || ''} onChange={event => setValues(old => ({ ...old, [f.key]: event.target.value }))} />}</label>)}
      <div className="serviceButtons"><button type="submit" className="primary" disabled={busy || loading}>{busy ? '…' : ja ? '変更を保存' : 'Save changes'}</button><button type="button" className="ghost" disabled={busy || loading} onClick={() => setValues(getInitial(current, def.fields))}>{ja ? '元に戻す' : 'Reset form'}</button></div>
    </form><aside className="serviceAdvancedAside"><h3>{ja ? 'クイック操作' : 'Quick actions'}</h3>
      {service === 'rss' && <><button className="secondary" disabled={busy} onClick={() => { void action(`${base}/preview`, ja ? '抽出プレビューを取得しました。' : 'Extraction preview loaded.'); }}>{ja ? '抽出をプレビュー' : 'Preview extraction'}</button><button className="secondary" disabled={busy} onClick={() => { void action(`${base}/refresh`, ja ? 'フィードを更新しました。' : 'Feed refreshed.'); }}>{ja ? '今すぐ更新' : 'Refresh feed now'}</button></>}
      {service === 'mcp' && <button className="secondary" disabled={busy} onClick={() => { if (window.confirm(ja ? 'ビルド枠を消費して再ビルドしますか？' : 'Rebuild this deployment? This consumes a build quota.')) void action(`${base}/rebuild`, ja ? '再ビルドを開始しました。' : 'Rebuild queued.'); }}>{ja ? '再ビルド' : 'Rebuild deployment'}</button>}
      {service === 'functions' && <p className="serviceMuted">{ja ? 'コード変更後は保存してから公開URLを確認してください。' : 'Save code before testing the public endpoint.'}</p>}
      {service === 'qr' && <p className="serviceMuted">{ja ? '転送先を編集しても既存のQRコードはそのまま使えます。' : 'Changing the destination preserves the existing QR code.'}</p>}
      {def.allowDelete && <div className="serviceDanger"><button type="button" className="ghost" disabled={busy} onClick={() => { void remove(); }}>{ja ? 'リソースを完全に削除' : 'Permanently delete resource'}</button></div>}
    </aside></div>}
    {tab === 'activity' && def.activity && <div className="serviceActivity"><div className="sectionHead"><h3>{ja ? 'イベント・実行履歴' : def.activity.title}</h3><button className="ghost" disabled={loading || busy} onClick={() => { void load(); }}>{ja ? '更新' : 'Refresh'}</button></div>
      {activity.length === 0 ? <p className="empty">{ja ? '履歴はありません。' : 'No activity yet.'}</p> : <div className="serviceActivityList">{activity.map((item, i) => <button type="button" key={str(item.id || i)} className={`serviceActivityItem ${selectedEvent?.id === item.id ? 'active' : ''}`} onClick={() => { void inspectEvent(item); }}><span className="serviceActivityDot"/><span><strong>{activityTitle(item)}</strong><small>{activityTime(item)}</small></span><span className="serviceActivityStatus">{str(item.delivery_status || item.response_status || item.sizeBytes || item.size_bytes || '')}</span></button>)}</div>}
      {nextBefore && <button className="ghost" disabled={busy} onClick={() => { void olderEvents(); }}>{ja ? 'さらに読み込む' : 'Load older events'}</button>}
      {selectedEvent && <div className="serviceEventDetail"><div className="sectionHead"><h3>{ja ? 'イベント詳細' : 'Event details'}</h3><button className="ghost" onClick={() => setSelectedEvent(null)}>×</button></div><pre>{JSON.stringify(selectedEvent, null, 2)}</pre>{service === 'hooks' && <div className="serviceReplay"><label className="serviceField"><span>{ja ? '再送先URL' : 'Replay destination URL'}</span><input type="url" value={replayUrl} placeholder="https://example.com/webhook" onChange={event => setReplayUrl(event.target.value)} /></label><button className="secondary" disabled={busy || !safeUrl(replayUrl)} onClick={() => { void replayEvent(); }}>{ja ? '確認して再送' : 'Confirm and replay'}</button></div>}</div>}
    </div>}
    {tab === 'security' && <div className="serviceSecurity"><h3>{ja ? '認証情報' : 'Credentials'}</h3>{service === 'mcp' && <><p className="serviceMuted">{ja ? '保護されたMCPへの接続に使うトークンと環境変数を管理します。' : 'Manage protected MCP tokens and runtime environment secrets.'}</p><button className="secondary" disabled={busy} onClick={() => { void rotateToken(`${base}/token/rotate`); }}>{ja ? 'MCPトークンを再発行' : 'Rotate MCP token'}</button><form className="serviceInnerForm" onSubmit={event => { void saveSecret(event); }}><h3>{ja ? '環境シークレット' : 'Environment secrets'}</h3><label className="serviceField"><span>{ja ? '変数名' : 'Variable name'}</span><input required value={secretName} onChange={event => setSecretName(event.target.value)} placeholder="API_KEY" /></label><label className="serviceField"><span>{ja ? '値（表示しません）' : 'Value (not displayed again)'}</span><input required type="password" autoComplete="new-password" value={secretValue} onChange={event => setSecretValue(event.target.value)} /></label><button type="submit" className="primary" disabled={busy || !secretName || !secretValue}>{ja ? 'シークレットを保存' : 'Save secret'}</button></form><div className="serviceNestedList">{secretNames.map(item => <div className="serviceNestedRow" key={item}><strong>{item}</strong><button type="button" className="ghost" disabled={busy} onClick={() => { void deleteSecret(item); }}>{ja ? '削除' : 'Delete'}</button></div>)}</div></>}
      {service === 'json' && <button className="secondary" disabled={busy} onClick={() => { void rotateToken(`${base}/token/rotate`); }}>{ja ? 'ストアのトークンを再発行' : 'Rotate store token'}</button>}
      {oneTimeToken && <div className="success serviceOutput" role="status"><strong>{ja ? '今回限り表示されるトークン' : 'Token shown once'}</strong><code>{oneTimeToken}</code><button className="ghost" onClick={() => { void copyValue(oneTimeToken); }}>{ja ? 'コピー' : 'Copy token'}</button></div>}
    </div>}
    {response !== null && <div className="serviceEventDetail" role="status"><h3>{ja ? '操作結果' : 'Operation result'}</h3><pre>{JSON.stringify(response, null, 2)}</pre></div>}
  </section>;
}
