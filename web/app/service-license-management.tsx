'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import './service-license-management.css';

type Data = Record<string, unknown>;
type Lang = 'ja' | 'en' | 'zh-CN';
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Filter = 'all' | 'active' | 'expired' | 'revoked';
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const object = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorMessage = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);
const revoked = (key: Data): boolean => key.revoked === true || key.revoked === 1 || key.revoked === '1';
function state(key: Data): Filter {
  if (revoked(key)) return 'revoked';
  const expiry = text(key.expires_at ?? key.expiresAt);
  if (expiry && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) <= Date.now()) return 'expired';
  return 'active';
}
function formattedDate(value: unknown, locale: Lang): string {
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}
const COPY: Record<Lang, Record<string, string>> = {
  ja: { title: 'ライセンスキー管理', intro: '期限・メタデータを指定してキーを発行し、利用状況に応じて失効・再有効化します。', endpoint: '公開検証API', endpointHint: 'POSTで {"key":"発行したキー"} をJSON送信。検証APIは利用枠を消費します。', copy: 'コピー', copied: 'コピーしました', close: '閉じる', issue: '新しいキーを発行', label: '管理用ラベル（任意）', expiry: '有効期限（任意・ローカル日時）', metadata: 'メタデータ（JSONオブジェクト）', metadataHint: '検証成功時に返される情報です。秘密情報を入力しないでください。', submit: 'キーを発行', issued: '新しいキーを発行しました。', oneTime: '発行したキー（今回限り表示）', oneTimeHint: 'この画面を閉じると再表示できません。安全な場所に保管してください。', show: '表示', hide: '隠す', clear: '表示を消去', discard: '現在表示中のキーは再表示できません。表示を消して別のキーを発行しますか？', invalid: '未来の有効期限と正しいJSONオブジェクトを指定してください。', keys: '発行済みキー', refresh: '一覧を更新', search: 'ラベル・キーIDで絞り込む', all: 'すべて', active: '有効', expired: '期限切れ', revoked: '失効済み', empty: '該当するキーはありません。', created: '発行日', expires: '有効期限', details: 'メタデータ', revoke: '失効させる', restore: '再有効化', confirmRevoke: 'このキーを失効させますか？利用中のクライアントは検証に失敗します。', confirmRestore: 'このキーを再有効化しますか？期限切れの場合、有効期限は変更されません。', changed: 'キーの状態を更新しました。', noKey: 'キーの文字列は発行時にしか表示されません。', loading: '処理中…', noEndpoint: '公開検証URLが取得できません。' },
  en: { title: 'License key management', intro: 'Issue keys with expiration and metadata; revoke or restore them as needed.', endpoint: 'Public validation API', endpointHint: 'POST JSON {"key":"your issued key"}. Validation consumes quota.', copy: 'Copy', copied: 'Copied', close: 'Close', issue: 'Issue a new key', label: 'Internal label (optional)', expiry: 'Expiration (optional, local time)', metadata: 'Metadata (JSON object)', metadataHint: 'Returned on successful validation. Do not include secrets.', submit: 'Issue key', issued: 'A new key was issued.', oneTime: 'New license key (shown only now)', oneTimeHint: 'This key cannot be retrieved after leaving this page. Store it securely.', show: 'Reveal', hide: 'Hide', clear: 'Clear key', discard: 'The currently displayed key cannot be retrieved again. Clear it and issue another?', invalid: 'Enter a future expiration and a valid JSON object.', keys: 'Issued keys', refresh: 'Refresh keys', search: 'Filter by label or key ID', all: 'All', active: 'Active', expired: 'Expired', revoked: 'Revoked', empty: 'No matching keys.', created: 'Issued', expires: 'Expires', details: 'Metadata', revoke: 'Revoke', restore: 'Restore', confirmRevoke: 'Revoke this key? Existing clients will fail validation.', confirmRestore: 'Restore this key? An expired key remains expired.', changed: 'Key status updated.', noKey: 'Full key values are available only at issuance.', loading: 'Working…', noEndpoint: 'Validation endpoint unavailable.' },
  'zh-CN': { title: '许可证密钥管理', intro: '发行含有效期与元数据的密钥，并按需撤销或恢复。', endpoint: '公开验证 API', endpointHint: 'POST JSON {"key":"已发行的密钥"}。验证消耗配额。', copy: '复制', copied: '已复制', close: '关闭', issue: '发行新密钥', label: '管理标签（可选）', expiry: '有效期（可选，本地时间）', metadata: '元数据（JSON 对象）', metadataHint: '验证成功后会返回这些信息，请勿填写机密。', submit: '发行密钥', issued: '新密钥已发行。', oneTime: '新密钥（仅此时显示）', oneTimeHint: '离开页面后无法再次获取，请妥善保存。', show: '显示', hide: '隐藏', clear: '清除显示', discard: '当前密钥无法重新获取。清除并发行新密钥？', invalid: '请输入未来的有效期与有效的JSON对象。', keys: '已发行密钥', refresh: '刷新列表', search: '按标签或密钥ID筛选', all: '全部', active: '有效', expired: '已过期', revoked: '已撤销', empty: '没有匹配的密钥。', created: '发行日期', expires: '有效期', details: '元数据', revoke: '撤销', restore: '恢复', confirmRevoke: '撤销密钥？现有客户端将无法验证。', confirmRestore: '恢复密钥？已过期的密钥仍保持过期。', changed: '密钥状态已更新。', noKey: '完整密钥仅在发行时显示。', loading: '处理中…', noEndpoint: '无法获取验证地址。' },
};

export default function LicenseManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/license/projects/${encodeURIComponent(id)}`;
  const [keys, setKeys] = useState<Data[]>([]);
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [metadata, setMetadata] = useState('{}');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oneTimeKey, setOneTimeKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const publicId = text(resource.publicId ?? resource.public_id);
  let validationUrl = '';
  try { if (/^[0-9a-f]{32}$/i.test(publicId)) validationUrl = `${new URL(API_ORIGIN).origin}/license/${publicId}/validate`; } catch { /* Worker URL is not configured. */ }

  const reload = useCallback(async () => {
    const result = object((await api(`${base}/keys`)).payload);
    if (!result || !Array.isArray(result.keys)) throw new Error('Invalid license key list response.');
    setKeys(result.keys.filter((entry): entry is Data => object(entry) !== null));
  }, [api, base]);
  useEffect(() => {
    let mounted = true;
    void reload().catch(reason => { if (mounted) setError(errorMessage(reason)); }).finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, [reload]);
  async function refresh() {
    if (busy) return;
    setBusy('refresh'); setError('');
    try { await reload(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (oneTimeKey && !window.confirm(t.discard)) return;
    let parsed: unknown;
    try { parsed = JSON.parse(metadata); } catch { setError(t.invalid); return; }
    if (!object(parsed) || new TextEncoder().encode(metadata).byteLength > 16 * 1024) { setError(t.invalid); return; }
    const expiresAt = expires ? new Date(expires).toISOString() : null;
    if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) { setError(t.invalid); return; }
    setBusy('issue'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: label.trim(), expiresAt, metadata: parsed }) })).payload);
      if (!result || typeof result.licenseKey !== 'string' || !result.licenseKey) throw new Error('The API did not return the one-time license key.');
      setOneTimeKey(result.licenseKey); setRevealed(false); setCopied(false); setNotice(t.issued);
      setLabel(''); setExpires(''); setMetadata('{}');
      try { await reload(); } catch (reason) { setError(errorMessage(reason)); }
      onChanged();
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function changeRevocation(key: Data, next: boolean) {
    if (busy || !window.confirm(next ? t.confirmRevoke : t.confirmRestore)) return;
    const keyId = text(key.id);
    if (!/^[0-9a-f-]{36}$/i.test(keyId)) { setError('Invalid license key identifier.'); return; }
    setBusy(keyId); setError(''); setNotice('');
    try {
      const result = object((await api(`/api/picosvc/license/keys/${encodeURIComponent(keyId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked: next }) })).payload);
      if (!result || result.revoked !== next) throw new Error('Invalid license status response.');
      setKeys(previous => previous.map(row => text(row.id) === keyId ? { ...row, revoked: next } : row));
      setNotice(t.changed); onChanged();
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  const matches = keys.filter(key => {
    if (filter !== 'all' && state(key) !== filter) return false;
    const q = search.trim().toLocaleLowerCase();
    return !q || [key.id, key.label].some(value => text(value).toLocaleLowerCase().includes(q));
  });
  const counts: Record<Filter, number> = { all: keys.length, active: keys.filter(key => state(key) === 'active').length, expired: keys.filter(key => state(key) === 'expired').length, revoked: keys.filter(key => state(key) === 'revoked').length };
  return <section className="licenseConsole" aria-label={t.title}>
    <header className="licenseConsoleHead"><div><span>PICOSVC / LICENSE</span><h2>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="licenseConsoleError" role="alert">{error}</p>}{notice && <p className="licenseConsoleSuccess" role="status">{notice}</p>}
    <section className="licenseConsoleEndpoint"><div><h3>{t.endpoint}</h3>{validationUrl ? <code>{validationUrl}</code> : <p>{t.noEndpoint}</p>}<small>{t.endpointHint}</small></div>{validationUrl && <button type="button" onClick={() => { void copyValue(validationUrl); }}>{t.copy}</button>}</section>
    <div className="licenseConsoleGrid"><div className="licenseConsoleSide">
      <form className="licenseConsoleCard licenseConsoleForm" onSubmit={event => { void issue(event); }}><h3>{t.issue}</h3><fieldset disabled={Boolean(busy)}>
        <label>{t.label}<input maxLength={120} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <label>{t.expiry}<input type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></label>
        <label>{t.metadata}<textarea rows={5} spellCheck={false} value={metadata} onChange={event => setMetadata(event.target.value)} /><small>{t.metadataHint}</small></label>
        <button type="submit">{busy === 'issue' ? t.loading : t.submit}</button>
      </fieldset></form>
      {oneTimeKey && <section className="licenseConsoleCard licenseConsoleSecret" aria-label={t.oneTime}><h3>{t.oneTime}</h3><code>{revealed ? oneTimeKey : '••••••••••••••••••••'}</code><p>{t.oneTimeHint}</p><div className="licenseConsoleActions"><button type="button" onClick={() => setRevealed(previous => !previous)}>{revealed ? t.hide : t.show}</button><button type="button" onClick={() => { void copyValue(oneTimeKey).then(() => setCopied(true)); }}>{copied ? t.copied : t.copy}</button><button type="button" onClick={() => { setOneTimeKey(''); setRevealed(false); setCopied(false); }}>{t.clear}</button></div></section>}
    </div><section className="licenseConsoleCard licenseConsoleInventory"><div className="licenseConsoleSectionHead"><h3>{t.keys} <small>{keys.length}</small></h3><button type="button" disabled={Boolean(busy)} onClick={() => { void refresh(); }}>{busy === 'refresh' ? t.loading : t.refresh}</button></div>
      <p className="licenseConsoleHint">{t.noKey}</p><label className="licenseConsoleSearch"><span className="srOnly">{t.search}</span><input type="search" placeholder={t.search} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="licenseConsoleFilters" role="group" aria-label={t.keys}>{(['all', 'active', 'expired', 'revoked'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t[value]} <small>{counts[value]}</small></button>)}</div>
      {!loaded ? <p role="status">{t.loading}</p> : matches.length === 0 ? <p className="licenseConsoleHint">{t.empty}</p> : <div className="licenseConsoleList">{matches.map(key => { const status = state(key); const metadataValue = key.metadata ?? key.metadata_json; const extra = typeof metadataValue === 'string' ? metadataValue : JSON.stringify(metadataValue ?? {}, null, 2); return <article key={text(key.id)} className="licenseConsoleKey"><header><strong>{text(key.label) || text(key.id)}</strong><span className={`licenseConsoleStatus licenseConsoleStatus-${status}`}>{t[status]}</span></header><code>{text(key.id)}</code><dl><dt>{t.created}</dt><dd>{formattedDate(key.created_at ?? key.createdAt, locale)}</dd><dt>{t.expires}</dt><dd>{formattedDate(key.expires_at ?? key.expiresAt, locale)}</dd></dl><details><summary>{t.details}</summary><pre>{extra}</pre></details><div className="licenseConsoleActions"><button type="button" disabled={Boolean(busy)} onClick={() => { void changeRevocation(key, !revoked(key)); }}>{revoked(key) ? t.restore : t.revoke}</button></div></article>; })}</div>}
    </section></div>
  </section>;
}
