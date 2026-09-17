'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import { parseFlagDraft } from './flag-editor-validation';
import './service-flags-management.css';

type Data = Record<string, unknown>;
type Lang = 'ja' | 'en' | 'zh-CN';
type Filter = 'all' | 'enabled' | 'disabled';
type Draft = { key: string; source: string; enabled: boolean };
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const EMPTY: Draft = { key: '', source: 'false', enabled: true };
const record = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const message = (value: unknown): string => value instanceof Error ? value.message : String(value);
const isEnabled = (item: Data): boolean => item.enabled === true || item.enabled === 1 || item.enabled === '1';
const pretty = (value: unknown): string => JSON.stringify(value, null, 2) ?? 'null';
function lastUpdated(value: unknown, locale: Lang): string {
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}
const COPY: Record<Lang, Record<string, string>> = {
  ja: { title: 'Feature Flags 管理', intro: '値を編集して公開状態を切り替えます。無効なフラグは公開APIのレスポンスから除外されます。', endpoint: '公開設定 API（GET）', metered: '公開APIの呼び出しは利用枠を消費します。画面では自動実行しません。', copy: 'URLをコピー', copied: 'コピーしました', unavailable: '公開URLを取得できません。', edit: 'フラグの編集', new: '新しいフラグ', editExisting: '選択中のフラグ', key: 'フラグキー', immutable: 'キーは変更できません。別の名前にするには新規作成してください。', value: 'JSON値', valueHint: 'boolean・数値・文字列・配列・オブジェクト・null。64 KiB以内。公開する値に秘密情報を含めないでください。', enabled: '公開APIに含める', enabledHint: '無効にすると公開APIの flags オブジェクトからこのキーが消えます。', save: 'フラグを保存', saved: 'フラグを保存しました。', reset: '新規作成に戻る', invalid: 'キーまたはJSON値を確認してください。', existing: '同じキーが存在します。まず一覧から選択してください。', discard: '未保存の変更を破棄しますか？', refresh: '一覧を更新', inventory: '保存済みフラグ', search: 'キーで検索', all: 'すべて', enabledFilter: '公開中', disabledFilter: '非公開', none: '該当するフラグはありません。', updated: '更新日時', public: '公開中', private: '非公開', inspect: '編集する', publish: '公開する', unpublish: '非公開にする', confirmPublish: 'このフラグを公開APIに含めますか？値は公開されます。', confirmUnpublish: 'このフラグを公開APIから除外しますか？利用中のクライアントに影響する可能性があります。', toggled: '公開状態を変更しました。', delete: 'フラグを削除', confirmDelete: 'このフラグを完全に削除しますか？公開APIからも削除されます。元に戻せません。', deleted: 'フラグを削除しました。', saveFirst: '未保存の編集を保存または破棄してから切り替えてください。', close: '閉じる', loading: '処理中…', noProject: 'プロジェクト情報を読み取れませんでした。' },
  en: { title: 'Feature Flags management', intro: 'Edit values and publication. Disabled flags are omitted from the public API response.', endpoint: 'Public configuration API (GET)', metered: 'Public API requests consume quota. This panel never calls it automatically.', copy: 'Copy URL', copied: 'Copied', unavailable: 'Public URL unavailable.', edit: 'Edit a flag', new: 'Create a flag', editExisting: 'Selected flag', key: 'Flag key', immutable: 'Keys cannot be renamed. Create another flag for a different key.', value: 'JSON value', valueHint: 'Boolean, number, string, array, object or null. Up to 64 KiB. Never include secrets in published values.', enabled: 'Include in the public API', enabledHint: 'Disabling removes this key from the public flags object.', save: 'Save flag', saved: 'Flag saved.', reset: 'New flag', invalid: 'Check the key and JSON value.', existing: 'This key already exists. Select it from the list to edit.', discard: 'Discard your unsaved changes?', refresh: 'Refresh list', inventory: 'Saved flags', search: 'Search keys', all: 'All', enabledFilter: 'Published', disabledFilter: 'Unpublished', none: 'No matching flags.', updated: 'Updated', public: 'Published', private: 'Unpublished', inspect: 'Edit', publish: 'Publish', unpublish: 'Unpublish', confirmPublish: 'Publish this flag? Its value will be publicly visible.', confirmUnpublish: 'Remove this flag from the public API? Existing clients may be affected.', toggled: 'Publication updated.', delete: 'Delete flag', confirmDelete: 'Permanently delete this flag? It will disappear from the public API. This cannot be undone.', deleted: 'Flag deleted.', saveFirst: 'Save or discard your pending edits before changing publication.', close: 'Close', loading: 'Working…', noProject: 'Project details are unavailable.' },
  'zh-CN': { title: '功能开关管理', intro: '编辑值与发布状态。未启用的开关不会出现在公开 API 中。', endpoint: '公开配置 API（GET）', metered: '访问公开 API 会消耗配额，本页面不会自动调用。', copy: '复制网址', copied: '已复制', unavailable: '无法获取公开网址。', edit: '编辑开关', new: '新建开关', editExisting: '已选开关', key: '开关键', immutable: '无法重命名，请另建一个开关。', value: 'JSON 值', valueHint: '布尔值、数字、字符串、数组、对象或 null，最多 64 KiB。请勿公开密钥。', enabled: '在公开 API 中显示', enabledHint: '禁用后该键将从公开 flags 对象中消失。', save: '保存开关', saved: '已保存。', reset: '新建开关', invalid: '请检查键名与 JSON 值。', existing: '此键已存在，请在列表中选中后编辑。', discard: '放弃未保存的更改？', refresh: '刷新列表', inventory: '已保存的开关', search: '搜索键名', all: '全部', enabledFilter: '已公开', disabledFilter: '未公开', none: '没有匹配的开关。', updated: '更新时间', public: '已公开', private: '未公开', inspect: '编辑', publish: '公开', unpublish: '取消公开', confirmPublish: '公开此开关？其值将对所有人可见。', confirmUnpublish: '从公开 API 移除此开关？可能影响现有客户端。', toggled: '发布状态已更新。', delete: '删除开关', confirmDelete: '永久删除此开关？它将从公开 API 消失，且无法恢复。', deleted: '已删除。', saveFirst: '请先保存或放弃未保存的编辑。', close: '关闭', loading: '处理中…', noProject: '无法读取项目信息。' },
};

export default function FlagsManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/flags/projects/${encodeURIComponent(id)}/flags`;
  const [flags, setFlags] = useState<Data[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const publicId = text(resource.publicId ?? resource.public_id);
  let publicUrl = '';
  try {
    const origin = new URL(API_ORIGIN);
    if (/^[0-9a-f]{32}$/i.test(publicId) && ['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password) publicUrl = `${origin.origin}/flags/${publicId}`;
  } catch { /* No configured API origin. */ }

  const reload = useCallback(async () => {
    const result = record((await api(base)).payload);
    if (!result || !Array.isArray(result.flags)) throw new Error('Invalid flag list response.');
    setFlags(result.flags.filter((item): item is Data => record(item) !== null));
  }, [api, base]);
  useEffect(() => {
    let mounted = true;
    void reload().catch(reason => { if (mounted) setError(message(reason)); }).finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, [reload]);
  function select(item: Data | null) {
    if (busy || (dirty && !window.confirm(t.discard))) return;
    const next: Draft = item ? { key: text(item.key), source: pretty(item.value), enabled: isEnabled(item) } : { ...EMPTY };
    setSelectedKey(item ? next.key : ''); setDraft(next); setSaved(next); setError(''); setNotice('');
  }
  async function refresh() {
    if (busy || (dirty && !window.confirm(t.discard))) return;
    setBusy('refresh'); setError('');
    try { await reload(); setSelectedKey(''); setDraft({ ...EMPTY }); setSaved({ ...EMPTY }); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    let payload: { key: string; value: unknown };
    try { payload = parseFlagDraft(draft.key, draft.source); }
    catch (reason) { setError(`${t.invalid} ${message(reason)}`); return; }
    if (!selectedKey && flags.some(item => item.key === payload.key)) { setError(t.existing); return; }
    if (selectedKey && payload.key !== selectedKey) { setError(t.immutable); return; }
    setBusy('save'); setError(''); setNotice('');
    try {
      const result = record((await api(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, enabled: draft.enabled }) })).payload);
      if (!result || result.key !== payload.key || !Object.prototype.hasOwnProperty.call(result, 'value') || JSON.stringify(result.value) !== JSON.stringify(payload.value) || result.enabled !== draft.enabled) throw new Error('Invalid flag save response.');
      const next: Draft = { key: payload.key, source: pretty(payload.value), enabled: draft.enabled };
      setSelectedKey(payload.key); setDraft(next); setSaved(next);
      setFlags(old => [...old.filter(item => item.key !== payload.key), result].sort((a, b) => text(a.key).localeCompare(text(b.key))));
      setNotice(t.saved); onChanged();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(''); }
  }
  async function toggle(item: Data) {
    if (busy) return;
    if (dirty) { setError(t.saveFirst); return; }
    const wasEnabled = isEnabled(item);
    if (!window.confirm(wasEnabled ? t.confirmUnpublish : t.confirmPublish)) return;
    const key = text(item.key);
    setBusy(key); setError(''); setNotice('');
    try {
      const result = record((await api(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value: item.value, enabled: !wasEnabled }) })).payload);
      if (!result || result.key !== key || result.enabled !== !wasEnabled || JSON.stringify(result.value) !== JSON.stringify(item.value)) throw new Error('Invalid flag publication response.');
      setFlags(old => old.map(entry => entry.key === key ? { ...entry, ...result } : entry));
      if (selectedKey === key) { const next = { key, source: pretty(item.value), enabled: !wasEnabled }; setDraft(next); setSaved(next); }
      setNotice(t.toggled); onChanged();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(''); }
  }
  async function remove() {
    if (busy || !selectedKey || !window.confirm(t.confirmDelete)) return;
    const key = selectedKey;
    setBusy('delete'); setError(''); setNotice('');
    try {
      await api(`${base}/${encodeURIComponent(key)}`, { method: 'DELETE' });
      setFlags(old => old.filter(item => item.key !== key));
      setSelectedKey(''); setDraft({ ...EMPTY }); setSaved({ ...EMPTY });
      setNotice(t.deleted); onChanged();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(''); }
  }
  const visible = flags.filter(item => {
    if (filter !== 'all' && isEnabled(item) !== (filter === 'enabled')) return false;
    return text(item.key).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  const published = flags.filter(isEnabled).length;
  return <section className="flagsConsole" aria-label={t.title}>
    <header className="flagsConsoleHead"><div><span>PICOSVC / FLAGS</span><h2>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="flagsConsoleError" role="alert">{error}</p>}{notice && <p className="flagsConsoleSuccess" role="status">{notice}</p>}
    <section className="flagsConsoleEndpoint"><div><strong>{t.endpoint}</strong>{publicUrl ? <code>{publicUrl}</code> : <p>{t.unavailable}</p>}<small>{t.metered}</small></div>{publicUrl && <button type="button" onClick={() => { void copyValue(publicUrl).then(() => setCopied(true)).catch(reason => setError(message(reason))); }}>{copied ? t.copied : t.copy}</button>}</section>
    <div className="flagsConsoleGrid"><form className="flagsConsoleCard flagsConsoleEditor" onSubmit={event => { void save(event); }}><div className="flagsConsoleSectionHead"><div><h3>{t.edit}</h3><small>{selectedKey ? t.editExisting : t.new}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => select(null)}>{t.reset}</button></div>
      <fieldset disabled={Boolean(busy)}><label>{t.key}<input required value={draft.key} maxLength={100} readOnly={Boolean(selectedKey)} onChange={event => setDraft(old => ({ ...old, key: event.target.value }))} placeholder="new_checkout" /></label>{selectedKey && <small>{t.immutable}</small>}
      <label>{t.value}<textarea required rows={8} spellCheck={false} value={draft.source} onChange={event => setDraft(old => ({ ...old, source: event.target.value }))} placeholder={'{"enabled": true}'} /></label><small>{t.valueHint}</small>
      <label className="flagsConsoleCheck"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(old => ({ ...old, enabled: event.target.checked }))} />{t.enabled}</label><small>{t.enabledHint}</small>
      <div className="flagsConsoleActions"><button className="flagsConsolePrimary" type="submit" disabled={!draft.key || (!dirty && Boolean(selectedKey))}>{busy === 'save' ? t.loading : t.save}</button>{selectedKey && <button className="flagsConsoleDanger" type="button" onClick={() => { void remove(); }}>{t.delete}</button>}</div></fieldset>
    </form><section className="flagsConsoleCard flagsConsoleInventory"><div className="flagsConsoleSectionHead"><div><h3>{t.inventory}</h3><small>{published} / {flags.length} {t.public}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => { void refresh(); }}>{busy === 'refresh' ? t.loading : t.refresh}</button></div>
      <label className="flagsConsoleSearch"><span className="srOnly">{t.search}</span><input type="search" value={search} placeholder={t.search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="flagsConsoleFilters" role="group" aria-label={t.inventory}>{(['all', 'enabled', 'disabled'] as const).map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === 'all' ? t.all : option === 'enabled' ? t.enabledFilter : t.disabledFilter} <span>{option === 'all' ? flags.length : option === 'enabled' ? published : flags.length - published}</span></button>)}</div>
      {!loaded ? <p role="status">{t.loading}</p> : !visible.length ? <p className="flagsConsoleEmpty">{t.none}</p> : <div className="flagsConsoleList">{visible.map(item => { const key = text(item.key); const publishedNow = isEnabled(item); return <article className={`flagsConsoleItem ${selectedKey === key ? 'flagsConsoleSelected' : ''}`} key={key}><div className="flagsConsoleItemHead"><strong>{key}</strong><span className={publishedNow ? 'flagsConsoleLive' : 'flagsConsoleOff'}>{publishedNow ? t.public : t.private}</span></div><pre>{pretty(item.value)}</pre><small>{t.updated}: {lastUpdated(item.updatedAt ?? item.updated_at, locale)}</small><div className="flagsConsoleActions"><button type="button" disabled={Boolean(busy)} onClick={() => select(item)}>{t.inspect}</button><button type="button" disabled={Boolean(busy)} onClick={() => { void toggle(item); }}>{publishedNow ? t.unpublish : t.publish}</button></div></article>; })}</div>}
    </section></div>
  </section>;
}
