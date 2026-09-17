'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from './i18n';
import type { ManagementProps } from './service-management-detail';
import './service-mail-operations.css';

type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const str = (value: unknown): string => value == null ? '' : String(value);
const errorMessage = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);
const bytes = (value: unknown, locale: string): string => Number.isFinite(Number(value)) ? `${new Intl.NumberFormat(locale).format(Number(value))} bytes` : '—';
const date = (value: unknown, locale: string): string => {
  const parsed = new Date(str(value));
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : '—';
};
const COPY = {
  ja: { title: '配信の詳細と署名', intro: '保存済みメールの抜粋・添付ファイル・Webhook配信を確認します。閲覧にはログインが必要です。', events: 'メールを選択', select: '詳細を表示するメール', empty: '配信履歴はありません。', details: 'メールの詳細', from: '送信元', to: '宛先', subject: '件名', received: '受信', status: '配信状態', attempts: '配信試行', retryAt: '次の自動再試行', response: 'Webhook応答', error: '配信エラー', text: 'テキスト抜粋', html: 'HTMLの抜粋（安全のためソース表示）', previewNote: '本文は先頭最大2,000文字の抜粋です。HTMLは実行せずテキストとして表示します。', attachments: '添付ファイル', download: '添付ファイルを取得', retry: '配信を再試行', retryConfirm: 'Webhookに同じメールが再送される可能性があります。再試行しますか？', retried: '再試行を要求しました。最新状態を取得してください。', retryNote: '未配信のメールのみ再試行できます。試行回数の上限は4回です。', signing: 'Webhook署名キー', signingHelp: '受信側はタイムスタンプと受信したJSON本文の正確なバイト列からHMAC-SHA256を検証してください。', rotate: '署名キーを発行・更新', rotateConfirm: '既存の署名キーは直ちに無効になります。受信側の検証設定も更新しますか？', secret: '今回発行したキー（再表示不可）', store: 'このキーを安全な場所に保存してください。閉じると再取得できません。', copy: 'キーをコピー', reveal: '表示', hide: '隠す', clear: '画面から消す', refresh: '一覧を更新', loading: '読み込み中…', working: '処理中…', noPreview: '保存済みの抜粋はありません。', failed: '詳細の取得に失敗しました。' },
  en: { title: 'Delivery details and signing', intro: 'Inspect stored message previews, attachments and webhook delivery. Sign-in is required.', events: 'Select an email', select: 'Email for detail view', empty: 'No delivery events yet.', details: 'Message details', from: 'From', to: 'To', subject: 'Subject', received: 'Received', status: 'Delivery status', attempts: 'Delivery attempts', retryAt: 'Next automatic retry', response: 'Webhook response', error: 'Delivery error', text: 'Text preview', html: 'HTML preview (source only for safety)', previewNote: 'Body previews are limited to the first 2,000 characters. HTML is displayed as text, never executed.', attachments: 'Attachments', download: 'Download attachment', retry: 'Retry delivery', retryConfirm: 'Your webhook may receive a duplicate message. Retry delivery?', retried: 'Retry requested. Refresh to inspect the latest state.', retryNote: 'Only undelivered mail is retryable; the maximum is four attempts.', signing: 'Webhook signing secret', signingHelp: 'Verify HMAC-SHA256 over the timestamp and exact received JSON body bytes on your webhook.', rotate: 'Generate / rotate signing key', rotateConfirm: 'The existing signing key will immediately stop working. Update your webhook verification configuration?', secret: 'New secret (shown once)', store: 'Store this secret securely. It cannot be retrieved after leaving this view.', copy: 'Copy secret', reveal: 'Reveal', hide: 'Hide', clear: 'Clear from screen', refresh: 'Refresh list', loading: 'Loading…', working: 'Working…', noPreview: 'No stored preview.', failed: 'Could not load event details.' },
  'zh-CN': { title: '投递详情与签名', intro: '查看保存的邮件预览、附件及 Webhook 投递情况。需要登录。', events: '选择邮件', select: '选择查看详情的邮件', empty: '暂无投递记录。', details: '邮件详情', from: '发件人', to: '收件人', subject: '主题', received: '接收时间', status: '投递状态', attempts: '投递次数', retryAt: '下次自动重试', response: 'Webhook 响应', error: '投递错误', text: '纯文本预览', html: 'HTML 预览（仅显示源码）', previewNote: '正文预览最多 2,000 字符。HTML 只作为文本显示，不执行。', attachments: '附件', download: '下载附件', retry: '重试投递', retryConfirm: 'Webhook 可能收到重复消息，确定重试投递吗？', retried: '已请求重试。刷新后可查看最新状态。', retryNote: '仅未投递成功的邮件可重试，最多尝试四次。', signing: 'Webhook 签名密钥', signingHelp: '在 Webhook 端对时间戳与收到的原始 JSON 正文字节进行 HMAC-SHA256 验证。', rotate: '生成／轮换签名密钥', rotateConfirm: '旧密钥将立即失效。确认同时更新接收端验证配置？', secret: '新密钥（仅显示一次）', store: '请安全保存此密钥。离开后无法再次获取。', copy: '复制密钥', reveal: '显示', hide: '隐藏', clear: '从屏幕清除', refresh: '刷新列表', loading: '加载中…', working: '处理中…', noPreview: '没有保存的预览。', failed: '无法获取邮件详情。' },
} as const;

export function MailOperations({ resource, api, copyValue }: ManagementProps) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = str(resource.id);
  const base = `/api/picosvc/mail/routes/${encodeURIComponent(id)}`;
  const [events, setEvents] = useState<Row[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = object((await api(`${base}/events`)).payload);
      if (!response || !Array.isArray(response.events)) throw new Error('Invalid mail events response.');
      const next = response.events.filter((item): item is Row => object(item) !== null);
      setEvents(next);
      setSelected(previous => next.some(item => str(item.id) === previous) ? previous : '');
      setError('');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const loadDetail = useCallback(async (eventId: string) => {
    if (!eventId) { setDetail(null); setAttachments([]); return; }
    setDetailLoading(true); setDetail(null); setAttachments([]);
    try {
      const response = object((await api(`/api/picosvc/mail/events/${encodeURIComponent(eventId)}`)).payload);
      if (!response || !object(response.event) || !Array.isArray(response.attachments)) throw new Error('Invalid mail event detail response.');
      setDetail(object(response.event));
      setAttachments(response.attachments.filter((item): item is Row => object(item) !== null));
      setError('');
    } catch (reason) { setError(`${t.failed} ${errorMessage(reason)}`); }
    finally { setDetailLoading(false); }
  }, [api, t.failed]);
  useEffect(() => { void loadDetail(selected); }, [loadDetail, selected]);

  async function run(action: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(action); setError(''); setNotice('');
    try { await work(); } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function rotate() {
    if (!window.confirm(t.rotateConfirm)) return;
    await run('rotate', async () => {
      setSecret(''); setRevealed(false); setCopied(false);
      const response = object((await api(`${base}/signing-key`, { method: 'POST' })).payload);
      if (!response || typeof response.signingSecret !== 'string' || !response.signingSecret) throw new Error('Invalid signing key response.');
      setSecret(response.signingSecret);
    });
  }
  async function retry() {
    if (!detail || !window.confirm(t.retryConfirm)) return;
    const eventId = str(detail.id);
    await run('retry', async () => {
      const result = object((await api(`/api/picosvc/mail/events/${encodeURIComponent(eventId)}/retry`, { method: 'POST' })).payload);
      if (!result || result.retryRequested !== true) throw new Error('Invalid retry response.');
      setNotice(t.retried);
      await loadEvents();
      await loadDetail(eventId);
    });
  }
  async function download(item: Row) {
    const attachmentId = str(item.id);
    if (!detail || !/^[a-f0-9-]{36}$/i.test(attachmentId)) return;
    await run(`download:${attachmentId}`, async () => {
      const response = await api(`/api/picosvc/mail/events/${encodeURIComponent(str(detail.id))}/attachments/${encodeURIComponent(attachmentId)}`);
      if (!response.blob) throw new Error('Attachment download did not return a file.');
      const downloadUrl = URL.createObjectURL(response.blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = str(item.filename).replace(/[\\/\r\n]/g, '_') || 'attachment';
      document.body.appendChild(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000); }
    });
  }
  const status = str(detail?.deliveryStatus);
  const attemptCount = Number(detail?.attempts);
  const canRetry = detail && (status === 'failed' || status === 'retry') && Number.isFinite(attemptCount) && attemptCount < 4;
  return <section className="mailOperations" aria-label={t.title}>
    <div className="mailOperationsHead"><div><span>PICOSVC / MAIL / DELIVERY</span><h3>{t.title}</h3><p>{t.intro}</p></div><button type="button" disabled={loading || Boolean(busy)} onClick={() => { void loadEvents(); }}>{loading ? t.loading : t.refresh}</button></div>
    {error && <p className="mailOperationsError" role="alert">{error}</p>}{notice && <p className="mailOperationsNotice" role="status">{notice}</p>}
    <div className="mailOperationsLayout"><section className="mailOperationsCard"><h4>{t.events}</h4>
      <label className="mailOperationsLabel">{t.select}<select value={selected} disabled={loading || Boolean(busy)} onChange={event => setSelected(event.target.value)}><option value="">{t.empty}</option>{events.map(item => <option key={str(item.id)} value={str(item.id)}>{str(item.subject) || '(no subject)'} · {str(item.delivery_status)} · {date(item.received_at, locale)}</option>)}</select></label>
      {detailLoading ? <p role="status">{t.loading}</p> : detail && <div className="mailOperationsDetail"><h4>{t.details}</h4><dl>
        {([[t.from, detail.from], [t.to, detail.to], [t.subject, detail.subject], [t.received, date(detail.receivedAt, locale)], [t.status, status], [t.attempts, detail.attempts], [t.retryAt, detail.nextRetryAt ? date(detail.nextRetryAt, locale) : '—'], [t.response, detail.responseStatus ?? '—'], [t.error, detail.error ?? '—']] as Array<[string, unknown]>).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{str(value) || '—'}</dd></div>)}
      </dl><p className="mailOperationsHint">{t.previewNote}</p><details><summary>{t.text}</summary><pre>{str(detail.textPreview) || t.noPreview}</pre></details><details><summary>{t.html}</summary><pre>{str(detail.htmlPreview) || t.noPreview}</pre></details>
      <h4>{t.attachments}</h4>{attachments.length ? <ul>{attachments.map(item => <li key={str(item.id)}><div><strong>{str(item.filename) || 'attachment'}</strong><small>{str(item.content_type)} · {bytes(item.size_bytes, locale)}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => { void download(item); }}>{busy === `download:${str(item.id)}` ? t.working : t.download}</button></li>)}</ul> : <p>—</p>}
      <div className="mailOperationsActions"><button type="button" disabled={!canRetry || Boolean(busy)} onClick={() => { void retry(); }}>{busy === 'retry' ? t.working : t.retry}</button><small>{t.retryNote}</small></div></div>}
    </section><section className="mailOperationsCard mailOperationsSigning"><h4>{t.signing}</h4><p>{t.signingHelp}</p><code>x-picosvc-mail-timestamp · x-picosvc-mail-signature: v1=…</code><div className="mailOperationsActions"><button type="button" disabled={Boolean(busy)} onClick={() => { void rotate(); }}>{busy === 'rotate' ? t.working : t.rotate}</button></div>
      {secret && <div className="mailOperationsSecret" role="status"><strong>{t.secret}</strong><code>{revealed ? secret : '••••••••••••••••••••••••'}</code><p>{t.store}</p><div className="mailOperationsActions"><button type="button" onClick={() => setRevealed(value => !value)}>{revealed ? t.hide : t.reveal}</button><button type="button" onClick={() => { void copyValue(secret).then(() => setCopied(true)).catch(reason => setError(errorMessage(reason))); }}>{copied ? '✓' : t.copy}</button><button type="button" onClick={() => { setSecret(''); setRevealed(false); setCopied(false); }}>{t.clear}</button></div></div>}
    </section></div>
  </section>;
}
