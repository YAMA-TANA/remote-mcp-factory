import type { Metadata } from 'next';
import { localeToSlug, slugToLocale, type Locale } from './i18n-data';

export const SITE_URL = 'https://picosvc.com';

export type PageKind = 'home' | 'mock' | 'hooks' | 'pricing' | 'contact' | 'terms' | 'privacy' | 'tokushoho';

const META: Record<Locale, Record<PageKind, { title: string; description: string }>> = {
  en: {
    home: { title: 'PicoSvc — Tiny developer services, one account', description: 'Small developer infrastructure with separate product plans and optional bundles: MCP hosting, mock APIs, webhooks, RSS, screenshots, QR, cron, files, forms, and more.' },
    mock: { title: 'PicoSvc Mock — Mock APIs in seconds', description: 'Create stable public mock API endpoints with custom methods, status codes and response bodies.' },
    hooks: { title: 'PicoSvc Hooks — Webhook inbox and replay', description: 'Create public webhook inboxes, inspect incoming requests, and safely replay events to public HTTP(S) endpoints.' },
    pricing: { title: 'Pricing — PicoSvc', description: 'PicoSvc pricing: Pico is $1 per service per month, PicoPlus is $5, Bundle Pico is $5, Bundle Pro is $22, with custom plans available by contact.' },
    contact: { title: 'Contact & Support — PicoSvc', description: 'Contact PicoSvc support for product, billing, privacy, security and statutory disclosure requests.' },
    terms: { title: 'Terms of Service — PicoSvc', description: 'Terms governing access to and use of PicoSvc developer services.' },
    privacy: { title: 'Privacy Policy — PicoSvc', description: 'How PicoSvc collects, uses, stores and shares information.' },
    tokushoho: { title: 'Specified Commercial Transactions Act Disclosure — PicoSvc', description: 'PicoSvc disclosure under Japan’s Specified Commercial Transactions Act. This English text is a convenience translation.' },
  },
  ja: {
    home: { title: 'PicoSvc — 小さな開発者向けサービスを、ひとつのアカウントで', description: 'MCPホスティング、Mock API、Webhook、RSS、スクリーンショット、QR、Cron、Files、Formsなどを製品別プランとBundleで使える軽量開発者インフラ。' },
    mock: { title: 'PicoSvc Mock — Mock APIをすぐ作成', description: 'HTTPメソッド、ステータスコード、レスポンス本文を指定して安定した公開Mock API endpointを作成できます。' },
    hooks: { title: 'PicoSvc Hooks — Webhook InboxとReplay', description: '公開Webhook Inboxを作成し、受信requestの確認と安全なReplayを行える軽量Webhook開発ツールです。' },
    pricing: { title: '料金 — PicoSvc', description: 'PicoSvcの料金。単品Picoは1サービス月$1、PicoPlusは月$5、Bundle Picoは月$5、Bundle Proは月$22。さらに上の利用は要相談です。' },
    contact: { title: 'お問い合わせ・サポート — PicoSvc', description: 'PicoSvcの製品、課金、プライバシー、セキュリティ、法定表示の開示請求窓口です。' },
    terms: { title: '利用規約 — PicoSvc', description: 'PicoSvc開発者サービスの利用条件を定める利用規約です。' },
    privacy: { title: 'プライバシーポリシー — PicoSvc', description: 'PicoSvcにおける情報の取得、利用、保存、共有について説明します。' },
    tokushoho: { title: '特定商取引法に基づく表記 — PicoSvc', description: 'PicoSvcの特定商取引法に基づく正式な表示です。' },
  },
  'zh-CN': {
    home: { title: 'PicoSvc — 轻量开发者服务，一个账号即可使用', description: '通过独立产品套餐与 Bundle 使用 MCP 托管、Mock API、Webhook、RSS、截图、QR、Cron、Files、Forms 等轻量开发者基础设施。' },
    mock: { title: 'PicoSvc Mock — 快速创建 Mock API', description: '自定义 HTTP 方法、状态码和响应内容，快速创建稳定的公开 Mock API endpoint。' },
    hooks: { title: 'PicoSvc Hooks — Webhook Inbox 与 Replay', description: '创建公开 Webhook Inbox，查看收到的请求，并安全地 Replay 到公开 HTTP(S) endpoint。' },
    pricing: { title: '价格 — PicoSvc', description: 'PicoSvc 价格：Pico 每项服务每月 $1，PicoPlus $5，Bundle Pico $5，Bundle Pro $22，更高用量可联系定制。' },
    contact: { title: '联系与支持 — PicoSvc', description: '联系 PicoSvc 获取产品、计费、隐私、安全及法定信息披露支持。' },
    terms: { title: '服务条款 — PicoSvc', description: '适用于 PicoSvc 开发者服务访问与使用的服务条款。' },
    privacy: { title: '隐私政策 — PicoSvc', description: '说明 PicoSvc 如何收集、使用、存储和共享信息。' },
    tokushoho: { title: '日本特定商业交易法披露 — PicoSvc', description: 'PicoSvc 根据日本《特定商业交易法》提供的披露。本中文文本为参考译文。' },
  },
};

const PAGE_PATH: Record<PageKind, string> = {
  home: '',
  mock: '/mock',
  hooks: '/hooks',
  pricing: '/pricing',
  contact: '/contact',
  terms: '/terms',
  privacy: '/privacy',
  tokushoho: '/tokushoho',
};

export function localizedUrl(locale: Locale, kind: PageKind): string {
  return `${SITE_URL}/${localeToSlug(locale)}${PAGE_PATH[kind]}/`;
}

export function localizedPath(locale: Locale, kind: PageKind): string {
  return `/${localeToSlug(locale)}${PAGE_PATH[kind]}/`;
}

export function localeMetadata(locale: Locale, kind: PageKind): Metadata {
  const data = META[locale][kind];
  const canonical = localizedUrl(locale, kind);
  return {
    title: data.title,
    description: data.description,
    robots: { index: true, follow: true },
    alternates: {
      canonical,
      languages: {
        en: localizedUrl('en', kind),
        ja: localizedUrl('ja', kind),
        'zh-CN': localizedUrl('zh-CN', kind),
        'x-default': localizedUrl('en', kind),
      },
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: canonical,
      siteName: 'PicoSvc',
      locale: locale === 'zh-CN' ? 'zh_CN' : locale === 'ja' ? 'ja_JP' : 'en_US',
      type: 'website',
    },
  };
}

export function parseLocaleParam(slug: string): Locale {
  return slugToLocale(slug) ?? 'en';
}
