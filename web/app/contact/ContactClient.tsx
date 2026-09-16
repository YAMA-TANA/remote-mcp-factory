'use client';

import ProtectedContact from '../components/ProtectedContact';
import { LanguageSwitcher, useI18n } from '../i18n';

const COPY = {
  en: {
    title: 'Contact & Support', intro: 'PicoSvc is operated by the sole proprietorship Y&T. For product support, billing questions, privacy requests, security-related questions, or requests for statutory business information, use the channels below.',
    emailNote: 'Email is the preferred channel for support and disclosure requests. Do not send passwords, private keys, API secrets, or other credentials.',
    phoneNote: 'Telephone availability may vary. For requests that require a written response or disclosure of statutory information, please use email.',
    disclosureTitle: 'Specified Commercial Transactions Act disclosure requests',
    disclosure1: 'Where information is lawfully omitted from the public statutory disclosure page, including the proprietor’s legal name or business address, it will be provided without undue delay by email or another appropriate written method upon request, with enough time for you to review it before deciding whether to purchase.',
    disclosure2: 'For such a request, contact support and state that you are requesting disclosure of information under Japan’s Specified Commercial Transactions Act.',
    securityTitle: 'Security reports', security: 'If you believe you have found a security issue, include the affected PicoSvc product, endpoint or feature, reproduction steps, and the potential impact. Please avoid accessing data that does not belong to you and do not include live secrets in the report.'
  },
  ja: {
    title: 'お問い合わせ・サポート', intro: 'PicoSvcは個人事業主 Y&T が運営しています。製品サポート、請求・決済、プライバシー請求、セキュリティに関する連絡、または法令上の事業者情報の開示請求は、以下の窓口をご利用ください。',
    emailNote: 'サポートおよび開示請求はメールを推奨します。パスワード、秘密鍵、APIシークレットその他の認証情報は送信しないでください。',
    phoneNote: '電話対応可能時間は一定ではありません。書面での回答や法定情報の開示が必要な場合はメールをご利用ください。',
    disclosureTitle: '特定商取引法に基づく開示請求',
    disclosure1: '販売事業者の氏名・所在地など、法令上公開表示を省略できる事項については、請求があった場合、購入判断前に確認できるよう十分な時間を確保して、電子メールその他適切な書面的方法により遅滞なく開示します。',
    disclosure2: '開示請求の際は、特定商取引法に基づく事業者情報の開示を希望する旨をメールでお知らせください。',
    securityTitle: 'セキュリティ報告', security: 'セキュリティ上の問題を発見したと思われる場合は、対象のPicoSvc製品・endpoint・機能、再現手順、想定される影響をご連絡ください。他人のデータへアクセスする行為は避け、実際に使用中のsecretを報告へ含めないでください。'
  },
  'zh-CN': {
    title: '联系与支持', intro: 'PicoSvc 由个体经营者 Y&T 运营。产品支持、账单问题、隐私请求、安全问题或依法请求披露经营者信息，请使用以下渠道。',
    emailNote: '支持和信息披露请求建议优先使用邮箱。请勿发送密码、私钥、API secret 或其他凭据。',
    phoneNote: '电话可接听时间可能不固定。需要书面回复或法定信息披露时，请使用邮箱。',
    disclosureTitle: '日本《特定商业交易法》信息披露请求',
    disclosure1: '对于依法可以不在公开页面直接显示的信息（例如经营者法定姓名或营业地址），收到请求后，我们会通过邮箱或其他适当书面方式及时披露，并确保你能在决定购买前有充分时间确认。',
    disclosure2: '提出此类请求时，请联系支持并说明你希望依据日本《特定商业交易法》获取经营者信息。',
    securityTitle: '安全问题报告', security: '如果你认为发现了安全问题，请提供受影响的 PicoSvc 产品、endpoint 或功能、复现步骤以及潜在影响。请避免访问不属于你的数据，也不要在报告中包含正在使用的 secret。'
  }
} as const;

export default function ContactClient() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale]; const c = messages.common;
  return (
    <main>
      <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/terms')}>{c.terms}</a><a href={localizedHref('/privacy')}>{c.privacy}</a><LanguageSwitcher /></div></nav>
      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> {c.support}</div><h1>{t.title}</h1><p>{t.intro}</p>
        <h2>{c.email}</h2><ProtectedContact kind="email" /><p className="legalMeta">{t.emailNote}</p>
        <h2>{c.phone}</h2><ProtectedContact kind="phone" /><p className="legalMeta">{t.phoneNote}</p>
        <h2>{t.disclosureTitle}</h2><p>{t.disclosure1}</p><p>{t.disclosure2}</p>
        <h2>{t.securityTitle}</h2><p>{t.security}</p>
      </article>
    </main>
  );
}
