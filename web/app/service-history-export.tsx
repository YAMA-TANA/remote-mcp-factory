'use client';

import { useState } from 'react';
import { useI18n } from './i18n';
import { HISTORY_DEFINITIONS, historyToCsv, readHistoryRows, type HistoryService } from './service-history-csv';
import './service-history-export.css';

type Props = {
  service: HistoryService;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
};
const WORDS = {
  ja: { title: '履歴をCSVで保存', detail: 'このリソースの直近の記録だけを出力します。全期間のバックアップではありません。', download: 'CSVをダウンロード', loading: '履歴を取得中…', count: '件を出力しました。', empty: '出力できる記録はまだありません。', error: '履歴を取得できませんでした。' },
  en: { title: 'Export history as CSV', detail: 'Export only the recent records for this resource, not a full historical backup.', download: 'Download CSV', loading: 'Loading history…', count: 'records exported.', empty: 'No records to export yet.', error: 'Could not retrieve history.' },
  'zh-CN': { title: '导出历史 CSV', detail: '仅导出此资源最近的记录，不是全部历史备份。', download: '下载 CSV', loading: '正在加载记录…', count: '条记录已导出。', empty: '暂无可导出的记录。', error: '无法获取历史记录。' },
} as const;

export default function ServiceHistoryExport({ service, resource, api }: Props) {
  const { locale } = useI18n();
  const t = WORDS[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const definition = HISTORY_DEFINITIONS[service];
  const id = typeof resource.id === 'string' ? resource.id : '';

  async function download() {
    if (busy || !id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api(definition.path(id));
      const rows = readHistoryRows(service, response.payload);
      if (!rows.length) { setNotice(t.empty); return; }
      const csv = historyToCsv(service, rows);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${service}-${id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'resource'}-history.csv`;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
      } finally {
        // Delay revocation until the browser has started the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      setNotice(`${rows.length} ${t.count}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  return <section className="serviceHistoryExport" aria-label={t.title}>
    <div><span className="serviceHistoryEyebrow">PICOSVC / {service.toUpperCase()} / CSV</span><h3>{t.title}</h3><p>{t.detail} ({definition.limit})</p></div>
    <button type="button" className="secondary" disabled={busy || !id} onClick={() => { void download(); }}>{busy ? t.loading : t.download}</button>
    {error && <p className="serviceHistoryError" role="alert">{error}</p>}
    {notice && <p className="serviceHistoryNotice" role="status">{notice}</p>}
  </section>;
}
