'use client';

import { useState } from 'react';
import { useI18n } from './i18n';
import { collectJsonBackup, FILE_INVENTORY_LIMIT, fileInventoryCsv, filterFileInventory, readFileInventory, type Backup, type FileEntry, type FileSort } from './service-inventory-data';
import './service-inventory-tools.css';

type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { resource: Record<string, unknown>; api: Api };
const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
const problem = (value: unknown) => value instanceof Error ? value.message : String(value);
function download(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const COPY = {
  ja: { backup: '複数ページをまとめてバックアップ', jsonHint: '認証付きAPIで最大10ページ・8 MiBまで取得します。JSON値の中身を含むため、安全な場所に保管してください。取得中の更新による一貫性は保証されません。', prepare: 'バックアップを取得', preparing: '取得中…', save: 'JSONを保存', complete: '最終ページまで取得', partial: '上限に達したため一部のみ取得', pages: 'ページ', docs: '文書', bytes: 'バイト', remaining: '続きのカーソル', noDocs: '文書はありません。', files: 'ファイル目録・検索', fileHint: '直近最大500件のメタデータを検索・CSV保存します。ファイル本体は含みません。500件の場合、それより古いファイルがある可能性があります。', load: '目録を読み込む', refresh: '目録を更新', loading: '読み込み中…', search: 'パスまたはMIMEタイプで検索', recent: '更新日時が新しい順', path: 'パス順', size: 'サイズが大きい順', visible: '表示件数', total: '取得件数', totalSize: '取得範囲の合計', saveCsv: '表示中の目録をCSV保存', none: '一致するファイルはありません。', limit: '500件の上限に到達：この目録は全件ではない可能性があります。', exportError: '書き出すデータがありません。' },
  en: { backup: 'Multi-page JSON backup', jsonHint: 'Reads at most 10 pages / 8 MiB via the authenticated API. Includes actual JSON values; store securely. Changes during pagination can produce an inconsistent snapshot.', prepare: 'Prepare backup', preparing: 'Preparing…', save: 'Save JSON', complete: 'Reached final page', partial: 'Partial backup: safety limit reached', pages: 'Pages', docs: 'Documents', bytes: 'bytes', remaining: 'Continuation cursor', noDocs: 'No documents found.', files: 'Files inventory & search', fileHint: 'Search and export metadata for up to 500 most recently updated objects. No file contents. Older objects may be omitted.', load: 'Load inventory', refresh: 'Refresh inventory', loading: 'Loading…', search: 'Search path or MIME type', recent: 'Recently updated', path: 'Path A–Z', size: 'Largest first', visible: 'Matching', total: 'Loaded', totalSize: 'Loaded size', saveCsv: 'Export visible inventory CSV', none: 'No matching files.', limit: '500-item cap reached: this may not be the complete inventory.', exportError: 'Nothing to export.' },
  'zh-CN': { backup: '多页 JSON 备份', jsonHint: '通过已认证 API 最多读取10页、8 MiB。包含实际 JSON 值，请安全保存。分页期间的修改可能导致快照不一致。', prepare: '生成备份', preparing: '正在读取…', save: '保存 JSON', complete: '已到最后一页', partial: '达到上限，仅包含部分数据', pages: '页数', docs: '文档', bytes: '字节', remaining: '续传游标', noDocs: '暂无文档。', files: '文件清单与搜索', fileHint: '搜索并导出最近最多500个对象的元数据，不包含文件本体；旧文件可能被省略。', load: '读取清单', refresh: '刷新清单', loading: '读取中…', search: '搜索路径或 MIME 类型', recent: '最近更新', path: '路径排序', size: '大小降序', visible: '匹配数', total: '已读取', totalSize: '已读取大小', saveCsv: '将可见清单导出 CSV', none: '没有匹配的文件。', limit: '已达到500项上限：此清单可能不完整。', exportError: '没有可导出的数据。' },
} as const;

export function JsonBackupTools({ resource, api }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = text(resource.id);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function prepare() {
    if (busy || !id) return;
    setBusy(true); setError(''); setBackup(null);
    try { setBackup(await collectJsonBackup(id, api)); }
    catch (reason) { setError(problem(reason)); }
    finally { setBusy(false); }
  }
  return <section className="inventoryTools" aria-label={t.backup}>
    <h3>{t.backup}</h3><p>{t.jsonHint}</p>
    <div className="inventoryActions"><button type="button" disabled={busy || !id} onClick={() => { void prepare(); }}>{busy ? t.preparing : t.prepare}</button>
      <button type="button" disabled={busy || !backup || !backup.count} onClick={() => { if (backup) download(backup.content, 'application/json;charset=utf-8', `picosvc-json-${id.slice(0, 8)}-${backup.complete ? 'backup' : 'partial'}.json`); }}>{t.save}</button></div>
    {error && <p role="alert" className="inventoryError">{error}</p>}
    {backup && <div className="inventoryResult" role="status"><strong>{backup.complete ? t.complete : t.partial}</strong><span>{t.pages}: {backup.pages} · {t.docs}: {backup.count} · {backup.bytes.toLocaleString()} {t.bytes}</span>{!backup.count && <span>{t.noDocs}</span>}{backup.nextCursor && <div>{t.remaining}: <code>{backup.nextCursor}</code></div>}</div>}
  </section>;
}

export function FilesInventoryTools({ resource, api }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = text(resource.id);
  const [rows, setRows] = useState<FileEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FileSort>('recent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    if (busy || !id) return;
    setBusy(true); setError(''); setNotice(''); setRows(null);
    try { setRows(readFileInventory((await api(`/api/picosvc/files/spaces/${encodeURIComponent(id)}/objects`)).payload)); }
    catch (reason) { setError(problem(reason)); }
    finally { setBusy(false); }
  }
  const visible = filterFileInventory(rows || [], query, sort);
  const totalSize = (rows || []).reduce((sum, row) => sum + row.sizeBytes, 0);
  return <section className="inventoryTools" aria-label={t.files}>
    <h3>{t.files}</h3><p>{t.fileHint}</p>
    <div className="inventoryActions"><button type="button" disabled={busy || !id} onClick={() => { void load(); }}>{busy ? t.loading : rows ? t.refresh : t.load}</button>
      <button type="button" disabled={busy || !visible.length} onClick={() => { if (!visible.length) { setError(t.exportError); return; } download(fileInventoryCsv(visible), 'text/csv;charset=utf-8', `picosvc-files-${id.slice(0, 8)}-inventory.csv`); setNotice(`${visible.length} CSV`); }}>{t.saveCsv}</button></div>
    {error && <p role="alert" className="inventoryError">{error}</p>}{notice && <p role="status">{notice}</p>}
    {rows && <><div className="inventoryFilters"><label>{t.search}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="images/" /></label><label>{t.path}<select value={sort} onChange={event => setSort(event.target.value as FileSort)}><option value="recent">{t.recent}</option><option value="path">{t.path}</option><option value="size">{t.size}</option></select></label></div>
      <p role="status">{t.visible}: {visible.length} · {t.total}: {rows.length} · {t.totalSize}: {totalSize.toLocaleString()} B</p>
      {rows.length === FILE_INVENTORY_LIMIT && <p className="inventoryWarning">{t.limit}</p>}
      {visible.length === 0 ? <p>{t.none}</p> : <div className="inventoryTable" role="region" aria-label={t.files} tabIndex={0}><table><thead><tr><th>{t.path}</th><th>MIME</th><th>{t.size}</th><th>Updated</th></tr></thead><tbody>{visible.slice(0, 100).map(row => <tr key={row.path}><td><code>{row.path}</code></td><td>{row.contentType}</td><td>{row.sizeBytes.toLocaleString()} B</td><td>{row.updatedAt}</td></tr>)}</tbody></table></div>}
      {visible.length > 100 && <p>{locale === 'ja' ? '表には先頭100件を表示します。CSVは絞り込み結果すべてを出力します。' : locale === 'zh-CN' ? '表格只显示前100项，CSV包含全部筛选结果。' : 'Table shows the first 100. CSV contains all matching rows.'}</p>}
    </>}
  </section>;
}
