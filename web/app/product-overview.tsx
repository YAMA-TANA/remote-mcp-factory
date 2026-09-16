import { SERVICE_INFO } from './service-data';
import type { GenericServiceSlug } from './service-data';
import type { Locale } from './i18n-data';
import './product-overview.css';

type Copy = { ja: string; en: string; 'zh-CN': string };
type Product = {
  purpose: Copy;
  example: Copy;
  approach: Copy;
  boundary: Copy;
  alternative: { name: string; url: string; scope: Copy };
};
const t = (ja: string, en: string, zh: string): Copy => ({ ja, en, 'zh-CN': zh });

/** Product statements describe the repository implementation, NOT verified live availability.
 * Competitor statements refer only to the linked primary documentation; no price or superiority claims.
 * Review source pages when editing this content. */
export const PRODUCT_OVERVIEW: Record<GenericServiceSlug | 'mock', Product> = {
  mcp: {
    purpose: t('GitHub上のMCPサーバーをRemote MCPの接続先として公開・管理します。', 'Deploy a GitHub MCP server and manage its remote endpoint.', '部署 GitHub 上的 MCP 服务器并管理远程连接地址。'),
    example: t('リポジトリを指定し、公開／トークン保護を選び、ビルド結果と接続URLを確認します。', 'Enter a repository, choose public or token access, and inspect the build and connection URL.', '输入仓库地址，选择公开或令牌保护，查看构建结果与连接 URL。'),
    approach: t('ソースからのデプロイと、PicoSvcの他サービスを同じアカウントで管理する用途に焦点を当てています。', 'Focuses on deploying from source and managing it alongside other PicoSvc tools in one account.', '侧重源码部署，并在同一账号中管理其他 PicoSvc 工具。'),
    boundary: t('すべての依存ライブラリや実行環境に対応するわけではありません。ビルド・ヘルスチェックと実際の接続確認が必要です。', 'Not every runtime or dependency is supported. Check the build, health check, and actual client connection.', '并非支持所有运行时和依赖；需要检查构建、健康检查及真实客户端连接。'),
    alternative: { name: 'Smithery', url: 'https://smithery.ai/docs/build', scope: t('MCPの公開・発見・接続と利用状況分析に関する機能を案内しています。', 'Documents MCP distribution, discovery, connections, and analytics.', '官方文档介绍 MCP 分发、发现、连接和分析功能。') },
  },
  mock: {
    purpose: t('HTTPメソッド・ステータス・本文を指定して、テスト用の公開APIを作れます。', 'Create a public test API with a configurable HTTP method, status, and body.', '创建可配置 HTTP 方法、状态码和响应正文的公开测试 API。'),
    example: t('GET /hello を作成し、レスポンスJSONを設定して、URLをアプリの開発環境から呼びます。', 'Create GET /hello, set a JSON response, and call its URL from your development app.', '创建 GET /hello，设置 JSON 响应，并从开发应用调用其 URL。'),
    approach: t('単純な固定レスポンスを短時間で用意し、必要に応じて停止・編集する使い方です。', 'Designed for quick fixed responses that can be edited or paused.', '适合快速创建可编辑或暂停的固定响应。'),
    boundary: t('複雑な状態遷移や動的なデータ生成を備えた完全なAPIシミュレーターではありません。', 'Not a full API simulator with complex state transitions or dynamic data generation.', '并非具备复杂状态转换和动态数据生成的完整 API 模拟器。'),
    alternative: { name: 'Mockoon Cloud', url: 'https://mockoon.com/cloud/docs/about/', scope: t('クラウド上のMock API共有、チーム共同作業、AIによるモック生成を案内しています。', 'Documents cloud mock deployment, team collaboration, and AI-assisted mocking.', '官方文档涵盖云端 Mock API、团队协作和 AI 辅助模拟。') },
  },
  hooks: {
    purpose: t('Webhookを受信するURLを作り、リクエストを確認して指定先へ再送できます。', 'Create a webhook URL, inspect incoming requests, and replay them to a destination.', '创建 Webhook 地址、检查收到的请求并重放到指定目标。'),
    example: t('外部サービスのWebhook送信先にInboxのURLを登録し、ヘッダーと本文を確認します。', 'Register an inbox URL with a sender, then inspect the request headers and body.', '将 Inbox 地址配置为发送目标，然后检查请求头和正文。'),
    approach: t('受信・調査・再送の基本フローをPicoSvc内で完結させます。', 'Keeps the receive–inspect–replay workflow in PicoSvc.', '在 PicoSvc 中完成接收、检查和重放的工作流。'),
    boundary: t('送信元の署名検証や本番処理の実装そのものを自動で代行するサービスではありません。', 'Does not replace sender-signature verification or your production webhook handler.', '不能代替发送方签名验证或生产环境的 Webhook 处理程序。'),
    alternative: { name: 'Webhook.site', url: 'https://docs.webhook.site/api/requests.html', scope: t('HTTPリクエストの捕捉・確認・エクスポートなどのAPIを公開しています。', 'Documents request capture, inspection, and export APIs.', '官方文档提供请求捕获、检查和导出 API。') },
  },
  rss: {
    purpose: t('RSSを持たない公開Webページから記事を抽出してフィードを生成します。', 'Turn articles on a public web page into an RSS feed.', '从公开网页提取文章并生成 RSS 订阅源。'),
    example: t('ニュース一覧URLを指定し、必要なら記事・タイトル・リンクのCSSセレクターを設定します。', 'Enter a news listing URL and optionally configure article, title, and link CSS selectors.', '输入新闻列表 URL，可选配置文章、标题和链接的 CSS 选择器。'),
    approach: t('CSSセレクターを指定した場合、初回に記事を抽出できなければ作成失敗を返します。', 'When explicit CSS selectors yield no articles initially, creation reports a failure.', '指定 CSS 选择器后，首次未提取到文章会报告创建失败。'),
    boundary: t('ログイン必須ページ・取得を拒否するサイト・複雑なJS描画ではフィード化できない場合があります。', 'Login-only pages, blocked sites, and complex JavaScript rendering may not extract correctly.', '需要登录、阻止抓取或复杂 JS 渲染的页面可能无法正确提取。'),
    alternative: { name: 'PolitePol', url: 'https://politepol.com/about', scope: t('ビジュアル操作やXPathでWebページからRSSを作る方式を案内しています。', 'Documents visual construction and XPath-based RSS extraction.', '官方介绍可视化构建和基于 XPath 的 RSS 提取。') },
  },
  mail: {
    purpose: t('受信メールをHTTPSのWebhookへ転送するルートを作成します。', 'Route incoming email to an HTTPS webhook.', '将收到的邮件转发到 HTTPS Webhook。'),
    example: t('転送先のURLを登録し、Cloudflare Email Routingの受信設定を行います。', 'Set a webhook destination and configure Cloudflare Email Routing.', '设置 Webhook 目标并配置 Cloudflare Email Routing。'),
    approach: t('メールから自分のアプリへイベントを渡す、小さな受信経路に絞っています。', 'Focuses on a small inbound email-to-app relay.', '专注于将入站邮件转交给应用的轻量流程。'),
    boundary: t('メールの送信・受信ルールのDNS設定は画面だけでは完了しません。メールボックス製品でもありません。', 'Email Routing and DNS still need setup; this is not a mailbox or outbound email suite.', '仍需配置 Email Routing 和 DNS；这不是邮箱或群发邮件服务。'),
    alternative: { name: 'Resend Receiving', url: 'https://resend.com/docs/dashboard/receiving/introduction', scope: t('受信メール・添付ファイルの処理とWebhook通知を案内しています。', 'Documents receiving emails, attachments, and webhook events.', '官方文档介绍邮件接收、附件与 Webhook 事件。') },
  },
  shot: {
    purpose: t('公開ページをブラウザーで描画し、PNGまたはPDFとして取得できます。', 'Render a public page and capture PNG or PDF output.', '渲染公开网页并获取 PNG 或 PDF。'),
    example: t('URLと待機条件を入力し、画面で確認したら専用APIキーでCIから自動撮影します。', 'Choose a URL and wait condition, preview the result, then automate with a scoped API key.', '指定 URL 和等待条件，预览结果后使用专用 API 密钥实现自动截图。'),
    approach: t('単発撮影とスクリプトからの利用に必要な設定を一つの画面にまとめています。', 'Combines an interactive capture console with a dedicated automation key.', '将交互式截图面板与自动化专用密钥结合。'),
    boundary: t('ログイン必須ページ・Bot対策付きページを必ず撮影できるわけではありません。白紙検知も万能ではありません。', 'Login-only or bot-protected pages may fail; blank-image detection is not foolproof.', '需要登录或有反爬保护的页面可能失败；空白检测也不是万能的。'),
    alternative: { name: 'Browserless', url: 'https://docs.browserless.io/rest-apis/screenshot-api', scope: t('Screenshot APIやブラウザーの詳細オプションを公開しています。', 'Documents a screenshot API with browser options and multiple image formats.', '官方文档提供截图 API、浏览器选项和多种图像格式。') },
  },
  fetch: {
    purpose: t('公開URLからMarkdownまたはページのメタデータを抽出します。', 'Extract Markdown or page metadata from a public URL.', '从公开 URL 提取 Markdown 或页面元数据。'),
    example: t('対象URLを入力し、Markdownまたはタイトル・説明などのメタデータを取得します。', 'Enter a URL to obtain Markdown or metadata such as title and description.', '输入 URL，获取 Markdown 或标题、描述等元数据。'),
    approach: t('単一URLの取得に絞り、空応答・形式違い・2MiB超過をエラーとして扱います。', 'Focuses on one URL and rejects empty, unsupported, or over-2-MiB responses.', '专注单个 URL，对空内容、不支持格式或超出 2MiB 的响应报错。'),
    boundary: t('サイト全体のクロール・検索・認証済みページ取得は対象外です。', 'Does not provide site-wide crawling, search, or authenticated-page extraction.', '不提供全站爬取、搜索或已登录页面提取。'),
    alternative: { name: 'Firecrawl', url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', scope: t('単一ページの抽出に加え、構造化抽出などのオプションを案内しています。', 'Documents webpage scraping with structured-extraction options.', '官方文档介绍网页抓取与结构化提取选项。') },
  },
  qr: {
    purpose: t('印刷後でも転送先を変更できるQRコードと短いリンクを作れます。', 'Create a QR code and redirect link with an editable destination.', '创建可修改目标地址的二维码和跳转链接。'),
    example: t('遷移先URLを登録してSVGを印刷し、イベント終了後に転送先を更新します。', 'Set a destination, print the SVG, and update the redirect after an event.', '设置目标地址、打印 SVG，并在活动后更新跳转地址。'),
    approach: t('QRとリダイレクトの基本機能を開発用サービス群と一緒に管理します。', 'Keeps essential QR redirect management alongside developer tools.', '将基础二维码跳转管理与其他开发工具统一管理。'),
    boundary: t('地域・端末別の高度なルーティングやマーケティング分析を約束するものではありません。', 'Does not promise advanced geo/device routing or marketing analytics.', '不承诺高级地区／设备路由或营销分析。'),
    alternative: { name: 'Bitly QR Codes', url: 'https://bitly.com/pages/products/qr-codes', scope: t('QR・短縮リンク・マーケティング分析や動的ルーティングを案内しています。', 'Documents QR codes, short links, analytics, and dynamic routing.', '官方介绍二维码、短链接、分析和动态路由。') },
  },
  cron: {
    purpose: t('UTCのCron式で、指定した公開URLへHTTPリクエストを送ります。', 'Schedule HTTP requests to a public URL with a UTC cron expression.', '使用 UTC Cron 表达式向公开 URL 定时发送 HTTP 请求。'),
    example: t('毎時のヘルスチェックやPOST送信を登録し、実行履歴を確認します。', 'Schedule hourly health checks or POST calls and inspect run history.', '设置每小时健康检查或 POST 请求并查看执行历史。'),
    approach: t('スケジュール・HTTPメソッド・ヘッダー・本文を小さなジョブとして管理します。', 'Manages a compact job with schedule, method, headers, and body.', '将计划、方法、请求头和正文作为轻量任务管理。'),
    boundary: t('長時間処理や配信保証を必要とするキュー基盤そのものではありません。', 'Not a durable queue or long-running workflow platform.', '不是持久化消息队列或长时间工作流平台。'),
    alternative: { name: 'Upstash QStash', url: 'https://upstash.com/docs/qstash/features/schedules', scope: t('スケジュール配信のほか、キュー・コールバックなどの機能を案内しています。', 'Documents scheduled delivery alongside queues and related messaging features.', '官方文档提供定时投递、队列及相关消息功能。') },
  },
  functions: {
    purpose: t('小さなJavaScriptのfetchハンドラーを公開URLで動かします。', 'Deploy a small JavaScript fetch handler to a public URL.', '将轻量 JavaScript fetch 处理程序部署为公开 URL。'),
    example: t('Responseを返す関数コードを登録し、発行された実行URLから呼び出します。', 'Publish code that returns a Response and call its runtime URL.', '发布返回 Response 的函数代码并调用运行地址。'),
    approach: t('小規模な関数をPicoSvcの管理画面から作成する体験に絞っています。', 'Focuses on creating small functions from the PicoSvc dashboard.', '专注通过 PicoSvc 控制台创建小型函数。'),
    boundary: t('任意のNode.jsパッケージや長時間ジョブに対応する汎用ホスティングではありません。', 'Not general-purpose hosting for arbitrary Node.js packages or long-running jobs.', '并非适用于任意 Node.js 依赖或长时间任务的通用托管。'),
    alternative: { name: 'Cloudflare Workers', url: 'https://developers.cloudflare.com/workers/', scope: t('フルスタックアプリ、複数言語、各種Bindingなど幅広い実行環境を案内しています。', 'Documents broader app runtimes, languages, and infrastructure bindings.', '官方文档提供更广泛的运行时、语言和基础设施绑定。') },
  },
  json: {
    purpose: t('Bearerトークンで保護したJSONのキー・バリューストアを作れます。', 'Create a bearer-token-protected JSON key/value store.', '创建由 Bearer 令牌保护的 JSON 键值存储。'),
    example: t('ストア作成時のトークンを保存し、キーごとにJSONをPUT・GETします。', 'Save the one-time token, then PUT and GET JSON by key.', '保存创建时显示的一次性令牌，按键 PUT／GET JSON。'),
    approach: t('小さなJSONドキュメントを、独立したDB構築なしで扱う用途です。', 'Targets small JSON documents without building a separate database.', '适合无需单独建设数据库的小型 JSON 文档。'),
    boundary: t('SQL検索・履歴・複雑なクエリを備えるデータベースではありません。', 'Not a SQL database with rich queries or document version history.', '不是提供复杂查询或文档版本历史的 SQL 数据库。'),
    alternative: { name: 'JSONBin.io', url: 'https://jsonbin.io/api-reference', scope: t('JSONのCRUDに加え、Collectionやスキーマ検証などのAPIを案内しています。', 'Documents JSON CRUD, collections, and schema validation APIs.', '官方文档涵盖 JSON 增删改查、集合与 Schema 验证。') },
  },
  files: {
    purpose: t('ファイル用のスペースを作り、R2を使ってオブジェクトを保存・配信します。', 'Create file spaces and store or deliver objects backed by R2.', '创建文件空间，基于 R2 存储并分发对象。'),
    example: t('スペースを作り、公開範囲を確認して画像や配布ファイルをアップロードします。', 'Create a space, check its access settings, and upload an asset.', '创建空间、确认访问设置并上传文件。'),
    approach: t('小規模な配布ファイルと管理画面を一つの製品としてまとめています。', 'Packages small-file delivery and its dashboard as one service.', '将小文件分发和管理面板组合为一个服务。'),
    boundary: t('R2の全機能・S3互換APIをそのまま公開するサービスではありません。', 'Not a replacement for the full R2 feature set or its S3-compatible API.', '并非完整 R2 功能或 S3 兼容 API 的替代品。'),
    alternative: { name: 'Cloudflare R2', url: 'https://developers.cloudflare.com/r2/', scope: t('オブジェクト保存・S3互換API・バケット設定などを直接提供しています。', 'Documents object storage, S3-compatible access, and bucket configuration.', '官方文档提供对象存储、S3 兼容访问及存储桶配置。') },
  },
  license: {
    purpose: t('アプリ用のライセンスキーを発行・失効・検証できます。', 'Issue, revoke, and validate application license keys.', '发行、撤销并验证应用许可证密钥。'),
    example: t('製品ごとにプロジェクトを作り、購入者へ渡すキーを発行します。', 'Create a project and issue keys to your customers.', '创建项目并向客户发放密钥。'),
    approach: t('キーの基本ライフサイクルと検証APIに範囲を絞っています。', 'Focuses on the basic key lifecycle and validation API.', '专注密钥基本生命周期与验证 API。'),
    boundary: t('複雑な端末単位の認証、オフラインライセンス、課金の代行を保証しません。', 'Does not promise advanced machine locking, offline licensing, or payment processing.', '不承诺高级设备绑定、离线许可或代收付款。'),
    alternative: { name: 'Keygen', url: 'https://keygen.sh/docs/validating-licenses/', scope: t('端末フィンガープリント等を使うライセンス検証を案内しています。', 'Documents license validation with optional machine fingerprints.', '官方文档介绍可选设备指纹的许可证验证。') },
  },
  flags: {
    purpose: t('アプリから取得する機能フラグ・リモート設定を管理します。', 'Manage feature flags and remote configuration for an app.', '管理应用读取的功能开关和远程配置。'),
    example: t('プロジェクトを作り、設定値を登録してアプリから公開設定APIを読みます。', 'Create a project, set values, and read the published configuration from your app.', '创建项目、设置配置值并从应用读取公开配置 API。'),
    approach: t('小さな設定値をHTTP経由で共有するシンプルな用途に合わせています。', 'Targets straightforward HTTP-based distribution of small configuration values.', '面向通过 HTTP 分发小型配置值的简单场景。'),
    boundary: t('高度なターゲティング・段階的ロールアウトや実験分析は対象外です。', 'Does not provide advanced targeting, phased rollout, or experiment analytics.', '不提供高级定向、分阶段发布或实验分析。'),
    alternative: { name: 'LaunchDarkly', url: 'https://launchdarkly.com/docs/api/feature-flags', scope: t('属性別ターゲティングや段階的ロールアウトなどのAPIを案内しています。', 'Documents feature targeting and percentage rollouts.', '官方文档提供功能定向及百分比分批发布。') },
  },
  monitor: {
    purpose: t('Webページの変化を定期確認し、変化や取得失敗の履歴を見られます。', 'Check a page for changes and inspect change and fetch-error history.', '定期检查网页变化并查看变更与抓取错误历史。'),
    example: t('URLと間隔を設定し、必要なら変更通知Webhookを登録します。', 'Set a URL and interval, optionally adding a change-notification webhook.', '设置 URL 和检查间隔，可选配置变化通知 Webhook。'),
    approach: t('ページ内容の変化を知りたい用途で、抽出プレビューと実行履歴を用意しています。', 'Focuses on page-content changes with extraction preview and run history.', '专注页面内容变化，提供提取预览和检查历史。'),
    boundary: t('稼働率SLA・多地域監視・SMS通知の代替ではありません。', 'Not a substitute for uptime SLAs, multi-region checks, or SMS alerts.', '不能替代可用率 SLA、多地域检查或短信警报。'),
    alternative: { name: 'UptimeRobot', url: 'https://uptimerobot.com/website-monitoring/', scope: t('HTTP稼働監視、通知、ステータスページなどを案内しています。', 'Documents uptime checks, alerts, and status pages.', '官方介绍可用率监控、警报与状态页面。') },
  },
  forms: {
    purpose: t('自前のバックエンドなしでフォーム投稿を受け付ける送信先を作れます。', 'Create a submission endpoint for forms without building a dedicated backend.', '无需自建后端即可创建表单提交地址。'),
    example: t('フォームを作成し、発行された投稿先にWebフォームから送信します。', 'Create a form and send submissions from your website to its endpoint.', '创建表单，并从网站向其提交地址发送数据。'),
    approach: t('シンプルな投稿受付とデータ確認に必要な範囲へ絞っています。', 'Focuses on basic form intake and submission inspection.', '专注基础表单接收与提交数据查看。'),
    boundary: t('高度なメールマーケティングやCRMを内蔵する製品ではありません。', 'Not a complete CRM or email-marketing product.', '并非完整 CRM 或邮件营销产品。'),
    alternative: { name: 'Formspree', url: 'https://help.formspree.io/articles/the-forms-api/form-submissions-api', scope: t('フォーム投稿の取得などのAPI機能を案内しています。', 'Documents APIs for retrieving form submissions.', '官方文档介绍获取表单提交数据等 API。') },
  },
};

const LABELS = {
  ja: { eyebrow: 'ログイン不要のサービスガイド', title: 'このサービスでできること', start: '使い方のイメージ', steps: ['作成する', '設定・テストする', 'アプリに組み込む'], comparison: '競合・代替サービスとの違い', ours: 'PicoSvcの対象範囲', other: '公式資料で確認できる範囲', consider: '導入前に確認したいこと', source: '競合の公式資料を見る', disclaimer: '機能範囲の比較です。優劣・価格・稼働率の比較や、本番での動作保証ではありません。競合情報は公式資料を基に2026年9月に確認。', pricing: '料金・利用枠を見る', docs: 'APIの使い方を見る', next: 'ログインして試すには、上のワークスペースをご利用ください。' },
  en: { eyebrow: 'Public product guide · no sign-in required', title: 'What can you do?', start: 'How to get started', steps: ['Create', 'Configure and test', 'Integrate'], comparison: 'Compared with alternatives', ours: 'PicoSvc focus', other: 'In the official alternative documentation', consider: 'Check before choosing', source: 'Read the official docs', disclaimer: 'A comparison of scope, not rankings, current pricing, uptime, or proof of live availability. Alternative documentation reviewed September 2026.', pricing: 'See plans and quotas', docs: 'Read the API guide', next: 'Use the workspace above to sign in and try this service.' },
  'zh-CN': { eyebrow: '公开服务指南 · 无需登录', title: '这个服务能做什么？', start: '如何开始', steps: ['创建', '配置并测试', '接入应用'], comparison: '与同类服务的差异', ours: 'PicoSvc 的侧重点', other: '其他服务官方文档所述', consider: '使用前须知', source: '阅读官方资料', disclaimer: '仅比较功能范围，不代表排名、实时价格、可用率或已通过线上验收。对方官方资料查阅于 2026 年 9 月。', pricing: '查看套餐及限额', docs: '查看 API 指南', next: '登录并试用请使用上方工作台。' },
} as const;

export default function ProductOverview({ service, locale }: { service: GenericServiceSlug | 'mock'; locale: Locale }) {
  const info = SERVICE_INFO[service];
  const profile = PRODUCT_OVERVIEW[service];
  const l = LABELS[locale];
  const prefix = locale === 'zh-CN' ? 'zh-cn' : locale;
  return <section className="productOverview shell" aria-labelledby={`${service}-overview-title`}>
    <div className="productOverviewHeading"><div className="productOverviewGlyph" aria-hidden="true" style={{ backgroundImage: `url('/icons/${service}.svg')` }} /><div><span className="productOverviewEyebrow">{l.eyebrow}</span><h2 id={`${service}-overview-title`}>{l.title} · {info.name}</h2><p>{profile.purpose[locale]}</p></div></div>
    <div className="productOverviewGrid">
      <article className="productOverviewCard"><span className="productOverviewIndex">01 / HOW IT WORKS</span><h3>{l.start}</h3><ol>{l.steps.map((step, i) => <li key={step}><strong>{step}</strong>{i === 0 ? <span>{profile.purpose[locale]}</span> : i === 1 ? <span>{profile.example[locale]}</span> : <span>{profile.approach[locale]}</span>}</li>)}</ol></article>
      <article className="productOverviewCard"><span className="productOverviewIndex">02 / COMPARISON</span><h3>{l.comparison}</h3><div className="productOverviewCompare"><strong>{l.ours}</strong><p>{profile.approach[locale]}</p><strong>{profile.alternative.name} — {l.other}</strong><p>{profile.alternative.scope[locale]}</p></div><a className="productOverviewSource" href={profile.alternative.url} target="_blank" rel="noopener noreferrer">{l.source}: {profile.alternative.name} ↗</a></article>
    </div>
    <aside className="productOverviewCaveat"><strong>{l.consider}</strong><p>{profile.boundary[locale]}</p></aside>
    <p className="productOverviewDisclaimer">{l.disclaimer}</p>
    <div className="productOverviewLinks"><a href={`/${prefix}/pricing/`}>{l.pricing} ↗</a><a href="https://github.com/YAMA-TANA/remote-mcp-factory/blob/main/docs/PICOSVC_API_GUIDE.md" target="_blank" rel="noopener noreferrer">{l.docs} ↗</a></div>
  </section>;
}
