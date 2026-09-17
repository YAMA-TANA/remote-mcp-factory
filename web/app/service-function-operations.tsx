'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { ManagementProps } from './service-management-detail';
import './service-advanced-operations.css';

type Data = Record<string, unknown>;
type Props = Pick<ManagementProps, 'resource' | 'api' | 'onChanged'> & { onRollback: () => void };
const obj = (value: unknown): Data | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);
const rows = (payload: unknown, key: string): Data[] => {
  const value = obj(payload)?.[key];
  if (!Array.isArray(value)) throw new Error(`Invalid ${key} API response.`);
  return value.filter((entry): entry is Data => obj(entry) !== null);
};
const date = (value: unknown, locale: string) => {
  const parsed = new Date(str(value));
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : '—';
};
const WORDS = {
  ja: { title: '実行・バージョン・環境設定', sub: '保存済みの関数に対する実際の実行履歴と管理APIです。', reload: '情報を更新', loading: '取得中…', logs: '実行ログ', emptyLogs: '実行記録はありません。', version: 'リビジョン', history: 'バージョン履歴', emptyHistory: '履歴はありません。', current: '現在', inspect: 'コードを確認', rollback: 'この版へ復元', rollbackConfirm: 'この版を新しいリビジョンとして復元します。エディターにある未保存の変更は破棄されます。続行しますか？', rollbackDone: '復元しました。エディターに最新版を読み込みました。', secrets: '環境変数・シークレット', secretHint: '値は暗号化して保存され、一覧には名前しか返されません。値を再取得することはできません。', secretName: '名前（大文字英数字・_）', secretValue: '新しい値', secretSave: '値を登録・更新', secretDelete: '削除', secretConfirm: 'このシークレットを削除しますか？', secretOverwrite: '同じ名前のシークレットを上書きしますか？', secretSaved: 'シークレットを保存しました。値は再表示されません。', secretRemoved: 'シークレットを削除しました。', secretInvalid: '有効な名前と8 KiB以内の値を入力してください。', noSecrets: '登録されたシークレットはありません。', error: 'エラー', status: 'HTTP', duration: '所要時間', method: 'メソッド', show: '表示', hide: '隠す', limit: '直近200件までの実行記録を表示します。' },
  en: { title: 'Runs, versions & environment', sub: 'Actual execution records and management APIs for this function.', reload: 'Refresh data', loading: 'Loading…', logs: 'Invocation logs', emptyLogs: 'No invocations recorded.', version: 'Revision', history: 'Revision history', emptyHistory: 'No revisions yet.', current: 'Current', inspect: 'Inspect code', rollback: 'Restore revision', rollbackConfirm: 'Restore this version as a new revision? Unsaved changes in the editor will be discarded.', rollbackDone: 'Restored. The editor has reloaded the latest revision.', secrets: 'Environment secrets', secretHint: 'Values are encrypted at rest. The API returns only names, so values cannot be retrieved later.', secretName: 'Name (uppercase letters, numbers, _)', secretValue: 'New value', secretSave: 'Create / replace secret', secretDelete: 'Delete', secretConfirm: 'Delete this secret?', secretOverwrite: 'Replace the existing secret with this name?', secretSaved: 'Secret saved. Its value will not be shown again.', secretRemoved: 'Secret deleted.', secretInvalid: 'Enter a valid name and a value no larger than 8 KiB.', noSecrets: 'No secrets configured.', error: 'Error', status: 'HTTP', duration: 'Duration', method: 'Method', show: 'Show', hide: 'Hide', limit: 'Showing up to the latest 200 invocations.' },
  'zh-CN': { title: '执行、版本和环境', sub: '查看此函数的真实执行记录和管理接口。', reload: '刷新数据', loading: '加载中…', logs: '执行日志', emptyLogs: '暂无执行记录。', version: '修订版', history: '版本历史', emptyHistory: '暂无版本。', current: '当前', inspect: '查看代码', rollback: '恢复此版本', rollbackConfirm: '将此版本恢复为新的修订版？编辑器中未保存的更改会被丢弃。', rollbackDone: '已恢复，编辑器已加载最新版本。', secrets: '环境密钥', secretHint: '密钥加密保存。接口只返回名称，无法再次获取其值。', secretName: '名称（大写字母、数字、_）', secretValue: '新值', secretSave: '创建／替换密钥', secretDelete: '删除', secretConfirm: '删除此密钥？', secretOverwrite: '替换同名密钥？', secretSaved: '已保存密钥。不会再次显示其值。', secretRemoved: '已删除密钥。', secretInvalid: '请输入有效名称及不超过 8 KiB 的值。', noSecrets: '暂无密钥。', error: '错误', status: 'HTTP', duration: '耗时', method: '方法', show: '显示', hide: '隐藏', limit: '最多显示最近 200 条执行记录。' },
} as const;

export function FunctionOperations({ resource, api, onChanged, onRollback }: Props) {
  const { locale } = useI18n(); const t = WORDS[locale];
  const id = str(resource.id);
  const base = `/api/picosvc/functions/apps/${encodeURIComponent(id)}`;
  const [logs, setLogs] = useState<Data[]>([]);
  const [revisions, setRevisions] = useState<Data[]>([]);
  const [secrets, setSecrets] = useState<Data[]>([]);
  const [currentRevision, setCurrentRevision] = useState(0);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [source, setSource] = useState('');
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [runs, versions, keys] = await Promise.all([api(`${base}/logs`), api(`${base}/revisions`), api(`${base}/secrets`)]);
      setLogs(rows(runs.payload, 'logs'));
      setRevisions(rows(versions.payload, 'revisions'));
      setSecrets(rows(keys.payload, 'secrets'));
      setCurrentRevision(Number(obj(versions.payload)?.currentRevision || 0));
    } catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void load(); }, [load]);
  async function inspect(revision: number) {
    if (busy) return;
    if (selectedRevision === revision) { setSelectedRevision(null); setSource(''); return; }
    setBusy(true); setError(''); setSelectedRevision(null); setSource('');
    try {
      const result = obj((await api(`${base}/revisions/${revision}`)).payload);
      if (!result || typeof result.code !== 'string' || Number(result.revision_no) !== revision) throw new Error('Invalid revision response.');
      setSelectedRevision(revision); setSource(result.code);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function rollback() {
    if (busy || selectedRevision === null || !window.confirm(t.rollbackConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`${base}/rollback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: selectedRevision }) });
      setSelectedRevision(null); setSource('');
      await load(); onRollback(); onChanged(); setNotice(t.rollbackDone);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function saveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const name = secretName.trim();
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name) || name.startsWith('CF_') || name.startsWith('WRANGLER_') || ['PATH','HOME','NODE_OPTIONS','NODE_PATH','LD_PRELOAD','PICOSVC_FUNCTION_ID','PICOSVC_FUNCTION_NAME'].includes(name) || !secretValue || new TextEncoder().encode(secretValue).byteLength > 8192) { setError(t.secretInvalid); return; }
    if (secrets.some(entry => entry.name === name) && !window.confirm(t.secretOverwrite)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`${base}/secrets`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secrets: { [name]: secretValue } }) });
      setSecretValue(''); setReveal(false); setNotice(t.secretSaved);
      const response = await api(`${base}/secrets`);
      setSecrets(rows(response.payload, 'secrets')); onChanged();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function deleteSecret(name: string) {
    if (busy || !window.confirm(t.secretConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`${base}/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setSecrets(previous => previous.filter(entry => entry.name !== name));
      setNotice(t.secretRemoved); onChanged();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <section className="advancedOperations" aria-label={t.title}>
    <header className="advancedOperationsHead"><div><span className="advancedEyebrow">PICOSVC / FUNCTIONS / OPERATIONS</span><h2>{t.title}</h2><p>{t.sub}</p></div><button type="button" onClick={() => { void load(); }} disabled={busy || loading}>{loading ? t.loading : t.reload}</button></header>
    {error && <p className="advancedError" role="alert">{error}</p>}{notice && <p className="advancedSuccess" role="status">{notice}</p>}
    <div className="advancedOperationsColumns">
      <section className="advancedPanel"><h3>{t.logs}</h3><p className="advancedHint">{t.limit}</p>{loading ? <p role="status">{t.loading}</p> : logs.length === 0 ? <p className="advancedEmpty">{t.emptyLogs}</p> : <div className="advancedScroll">{logs.map((entry, index) => <details className="advancedEvent" key={str(entry.id) || index}><summary><strong>{str(entry.method)}</strong><span>{t.status} {str(entry.status_code) || '—'}</span><span>{str(entry.duration_ms)} ms</span><time>{date(entry.occurred_at, locale)}</time></summary><div className="advancedEventBody"><p>{t.version}: {str(entry.revision_no)}</p>{entry.error != null && <p className="advancedError">{t.error}: {str(entry.error)}</p>}</div></details>)}</div>}</section>
      <section className="advancedPanel"><h3>{t.history}</h3>{loading ? <p role="status">{t.loading}</p> : revisions.length === 0 ? <p className="advancedEmpty">{t.emptyHistory}</p> : <div className="advancedScroll">{revisions.map((revision, index) => { const number = Number(revision.revision_no); return <div className="advancedRevision" key={str(revision.id) || index}><div><strong>{t.version} {number}</strong>{number === currentRevision && <span className="advancedPill">{t.current}</span>}<small>{date(revision.created_at, locale)}</small></div><button type="button" disabled={busy} onClick={() => { void inspect(number); }}>{selectedRevision === number ? t.hide : t.inspect}</button></div>; })}</div>}{selectedRevision !== null && <div className="advancedCodePreview"><p>{t.version} {selectedRevision}</p><pre>{source}</pre><button type="button" disabled={busy || selectedRevision === currentRevision} onClick={() => { void rollback(); }}>{t.rollback}</button></div>}</section>
    </div>
    <section className="advancedPanel"><h3>{t.secrets}</h3><p className="advancedHint">{t.secretHint}</p>{loading ? <p role="status">{t.loading}</p> : secrets.length === 0 ? <p className="advancedEmpty">{t.noSecrets}</p> : <div className="advancedSecretList">{secrets.map((secret, index) => <div key={str(secret.name) || index}><code>{str(secret.name)}</code><small>{date(secret.updated_at, locale)}</small><button type="button" disabled={busy} onClick={() => { void deleteSecret(str(secret.name)); }}>{t.secretDelete}</button></div>)}</div>}
      <form className="advancedSecretForm" onSubmit={event => { void saveSecret(event); }} autoComplete="off"><label>{t.secretName}<input required autoComplete="off" maxLength={64} spellCheck={false} value={secretName} onChange={event => setSecretName(event.target.value)}/></label><label>{t.secretValue}<span className="advancedSecretInput"><input required autoComplete="new-password" type={reveal ? 'text' : 'password'} value={secretValue} onChange={event => setSecretValue(event.target.value)}/><button type="button" onClick={() => setReveal(previous => !previous)}>{reveal ? t.hide : t.show}</button></span></label><button type="submit" disabled={busy || loading || !secretName.trim() || !secretValue}>{busy ? t.loading : t.secretSave}</button></form>
    </section>
  </section>;
}
