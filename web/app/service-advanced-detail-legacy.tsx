'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { GenericServiceSlug } from './service-data';

type Data = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { service: GenericServiceSlug; resource: Data; api: Api; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Field = { key: string; label: string; source?: string; kind?: 'text' | 'url' | 'number' | 'select' | 'json' | 'code' | 'check' };
type Definition = { base: (id: string) => string; fields: Field[]; activity?: { path: (id: string) => string; key: string; title: string }; allowDelete?: boolean };
const f = (key: string, label: string, kind: Field['kind'] = 'text', source?: string): Field => ({ key, label, kind, source });
const DEFINITIONS: Partial<Record<GenericServiceSlug, Definition>> = {
  qr: { base: id => `/api/picosvc/qr/links/${id}`, fields: [f('name', 'Name'), f('targetUrl', 'Destination URL', 'url', 'target_url'), f('enabled', 'Enabled', 'check')], allowDelete: true },
  rss: { base: id => `/api/picosvc/rss/feeds/${id}`, fields: [f('name', 'Feed name'), f('sourceUrl', 'Source URL', 'url', 'source_url'), f('enabled', 'Enabled', 'check'), ...['item', 'title', 'link', 'content', 'date'].map(key => f(`${key}Selector`, `${key} CSS selector (optional)`, 'text', `${key}_selector`))], allowDelete: true },
  mail: { base: id => `/api/picosvc/mail/routes/${id}`, fields: [f('name', 'Route name'), f('webhookUrl', 'Destination webhook', 'url', 'webhook_url'), f('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/mail/routes/${id}/events`, key: 'events', title: 'Delivery history' }, allowDelete: true },
  cron: { base: id => `/api/picosvc/cron/jobs/${id}`, fields: [f('name', 'Job name'), f('cron', 'Cron (UTC)', 'text', 'cron_expression'), f('method', 'HTTP method', 'select'), f('targetUrl', 'Destination URL', 'url', 'target_url'), f('headers', 'Request headers (JSON)', 'json', 'headers_json'), f('body', 'Request body', 'code'), f('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/cron/jobs/${id}/runs`, key: 'runs', title: 'Run history' }, allowDelete: true },
  monitor: { base: id => `/api/picosvc/monitor/${id}`, fields: [f('name', 'Monitor name'), f('targetUrl', 'Page URL', 'url', 'target_url'), f('webhookUrl', 'Webhook (optional)', 'url', 'webhook_url'), f('intervalMinutes', 'Interval in minutes', 'number', 'interval_minutes'), f('enabled', 'Enabled', 'check')], allowDelete: true },
  functions: { base: id => `/api/picosvc/functions/apps/${id}`, fields: [f('name', 'Function name'), f('code', 'JavaScript source', 'code'), f('enabled', 'Enabled', 'check')], allowDelete: true },
  hooks: { base: id => `/api/picosvc/hooks/inboxes/${id}`, fields: [f('name', 'Inbox name'), f('enabled', 'Enabled', 'check')], activity: { path: id => `/api/picosvc/hooks/inboxes/${id}/events?limit=50`, key: 'events', title: 'Received webhooks' }, allowDelete: true },
  mcp: { base: id => `/api/servers/${id}`, fields: [f('visibility', 'Access', 'select'), f('enabled', 'Enabled', 'check')] },
};
const HTTP = new Set(['https:', 'http:']);
function object(value: unknown): Data | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null; }
function text(value: unknown): string { return value == null ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
function initial(resource: Data, fields: Field[]): Record<string, string> {
  return Object.fromEntries(fields.map(field => {
    let value = resource[field.key] ?? resource[field.source || field.key];
    if (field.kind === 'check') value = value === undefined || !(value === false || value === 0 || value === '0');
    if (field.kind === 'json') { try { value = JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value ?? {}, null, 2); } catch { value = '{}'; } }
    return [field.key, text(value)];
  }));
}
function validUrl(url: string): boolean { try { return HTTP.has(new URL(url).protocol); } catch { return false; } }
function err(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }

export default function ServiceAdvancedDetail({ service, resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const ja = locale === 'ja';
  const def = DEFINITIONS[service]; const id = text(resource.id);
  const base = def?.base(encodeURIComponent(id)) || '';
  const [current, setCurrent] = useState<Data>(resource);
  const [values, setValues] = useState<Record<string, string>>(() => initial(resource, def?.fields || []));
  const [tab, setTab] = useState<'settings' | 'activity' | 'security'>('settings');
  const [activity, setActivity] = useState<Data[]>([]);
  const [cursor, setCursor] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Data | null>(null);
  const [replayUrl, setReplayUrl] = useState('');
  const [secretName, setSecretName] = useState(''); const [secretValue, setSecretValue] = useState('');
  const [secretNames, setSecretNames] = useState<string[]>([]); const [oneTimeToken, setOneTimeToken] = useState('');
  const [response, setResponse] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const name = text(current.name || current.repo_url || id);
  const load = useCallback(async () => {
    if (!def || !id) return;
    setLoading(true); setError('');
    try {
      if (service === 'functions' || service === 'hooks') {
        const detail = object((await api(base)).payload);
        if (!detail) throw new Error('Invalid resource detail response.');
        setCurrent(detail); setValues(initial(detail, def.fields));
      }
      if (def.activity) {
        const result = object((await api(def.activity.path(encodeURIComponent(id)))).payload);
        const entries = result?.[def.activity.key];
        if (!Array.isArray(entries)) throw new Error(`Missing ${def.activity.key} in activity response.`);
        setActivity(entries.filter((entry): entry is Data => object(entry) !== null));
        setCursor(text(result?.nextBefore));
      }
      if (service === 'mcp') {
        const result = object((await api(`${base}/secrets`)).payload);
        const names = result?.names;
        if (!Array.isArray(names)) throw new Error('Missing MCP secret names.');
        setSecretNames(names.filter((entry): entry is string => typeof entry === 'string'));
      }
    } catch (reason) { setError(err(reason)); }
    finally { setLoading(false); }
  }, [api, base, def, id, service]);
  useEffect(() => { setCurrent(resource); setValues(initial(resource, def?.fields || [])); setActivity([]); setSelectedEvent(null); setOneTimeToken(''); void load(); }, [resource, def, load]);

  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice(''); setResponse(null);
    try { await operation(); } catch (reason) { setError(err(reason)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!def) return;
    await run(async () => {
      const body: Data = {};
      for (const field of def.fields) {
        const value = values[field.key] || '';
        if (field.kind === 'check') body[field.key] = value === 'true';
        else if (field.kind === 'number') {
          if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${field.label}: invalid number`);
          body[field.key] = Number(value);
        } else if (field.kind === 'json') {
          const parsed: unknown = JSON.parse(value || '{}');
          if (!object(parsed)) throw new Error(`${field.label}: expected a JSON object`);
          body[field.key] = parsed;
        } else if (field.kind === 'url' && !value.trim() && field.key === 'webhookUrl' && service === 'monitor') body[field.key] = null;
        else {
          if (field.kind === 'url' && !validUrl(value)) throw new Error(`${field.label}: valid HTTP(S) URL required`);
          body[field.key] = value;
        }
      }
      const updated = object((await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).payload);
      setCurrent(old => ({ ...old, ...body, ...updated })); setNotice(ja ? '変更を保存しました。' : 'Changes saved.'); onChanged();
    });
  }
  async function remove() {
    if (!def?.allowDelete || !window.confirm(ja ? `「${name}」を完全に削除しますか？元に戻せません。` : `Permanently delete “${name}”? This cannot be undone.`)) return;
    await run(async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  async function post(path: string, label: string) { await run(async () => { setResponse((await api(path, { method: 'POST' })).payload); setNotice(label); onChanged(); }); }
  async function loadOlder() {
    if (!def?.activity || !cursor || busy) return;
    await run(async () => {
      const url = new URL(def.activity!.path(encodeURIComponent(id)), 'https://example.invalid'); url.searchParams.set('before', cursor);
      const result = object((await api(`${url.pathname}${url.search}`)).payload);
      const entries = result?.events;
      if (!Array.isArray(entries)) throw new Error('Missing webhook events.');
      const page: Data[] = entries.filter((entry: unknown): entry is Data => object(entry) !== null);
      setActivity(old => [...old, ...page]); setCursor(text(result?.nextBefore));
    });
  }
  async function inspect(item: Data) {
    if (service !== 'hooks') { setSelectedEvent(item); return; }
    await run(async () => {
      const detail = object((await api(`/api/picosvc/hooks/events/${encodeURIComponent(text(item.id))}`)).payload);
      if (!detail) throw new Error('Could not read webhook event.');
      setSelectedEvent({ ...detail, bodyBase64: undefined }); // Never auto-decode binary bodies or show credentials.
    });
  }
  async function replay() {
    if (!selectedEvent || !validUrl(replayUrl)) { setError('Valid public replay URL required.'); return; }
    if (!window.confirm(ja ? `このイベントを ${replayUrl} に再送しますか？` : `Replay this event to ${replayUrl}?`)) return;
    await run(async () => {
      setResponse((await api(`/api/picosvc/hooks/events/${encodeURIComponent(text(selectedEvent.id))}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: replayUrl }) })).payload);
      setNotice(ja ? '再送結果' : 'Replay result');
    });
  }
  async function rotate() {
    if (!window.confirm(ja ? '現在のトークンを無効にして再発行しますか？' : 'Invalidate and rotate the existing token?')) return;
    await run(async () => {
      const result = object((await api(`${base}/token/rotate`, { method: 'POST' })).payload);
      const token = text(result?.bearerToken);
      if (!token) throw new Error('API did not return a new token.');
      setOneTimeToken(token); setNotice(ja ? '新しいトークンは再表示できません。安全に保存してください。' : 'Save this token securely. It cannot be shown again.');
    });
  }
  async function saveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretName)) throw new Error('Invalid environment variable name.');
      const result = object((await api(`${base}/secrets`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secrets: { [secretName]: secretValue } }) })).payload);
      const names = result?.names;
      setSecretNames(Array.isArray(names) ? names.filter((entry): entry is string => typeof entry === 'string') : []);
      setSecretName(''); setSecretValue(''); setNotice(ja ? 'シークレットを保存しました。ランタイムは再起動されます。' : 'Secret saved. Runtime will restart.');
    });
  }
  async function deleteSecret(secret: string) {
    if (!window.confirm(ja ? `${secret} を削除しますか？` : `Delete ${secret}?`)) return;
    await run(async () => {
      const result = object((await api(`${base}/secrets/${encodeURIComponent(secret)}`, { method: 'DELETE' })).payload);
      const names = result?.names;
      setSecretNames(Array.isArray(names) ? names.filter((entry): entry is string => typeof entry === 'string') : []);
      setNotice(ja ? '削除しました。' : 'Deleted.');
    });
  }
  if (!def) return null;
  return <section className="deployCard serviceDetail serviceAdvanced" aria-label={`${name} advanced management`}>
    <header className="serviceAdvancedHead"><div><span className="kicker">PICOSVC / {service.toUpperCase()}</span><h2>{name}</h2><p>{ja ? '設定・履歴・認証を管理' : 'Manage settings, activity and access'}</p></div><button type="button" className="ghost" onClick={onClose}>{ja ? '閉じる' : 'Close'} ×</button></header>
    <div className="serviceTabs" role="tablist" aria-label="Management sections">
      <button role="tab" type="button" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>{ja ? '設定' : 'Settings'}</button>
      {def.activity && <button role="tab" type="button" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>{ja ? '履歴' : 'Activity'} <span>{activity.length}</span></button>}
      {service === 'mcp' && <button role="tab" type="button" aria-selected={tab === 'security'} className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>{ja ? '認証' : 'Security'}</button>}
    </div>
    {error && <div className="error" role="alert">{error}</div>}{notice && <div className="success" role="status">{notice}</div>}
    {loading && <p className="serviceMuted" role="status">{ja ? '取得中…' : 'Loading details…'}</p>}
    {tab === 'settings' && <div className="serviceAdvancedGrid"><form className="serviceInnerForm serviceEditForm" onSubmit={event => { void save(event); }}><h3>{ja ? 'リソース設定' : 'Resource settings'}</h3>
      {def.fields.map(field => <label className="serviceField" key={field.key}><span>{field.label}</span>{field.kind === 'check' ? <span className="serviceCheck"><input type="checkbox" checked={values[field.key] === 'true'} onChange={event => setValues(old => ({ ...old, [field.key]: String(event.target.checked) }))} />{values[field.key] === 'true' ? ja ? '有効' : 'Active' : ja ? '停止中' : 'Paused'}</span> : field.kind === 'select' ? <select value={values[field.key] || ''} onChange={event => setValues(old => ({ ...old, [field.key]: event.target.value }))}>{(field.key === 'visibility' ? ['token', 'public'] : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).map(choice => <option key={choice}>{choice}</option>)}</select> : field.kind === 'code' || field.kind === 'json' ? <textarea rows={field.kind === 'code' ? 10 : 5} spellCheck={false} value={values[field.key] || ''} onChange={event => setValues(old => ({ ...old, [field.key]: event.target.value }))} /> : <input type={field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : 'text'} value={values[field.key] || ''} onChange={event => setValues(old => ({ ...old, [field.key]: event.target.value }))} />}</label>)}
      <div className="serviceButtons"><button type="submit" className="primary" disabled={busy || loading}>{busy ? '…' : ja ? '変更を保存' : 'Save changes'}</button><button type="button" className="ghost" disabled={busy || loading} onClick={() => setValues(initial(current, def.fields))}>{ja ? '元に戻す' : 'Reset form'}</button></div>
    </form><aside className="serviceAdvancedAside"><h3>{ja ? 'クイック操作' : 'Quick actions'}</h3>
      {service === 'rss' && <><button className="secondary" disabled={busy} onClick={() => { void post(`${base}/preview`, ja ? '抽出プレビューを取得しました。' : 'Extraction preview loaded.'); }}>{ja ? '抽出プレビュー' : 'Preview extraction'}</button><button className="secondary" disabled={busy} onClick={() => { void post(`${base}/refresh`, ja ? 'フィードを更新しました。' : 'Feed refreshed.'); }}>{ja ? '今すぐ更新' : 'Refresh feed now'}</button></>}
      {service === 'mcp' && <button className="secondary" disabled={busy} onClick={() => { if (window.confirm(ja ? 'ビルド枠を消費して再ビルドしますか？' : 'Rebuild? This consumes a build quota.')) void post(`${base}/rebuild`, ja ? '再ビルドを開始しました。' : 'Rebuild queued.'); }}>{ja ? '再ビルド' : 'Rebuild deployment'}</button>}
      {service === 'functions' && <p className="serviceMuted">{ja ? 'コードの変更は保存後に公開URLへ反映されます。' : 'Save code before testing the public endpoint.'}</p>}
      {service === 'qr' && <p className="serviceMuted">{ja ? '転送先を変えても既存QRはそのまま利用できます。' : 'Changing the destination preserves existing QR codes.'}</p>}
      {def.allowDelete && <div className="serviceDanger"><button type="button" className="ghost" disabled={busy} onClick={() => { void remove(); }}>{ja ? '完全に削除' : 'Permanently delete'}</button></div>}
    </aside></div>}
    {tab === 'activity' && def.activity && <div className="serviceActivity"><div className="sectionHead"><h3>{ja ? 'イベント・実行履歴' : def.activity.title}</h3><button className="ghost" disabled={loading || busy} onClick={() => { void load(); }}>{ja ? '更新' : 'Refresh'}</button></div>
      {activity.length === 0 ? <p className="empty">{ja ? '履歴はありません。' : 'No activity yet.'}</p> : <div className="serviceActivityList">{activity.map((item, i) => <button type="button" key={text(item.id || i)} className={`serviceActivityItem ${selectedEvent?.id === item.id ? 'active' : ''}`} onClick={() => { void inspect(item); }}><span className="serviceActivityDot"/><span><strong>{text(item.method || item.subject || item.path || item.response_status || item.id)}</strong><small>{text(item.receivedAt || item.received_at || item.ran_at || item.created_at)}</small></span><span className="serviceActivityStatus">{text(item.delivery_status || item.response_status || item.sizeBytes || item.size_bytes || '')}</span></button>)}</div>}
      {cursor && <button className="ghost" disabled={busy} onClick={() => { void loadOlder(); }}>{ja ? 'さらに読み込む' : 'Load older events'}</button>}
      {selectedEvent && <div className="serviceEventDetail"><div className="sectionHead"><h3>{ja ? 'イベント詳細' : 'Event details'}</h3><button className="ghost" onClick={() => setSelectedEvent(null)}>×</button></div><pre>{JSON.stringify(selectedEvent, null, 2)}</pre>{service === 'hooks' && <div className="serviceReplay"><label className="serviceField"><span>{ja ? '再送先URL' : 'Replay destination URL'}</span><input type="url" value={replayUrl} placeholder="https://example.com/webhook" onChange={event => setReplayUrl(event.target.value)} /></label><button className="secondary" disabled={busy || !validUrl(replayUrl)} onClick={() => { void replay(); }}>{ja ? '確認して再送' : 'Confirm and replay'}</button></div>}</div>}
    </div>}
    {tab === 'security' && service === 'mcp' && <div className="serviceSecurity"><h3>{ja ? '認証情報' : 'Credentials'}</h3><p className="serviceMuted">{ja ? 'MCPトークンと環境変数を管理します。' : 'Manage MCP access tokens and runtime secrets.'}</p><button className="secondary" disabled={busy} onClick={() => { void rotate(); }}>{ja ? 'MCPトークンを再発行' : 'Rotate MCP token'}</button>
      <form className="serviceInnerForm" onSubmit={event => { void saveSecret(event); }}><h3>{ja ? '環境シークレット' : 'Environment secrets'}</h3><label className="serviceField"><span>{ja ? '変数名' : 'Variable name'}</span><input required value={secretName} onChange={event => setSecretName(event.target.value)} placeholder="API_KEY" /></label><label className="serviceField"><span>{ja ? '値（再表示できません）' : 'Value (shown once)'}</span><input required type="password" autoComplete="new-password" value={secretValue} onChange={event => setSecretValue(event.target.value)} /></label><button type="submit" className="primary" disabled={busy || !secretName || !secretValue}>{ja ? '保存' : 'Save secret'}</button></form>
      <div className="serviceNestedList">{secretNames.map(secret => <div className="serviceNestedRow" key={secret}><strong>{secret}</strong><button type="button" className="ghost" disabled={busy} onClick={() => { void deleteSecret(secret); }}>{ja ? '削除' : 'Delete'}</button></div>)}</div>
      {oneTimeToken && <div className="success serviceOutput" role="status"><strong>{ja ? '今回限り表示されるトークン' : 'Token shown once'}</strong><code>{oneTimeToken}</code><button className="ghost" onClick={() => { void copyValue(oneTimeToken); }}>{ja ? 'コピー' : 'Copy token'}</button></div>}
    </div>}
    {response !== null && <div className="serviceEventDetail" role="status"><h3>{ja ? '操作結果' : 'Operation result'}</h3><pre>{JSON.stringify(response, null, 2)}</pre></div>}
  </section>;
}
