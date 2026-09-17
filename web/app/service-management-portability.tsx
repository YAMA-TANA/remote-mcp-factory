'use client';

import { useState } from 'react';
import { useI18n } from './i18n';
import { formConfigurationSnapshot, mcpEventCsv } from './service-management-portability-data';
import './service-management-portability.css';

type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { resource: Record<string, unknown>; api: Api };
const LABELS = {
  ja: {
    formsTitle: '保護設定のバックアップ', formsHelp: '保存済みの設定をJSONで保存します。編集中の未保存の内容は含まれません。復元時はsettings内の項目を設定APIのPUTに使用してください。',
    destinations: 'Webhook・リダイレクトURLも含める', warning: 'URLにトークンなどの秘密情報が含まれる場合があります。共有先と保存場所に注意してください。', formsExport: '設定JSONを保存',
    mcpTitle: '実行・ビルド履歴の目録', mcpHelp: '取得時点の新しい順で最大50件をCSVに保存します。全件ではありません。ログ本文・エラーメッセージ・シークレットは出力しません。', mcpExport: '直近50件のCSVを保存', empty: '記録がありません。', busy: '取得中…', saved: '保存用ファイルを作成しました。',
  },
  en: {
    formsTitle: 'Back up protection settings', formsHelp: 'Download saved settings as JSON. Unsaved editor changes are excluded. To restore, use the fields under settings with the configuration PUT API.',
    destinations: 'Include webhook and redirect URLs', warning: 'These URLs can contain tokens or other secrets. Take care where you store or share the file.', formsExport: 'Download settings JSON',
    mcpTitle: 'Runtime and build event inventory', mcpHelp: 'Download up to 50 latest events at request time, not all history. Log bodies, error messages and secrets are excluded.', mcpExport: 'Download latest 50 as CSV', empty: 'No events to export.', busy: 'Fetching…', saved: 'Download file prepared.',
  },
  'zh-CN': {
    formsTitle: '备份防护设置', formsHelp: '将已保存的配置下载为JSON，不包含编辑器中未保存的修改。恢复时请将settings下的字段用于配置PUT接口。',
    destinations: '包含Webhook和跳转URL', warning: 'URL可能包含令牌等秘密信息，请注意文件的存储和共享位置。', formsExport: '下载设置JSON',
    mcpTitle: '运行与构建事件目录', mcpHelp: '按请求时的时间顺序最多导出最近50条CSV，并非全部历史。不包含日志正文、错误信息或密钥。', mcpExport: '下载最近50条CSV', empty: '没有可导出的事件。', busy: '正在获取…', saved: '已准备下载文件。',
  },
} as const;

function download(content: string, mime: string, filename: string) {
  const href = URL.createObjectURL(new Blob([content], { type: mime }));
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { window.setTimeout(() => URL.revokeObjectURL(href), 1000); }
}
const failure = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export function FormsConfigurationDownload({ resource, api }: Props) {
  const { locale } = useI18n(); const t = LABELS[locale];
  const [includeDestinations, setIncludeDestinations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const id = typeof resource.id === 'string' ? resource.id : '';
  async function exportSettings() {
    if (busy || !id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api(`/api/picosvc/forms/${encodeURIComponent(id)}/config`);
      const snapshot = formConfigurationSnapshot(response.payload, includeDestinations);
      download(JSON.stringify(snapshot, null, 2) + '\n', 'application/json;charset=utf-8', `picosvc-form-settings-${id}.json`);
      setNotice(t.saved);
    } catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }
  return <section className="managementPortability" aria-label={t.formsTitle} aria-busy={busy}>
    <h3>{t.formsTitle}</h3><p>{t.formsHelp}</p>
    <label className="managementPortabilityCheck"><input type="checkbox" checked={includeDestinations} disabled={busy} onChange={event => setIncludeDestinations(event.target.checked)} />{t.destinations}</label>
    {includeDestinations && <p className="managementPortabilityWarning" role="status">{t.warning}</p>}
    <button type="button" disabled={busy || !id} onClick={() => { void exportSettings(); }}>{busy ? t.busy : t.formsExport}</button>
    {error && <p className="managementPortabilityError" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

export function McpEventsDownload({ resource, api }: Props) {
  const { locale } = useI18n(); const t = LABELS[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const id = typeof resource.id === 'string' ? resource.id : '';
  async function exportEvents() {
    if (busy || !id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api(`/api/picosvc/mcp/servers/${encodeURIComponent(id)}/logs?limit=50`);
      const { csv, count } = mcpEventCsv(response.payload);
      if (count === 0) { setNotice(t.empty); return; }
      download(csv, 'text/csv;charset=utf-8', `picosvc-mcp-events-${id}.csv`);
      setNotice(`${t.saved} (${count})`);
    } catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }
  return <section className="managementPortability" aria-label={t.mcpTitle} aria-busy={busy}>
    <h3>{t.mcpTitle}</h3><p>{t.mcpHelp}</p>
    <button type="button" disabled={busy || !id} onClick={() => { void exportEvents(); }}>{busy ? t.busy : t.mcpExport}</button>
    {error && <p className="managementPortabilityError" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
