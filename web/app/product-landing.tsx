import type { Locale } from './i18n-data';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';
import { PICOSVC_PRICING, PICOSVC_QUOTAS } from './pricing-data';
import { PRODUCT_OVERVIEW } from './product-overview';
import './product-landing.css';

type Slug = GenericServiceSlug | 'mock';
type Copy = { ja: string; en: string; 'zh-CN': string };
const t = (ja: string, en: string, zh: string): Copy => ({ ja, en, 'zh-CN': zh });

/** Only customer prerequisites belong here. Platform DNS/mail routing is an operator task. */
const PREPARE: Record<Slug, Copy> = {
  mcp: t('GitHubリポジトリを用意します。非公開リポジトリはGitHub連携が必要です。','Prepare a GitHub repository; private repositories also require GitHub access.','准备 GitHub 仓库；私有仓库还需要 GitHub 授权。'),
  mock: t('返したいHTTPメソッド、パス、ステータス、本文を決めます。','Decide the response method, path, status, and body.','确定响应方法、路径、状态码及正文。'),
  hooks: t('イベントを送信するサービスを用意します。自分の受信サーバーは不要です。','Have a service that sends webhooks. You do not need to host an inbox.','准备发送 Webhook 的服务；无需自行托管收件端。'),
  rss: t('記事へのリンクがある、公開WebページのURLを用意します。','Prepare a public page URL that links to articles.','准备包含文章链接的公开网页 URL。'),
  mail: t('メールの転送先となるWebhook URLを用意します。自前のサーバーがなければPicoSvc Hooksで受信先を作れます。自分のドメインやメール用DNSの設定は不要です。','Prepare a webhook destination. You can create one with PicoSvc Hooks instead of hosting a server. No domain or mail DNS setup is required from you.','准备 Webhook 接收地址；也可使用 PicoSvc Hooks，无需自建服务器、域名或邮件 DNS 配置。'),
  shot: t('撮影する公開ページのURLを用意します。','Prepare the public URL you want to capture.','准备需要截图的公开网页 URL。'),
  fetch: t('ログイン不要で閲覧できるページのURLを用意します。','Prepare a page URL that does not require login.','准备无需登录即可访问的网页 URL。'),
  qr: t('QRコードの遷移先URLを用意します。','Prepare the URL your QR code should open.','准备二维码要跳转的目标 URL。'),
  cron: t('アクセス可能な送信先URLとUTCのCron式を決めます。','Prepare a reachable target URL and a UTC cron expression.','准备可访问的目标 URL 和 UTC Cron 表达式。'),
  functions: t('HTTPリクエストを処理する小さなJavaScript関数を用意します。','Prepare a small JavaScript function that handles HTTP requests.','准备处理 HTTP 请求的小型 JavaScript 函数。'),
  json: t('作成後、一度だけ表示されるBearerトークンを安全に保存してください。','Safely save the bearer token shown once when the store is created.','妥善保存创建存储时仅显示一次的 Bearer 令牌。'),
  files: t('アップロードするファイルと公開・非公開の扱いを決めます。ストレージ基盤の契約は不要です。','Choose your files and whether they should be public or private. No separate storage account is required.','选择文件及公开范围，无需单独开通存储账号。'),
  license: t('ライセンスキーを発行する製品を決めます。','Choose the product you want to license.','确定需要发放许可证的产品。'),
  flags: t('アプリから参照する設定値を決めます。公開設定に秘密情報を入れないでください。','Decide which settings your app will read; do not put secrets in public flags.','确定应用需要读取的设置，不要在公开配置中放入秘密信息。'),
  monitor: t('変化を調べる公開ページのURLを用意します。通知先は任意です。','Prepare the public page URL; a notification destination is optional.','准备要监测的公开网页 URL；通知地址为可选。'),
  forms: t('フォームの入力項目を決めます。独自の投稿処理サーバーは不要です。','Choose your form fields. You do not need to host a submission backend.','确定表单字段，无需自建提交后端。'),
};

const SECOND_EXAMPLE: Record<Slug, Copy> = {
  mcp: t('更新したMCPのビルド結果を確認する。','Check build results after updating your MCP.','更新 MCP 后检查构建结果。'),
  mock: t('404や500を返して、エラー画面をテストする。','Return 404 or 500 to test error handling.','返回 404 或 500 测试错误处理。'),
  hooks: t('保存したWebhookイベントを開発環境へ再送する。','Replay a captured webhook to your development handler.','将已捕获的 Webhook 重放到开发环境。'),
  rss: t('記事ごとにCSSセレクターを設定して抽出を調整する。','Tune extraction with article-specific CSS selectors.','使用文章 CSS 选择器调整提取结果。'),
  mail: t('PicoSvc Hooksを宛先にして、受信メールのイベントを画面で確認する。','Use PicoSvc Hooks as the destination to inspect email events without your own server.','使用 PicoSvc Hooks 接收并查看邮件事件，无需自建服务器。'),
  shot: t('撮影した画像やPDFをレビュー・CIに利用する。','Use captured images or PDFs for reviews and CI.','将截图或 PDF 用于审核和 CI。'),
  fetch: t('リンク先のタイトルと説明文を取得する。','Extract a link title and description.','提取链接标题和说明。'),
  qr: t('印刷したQRコードを変えずに遷移先だけ更新する。','Update a printed QR code’s destination without reprinting.','无需重新印刷即可修改二维码的目标地址。'),
  cron: t('定期実行の成功・失敗を履歴で確認する。','Inspect the run history for failures.','通过执行记录检查任务是否失败。'),
  functions: t('小さなJSON変換処理をAPIとして公開する。','Publish a small JSON transformation as an API.','将小型 JSON 转换功能发布为 API。'),
  json: t('サーバーからJSONドキュメントを読み書きする。','Read and write JSON documents from your server.','从服务器读取和写入 JSON 文档。'),
  files: t('配布用アセットをファイルURLで共有する。','Share distribution assets via file URLs.','通过文件 URL 分享资源。'),
  license: t('無効にしたキーが検証時に拒否されることを確認する。','Check that a revoked key fails validation.','检查已撤销的密钥无法通过验证。'),
  flags: t('開発と本番で別の設定プロジェクトを使う。','Keep separate settings for development and production.','为开发和生产使用不同的配置项目。'),
  monitor: t('変更と取得エラーを履歴で区別する。','Distinguish changes from fetch errors in the history.','在记录中区分内容变化和抓取失败。'),
  forms: t('問い合わせやアンケートの投稿を管理画面で確認する。','Inspect contact or survey submissions in the dashboard.','在控制台查看联系表单或问卷提交。'),
};

const UI = {
  ja: { products:'全サービス', plans:'料金・利用枠', guide:'サービスガイド', try:'今すぐ使う', details:'機能・料金・比較を詳しく見る', intro:'できることを確認して、すぐに試せます。', examples:'こんな場面で使えます', prepare:'始める前に準備すること', steps:'使い始めるまでの3ステップ', step1:'ログインして作成', step2:'設定・テスト', step3:'アプリに組み込む', features:'このサービスでできること', comparison:'競合・代替サービスとの違い', ours:'PicoSvcの対象範囲', theirs:'競合の公式資料で確認できる範囲', source:'公式資料を見る', limits:'利用前に知っておきたいこと', price:'料金と利用枠', note:'表示はコード上のプランです。実際の購入条件は決済画面で確認してください。', faq:'よくある質問', q1:'自分でサーバーやドメインを用意しますか？', q2:'すぐに使えますか？', a2:'コード上の機能説明です。本番環境での提供状況・疎通・利用枠は実際のサービスで確認してください。', q3:'ログイン前に何が見られますか？', a3:'紹介、利用枠、競合との機能範囲はログイン不要です。作成や利用履歴の確認にはログインが必要です。', mailStatus:'メール受信アドレスはPicoSvcが発行します。受信が可能になるのは運営側のメール受信設定と実際の配送テストが完了してからです。', disclaimer:'競合は機能範囲のみ比較しています。価格・性能・稼働率の優劣を示すものではありません。', docs:'APIの使い方', next:'上の操作画面へ戻る' },
  en: { products:'All products', plans:'Pricing & quotas', guide:'Product guide', try:'Try it now', details:'Explore features, plans & comparisons', intro:'See what it does and get straight to work.', examples:'Example use cases', prepare:'What to prepare', steps:'Get started in three steps', step1:'Sign in and create', step2:'Configure and test', step3:'Integrate', features:'What this service does', comparison:'Compared with alternatives', ours:'PicoSvc focus', theirs:'In the alternative’s official documentation', source:'Read official docs', limits:'What to know first', price:'Plans and quotas', note:'These are code-configured plans. Confirm actual purchase terms at checkout.', faq:'Frequently asked questions', q1:'Do I need my own server or domain?', q2:'Is it ready to use?', a2:'These features reflect repository code. Check actual service availability, connectivity, and quotas in the deployed environment.', q3:'What can I see without signing in?', a3:'This guide, quotas, and comparisons are public. Creating resources and viewing usage require sign-in.', mailStatus:'PicoSvc issues the receiving address. Email delivery requires the operator to finish inbound-mail setup and verify a real delivery first.', disclaimer:'This compares feature scope only, not superiority in price, performance, or uptime.', docs:'API guide', next:'Back to workspace' },
  'zh-CN': { products:'所有服务', plans:'价格与配额', guide:'服务指南', try:'立即使用', details:'查看功能、价格和对比', intro:'了解功能后即可开始使用。', examples:'典型使用场景', prepare:'开始前需要准备', steps:'三步开始', step1:'登录并创建', step2:'配置并测试', step3:'接入应用', features:'这个服务能做什么', comparison:'与同类服务的差异', ours:'PicoSvc 的侧重点', theirs:'其他服务官方文档所述', source:'阅读官方资料', limits:'使用前须知', price:'套餐及配额', note:'此处显示代码中配置的套餐，购买条件以结账页面为准。', faq:'常见问题', q1:'需要自己准备服务器或域名吗？', q2:'现在可以直接使用吗？', a2:'功能说明基于仓库代码，实际服务可用性、连接及配额仍需在部署环境验证。', q3:'不登录可以查看什么？', a3:'本指南、配额和比较均可公开查看；创建资源和查看使用量需登录。', mailStatus:'PicoSvc 负责发放收件地址。运营方须先完成邮件接收配置并验证真实投递。', disclaimer:'仅比较功能范围，不代表价格、性能或稳定性优劣。', docs:'API 使用指南', next:'返回工作台' },
} as const;

const ALTERNATIVE_OVERRIDES = {
  functions: { name: 'Vercel Functions', url: 'https://vercel.com/docs/functions', scope: t('アプリやAPI向けのサーバー側関数とスケーリングを案内しています。','Documents server-side functions and scaling for apps and APIs.','官方文档介绍应用和 API 的服务端函数及扩缩容。') },
  files: { name: 'Supabase Storage', url: 'https://supabase.com/docs/guides/storage', scope: t('ファイルの保存・配信、公開・非公開バケット、アクセス制御を案内しています。','Documents file storage and delivery, public/private buckets, and access controls.','官方文档介绍文件存储、分发、公开／私有存储桶和访问控制。') },
} as const;

export function ProductIntro({ service, locale }: { service: Slug; locale: Locale }) {
  const copy = UI[locale];
  const info = SERVICE_INFO[service];
  const profile = PRODUCT_OVERVIEW[service];
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  return <header id="product-guide" className="productLanding productIntro">
    <nav className="productLandingNav shell" aria-label={copy.guide}>
      <a className="productLandingBrand" href={`/${lang}/`}><span className="productLandingLogo" aria-hidden="true"/>PicoSvc</a>
      <div className="productLandingNavLinks"><a href={`/${lang}/`}>{copy.products}</a><a href={`/${lang}/pricing/`}>{copy.plans}</a><a className="productLandingNavTry" href="#workspace">{copy.try} ↓</a></div>
    </nav>
    <div className="shell productIntroInner"><span className="productLandingIcon" aria-hidden="true" style={{backgroundImage:`url('/icons/${service}.svg')`}}/><div className="productIntroCopy"><span className="productLandingEyebrow">PICOSVC / {info.name.toUpperCase()}</span><h1>{info.name}</h1><p>{service === 'files' ? t('ファイルを保存・配信するスペースを作成できます。','Create a space to store and deliver your files.','创建文件空间，保存并分发文件。')[locale] : profile.purpose[locale]}</p><div className="productLandingCtas"><a className="productLandingPrimary" href="#workspace">{copy.try} ↓</a><a href="#product-features">{copy.details} ↓</a></div></div></div>
  </header>;
}

export default function ProductLanding({ service, locale }: { service: Slug; locale: Locale }) {
  const copy = UI[locale];
  const info = SERVICE_INFO[service];
  const profile = PRODUCT_OVERVIEW[service];
  const alt = service === 'functions' || service === 'files' ? ALTERNATIVE_OVERRIDES[service] : profile.alternative;
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const quota = PICOSVC_QUOTAS.find(item => item.service === info.name);
  const purpose = service === 'files' ? t('ファイルを保存・配信するスペースを作成できます。','Create a space to store and deliver your files.','创建文件空间，保存并分发文件。')[locale] : profile.purpose[locale];
  const boundary = service === 'files' ? t('大容量ファイルや高度な画像変換には対応していません。公開範囲を確認してください。','Large-file workflows and advanced image processing are outside the current scope; check access settings.','目前不支持大文件流程或高级图像处理；请确认访问权限。')[locale] : profile.boundary[locale];
  return <div className="productLanding productLandingDetails"><div className="shell productLandingContent">
    <div className="productLandingJump" aria-label={copy.guide}><a href="#workspace">↑ {copy.next}</a><a href="#product-use-cases">{copy.examples} ↓</a><a href="#product-comparison">{copy.comparison} ↓</a><a href="#product-faq">{copy.faq} ↓</a></div>
    <section id="product-features" className="productLandingSection" aria-labelledby="product-features-title"><div className="productLandingSectionHead"><span>01 / FEATURES</span><h2 id="product-features-title">{copy.features} · {info.name}</h2></div><div className="productLandingFeatureGrid"><article><span>01</span><p>{purpose}</p></article><article><span>02</span><p>{profile.example[locale]}</p></article><article><span>03</span><p>{profile.approach[locale]}</p></article></div></section>
    <section id="product-use-cases" className="productLandingSection" aria-labelledby="product-use-cases-title"><div className="productLandingSectionHead"><span>02 / USE CASES</span><h2 id="product-use-cases-title">{copy.examples}</h2></div><div className="productLandingCases"><article><span>01</span><p>{profile.example[locale]}</p></article><article><span>02</span><p>{SECOND_EXAMPLE[service][locale]}</p></article></div><aside className="productLandingSetup"><strong>{copy.prepare}</strong><p>{PREPARE[service][locale]}</p>{service === 'mail' && <p>{copy.mailStatus}</p>}{service === 'mail' && <a href={`/${lang}/hooks/`}>PicoSvc Hooks ↗</a>}</aside></section>
    <section className="productLandingSection" aria-labelledby="product-steps-title"><div className="productLandingSectionHead"><span>03 / QUICK START</span><h2 id="product-steps-title">{copy.steps}</h2></div><ol className="productLandingSteps"><li><strong>{copy.step1}</strong><p>{PREPARE[service][locale]}</p></li><li><strong>{copy.step2}</strong><p>{profile.example[locale]}</p></li><li><strong>{copy.step3}</strong><p>{profile.approach[locale]}</p></li></ol></section>
    {quota && <section className="productLandingSection" aria-labelledby="product-pricing-title"><div className="productLandingSectionHead"><span>04 / PLANS</span><h2 id="product-pricing-title">{copy.price}</h2></div><div className="productLandingPlans"><article><strong>Free</strong><span>$0</span><p>{quota.free}</p></article><article><strong>Pico</strong><span>${PICOSVC_PRICING.standalone.pico} / mo</span><p>{quota.pico}</p></article><article><strong>PicoPlus</strong><span>${PICOSVC_PRICING.standalone.picoPlus} / mo</span><p>{quota.picoPlus}</p></article></div><p className="productLandingFootnote">{copy.note}</p></section>}
    <section id="product-comparison" className="productLandingSection" aria-labelledby="product-comparison-title"><div className="productLandingSectionHead"><span>05 / ALTERNATIVES</span><h2 id="product-comparison-title">{copy.comparison}</h2></div><div className="productLandingCompare"><article><span>PICOSVC / {info.name.toUpperCase()}</span><h3>{copy.ours}</h3><p>{profile.approach[locale]}</p></article><article><span>{alt.name}</span><h3>{copy.theirs}</h3><p>{alt.scope[locale]}</p><a href={alt.url} target="_blank" rel="noopener noreferrer">{copy.source}: {alt.name} ↗</a></article></div><aside className="productLandingBoundary"><strong>{copy.limits}</strong><p>{boundary}</p></aside><p className="productLandingFootnote">{copy.disclaimer}</p></section>
    <section id="product-faq" className="productLandingSection" aria-labelledby="product-faq-title"><div className="productLandingSectionHead"><span>06 / FAQ</span><h2 id="product-faq-title">{copy.faq}</h2></div><div className="productLandingFaq"><details><summary>{copy.q1}</summary><p>{PREPARE[service][locale]}</p></details><details><summary>{copy.q2}</summary><p>{copy.a2}{service === 'mail' ? ` ${copy.mailStatus}` : ''}</p></details><details><summary>{copy.q3}</summary><p>{copy.a3}</p></details></div></section>
    <footer className="productLandingEnd"><a className="productLandingPrimary" href="#workspace">↑ {copy.next}</a><a href="https://github.com/YAMA-TANA/remote-mcp-factory/blob/main/docs/PICOSVC_API_GUIDE.md" target="_blank" rel="noopener noreferrer">{copy.docs} ↗</a><a href={`/${lang}/pricing/`}>{copy.plans} ↗</a></footer>
  </div></div>;
}
