'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { enabledFlagsPayload, formConfigSnapshot, licenseExpirySummary, safeJsonDownload, type Data } from './service-governance-tools-data';
import './service-governance-tools.css';

type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = { resource: Data; api: Api };
type Lang = 'ja' | 'en' | 'zh-CN';
const record = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown) => value == null ? '' : String(value);
function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([safeJsonDownload(value)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.style.display = 'none'; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const COPY: Record<Lang, Record<string,string>> = {
  ja: { formTitle:'設定バックアップ', formBody:'投稿本文やWebhook送信先を含めず、受信ルールだけをJSONで保存します。', load:'読み込む', refresh:'更新', download:'JSONを保存', webhook:'Webhook設定', configured:'設定あり（URLは出力しません）', none:'未設定', licenseTitle:'ライセンス期限サマリー', active:'有効', expired:'期限切れ', revoked:'失効', d7:'7日以内', d30:'30日以内', next:'次の期限', noExpiry:'無期限', flagsTitle:'公開フラグのプレビュー', flagsBody:'認証済み管理APIの一覧から、公開中のフラグだけを再構成します。公開APIの利用枠は消費しません。', published:'公開中', empty:'公開中のフラグはありません。', error:'読み込みに失敗しました。' },
  en: { formTitle:'Configuration backup', formBody:'Download submission rules without submission bodies or the webhook destination.', load:'Load', refresh:'Refresh', download:'Download JSON', webhook:'Webhook', configured:'Configured (URL omitted)', none:'Not configured', licenseTitle:'License expiry summary', active:'Active', expired:'Expired', revoked:'Revoked', d7:'Within 7 days', d30:'Within 30 days', next:'Next expiry', noExpiry:'No expiry', flagsTitle:'Published flags preview', flagsBody:'Reconstruct only enabled flags from the authenticated management list. This does not consume public API quota.', published:'Published', empty:'No published flags.', error:'Failed to load.' },
  'zh-CN': { formTitle:'配置备份', formBody:'仅导出接收规则，不包含提交内容或 Webhook 地址。', load:'加载', refresh:'刷新', download:'下载 JSON', webhook:'Webhook', configured:'已配置（不导出网址）', none:'未配置', licenseTitle:'许可证到期概览', active:'有效', expired:'已过期', revoked:'已撤销', d7:'7天内', d30:'30天内', next:'最近到期', noExpiry:'无到期', flagsTitle:'公开开关预览', flagsBody:'从已认证的管理列表重建仅已启用的开关，不消耗公开 API 配额。', published:'已公开', empty:'没有已公开的开关。', error:'加载失败。' },
};

function useLoaded(load: () => Promise<unknown>) {
  const [value,setValue] = useState<unknown>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const seq=useRef(0);
  const run = useCallback(async()=>{ const current=++seq.current; setBusy(true); setError(''); try { const next=await load(); if(seq.current===current) setValue(next); } catch(e){ if(seq.current===current) setError(e instanceof Error?e.message:String(e)); } finally { if(seq.current===current) setBusy(false); } },[load]);
  useEffect(()=>()=>{seq.current+=1;},[]); return {value,busy,error,run};
}

export function FormsGovernanceTools({resource,api}:Props){ const {locale}=useI18n(); const t=COPY[locale]; const id=text(resource.id);
  const loader=useCallback(async()=>{ const result=record((await api(`/api/picosvc/forms/${encodeURIComponent(id)}/config`)).payload); if(!result) throw new Error('Invalid Forms config response'); return formConfigSnapshot(result); },[api,id]);
  const state=useLoaded(loader); const snapshot=record(state.value);
  return <section className="governanceCard"><div><span>PICOSVC / FORMS</span><h3>{t.formTitle}</h3><p>{t.formBody}</p></div><div className="governanceActions"><button onClick={()=>void state.run()} disabled={state.busy}>{snapshot?t.refresh:t.load}</button>{snapshot&&<button onClick={()=>downloadJson(snapshot,`picosvc-forms-${id}-config.json`)}>{t.download}</button>}</div>{state.error&&<p role="alert" className="governanceError">{state.error}</p>}{snapshot&&<p className="governanceNote">{t.webhook}: {snapshot.webhookConfigured?t.configured:t.none}</p>}</section>;
}

export function LicenseGovernanceTools({resource,api}:Props){ const {locale}=useI18n(); const t=COPY[locale]; const id=text(resource.id);
  const loader=useCallback(async()=>{ const result=record((await api(`/api/picosvc/license/projects/${encodeURIComponent(id)}/keys`)).payload); if(!result||!Array.isArray(result.keys)) throw new Error('Invalid license list response'); return licenseExpirySummary(result.keys.filter((x):x is Data=>record(x)!==null)); },[api,id]);
  const state=useLoaded(loader); const summary=record(state.value); const fmt=(v:unknown)=>{const d=new Date(text(v)); return Number.isFinite(d.getTime())?d.toLocaleString(locale):'—';};
  return <section className="governanceCard"><div><span>PICOSVC / LICENSE</span><h3>{t.licenseTitle}</h3></div><div className="governanceActions"><button onClick={()=>void state.run()} disabled={state.busy}>{summary?t.refresh:t.load}</button></div>{state.error&&<p role="alert" className="governanceError">{state.error}</p>}{summary&&<><div className="governanceStats"><b>{t.active}<strong>{text(summary.active)}</strong></b><b>{t.expired}<strong>{text(summary.expired)}</strong></b><b>{t.revoked}<strong>{text(summary.revoked)}</strong></b><b>{t.d7}<strong>{text(summary.within7Days)}</strong></b><b>{t.d30}<strong>{text(summary.within30Days)}</strong></b><b>{t.noExpiry}<strong>{text(summary.noExpiry)}</strong></b></div><p className="governanceNote">{t.next}: {summary.nextExpiry?fmt(summary.nextExpiry):'—'}</p></>}</section>;
}

export function FlagsGovernanceTools({resource,api}:Props){ const {locale}=useI18n(); const t=COPY[locale]; const id=text(resource.id);
  const loader=useCallback(async()=>{ const result=record((await api(`/api/picosvc/flags/projects/${encodeURIComponent(id)}/flags`)).payload); if(!result||!Array.isArray(result.flags)) throw new Error('Invalid flag list response'); return enabledFlagsPayload(result.flags.filter((x):x is Data=>record(x)!==null)); },[api,id]);
  const state=useLoaded(loader); const payload=record(state.value); const flags=payload&&record(payload.flags); const count=flags?Object.keys(flags).length:0;
  return <section className="governanceCard"><div><span>PICOSVC / FLAGS</span><h3>{t.flagsTitle}</h3><p>{t.flagsBody}</p></div><div className="governanceActions"><button onClick={()=>void state.run()} disabled={state.busy}>{payload?t.refresh:t.load}</button>{payload&&<button onClick={()=>downloadJson(payload,`picosvc-flags-${id}-published.json`)}>{t.download}</button>}</div>{state.error&&<p role="alert" className="governanceError">{state.error}</p>}{payload&&<><p className="governanceNote">{t.published}: {count}</p><pre className="governancePreview">{count?JSON.stringify(payload,null,2):t.empty}</pre></>}</section>;
}
