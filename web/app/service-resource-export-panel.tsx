'use client';

import { useState } from 'react';
import { useI18n } from './i18n';
import { RESOURCE_EXPORTS, readExportRows, serializeResourceExport, type ResourceExportService } from './service-resource-export';
import './service-resource-export.css';

type Data = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { service: ResourceExportService; resource: Data; api: Api };
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const err = (value: unknown): string => value instanceof Error ? value.message : String(value);
const COPY = {
  ja: { title: 'データを書き出す', license: '発行済みキーのメタデータをCSV保存', flags: '現在のフラグ設定をJSON保存', run: 'ダウンロード', busy: '作成中…', hintLicense: '完全なライセンスキーや秘密値は含みません。ID・ラベル・状態・日時のみを書き出します。', hintFlags: '公開値と有効状態のスナップショットです。シークレットは対象外です。', empty: '対象データはありません。', done: '書き出しました。' },
  en: { title: 'Export data', license: 'Download issued-key metadata as CSV', flags: 'Download current flag snapshot as JSON', run: 'Download', busy: 'Preparing…', hintLicense: 'Full license keys and secret values are excluded. Only IDs, labels, state and timestamps are exported.', hintFlags: 'This snapshot contains flag values and publication state. Secrets are not included.', empty: 'There is no data to export.', done: 'Export downloaded.' },
  'zh-CN': { title: '导出数据', license: '将已发行密钥元数据下载为 CSV', flags: '将当前开关快照下载为 JSON', run: '下载', busy: '生成中…', hintLicense: '不包含完整许可证密钥或秘密值，仅导出 ID、标签、状态和时间。', hintFlags: '快照包含开关值和发布状态，不包含密钥。', empty: '没有可导出的数据。', done: '已导出。' },
} as const;

export default function ServiceResourceExport({ service, resource, api }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const id = text(resource.id);
  async function download() {
    if (busy || !id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const definition = RESOURCE_EXPORTS[service];
      const response = await api(definition.path(id));
      const rows = readExportRows(service, response.payload);
      if (!rows.length) { setError(t.empty); return; }
      const content = serializeResourceExport(service, rows);
      const blob = new Blob([content], { type: definition.mime });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = definition.filename(id); anchor.rel = 'noopener';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      } finally { URL.revokeObjectURL(url); }
      setNotice(t.done);
    } catch (reason) { setError(err(reason)); }
    finally { setBusy(false); }
  }
  return <section className="resourceExport" aria-label={t.title}>
    <div><span className="resourceExportEyebrow">PICOSVC / {service.toUpperCase()} / EXPORT</span><h3>{t.title}</h3><p>{service === 'license' ? t.hintLicense : t.hintFlags}</p></div>
    <div className="resourceExportActions"><strong>{t[service]}</strong><button type="button" disabled={busy || !id} onClick={() => { void download(); }}>{busy ? t.busy : t.run}</button></div>
    {error && <p className="resourceExportError" role="alert">{error}</p>}{notice && <p className="resourceExportSuccess" role="status">{notice}</p>}
  </section>;
}
