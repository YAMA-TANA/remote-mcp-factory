'use client';

import ProtectedContact from '../components/ProtectedContact';
import { LanguageSwitcher, useI18n } from '../i18n';

type Entry = { label: string; value?: string; contact?: true };

const COPY = {
  ja: {
    title: '特定商取引法に基づく表記', note: '',
    entries: [
      { label: '運営', value: '個人事業主 Y&T' },
      { label: '販売事業者の氏名', value: '請求があった場合、電子メールその他の適切な方法により遅滞なく開示します。' },
      { label: '所在地', value: '請求があった場合、電子メールその他の適切な方法により遅滞なく開示します。' },
      { label: 'お問い合わせ先', contact: true },
      { label: '販売価格・役務の対価', value: '各PicoSvc製品ページおよび購入・申込みの最終確認画面に表示します。製品ごとに個別のプラン・料金・利用上限が設定されます。Bundleを販売する場合は、対象製品、付与されるプランまたは利用枠、料金、契約期間を購入画面に表示します。' },
      { label: '販売価格以外に必要となる費用', value: 'インターネット接続料金、通信料金その他利用者側で発生する費用は利用者の負担となります。決済事業者、カード会社または金融機関が別途手数料や為替手数料を課す場合があります。' },
      { label: '支払方法', value: '購入画面に表示される決済方法をご利用いただけます。' },
      { label: '支払時期', value: '初回申込み時に課金され、継続課金プランについては購入画面に表示された請求周期ごとに自動更新・課金されます。' },
      { label: '役務の提供時期', value: '原則として決済確認後、技術的処理に必要な時間を除き速やかに利用可能となります。無料プランはアカウント作成後、対象機能の提供条件を満たした時点から利用できます。' },
      { label: '継続契約・自動更新', value: '月額その他の継続課金プランは、購入画面に表示された請求周期で自動更新されます。次回更新前にアカウントまたは決済管理画面から解約できます。解約後も、特段の表示がない限り、支払済み期間の終了まで利用できます。' },
      { label: '申込みの撤回・解約・返金', value: 'デジタルサービスの性質上、提供開始後の返品はありません。継続課金は将来の更新を停止する形で解約できます。既に支払われた料金は、法令上必要な場合または購入画面等で明示した場合を除き返金しません。' },
      { label: '申込み期間', value: '申込み期間を限定する場合は、対象ページおよび購入画面にその期間を表示します。表示がない場合、特別な申込み期限はありません。' },
      { label: '利用条件・動作環境', value: 'インターネット接続環境が必要です。Web管理画面は最新の主要ブラウザを想定しています。API・Webhook・MCP等の製品は、各製品ページまたはドキュメントに記載する技術要件、利用上限、レート制限その他の条件に従います。' },
      { label: '特別な販売条件', value: '各製品は原則として個別契約です。ある製品の有料プランを購入しても、別の製品が自動的に有料化されるものではありません。Bundleについては、購入画面に明示された製品・プラン・利用枠のみが対象です。' },
      { label: 'その他の表示事項の開示', value: '法令上、請求により開示することが認められている事項については、購入判断に先立って確認できるよう、請求を受けた後に遅滞なく開示します。開示請求は Contact & Support から行ってください。' },
    ] as Entry[]
  },
  en: {
    title: 'Specified Commercial Transactions Act Disclosure',
    note: 'Convenience translation. The Japanese disclosure is the authoritative version for this Japan-law notice.',
    entries: [
      { label: 'Operator', value: 'Sole proprietorship Y&T' },
      { label: 'Legal name of seller/service provider', value: 'Disclosed without undue delay by email or another appropriate method upon request.' },
      { label: 'Business address', value: 'Disclosed without undue delay by email or another appropriate method upon request.' },
      { label: 'Contact', contact: true },
      { label: 'Price / service fees', value: 'Displayed on each PicoSvc product page and on the final purchase or application confirmation screen. Each product has its own plans, prices, and usage limits. When a Bundle is offered, the checkout page shows the included products, granted plans or quotas, price, and contract period.' },
      { label: 'Additional costs', value: 'Internet access, telecommunications, and other user-side costs are borne by the user. A payment processor, card issuer, or financial institution may separately charge fees or foreign-exchange costs.' },
      { label: 'Payment methods', value: 'Payment methods available at checkout may be used.' },
      { label: 'Payment timing', value: 'The initial charge occurs when you subscribe. Recurring plans renew and are charged according to the billing cycle shown at checkout.' },
      { label: 'Service availability', value: 'As a rule, paid functionality becomes available promptly after payment confirmation, excluding time reasonably required for technical processing. Free plans become available after account creation once applicable feature conditions are satisfied.' },
      { label: 'Recurring contracts / automatic renewal', value: 'Monthly and other recurring plans automatically renew on the billing cycle shown at checkout. You may cancel before the next renewal through the account or billing-management interface. Unless otherwise stated, access continues through the end of the paid period.' },
      { label: 'Cancellation / refunds', value: 'Because the Service is digital, there are no returns after service delivery begins. Recurring subscriptions may be cancelled to stop future renewals. Fees already paid are not refunded except where required by law or expressly stated at checkout or elsewhere by PicoSvc.' },
      { label: 'Application period', value: 'If an offer has a limited application period, that period is displayed on the relevant page and checkout screen. If no period is displayed, there is no special application deadline.' },
      { label: 'Technical requirements', value: 'An internet connection is required. The web dashboard targets current major browsers. API, Webhook, MCP, and other products are subject to the technical requirements, usage limits, rate limits, and other conditions stated on product pages or documentation.' },
      { label: 'Special sales conditions', value: 'Each product is generally contracted separately. Purchasing a paid plan for one product does not automatically make another product paid. A Bundle applies only to the products, plans, and quotas expressly shown at checkout.' },
      { label: 'Disclosure of other statutory information', value: 'Information that may lawfully be disclosed upon request will be provided without undue delay after a request so that it can be reviewed before a purchase decision. Please make requests through Contact & Support.' },
    ] as Entry[]
  },
  'zh-CN': {
    title: '日本《特定商业交易法》信息披露',
    note: '本页为方便阅读的参考翻译。作为日本法相关披露，以日文版本为正式版本。',
    entries: [
      { label: '运营者', value: '个体经营者 Y&T' },
      { label: '销售/服务提供者法定姓名', value: '收到请求后，通过邮箱或其他适当方式及时披露。' },
      { label: '营业地址', value: '收到请求后，通过邮箱或其他适当方式及时披露。' },
      { label: '联系方式', contact: true },
      { label: '价格 / 服务费用', value: '显示在各 PicoSvc 产品页面以及购买/申请的最终确认页面。每个产品都有独立套餐、价格和使用上限。若销售 Bundle，结账页面会显示所含产品、授予的套餐或配额、价格及合同周期。' },
      { label: '价格以外的费用', value: '网络接入费、通信费及其他由用户侧产生的费用由用户承担。支付服务商、发卡机构或金融机构可能另行收取手续费或汇率相关费用。' },
      { label: '支付方式', value: '可使用结账页面显示的支付方式。' },
      { label: '支付时间', value: '首次订阅时收费；持续订阅套餐会按照结账页面显示的计费周期自动续订并收费。' },
      { label: '服务提供时间', value: '原则上在确认付款后，除合理必要的技术处理时间外，将尽快开放付费功能。免费套餐在创建账号并满足相应功能条件后即可使用。' },
      { label: '持续合同 / 自动续订', value: '月费及其他持续订阅套餐按结账页面显示的计费周期自动续订。可在下次续订前通过账号或账单管理页面取消。除另有说明外，取消后可继续使用至已付款周期结束。' },
      { label: '撤销、取消与退款', value: '由于服务属于数字服务，服务开始提供后不接受退货。持续订阅可通过取消未来续订的方式终止。除法律要求或 PicoSvc 在结账等页面明确说明外，已支付费用不予退还。' },
      { label: '申请期限', value: '若申请期间有限制，会在相关页面及结账页面显示。未显示时，不设特别申请截止日期。' },
      { label: '使用条件 / 运行环境', value: '需要互联网连接。Web 控制台以最新主流浏览器为目标环境。API、Webhook、MCP 等产品遵循产品页面或文档所列技术要求、使用上限、rate limit 及其他条件。' },
      { label: '特别销售条件', value: '各产品原则上独立签约。购买一个产品的付费套餐不会自动使其他产品升级为付费。Bundle 仅包含结账页面明确列出的产品、套餐与配额。' },
      { label: '其他法定信息披露', value: '对于依法允许在收到请求后披露的信息，我们会在收到请求后及时提供，以便你在决定购买前进行确认。请通过“联系与支持”提出请求。' },
    ] as Entry[]
  }
} as const;

export default function TokushohoClient() {
  const { locale, messages } = useI18n(); const t = COPY[locale]; const c = messages.common;
  return (
    <main>
      <nav className="nav shell"><a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href="/">{c.products}</a><a href="/contact">{c.contact}</a><a href="/terms">{c.terms}</a><a href="/privacy">{c.privacy}</a><LanguageSwitcher /></div></nav>
      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> {c.legal}</div><h1>{t.title}</h1>{t.note && <div className="notice">{t.note}</div>}
        <div className="legalTable">{t.entries.map((entry) => <section key={entry.label}><h2>{entry.label}</h2>{entry.contact ? <><p>{c.email}</p><ProtectedContact kind="email" /><p>{c.phone}</p><ProtectedContact kind="phone" /></> : <p>{entry.value}</p>}</section>)}</div>
      </article>
    </main>
  );
}
