'use client';

import { ClerkProvider, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { CheckoutButton, usePlans } from '@clerk/nextjs/experimental';
import { enUS } from '@clerk/localizations/en-US';
import { jaJP } from '@clerk/localizations/ja-JP';
import { zhCN } from '@clerk/localizations/zh-CN';
import { ui } from '@clerk/ui';
import type { Locale } from '../i18n-data';
import type { ProductSlug } from '../customer-content';
import './service-purchase.css';

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type BillingPlan = ReturnType<typeof usePlans>['data'][number];

const PRODUCT_NAMES: Record<ProductSlug, string> = {
  mcp: 'MCP', mock: 'Mock', hooks: 'Hooks', rss: 'Rss', mail: 'Mail', shot: 'Shot',
  fetch: 'Fetch', qr: 'Qr', cron: 'Cron', functions: 'Functions', json: 'Json',
  files: 'Files', license: 'License', flags: 'Flags', monitor: 'Monitor', forms: 'Forms',
};

const COPY = {
  ja: {
    kicker: 'このサービスの購入', title: '利用するプランを選択', description: 'このサービス専用のプランです。購入前に表示される画面で料金と更新条件を確認できます。',
    pico: 'Pico', picoPlus: 'PicoPlus', monthly: '/月', loading: 'プランを読み込んでいます…',
    unavailable: '現在プランを読み込めません。時間をおいて再度お試しください。', missing: '購入画面を準備できません。お問い合わせください。',
    notConfigured: 'オンライン購入は現在利用できません。お問い合わせください。',
    purchase: 'このプランを購入', signIn: 'ログインして購入', noPlans: 'このサービスの購入可能なプランは現在ありません。',
  },
  en: {
    kicker: 'PURCHASE THIS SERVICE', title: 'Choose your plan', description: 'These plans are for this service only. Review the price and renewal terms in checkout before you buy.',
    pico: 'Pico', picoPlus: 'PicoPlus', monthly: '/mo', loading: 'Loading plans…',
    unavailable: 'Plans could not be loaded. Please try again in a little while.', missing: 'Checkout is unavailable. Please contact support.',
    notConfigured: 'Online purchases are currently unavailable. Please contact support.',
    purchase: 'Purchase this plan', signIn: 'Sign in to purchase', noPlans: 'There are no purchasable plans for this service right now.',
  },
  'zh-CN': {
    kicker: '购买此服务', title: '选择套餐', description: '以下套餐仅适用于此服务。购买前可在结账页面确认价格和续费条件。',
    pico: 'Pico', picoPlus: 'PicoPlus', monthly: '/月', loading: '正在加载套餐…',
    unavailable: '无法加载套餐，请稍后重试。', missing: '暂时无法结账，请联系支持团队。',
    notConfigured: '暂时无法在线购买，请联系支持团队。',
    purchase: '购买此套餐', signIn: '登录后购买', noPlans: '此服务目前没有可购买的套餐。',
  },
} as const;

function formatPrice(plan: BillingPlan, locale: Locale): string | null {
  if (!plan.fee) return null;
  const amount = Number(plan.fee.amountFormatted);
  if (!Number.isFinite(amount)) return `${plan.fee.currencySymbol}${plan.fee.amountFormatted}`;
  return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    style: 'currency', currency: plan.fee.currency,
  }).format(amount);
}

function ServicePurchaseUnavailable({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return <section className="customerSection servicePurchase" aria-labelledby="servicePurchaseTitle">
    <span className="servicePurchaseKicker">{copy.kicker}</span>
    <h2 id="servicePurchaseTitle">{copy.title}</h2>
    <p>{copy.description}</p>
    <p className="servicePurchaseNotice" role="status">{copy.notConfigured}</p>
  </section>;
}

function ServicePlansContent({ service, locale }: { service: ProductSlug; locale: Locale }) {
  const { data, isLoading, isError } = usePlans({ for: 'user', pageSize: 100 });
  const product = PRODUCT_NAMES[service];
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const usageUrl = `/${lang}/usage/`;
  const serviceUrl = `/${lang}/${service}/`;
  const copy = COPY[locale];
  const plans = (['Pico', 'PicoPlus'] as const).map((tier) => ({
    tier,
    plan: data.find((candidate) => candidate.name.trim().toLocaleLowerCase('en-US') === `picosvc ${product} ${tier}`.toLocaleLowerCase('en-US')),
  })).filter((item): item is { tier: 'Pico' | 'PicoPlus'; plan: BillingPlan } => Boolean(item.plan));

  return (
    <section className="customerSection servicePurchase" aria-labelledby="servicePurchaseTitle">
      <span className="servicePurchaseKicker">{copy.kicker}</span>
      <h2 id="servicePurchaseTitle">{copy.title}</h2>
      <p>{copy.description}</p>
      {isLoading ? <p className="servicePurchaseNotice" role="status">{copy.loading}</p>
          : isError ? <p className="servicePurchaseNotice" role="status">{copy.unavailable}</p>
            : plans.length === 0 ? <p className="servicePurchaseNotice" role="status">{copy.noPlans}</p>
              : <div className="servicePurchaseGrid">
                {plans.map(({ tier, plan }) => (
                  <article className="servicePurchaseCard" key={plan.id}>
                    <div className="servicePurchaseCardHead">
                      <h3>{tier === 'Pico' ? copy.pico : copy.picoPlus}</h3>
                      <span>{product}</span>
                    </div>
                    <p className="servicePurchasePrice">
                      {formatPrice(plan, locale) ?? copy.missing}
                      {plan.fee && <span>{copy.monthly}</span>}
                    </p>
                    <SignedIn>
                      <CheckoutButton planId={plan.id} planPeriod="month" newSubscriptionRedirectUrl={usageUrl}>
                        <button className="servicePurchaseButton" type="button">{copy.purchase}</button>
                      </CheckoutButton>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton mode="modal" forceRedirectUrl={serviceUrl}>
                        <button className="servicePurchaseButton" type="button">{copy.signIn}</button>
                      </SignInButton>
                    </SignedOut>
                  </article>
                ))}
              </div>}
    </section>
  );
}

export default function ServicePurchasePlans({ service, locale }: { service: ProductSlug; locale: Locale }) {
  if (!CLERK_KEY) return <ServicePurchaseUnavailable locale={locale} />;

  const localization = locale === 'ja' ? jaJP : locale === 'zh-CN' ? zhCN : enUS;
  return (
    <ClerkProvider publishableKey={CLERK_KEY} ui={ui} localization={localization}>
      <ServicePlansContent service={service} locale={locale} />
    </ClerkProvider>
  );
}
