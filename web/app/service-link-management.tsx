'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import './service-link-management.css';

type Data = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { resource: Data; api: Api; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Lang = 'en' | 'ja' | 'zh-CN';
const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const obj = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (value: unknown): string => value instanceof Error ? value.message : String(value);
const active = (value: unknown): boolean => value !== false && value !== 0 && value !== '0';
const pick = (data: Data, camel: string, snake: string): string => text(data[camel] ?? data[snake]);
function safeWeb(value: string): string | null {
  try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
function origin(): string | null { try { const url = new URL(API); return safeWeb(API) ? url.origin : null; } catch { return null; } }
function when(value: unknown, lang: Lang): string {
  const date = new Date(text(value));
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : lang === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function requestBody(body: Data): RequestInit { return { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }
function publicId(resource: Data): string | null {
  const id = pick(resource, 'publicId', 'public_id');
  return /^[a-f0-9]{32}$/i.test(id) ? id.toLowerCase() : null;
}

const QR: Record<Lang, Record<string, string>> = {
  ja: { title: 'QRコードと転送先', subtitle: 'QRを変えずにリンク先を更新', code: '公開QRコード', paused: 'このQRは停止中です。再開すると画像と転送が利用できます。', unavailable: '公開QRの識別子が見つかりません。', openSvg: 'SVG画像を開く', svgUrl: 'SVGのURLをコピー', link: '短縮リンク', copy: 'コピー', copied: 'コピーしました', scans: '累積スキャン数', note: 'スキャン数は実際に転送が行われた回数です。画像の表示では増えません。', settings: '転送先の編集', name: 'QRコード名', target: '転送先URL', enabled: '転送を有効にする', current: '現在の転送先', save: '変更を保存', saved: '転送設定を更新しました。', unsaved: '新しい転送先は保存後に有効になります。', invalid: '公開HTTP(S)の転送先URLを指定してください。', delete: 'QRコードを完全に削除', confirm: 'このQRコードを削除しますか？印刷済みのQRも使えなくなります。', close: '閉じる', loading: '処理中…', refresh: 'スキャン数を更新', warning: '停止または削除すると印刷済みのQRからもアクセスできなくなります。' },
  en: { title: 'QR code and destination', subtitle: 'Change the destination without reprinting', code: 'Public QR code', paused: 'This QR is paused. Enable it to restore its image and redirect.', unavailable: 'Public QR identifier is unavailable.', openSvg: 'Open SVG image', svgUrl: 'Copy SVG URL', link: 'Short redirect link', copy: 'Copy', copied: 'Copied', scans: 'Total scans', note: 'Scans count actual redirects, not image views.', settings: 'Edit destination', name: 'QR name', target: 'Destination URL', enabled: 'Enable redirects', current: 'Current destination', save: 'Save changes', saved: 'Redirect settings updated.', unsaved: 'The new destination takes effect only after saving.', invalid: 'Enter a valid public HTTP(S) destination.', delete: 'Permanently delete QR', confirm: 'Delete this QR? Printed copies will stop working.', close: 'Close', loading: 'Working…', refresh: 'Refresh scan count', warning: 'Pausing or deleting this QR also affects already printed copies.' },
  'zh-CN': { title: '二维码与跳转目标', subtitle: '无需重新打印即可更改目标', code: '公开二维码', paused: '二维码已暂停。启用后恢复图片与跳转。', unavailable: '未找到公开二维码标识。', openSvg: '打开 SVG 图片', svgUrl: '复制 SVG 地址', link: '短链接', copy: '复制', copied: '已复制', scans: '累计扫码次数', note: '仅实际跳转计入扫码次数，查看图片不计入。', settings: '修改跳转目标', name: '二维码名称', target: '目标 URL', enabled: '启用跳转', current: '当前跳转目标', save: '保存修改', saved: '跳转设置已更新。', unsaved: '新目标保存后才会生效。', invalid: '请输入有效的公开 HTTP(S) 目标。', delete: '永久删除二维码', confirm: '删除二维码？已打印的二维码将无法使用。', close: '关闭', loading: '处理中…', refresh: '刷新扫码次数', warning: '暂停或删除也会影响已打印的二维码。' },
};

export function QrManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = QR[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/qr/links/${encodeURIComponent(id)}`;
  const [current, setCurrent] = useState<Data>(resource);
  const [name, setName] = useState(text(resource.name));
  const [target, setTarget] = useState(pick(resource, 'targetUrl', 'target_url'));
  const [enabled, setEnabled] = useState(active(resource.enabled));
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState('');
  const idPublic = publicId(current);
  const root = origin();
  const redirectUrl = idPublic && root ? `${root}/q/${idPublic}` : null;
  const svgUrl = redirectUrl ? `${redirectUrl}.svg` : null;
  const currentTarget = safeWeb(pick(current, 'targetUrl', 'target_url'));
  const isEnabled = active(current.enabled);
  const scans = Number(current.scans);
  async function run(action: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(action); setError(''); setNotice('');
    try { await work(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function copy(key: string, value: string) {
    try { await copyValue(value); setCopied(key); } catch (reason) { setError(errorText(reason)); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('save', async () => {
      if (!safeWeb(target)) throw new Error(t.invalid);
      const result = obj((await api(base, requestBody({ name, targetUrl: target, enabled }))).payload);
      if (!result) throw new Error('Invalid QR update response.');
      setCurrent(previous => ({ ...previous, ...result }));
      setTarget(pick(result, 'targetUrl', 'target_url') || target);
      setName(text(result.name ?? name));
      setEnabled(active(result.enabled));
      setNotice(t.saved); onChanged();
    });
  }
  async function refreshScans() {
    await run('refresh', async () => {
      const result = obj((await api('/api/picosvc/qr/links')).payload);
      if (!result || !Array.isArray(result.links)) throw new Error('Invalid QR list response.');
      const latest = result.links.find((entry: unknown) => { const record = obj(entry); return record !== null && text(record.id) === id; });
      if (!obj(latest)) throw new Error('QR code not found in your account.');
      setCurrent(previous => ({ ...previous, ...obj(latest) }));
    });
  }
  async function remove() {
    if (!window.confirm(t.confirm)) return;
    await run('delete', async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  const changed = name !== text(current.name) || target !== pick(current, 'targetUrl', 'target_url') || enabled !== isEnabled;
  return <section className="linkManager qrManager" aria-label={t.title}>
    <header className="linkManagerHeading"><div><span className="linkManagerEyebrow">PICOSVC / QR</span><h2>{t.title}</h2><p>{t.subtitle}</p></div><button className="linkManagerGhost" type="button" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="linkManagerError" role="alert">{error}</p>}{notice && <p className="linkManagerSuccess" role="status">{notice}</p>}
    <div className="qrManagerLayout"><section className="linkManagerPanel qrManagerPreview"><h3>{t.code}</h3>
      {svgUrl && isEnabled ? <img className="qrManagerImage" src={svgUrl} alt={text(current.name) || t.code} /> : <p className="linkManagerEmpty">{!idPublic || !root ? t.unavailable : t.paused}</p>}
      {svgUrl && isEnabled && <div className="linkManagerActions"><a href={svgUrl} target="_blank" rel="noopener noreferrer">{t.openSvg} ↗</a><button type="button" className="linkManagerGhost" onClick={() => { void copy('svg', svgUrl); }}>{copied === 'svg' ? t.copied : t.svgUrl}</button></div>}
      <div className="qrManagerStat"><span>{t.scans}</span><strong>{Number.isFinite(scans) ? new Intl.NumberFormat(locale).format(scans) : '—'}</strong><small>{t.note}</small><button type="button" className="linkManagerGhost" disabled={Boolean(busy)} onClick={() => { void refreshScans(); }}>{busy === 'refresh' ? t.loading : t.refresh}</button></div>
      {redirectUrl && <div className="linkManagerAddress"><span>{t.link}</span><code>{redirectUrl}</code><button type="button" className="linkManagerGhost" onClick={() => { void copy('redirect', redirectUrl); }}>{copied === 'redirect' ? t.copied : t.copy}</button></div>}
      <p className="linkManagerHint">{t.warning}</p>
    </section><form className="linkManagerPanel linkManagerForm" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3>
      <label>{t.name}<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>{t.target}<input required type="url" value={target} onChange={event => setTarget(event.target.value)} /></label>
      <p className="linkManagerHint">{t.unsaved}</p>
      {currentTarget && <div className="linkManagerAddress"><span>{t.current}</span><a href={currentTarget} target="_blank" rel="noopener noreferrer">{currentTarget} ↗</a><button type="button" className="linkManagerGhost" onClick={() => { void copy('target', currentTarget); }}>{copied === 'target' ? t.copied : t.copy}</button></div>}
      <label className="linkManagerToggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t.enabled}</label>
      <div className="linkManagerActions"><button className="linkManagerPrimary" type="submit" disabled={Boolean(busy) || !changed}>{busy === 'save' ? t.loading : t.save}</button><button className="linkManagerDanger" type="button" disabled={Boolean(busy)} onClick={() => { void remove(); }}>{t.delete}</button></div>
    </form></div>
  </section>;
}

const MAIL: Record<Lang, Record<string, string>> = {
  ja: { title: '受信ルートと配信履歴', subtitle: '受信アドレス・転送先・配信状況を管理', address: '受信アドレス', addressHint: 'このアドレス宛のメールを登録済みWebhookへ転送します。', webhook: '転送先Webhook', settings: '転送設定', name: 'ルート名', enabled: 'メール転送を有効にする', save: '設定を保存', saved: '転送設定を更新しました。', copy: 'コピー', copied: 'コピーしました', open: '転送先を開く', invalid: '公開HTTP(S)のWebhook URLを指定してください。', delete: 'ルートを削除', confirm: 'この受信ルートと配信履歴を完全に削除しますか？', history: '配信履歴', refresh: '履歴を更新', recent: '直近最大200件', all: 'すべて', delivered: '配信済み', failed: '失敗', quota_reached: '利用枠超過', other: 'その他', search: '送信元・件名で絞り込む', from: '送信元', to: '宛先', subject: '件名', received: '受信日時', size: 'メールサイズ', reason: 'エラー詳細', empty: '表示できる受信履歴はありません。', none: '条件に一致するメールはありません。', loading: '読み込み中…', close: '閉じる', privacy: 'ここではメール本文や添付ファイルは保存・表示しません。配信履歴は受信情報と転送結果のみです。' },
  en: { title: 'Mail route and delivery history', subtitle: 'Manage your inbound address, destination and deliveries', address: 'Inbound email address', addressHint: 'Mail sent to this address is forwarded to your configured webhook.', webhook: 'Destination webhook', settings: 'Forwarding settings', name: 'Route name', enabled: 'Enable mail forwarding', save: 'Save settings', saved: 'Forwarding settings updated.', copy: 'Copy', copied: 'Copied', open: 'Open webhook URL', invalid: 'Enter a valid public HTTP(S) webhook URL.', delete: 'Delete route', confirm: 'Permanently delete this inbound route and delivery history?', history: 'Delivery history', refresh: 'Refresh deliveries', recent: 'Up to 200 recent events', all: 'All', delivered: 'Delivered', failed: 'Failed', quota_reached: 'Quota reached', other: 'Other', search: 'Filter by sender or subject', from: 'From', to: 'To', subject: 'Subject', received: 'Received', size: 'Message size', reason: 'Delivery error', empty: 'No mail delivery history yet.', none: 'No mail matches these filters.', loading: 'Loading…', close: 'Close', privacy: 'Email bodies and attachments are not stored or displayed here. Only delivery metadata is available.' },
  'zh-CN': { title: '收件路由和投递记录', subtitle: '管理收件地址、转发目标和投递状态', address: '收件邮箱地址', addressHint: '发送至此地址的邮件会转发至设置的 Webhook。', webhook: '转发 Webhook', settings: '转发设置', name: '路由名称', enabled: '启用邮件转发', save: '保存设置', saved: '转发设置已更新。', copy: '复制', copied: '已复制', open: '打开 Webhook URL', invalid: '请输入有效的公开 HTTP(S) Webhook URL。', delete: '删除路由', confirm: '永久删除此收件路由及投递记录？', history: '投递记录', refresh: '刷新记录', recent: '最近最多 200 条', all: '全部', delivered: '投递成功', failed: '失败', quota_reached: '超出配额', other: '其他', search: '按发件人或主题筛选', from: '发件人', to: '收件人', subject: '主题', received: '接收时间', size: '邮件大小', reason: '投递错误', empty: '尚无邮件投递记录。', none: '没有符合筛选条件的邮件。', loading: '加载中…', close: '关闭', privacy: '这里不保存或显示邮件正文与附件，仅提供收件信息和转发结果。' },
};

type MailFilter = 'all' | 'delivered' | 'failed' | 'quota_reached';
export function MailManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = MAIL[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/mail/routes/${encodeURIComponent(id)}`;
  const [name, setName] = useState(text(resource.name));
  const [webhook, setWebhook] = useState(pick(resource, 'webhookUrl', 'webhook_url'));
  const [enabled, setEnabled] = useState(active(resource.enabled));
  const [current, setCurrent] = useState<Data>(resource);
  const [events, setEvents] = useState<Data[]>([]);
  const [filter, setFilter] = useState<MailFilter>('all'); const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false); const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState('');
  const address = text(current.address) || (publicId(current) ? `${publicId(current)}@picosvc.com` : '');
  const validAddress = /^[a-f0-9]{32}@picosvc\.com$/i.test(address);
  const currentWebhook = safeWeb(pick(current, 'webhookUrl', 'webhook_url'));
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = obj((await api(`${base}/events`)).payload);
      if (!result || !Array.isArray(result.events)) throw new Error('Invalid mail delivery response.');
      setEvents(result.events.filter((entry): entry is Data => obj(entry) !== null));
    } catch (reason) { setError(errorText(reason)); }
    finally { setLoaded(true); setLoading(false); }
  }, [api, base]);
  useEffect(() => { void reload(); }, [reload]);
  async function run(action: string, work: () => Promise<void>) {
    if (busy) return; setBusy(action); setError(''); setNotice('');
    try { await work(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function copy(key: string, value: string) {
    try { await copyValue(value); setCopied(key); } catch (reason) { setError(errorText(reason)); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('save', async () => {
      if (!safeWeb(webhook)) throw new Error(t.invalid);
      const result = obj((await api(base, requestBody({ name, webhookUrl: webhook, enabled }))).payload);
      if (!result) throw new Error('Invalid mail route update response.');
      setCurrent(previous => ({ ...previous, ...result }));
      setName(text(result.name ?? name)); setWebhook(pick(result, 'webhookUrl', 'webhook_url') || webhook); setEnabled(active(result.enabled));
      setNotice(t.saved); onChanged();
    });
  }
  async function remove() {
    if (!window.confirm(t.confirm)) return;
    await run('delete', async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  const visible = events.filter(event => {
    const status = text(event.delivery_status ?? event.deliveryStatus);
    const matchesStatus = filter === 'all' || status === filter;
    const needle = query.trim().toLocaleLowerCase();
    return matchesStatus && (!needle || [event.from_address, event.to_address, event.subject].some(value => text(value).toLocaleLowerCase().includes(needle)));
  });
  const counts = { all: events.length, delivered: events.filter(event => event.delivery_status === 'delivered').length, failed: events.filter(event => event.delivery_status === 'failed').length, quota_reached: events.filter(event => event.delivery_status === 'quota_reached').length };
  const changed = name !== text(current.name) || webhook !== pick(current, 'webhookUrl', 'webhook_url') || enabled !== active(current.enabled);
  return <section className="linkManager mailManager" aria-label={t.title}>
    <header className="linkManagerHeading"><div><span className="linkManagerEyebrow">PICOSVC / MAIL</span><h2>{t.title}</h2><p>{t.subtitle}</p></div><button className="linkManagerGhost" type="button" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="linkManagerError" role="alert">{error}</p>}{notice && <p className="linkManagerSuccess" role="status">{notice}</p>}
    <section className="mailManagerAddress linkManagerPanel"><span>{t.address}</span>{validAddress ? <><code>{address}</code><div className="linkManagerActions"><button type="button" className="linkManagerPrimary" onClick={() => { void copy('address', address); }}>{copied === 'address' ? t.copied : t.copy}</button><a href={`mailto:${address}`}>{t.address} ↗</a></div></> : <strong>—</strong>}<p className="linkManagerHint">{t.addressHint}</p></section>
    <div className="mailManagerLayout"><form className="linkManagerPanel linkManagerForm" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3>
      <label>{t.name}<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>{t.webhook}<input required type="url" value={webhook} onChange={event => setWebhook(event.target.value)} /></label>
      {currentWebhook && <div className="linkManagerAddress"><span>{t.webhook}</span><a href={currentWebhook} target="_blank" rel="noopener noreferrer">{currentWebhook} ↗</a><button type="button" className="linkManagerGhost" onClick={() => { void copy('webhook', currentWebhook); }}>{copied === 'webhook' ? t.copied : t.copy}</button></div>}
      <label className="linkManagerToggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t.enabled}</label>
      <div className="linkManagerActions"><button className="linkManagerPrimary" type="submit" disabled={Boolean(busy) || !changed}>{busy === 'save' ? t.loading : t.save}</button><button className="linkManagerDanger" type="button" disabled={Boolean(busy)} onClick={() => { void remove(); }}>{t.delete}</button></div>
    </form><section className="linkManagerPanel mailManagerHistory"><div className="mailManagerHistoryHeading"><div><h3>{t.history}</h3><p>{t.recent} · {events.length}</p></div><button type="button" className="linkManagerGhost" disabled={loading || Boolean(busy)} onClick={() => { void reload(); }}>{loading ? t.loading : t.refresh}</button></div>
      <label className="mailManagerSearch"><span className="srOnly">{t.search}</span><input type="search" placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="mailManagerFilters" role="group" aria-label={t.history}>{(['all', 'delivered', 'failed', 'quota_reached'] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t[key]} <span>{counts[key]}</span></button>)}</div>
      {!loaded ? <p className="linkManagerEmpty" role="status">{t.loading}</p> : !events.length ? <p className="linkManagerEmpty">{t.empty}</p> : !visible.length ? <p className="linkManagerEmpty">{t.none}</p> : <div className="mailManagerEvents">{visible.map((entry, index) => { const status = text(entry.delivery_status ?? entry.deliveryStatus); const from = text(entry.from_address ?? entry.fromAddress); const subject = text(entry.subject); const rawSize = Number(entry.raw_size ?? entry.rawSize); return <details className="mailManagerEvent" key={text(entry.id || index)}><summary><span className={`mailManagerStatus mailManagerStatus-${['delivered', 'failed', 'quota_reached'].includes(status) ? status : 'other'}`}>{t[status] || t.other}</span><span className="mailManagerEventInfo"><strong>{subject || '—'}</strong><small>{from || '—'} · {when(entry.received_at ?? entry.receivedAt, locale)}</small></span><span aria-hidden="true">⌄</span></summary><dl><div><dt>{t.from}</dt><dd>{from || '—'}</dd></div><div><dt>{t.to}</dt><dd>{text(entry.to_address ?? entry.toAddress) || '—'}</dd></div><div><dt>{t.received}</dt><dd>{when(entry.received_at ?? entry.receivedAt, locale)}</dd></div><div><dt>{t.size}</dt><dd>{Number.isFinite(rawSize) ? `${new Intl.NumberFormat(locale).format(rawSize)} bytes` : '—'}</dd></div>{Boolean(entry.error) && <div><dt>{t.reason}</dt><dd>{text(entry.error)}</dd></div>}</dl></details>; })}</div>}
      <p className="linkManagerHint">{t.privacy}</p>
    </section></div>
  </section>;
}
