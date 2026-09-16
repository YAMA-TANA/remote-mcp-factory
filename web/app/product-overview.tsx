import { SERVICE_INFO } from './service-data';
import type { GenericServiceSlug } from './service-data';
import type { Locale } from './i18n-data';
import './product-overview.css';

type Copy = { ja: string; en: string; 'zh-CN': string };
type Product = { purpose: Copy; example: Copy; approach: Copy; boundary: Copy; alternative: { name: string; url: string; scope: Copy } };
const t = (ja: string, en: string, zh: string): Copy => ({ ja, en, 'zh-CN': zh });

/** Customer-facing facts describe implemented capabilities, not verified production availability.
 * Competitor details describe the linked official documents, never performance or price superiority. */
export const PRODUCT_OVERVIEW: Record<GenericServiceSlug | 'mock', Product> = {
  mcp: {
    purpose: t('GitHubのMCPサーバーをRemote MCPとして公開・管理できます。','Deploy a GitHub MCP server and manage a remote endpoint.','部署 GitHub MCP 服务器并管理远程连接地址。'),
    example: t('リポジトリを指定し、公開・トークン保護を選んで接続URLを確認します。','Choose a repository and access mode, then inspect its connection URL.','选择仓库及访问模式，查看连接 URL。'),
    approach: t('ソースからのデプロイと他のPicoSvcサービスの一元管理に焦点を当てています。','Focuses on source deployment alongside other PicoSvc tools.','专注源码部署并统一管理 PicoSvc 工具。'),
    boundary: t('すべての依存ライブラリに対応するわけではありません。ビルド・接続の確認が必要です。','Not all dependencies are supported; verify builds and client connectivity.','并非支持所有依赖，请验证构建与客户端连接。'),
    alternative: { name:'Smithery', url:'https://smithery.ai/docs/build', scope:t('MCPの配布・発見・接続方法を案内しています。','Documents MCP distribution, discovery and connections.','官方文档介绍 MCP 分发、发现和连接。') },
  },
  mock: {
    purpose: t('HTTPメソッド・ステータス・本文を指定して、テスト用APIを作成できます。','Create a test API with configurable method, status and response body.','创建可配置请求方法、状态码和响应内容的测试 API。'),
    example: t('GET /helloを作り、固定JSONをアプリから呼び出します。','Create GET /hello with fixed JSON for your app.','创建返回固定 JSON 的 GET /hello 接口。'),
    approach: t('固定レスポンスを手軽に作成・編集・停止する用途です。','Focuses on quickly creating, editing and pausing fixed responses.','用于快速创建、编辑和暂停固定响应。'),
    boundary: t('複雑な状態遷移や動的なデータ生成を備える完全なAPIシミュレーターではありません。','Not a full API simulator with complex state transitions or generated data.','并非具备复杂状态转换或动态数据生成的完整模拟器。'),
    alternative: { name:'Mockoon Cloud', url:'https://mockoon.com/cloud/docs/about/', scope:t('モックの共有やチームでの利用を案内しています。','Documents shared mocks and team workflows.','官方介绍共享模拟接口和团队工作流程。') },
  },
  hooks: {
    purpose: t('Webhookを受信・確認し、指定先へ再送できます。','Receive, inspect and replay webhooks.','接收、检查并重放 Webhook。'),
    example: t('受信URLを送信元に設定し、ヘッダーと本文を確認します。','Register an inbox URL and inspect incoming headers and bodies.','配置收件地址并查看请求头和内容。'),
    approach: t('受信・調査・再送を一つの画面で扱います。','Combines capture, inspection and replay in one workspace.','在同一工作台中接收、查看并重放。'),
    boundary: t('送信元の署名検証や本番処理を自動で代行するものではありません。','Does not replace sender signature verification or a production handler.','不能取代发送方签名验证或生产处理程序。'),
    alternative: { name:'Webhook.site', url:'https://docs.webhook.site/api/requests.html', scope:t('HTTPリクエストの捕捉・確認APIを案内しています。','Documents APIs for capturing and inspecting HTTP requests.','官方文档介绍捕获和查看 HTTP 请求的 API。') },
  },
  rss: {
    purpose: t('公開Webページから記事を抽出し、RSSフィードを生成します。','Turn articles on a public page into an RSS feed.','从公开网页提取文章并生成 RSS。'),
    example: t('一覧ページのURLと、必要なら記事のCSSセレクターを指定します。','Choose a listing URL and optional article CSS selectors.','指定列表 URL 和可选的文章 CSS 选择器。'),
    approach: t('単一ページからの記事抽出と定期更新に焦点を当てています。','Focuses on extraction and periodic updates for a listing page.','专注列表页面提取与定期更新。'),
    boundary: t('ログイン必須ページや取得を拒否するサイトでは抽出できない場合があります。','Login-only or blocked sites may not extract successfully.','需要登录或禁止抓取的网站可能无法提取。'),
    alternative: { name:'PolitePol', url:'https://politepol.com/about', scope:t('画面上の操作やXPathによるRSS作成を案内しています。','Documents visual and XPath-based RSS creation.','官方介绍可视化及 XPath RSS 创建。') },
  },
  mail: {
    purpose: t('PicoSvcが発行するメールアドレスへの受信メールをWebhookへ転送します。','Forward mail arriving at a PicoSvc-issued address to your webhook.','将发送到 PicoSvc 所发邮箱地址的邮件转发至 Webhook。'),
    example: t('ログインしてメールルートを作成し、発行されたアドレスと転送先を確認します。','Create a mail route, then copy the issued address and confirm its webhook destination.','创建邮件路由，复制分配的地址并确认 Webhook 接收端。'),
    approach: t('メール受信イベントをアプリへ渡す小さな連携機能です。','Focuses on relaying inbound email events to your app.','专注将入站邮件事件转发给应用。'),
    boundary: t('顧客のドメインやメールDNS設定は不要です。Webhookの転送先は必要ですがPicoSvc Hooksを利用できます。実際の受信は運営側のメール設定と配送テストが完了してから利用可能です。','You do not need your own domain or mail DNS. A webhook destination is needed, and PicoSvc Hooks is an option. Inbound mail must be configured and delivery-tested by the operator before use.','无需自有域名或邮件 DNS；需要 Webhook 接收端，也可使用 PicoSvc Hooks。运营方完成收件配置和真实投递验证后方可使用。'),
    alternative: { name:'Resend Receiving', url:'https://resend.com/docs/dashboard/receiving/introduction', scope:t('メールの受信・添付ファイル処理とWebhook通知を案内しています。','Documents email receiving, attachments and webhook events.','官方文档介绍邮件接收、附件和 Webhook 事件。') },
  },
  shot: {
    purpose: t('公開WebページをPNGまたはPDFとして取得できます。','Capture public pages as PNG or PDF.','将公开网页保存为 PNG 或 PDF。'),
    example: t('URLと撮影タイミングを設定し、画像を確認して専用キーで自動化します。','Set a URL and capture timing, inspect the output, then automate with a scoped key.','设置 URL 和截图时机，查看结果并使用专用密钥自动化。'),
    approach: t('画面での単発撮影とスクリプトによる自動撮影を扱います。','Combines interactive captures with scripted automation.','结合交互式截图和脚本自动化。'),
    boundary: t('ログイン必須・Bot対策付きページや白紙検知に制約があります。','Login-only and bot-protected pages may fail; blank detection has limits.','需要登录或有反爬保护的页面可能失败；空白检测存在局限。'),
    alternative: { name:'Browserless', url:'https://docs.browserless.io/rest-apis/screenshot-api', scope:t('Screenshot APIと撮影オプションを案内しています。','Documents screenshot APIs and browser options.','官方文档介绍截图 API 与浏览器参数。') },
  },
  fetch: {
    purpose: t('公開URLからMarkdownやメタデータを取得します。','Extract Markdown or metadata from a public URL.','从公开 URL 提取 Markdown 或元数据。'),
    example: t('記事URLを入力し、Markdownまたはタイトル・説明を取得します。','Enter an article URL to obtain Markdown or title and description.','输入文章 URL 获取 Markdown 或标题与说明。'),
    approach: t('単一URLの抽出に焦点を当てています。','Focuses on extraction from one URL.','专注单个 URL 的内容提取。'),
    boundary: t('サイト全体のクロール・検索・ログイン必須ページ取得には対応しません。','No site-wide crawl, search or authenticated-page extraction.','不提供全站爬取、搜索或登录页面提取。'),
    alternative: { name:'Firecrawl', url:'https://docs.firecrawl.dev/api-reference/endpoint/scrape', scope:t('ページ取得と構造化抽出オプションを案内しています。','Documents scraping and structured extraction options.','官方文档介绍网页抓取与结构化提取。') },
  },
  qr: {
    purpose: t('転送先を後から変更できるQRコードを作成できます。','Create a QR code with an editable redirect destination.','创建可修改跳转地址的二维码。'),
    example: t('遷移先URLを設定してSVGを印刷し、後で転送先を変更します。','Set a target URL, print the SVG, then change the destination later.','设置目标地址、打印 SVG，之后修改跳转地址。'),
    approach: t('QR生成とリンク転送の基本機能に焦点を当てています。','Focuses on essential QR generation and redirects.','专注基础二维码生成和跳转。'),
    boundary: t('地域・端末別の高度なルーティングや分析は対象外です。','Advanced geo/device routing and analytics are outside scope.','不支持高级地域／设备路由或分析。'),
    alternative: { name:'Bitly QR Codes', url:'https://bitly.com/pages/products/qr-codes', scope:t('QRコード・短縮リンク・分析を案内しています。','Documents QR codes, short links and analytics.','官方介绍二维码、短链接及分析。') },
  },
  cron: {
    purpose: t('UTCのCron式で公開URLへHTTPリクエストを定期送信します。','Schedule HTTP requests to a public URL with UTC cron.','按 UTC Cron 表达式定时向公开 URL 发送 HTTP 请求。'),
    example: t('定期POSTやヘルスチェックを登録し、実行履歴を確認します。','Schedule a POST or health check and inspect run history.','配置定时 POST 或健康检查并查看执行记录。'),
    approach: t('HTTPメソッド・ヘッダー・本文を小さなジョブとして管理します。','Manage method, headers and body as a small scheduled job.','将方法、请求头和正文作为轻量任务管理。'),
    boundary: t('実行時刻の厳密な保証や任意の長時間処理を提供するものではありません。','Does not guarantee exact execution times or arbitrary long-running jobs.','不保证精确执行时间或任意长时间任务。'),
    alternative: { name:'Upstash QStash', url:'https://upstash.com/docs/qstash/features/schedules', scope:t('HTTPメッセージのスケジュール機能を案内しています。','Documents scheduled HTTP messages.','官方文档介绍定时 HTTP 消息。') },
  },
  functions: {
    purpose: t('小さなJavaScriptのHTTP関数を公開・管理します。','Publish and manage small JavaScript HTTP functions.','发布并管理轻量 JavaScript HTTP 函数。'),
    example: t('fetch(request)がResponseを返すコードを登録します。','Publish code with a fetch(request) handler that returns a Response.','发布含有返回 Response 的 fetch(request) 处理程序的代码。'),
    approach: t('小規模な関数の公開と管理に焦点を当てています。','Focuses on publishing and managing small functions.','专注发布和管理小型函数。'),
    boundary: t('任意の言語・依存関係や長時間処理を備えるフル機能の実行環境ではありません。','Not a full runtime for arbitrary languages, dependencies or long jobs.','不是支持任意语言、依赖和长任务的完整运行时。'),
    alternative: { name:'Vercel Functions', url:'https://vercel.com/docs/functions', scope:t('アプリやAPIのサーバー側関数とスケーリングを案内しています。','Documents server-side functions and scaling for apps and APIs.','官方文档介绍应用和 API 的服务端函数及扩缩容。') },
  },
  json: {
    purpose: t('Bearerトークンで保護したJSONのキー・バリューストアを作成できます。','Create a bearer-protected JSON key/value store.','创建 Bearer 令牌保护的 JSON 键值存储。'),
    example: t('作成時のトークンを保存して、キーごとにJSONを読み書きします。','Save the one-time token and read or write JSON by key.','保存一次性令牌并按键读写 JSON。'),
    approach: t('小さなJSONドキュメントを簡単に扱う用途です。','Targets lightweight JSON document storage.','面向轻量 JSON 文档存储。'),
    boundary: t('SQL検索や複雑なクエリを備えたデータベースではありません。','Not a SQL database with rich query capabilities.','不是支持复杂查询的 SQL 数据库。'),
    alternative: { name:'JSONBin.io', url:'https://jsonbin.io/api-reference', scope:t('JSONのCRUDやコレクションのAPIを案内しています。','Documents JSON CRUD and collection APIs.','官方文档介绍 JSON CRUD 和集合 API。') },
  },
  files: {
    purpose: t('ファイルを保存・配信するスペースを作成できます。','Create spaces for storing and delivering files.','创建用于存储和分发文件的空间。'),
    example: t('スペースを作り、公開範囲を確認してファイルをアップロードします。','Create a space, check access settings and upload files.','创建空间、检查权限并上传文件。'),
    approach: t('小さなファイルの保存・配信と管理画面を提供します。','Packages small-file storage and delivery with a dashboard.','提供小文件存储、分发及管理面板。'),
    boundary: t('大容量ファイルや高度な画像処理、汎用のストレージ管理機能は対象外です。','Large-file workflows, advanced image processing and full storage administration are outside scope.','不提供大文件流程、高级图像处理或完整存储管理。'),
    alternative: { name:'Supabase Storage', url:'https://supabase.com/docs/guides/storage', scope:t('ファイル保存・配信、公開・非公開設定とアクセス制御を案内しています。','Documents file storage, delivery, public/private buckets and access control.','官方文档介绍文件存储、分发、公开／私有存储桶与访问控制。') },
  },
  license: {
    purpose: t('アプリ用ライセンスキーを発行・失効・検証できます。','Issue, revoke and validate app license keys.','签发、撤销和验证应用许可证密钥。'),
    example: t('プロジェクトを作り、顧客に渡すキーを発行します。','Create a project and issue a key for your customer.','创建项目并向客户发放许可证密钥。'),
    approach: t('キーの基本的な発行・検証フローに範囲を絞っています。','Focuses on the core key issuance and validation flow.','专注密钥签发和验证的基本流程。'),
    boundary: t('高度な端末認証・オフライン認証や決済の代行には対応しません。','No advanced machine locking, offline licensing or payment processing.','不支持高级设备绑定、离线许可或代收付款。'),
    alternative: { name:'Keygen', url:'https://keygen.sh/docs/validating-licenses/', scope:t('ライセンス検証や端末フィンガープリントを案内しています。','Documents license validation and machine fingerprints.','官方文档介绍许可证验证与设备指纹。') },
  },
  flags: {
    purpose: t('アプリから取得する機能フラグとリモート設定を管理します。','Manage feature flags and remote app configuration.','管理功能开关和应用远程配置。'),
    example: t('プロジェクトを作成し、アプリから公開設定を読み込みます。','Create a project and read published settings from your app.','创建项目并从应用读取公开配置。'),
    approach: t('小さな設定値をHTTPで共有する用途です。','Targets straightforward sharing of small settings over HTTP.','面向通过 HTTP 共享小型配置值。'),
    boundary: t('高度なターゲティング・段階的ロールアウト・実験分析は対象外です。','No advanced targeting, phased rollout or experiment analytics.','不提供高级定向、分阶段发布或实验分析。'),
    alternative: { name:'LaunchDarkly', url:'https://launchdarkly.com/docs/api/feature-flags', scope:t('ターゲティングや段階的ロールアウトを案内しています。','Documents targeting and percentage rollouts.','官方文档介绍定向与百分比分批发布。') },
  },
  monitor: {
    purpose: t('Webページの変化を定期確認し、変更や取得失敗を記録します。','Check a web page for changes and record changes or fetch failures.','定期检查网页变化并记录变更和抓取失败。'),
    example: t('URLと間隔を設定し、必要なら通知Webhookを登録します。','Set a URL and interval with an optional notification webhook.','设置 URL 和检查间隔，可选通知 Webhook。'),
    approach: t('ページ内容の変化と実行履歴の確認に焦点を当てています。','Focuses on page-content changes and history.','专注网页内容变更和检查记录。'),
    boundary: t('稼働率SLA・多地域監視・SMS通知の代替ではありません。','Not a substitute for uptime SLAs, multi-region checks or SMS alerts.','不能替代可用率 SLA、多地域检查或短信警报。'),
    alternative: { name:'UptimeRobot', url:'https://uptimerobot.com/website-monitoring/', scope:t('稼働監視・アラート・ステータスページを案内しています。','Documents uptime checks, alerts and status pages.','官方介绍可用率检查、警报和状态页面。') },
  },
  forms: {
    purpose: t('自分でバックエンドを作らずにフォーム投稿を受け付けられます。','Receive form submissions without building your own backend.','无需自建后端即可接收表单提交。'),
    example: t('フォームを作成し、発行された投稿先へWebサイトから送信します。','Create a form and send website submissions to its endpoint.','创建表单并从网站向其提交地址发送数据。'),
    approach: t('シンプルな投稿受付とデータ確認に焦点を当てています。','Focuses on basic form intake and submission inspection.','专注基础表单接收及查看。'),
    boundary: t('CRM・メールマーケティングのフル機能を備える製品ではありません。','Not a complete CRM or email-marketing suite.','并非完整 CRM 或邮件营销工具。'),
    alternative: { name:'Formspree', url:'https://help.formspree.io/articles/the-forms-api/form-submissions-api', scope:t('フォーム投稿を取得するAPIを案内しています。','Documents APIs for retrieving form submissions.','官方文档介绍获取表单提交的 API。') },
  },
};

/** Kept for any standalone uses; the service pages render ProductIntro + ProductLanding. */
export default function ProductOverview({ service, locale }: { service: GenericServiceSlug | 'mock'; locale: Locale }) {
  const info = SERVICE_INFO[service];
  const copy = PRODUCT_OVERVIEW[service];
  return <section className="productOverview shell" aria-labelledby={`${service}-overview-title`}>
    <div className="productOverviewHeading"><div className="productOverviewGlyph" aria-hidden="true" style={{ backgroundImage: `url('/icons/${service}.svg')` }}/><div><h2 id={`${service}-overview-title`}>{info.name}</h2><p>{copy.purpose[locale]}</p></div></div>
  </section>;
}
