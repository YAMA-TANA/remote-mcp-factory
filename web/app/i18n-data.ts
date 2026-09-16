export type Locale = 'en' | 'ja' | 'zh-CN';
export type LocaleSlug = 'en' | 'ja' | 'zh-cn';

type ProductCopy = { role: string; pricing: string };

export type Messages = {
  languageName: string;
  common: {
    products: string; mock: string; contact: string; terms: string; privacy: string; commercial: string; github: string;
    signIn: string; legal: string; support: string; copy: string; copied: string; email: string; phone: string;
    active: string; disabled: string; public: string; protected: string; refresh: string; delete: string;
  };
  home: {
    eyebrow: string; title1: string; title2: string; lede: string;
    flowLogin: string; flowPlans: string; flowBundle: string; flowEdge: string; flowLive: string;
    suite: string; pick: string; available: string; planned: string; standalone: string; bundleEligible: string;
    sharedLoginBilling: string; openDashboard: string; availableNow: string;
    mcpAvailable: string; mcpDescription: string; deployFirst: string; deployFirstDesc: string; signInPico: string;
    githubRepo: string; deployMcp: string; deploying: string; branch: string; access: string;
    deploymentQueued: string; tokenShownOnce: string; yourProjects: string; deployments: string;
    signInToView: string; noDeployments: string; toolsPending: string; tools: string;
    feature1Title: string; feature1Body: string; feature2Title: string; feature2Body: string; feature3Title: string; feature3Body: string;
  };
  mock: {
    title1: string; title2: string; lede: string; signInTitle: string; signInBody: string; signInPico: string;
    plan: string; newEndpoint: string; name: string; method: string; path: string; status: string; responseBody: string;
    saving: string; createEndpoint: string; yourMocks: string; endpoints: string; signInToView: string; noEndpoints: string; copyUrl: string;
  };
  products: Record<string, ProductCopy>;
};

const EN: Messages = {
  languageName: 'English',
  common: { products: 'Products', mock: 'Mock', contact: 'Contact', terms: 'Terms', privacy: 'Privacy', commercial: 'Commercial Disclosure', github: 'GitHub', signIn: 'Sign in', legal: 'Legal', support: 'Support', copy: 'Copy', copied: 'Copied', email: 'Email', phone: 'Telephone', active: 'active', disabled: 'disabled', public: 'Public', protected: 'Protected', refresh: 'Refresh', delete: 'Delete' },
  home: {
    eyebrow: 'Small developer infrastructure', title1: 'Tiny services.', title2: 'One account.',
    lede: 'Mock APIs, webhook inboxes, RSS, screenshots, Remote MCP hosting and other small infrastructure without another heavyweight platform. Each service has its own plan, so you pay only for what you use. When several services fit together, bundles can lower the combined price.',
    flowLogin: 'One login', flowPlans: 'Separate product plans', flowBundle: 'Bundle when useful', flowEdge: 'Cloudflare edge', flowLive: 'MCP + Mock live first',
    suite: 'PICOSVC SUITE', pick: 'Pick only what you need.', available: 'Available now', planned: 'Planned', standalone: 'Standalone plan', bundleEligible: 'Bundle eligible', sharedLoginBilling: 'shared login, separate billing', openDashboard: 'Open dashboard →', availableNow: 'AVAILABLE NOW',
    mcpAvailable: 'PicoSvc MCP', mcpDescription: 'Connect a stdio MCP repository. Compatible servers compile to Cloudflare Dynamic Workers; heavier servers fall back to an isolated Sandbox.',
    deployFirst: 'Deploy your first MCP', deployFirstDesc: 'Your PicoSvc login is shared across products; product subscriptions stay separate.', signInPico: 'Sign in to PicoSvc', githubRepo: 'GitHub MCP repository', deployMcp: 'Deploy MCP', deploying: 'Deploying…', branch: 'Branch', access: 'Access', deploymentQueued: 'Deployment queued', tokenShownOnce: 'Bearer token — shown once:', yourProjects: 'YOUR MCP PROJECTS', deployments: 'Deployments', signInToView: 'Sign in to view your PicoSvc MCP deployments.', noDeployments: 'No MCP deployments yet.', toolsPending: 'tools pending', tools: 'tools',
    feature1Title: 'Shared account', feature1Body: 'One Clerk identity across every PicoSvc product. Organizations can share ownership without creating separate accounts for every service.',
    feature2Title: 'Separate plans', feature2Body: 'MCP, Mock, Hooks and every other service are billed independently. Upgrade one without paying for products you do not use.',
    feature3Title: 'Bundle and save', feature3Body: 'When several services belong together, a bundle can grant multiple product plans at a lower combined price without turning PicoSvc into one giant subscription.'
  },
  mock: {
    title1: 'Mock an API.', title2: 'Keep moving.', lede: 'Create a stable public endpoint with the HTTP method, status and response body you need. PicoSvc Mock has its own plan and quota; buying another PicoSvc product does not automatically upgrade Mock. Free includes 1 endpoint and Tiny includes 10 for $1/month.',
    signInTitle: 'Sign in to create a mock endpoint', signInBody: 'Your login is shared across PicoSvc. Product subscriptions remain independent unless you choose a bundle that explicitly includes them.', signInPico: 'Sign in to PicoSvc', plan: 'MOCK PLAN', newEndpoint: 'New endpoint', name: 'Name', method: 'Method', path: 'Path', status: 'Status', responseBody: 'Response body', saving: 'Saving…', createEndpoint: 'Create endpoint', yourMocks: 'YOUR MOCKS', endpoints: 'Endpoints', signInToView: 'Sign in to view endpoints.', noEndpoints: 'No mock endpoints yet.', copyUrl: 'Copy URL'
  },
  products: {
    mcp: { role: 'MCP hosting / Remote conversion', pricing: 'Paid from $1/mo' }, mock: { role: 'Mock API', pricing: 'Paid from $1/mo' }, hooks: { role: 'Webhook inbox / replay', pricing: 'Pricing TBD' }, rss: { role: 'Web → RSS', pricing: 'Pricing TBD' }, mail: { role: 'Email → Webhook', pricing: 'Pricing TBD' }, shot: { role: 'Screenshot / PDF', pricing: 'Pricing TBD' }, fetch: { role: 'URL → Markdown / metadata', pricing: 'Pricing TBD' }, qr: { role: 'Dynamic QR / redirect', pricing: 'Pricing TBD' }, cron: { role: 'Cron execution / monitoring', pricing: 'Pricing TBD' }, functions: { role: 'Tiny serverless functions', pricing: 'Pricing TBD' }, json: { role: 'JSON API / tiny database', pricing: 'Pricing TBD' }, files: { role: 'R2-backed file delivery', pricing: 'Pricing TBD' }, license: { role: 'License key validation', pricing: 'Pricing TBD' }, flags: { role: 'Feature flags / remote config', pricing: 'Pricing TBD' }, monitor: { role: 'Web page change monitoring', pricing: 'Pricing TBD' }, forms: { role: 'Form backend', pricing: 'Pricing TBD' }
  }
};

const JA: Messages = {
  languageName: '日本語',
  common: { products: '製品', mock: 'Mock', contact: 'お問い合わせ', terms: '利用規約', privacy: 'プライバシー', commercial: '特定商取引法', github: 'GitHub', signIn: 'ログイン', legal: '法務', support: 'サポート', copy: 'コピー', copied: 'コピー済み', email: 'メール', phone: '電話', active: '有効', disabled: '無効', public: '公開', protected: '保護', refresh: '更新', delete: '削除' },
  home: {
    eyebrow: '小さく使える開発者インフラ', title1: '小さなサービスを。', title2: 'ひとつのアカウントで。',
    lede: 'Mock API、Webhook受信、RSS、スクリーンショット、Remote MCPホスティングなどの小型インフラを、重い統合プラットフォームなしで使えます。各サービスは個別プランなので、必要なものだけ支払い。複数サービスを使う場合はBundleでまとめて安くできます。',
    flowLogin: '1つのログイン', flowPlans: '製品ごとのプラン', flowBundle: '必要ならBundle', flowEdge: 'Cloudflare Edge', flowLive: 'まずMCP + Mock',
    suite: 'PICOSVC SUITE', pick: '必要なものだけ選べます。', available: '利用可能', planned: '準備中', standalone: '単品プラン', bundleEligible: 'Bundle対象', sharedLoginBilling: 'ログイン共通・課金別', openDashboard: 'ダッシュボードを開く →', availableNow: '利用可能',
    mcpAvailable: 'PicoSvc MCP', mcpDescription: 'stdio MCPリポジトリを接続すると、対応サーバーはCloudflare Dynamic Workersへコンパイルし、重いサーバーは隔離Sandboxへフォールバックします。',
    deployFirst: '最初のMCPをデプロイ', deployFirstDesc: 'PicoSvcのログインは全製品で共通ですが、各製品の契約は個別です。', signInPico: 'PicoSvcにログイン', githubRepo: 'GitHub MCPリポジトリ', deployMcp: 'MCPをデプロイ', deploying: 'デプロイ中…', branch: 'ブランチ', access: 'アクセス', deploymentQueued: 'デプロイを開始しました', tokenShownOnce: 'Bearer token — この一度だけ表示:', yourProjects: 'あなたのMCP', deployments: 'デプロイ一覧', signInToView: 'PicoSvc MCPのデプロイを見るにはログインしてください。', noDeployments: 'MCPデプロイはまだありません。', toolsPending: 'tool確認中', tools: 'tools',
    feature1Title: 'アカウント共通', feature1Body: '1つのClerkアカウントで全PicoSvc製品を利用できます。Organizationも製品ごとにアカウントを作り直す必要はありません。',
    feature2Title: 'プランは製品別', feature2Body: 'MCP、Mock、Hooksなどはそれぞれ独立課金です。使わない製品までまとめて支払う必要はありません。',
    feature3Title: 'Bundleでまとめ買い', feature3Body: '複数サービスを一緒に使う場合だけ、Bundleで複数製品の権限を割安にまとめられます。巨大な一括サブスクにはしません。'
  },
  mock: {
    title1: 'APIをすぐMock。', title2: '開発を止めない。', lede: '必要なHTTPメソッド、ステータス、レスポンス本文を持つ安定した公開エンドポイントを作成できます。PicoSvc Mockには独自のプランと上限があり、他製品を購入しても自動ではアップグレードされません。Freeは1 endpoint、Tinyは月$1で10 endpointsです。',
    signInTitle: 'Mock endpointを作るにはログイン', signInBody: 'ログインはPicoSvc全体で共通です。明示的にBundleへ含まれる場合を除き、製品ごとの契約は独立しています。', signInPico: 'PicoSvcにログイン', plan: 'MOCKプラン', newEndpoint: '新しいendpoint', name: '名前', method: 'Method', path: 'Path', status: 'Status', responseBody: 'レスポンス本文', saving: '保存中…', createEndpoint: 'Endpointを作成', yourMocks: 'あなたのMOCK', endpoints: 'Endpoints', signInToView: 'endpointを見るにはログインしてください。', noEndpoints: 'Mock endpointはまだありません。', copyUrl: 'URLをコピー'
  },
  products: {
    mcp: { role: 'MCPホスティング / Remote変換', pricing: '有料 $1/月〜' }, mock: { role: 'Mock API', pricing: '有料 $1/月〜' }, hooks: { role: 'Webhook inbox / replay', pricing: '料金未定' }, rss: { role: 'Web → RSS', pricing: '料金未定' }, mail: { role: 'Email → Webhook', pricing: '料金未定' }, shot: { role: 'Screenshot / PDF', pricing: '料金未定' }, fetch: { role: 'URL → Markdown / Metadata', pricing: '料金未定' }, qr: { role: 'Dynamic QR / Redirect', pricing: '料金未定' }, cron: { role: 'Cron実行 / 監視', pricing: '料金未定' }, functions: { role: '小型serverless functions', pricing: '料金未定' }, json: { role: 'JSON API / tiny DB', pricing: '料金未定' }, files: { role: 'R2ファイル配信', pricing: '料金未定' }, license: { role: 'ライセンスキー検証', pricing: '料金未定' }, flags: { role: 'Feature flags / remote config', pricing: '料金未定' }, monitor: { role: 'Webページ変更監視', pricing: '料金未定' }, forms: { role: 'フォームbackend', pricing: '料金未定' }
  }
};

const ZH: Messages = {
  languageName: '简体中文',
  common: { products: '产品', mock: 'Mock', contact: '联系我们', terms: '服务条款', privacy: '隐私政策', commercial: '特商法披露', github: 'GitHub', signIn: '登录', legal: '法律', support: '支持', copy: '复制', copied: '已复制', email: '邮箱', phone: '电话', active: '启用', disabled: '停用', public: '公开', protected: '受保护', refresh: '刷新', delete: '删除' },
  home: {
    eyebrow: '轻量开发者基础设施', title1: '小服务。', title2: '一个账号。',
    lede: 'Mock API、Webhook 收件箱、RSS、截图、Remote MCP 托管等小型基础设施，无需使用笨重的一体化平台。每项服务都有独立套餐，只为真正使用的产品付费；需要多个服务时，可通过 Bundle 降低组合价格。',
    flowLogin: '一个登录', flowPlans: '产品独立套餐', flowBundle: '需要时购买Bundle', flowEdge: 'Cloudflare Edge', flowLive: '先上线 MCP + Mock',
    suite: 'PICOSVC SUITE', pick: '只选你需要的。', available: '现已可用', planned: '计划中', standalone: '独立套餐', bundleEligible: '可加入Bundle', sharedLoginBilling: '账号共用・计费独立', openDashboard: '打开控制台 →', availableNow: '现已可用',
    mcpAvailable: 'PicoSvc MCP', mcpDescription: '连接一个 stdio MCP 仓库。兼容的服务器会编译到 Cloudflare Dynamic Workers；较重的服务器会回退到隔离 Sandbox。',
    deployFirst: '部署你的第一个 MCP', deployFirstDesc: 'PicoSvc 登录在所有产品间共用，但产品订阅彼此独立。', signInPico: '登录 PicoSvc', githubRepo: 'GitHub MCP 仓库', deployMcp: '部署 MCP', deploying: '部署中…', branch: '分支', access: '访问方式', deploymentQueued: '部署已排队', tokenShownOnce: 'Bearer token — 仅显示一次：', yourProjects: '你的 MCP 项目', deployments: '部署', signInToView: '登录后查看 PicoSvc MCP 部署。', noDeployments: '还没有 MCP 部署。', toolsPending: '工具检测中', tools: '个 tools',
    feature1Title: '统一账号', feature1Body: '一个 Clerk 身份即可使用全部 PicoSvc 产品。组织也无需为每个服务分别创建账号。',
    feature2Title: '产品独立套餐', feature2Body: 'MCP、Mock、Hooks 等服务分别计费。只升级需要的产品，不必为不用的功能付费。',
    feature3Title: 'Bundle 更省', feature3Body: '当多个服务需要一起使用时，Bundle 可以用更低的组合价格授予多个产品套餐，而不是把 PicoSvc 变成一个巨大的统一订阅。'
  },
  mock: {
    title1: '快速 Mock API。', title2: '继续开发。', lede: '创建具有所需 HTTP 方法、状态码和响应内容的稳定公开端点。PicoSvc Mock 有自己的套餐和配额；购买其他 PicoSvc 产品不会自动升级 Mock。Free 包含 1 个 endpoint，Tiny 为每月 $1 包含 10 个 endpoints。',
    signInTitle: '登录后创建 Mock endpoint', signInBody: '登录账号在 PicoSvc 全产品间共用。除非你选择的 Bundle 明确包含某产品，否则各产品订阅保持独立。', signInPico: '登录 PicoSvc', plan: 'MOCK 套餐', newEndpoint: '新 endpoint', name: '名称', method: 'Method', path: 'Path', status: 'Status', responseBody: '响应内容', saving: '保存中…', createEndpoint: '创建 endpoint', yourMocks: '你的 MOCKS', endpoints: 'Endpoints', signInToView: '登录后查看 endpoints。', noEndpoints: '还没有 Mock endpoint。', copyUrl: '复制 URL'
  },
  products: {
    mcp: { role: 'MCP 托管 / Remote 转换', pricing: '付费 $1/月起' }, mock: { role: 'Mock API', pricing: '付费 $1/月起' }, hooks: { role: 'Webhook 收件箱 / replay', pricing: '价格待定' }, rss: { role: '网页 → RSS', pricing: '价格待定' }, mail: { role: 'Email → Webhook', pricing: '价格待定' }, shot: { role: '截图 / PDF', pricing: '价格待定' }, fetch: { role: 'URL → Markdown / Metadata', pricing: '价格待定' }, qr: { role: '动态 QR / Redirect', pricing: '价格待定' }, cron: { role: 'Cron 执行 / 监控', pricing: '价格待定' }, functions: { role: '轻量 serverless functions', pricing: '价格待定' }, json: { role: 'JSON API / tiny DB', pricing: '价格待定' }, files: { role: 'R2 文件分发', pricing: '价格待定' }, license: { role: '许可证密钥验证', pricing: '价格待定' }, flags: { role: 'Feature flags / remote config', pricing: '价格待定' }, monitor: { role: '网页变化监控', pricing: '价格待定' }, forms: { role: '表单 backend', pricing: '价格待定' }
  }
};

export const MESSAGES: Record<Locale, Messages> = { en: EN, ja: JA, 'zh-CN': ZH };
export const LOCALES: Locale[] = ['en', 'ja', 'zh-CN'];
export const LOCALE_SLUGS: LocaleSlug[] = ['en', 'ja', 'zh-cn'];

export function localeToSlug(locale: Locale): LocaleSlug {
  return locale === 'zh-CN' ? 'zh-cn' : locale;
}

export function slugToLocale(slug: string): Locale | null {
  if (slug === 'en' || slug === 'ja') return slug;
  if (slug === 'zh-cn') return 'zh-CN';
  return null;
}

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
