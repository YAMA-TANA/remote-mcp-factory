# PicoSvc サービス・APIガイド

このページは、現行の[Web作成フォーム](../web/app/service-ui-config.ts)、[Mock管理API](../src/picosvc/mock.ts)、[ルートの優先順位](../src/picosvc/routes.ts)に合わせた**主要エンドポイントの実用ガイド**です。全ルート・全レスポンスを網羅するOpenAPI仕様書ではありません。後述の例はログイン済みのユーザー向け管理APIを示し、本番に反映済みかどうかは別途確認が必要です。

## 共通ルール

- `BASE_URL`は**デプロイされたWorkerのオリジン**（末尾のスラッシュなし）。Pagesのオリジンと混同しないでください。
- 管理APIは、明記した例外を除き `Authorization: Bearer <Clerk session token>` が必要です。Clerk publishable keyや、あるサービス専用のキーでは代用できません。
- JSONをPOST/PATCHするときは `Content-Type: application/json` を付けます。
- `GET /api/picosvc/catalog`で製品・クォータ定義、`GET /api/picosvc/account`でログイン中の所有者・権限・当月利用量を参照できます。Clerk Organizationが有効なら通常は組織の所有権になります。
- `id`（所有者が管理APIで使うUUID）と`publicId`（公開URLに使うID）は異なります。実際に返ってきた値を使用してください。
- APIのクォータ、フィールド制約やルートは変更される可能性があります。最終的にはデプロイ先の実レスポンスと[サーバー実装](../src/picosvc/)で検証してください。

```bash
export BASE_URL='https://YOUR_DEPLOYED_WORKER_ORIGIN'
export PICOSVC_SESSION_TOKEN='YOUR_CLERK_SESSION_TOKEN'
# トークンは端末の安全な管理方法で設定し、履歴・スクリーンショット・GitHubに公開しない

curl --fail-with-body -sS \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" \
  "$BASE_URL/api/picosvc/account"
```

## 16サービスの管理API入口

下表の`GET/POST`は主に一覧・作成です。`Shot`と`Fetch`は単発実行です。MCPはレガシーな`/api/servers`名前空間にあります。Mockは専用の管理画面を持ちます。

| 製品 | 一覧／実行パス | 最初のPOSTに指定する主なフィールド | 次に行うこと |
| --- | --- | --- | --- |
| MCP | `GET, POST /api/servers` | `repoUrl`, `branch`, `visibility` (`token`/`public`) | ビルド状態・稼働方式・発行された接続先を確認。プライベートrepoはGitHub App連携が必要。 |
| Mock | `GET, POST /api/picosvc/mock/endpoints` | `name`, `method`, `path`, `statusCode`, `body`; 任意で`contentType`, `headers` | 返却された`endpoint`を呼ぶ。`PATCH /api/picosvc/mock/endpoints/:id`で設定変更・停止。 |
| Hooks | `GET, POST /api/picosvc/hooks/inboxes` | `name` | 受信先URLをコピーして送信元に登録、イベント詳細を確認。 |
| RSS | `GET, POST /api/picosvc/rss/feeds` | `name`, `sourceUrl`; 任意で5種類の`*Selector` | 発行された`feedUrl`を購読。抽出テストや手動更新は下記。 |
| Mail | `GET, POST /api/picosvc/mail/routes` | `name`, `webhookUrl` | Email Routingが設定された受信先と配送イベントを確認。 |
| Shot | `POST /api/picosvc/shot` | `url`, `format` (`png`/`pdf`)、任意で撮影条件 | **JSONではなくPNG/PDFバイナリ**を保存。APIキーは[専用ガイド](SCREENSHOT_API.md)。 |
| Fetch | `POST /api/picosvc/fetch` | `url`, `format` (`markdown`/`metadata`) | 抽出内容をJSONで受信。空・非対応形式・サイズ超過はエラー。 |
| QR | `GET, POST /api/picosvc/qr/links` | `name`, `targetUrl` | 発行された`redirectPath`と`svgPath`を利用。`PATCH /api/picosvc/qr/links/:id`でリンク先変更。 |
| Cron | `GET, POST /api/picosvc/cron/jobs` | `name`, `cron`, `method`, `targetUrl`; 任意で`headers`, `body` | UTCの定期実行と`GET /api/picosvc/cron/jobs/:id/runs`で履歴確認。 |
| Functions | `GET, POST /api/picosvc/functions/apps` | `name`, `code` | `fetch(request)`ハンドラーのデプロイ状態とランタイムURLを確認。 |
| JSON | `GET, POST /api/picosvc/json/stores` | `name` | 初回のみの`bearerToken`を保存してドキュメントを操作。 |
| Files | `GET, POST /api/picosvc/files/spaces` | `name` | R2の設定を確認後、アクセス設定に合うオブジェクトをアップロード。 |
| License | `GET, POST /api/picosvc/license/projects` | `name` | プロジェクト内でキー発行・検証。 |
| Flags | `GET, POST /api/picosvc/flags/projects` | `name` | プロジェクト内でフラグと公開設定を管理。 |
| Monitor | `GET, POST /api/picosvc/monitor` | `name`, `targetUrl`, `intervalMinutes`; 任意で`webhookUrl` | 監視の実行履歴・検出イベントを確認。 |
| Forms | `GET, POST /api/picosvc/forms` | `name` | 発行された投稿先をWebフォームまたはアプリから呼ぶ。 |

`GET`/`POST`は**テーブルに示した管理API入口に限る**記述です。公開データ面は認証方式・許可メソッドが異なるため、一覧をそのまま公開先として使わないでください。公開URLは作成レスポンスまたは管理画面に表示されたものを優先します。

## コピーして試せるリクエスト

以下の例は`BASE_URL`と`PICOSVC_SESSION_TOKEN`を上記のとおり設定した場合です。**公開先・資格情報は仮値**であり、動作結果を保証するものではありません。

### Mock — 作成、更新、公開エンドポイント

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/mock/endpoints" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Hello API","method":"GET","path":"hello","statusCode":200,"contentType":"application/json; charset=utf-8","body":"{\"hello\":\"world\"}"}'
```

作成レスポンスの`endpoint`が公開先です。`PATCH /api/picosvc/mock/endpoints/:id`に `{"enabled":false}` を送れば停止できます。**実際に返ったUUIDを`:id`に代入**してください。204/205/304等では本文を返せません。

### RSS — セレクターを指定してフィードを作る

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/rss/feeds" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Example news","sourceUrl":"https://example.com/","itemSelector":"article","titleSelector":"h2","linkSelector":"a[href]"}'
```

実際に記事があるURL・適合するセレクターに置き換えてください。存在しないセレクターやアクセスできないサイトでは抽出できません。記事・タイトル・リンク・本文・日付はそれぞれ `itemSelector`, `titleSelector`, `linkSelector`, `contentSelector`, `dateSelector`。文字列の上限は画面で300文字です。取得済みの`id`に対し、`POST /api/picosvc/rss/feeds/:id/preview`で抽出プレビュー、`POST /api/picosvc/rss/feeds/:id/refresh`で手動更新できます。いずれも月間チェック枠を消費することがあります。XML公開先はレスポンスの`feedUrl`を使用します。

### Cron — ヘッダーと本文を設定

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/cron/jobs" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Health ping","cron":"*/15 * * * *","method":"POST","targetUrl":"https://example.com/webhook","headers":{"content-type":"application/json"},"body":"{\"event\":\"tick\"}"}'
```

Cron式はUTCの5フィールド（分・時・日・月・曜日）です。`GET`リクエストでは本文を送りません。管理画面は不正なCron式、JSONオブジェクト以外のヘッダー、GETと本文の組み合わせを送信前に拒否します。ただし**ブラウザー側の検証はAPI側の安全対策の代わりにはなりません**。`GET /api/picosvc/cron/jobs/:id/runs`で記録を確認してください。

### Monitor — 間隔とWebhook

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/monitor" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Homepage","targetUrl":"https://example.com/","intervalMinutes":60,"webhookUrl":"https://example.com/changes"}'
```

変更通知が不要なら `webhookUrl` を省略します。無料／Pico／PicoPlusの最短間隔はそれぞれ60／15／5分で、プラン下限より短い値はサーバー側で調整される場合があります。`GET /api/picosvc/monitor/:id/events`で変更と取得エラーのイベントを区別して確認します。定期実行にはWorker側のCron Triggerが必要です。

### Fetch — JSONでMarkdown／metadataを取得

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/fetch" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/","format":"metadata"}'
```

`format:"markdown"`なら`markdown`文字列を含むJSON、`metadata`なら`title`、`description`、`canonical`、`textPreview`等を含むJSONを返します。**Markdownをプレーンテキストとして返すAPIではありません**。`readable:true`でmetadataのプレビューから一部のナビゲーション等を除去でき、`timeoutMs`は1,000〜20,000msに調整されます。レスポンスは最大2MiB。空内容422、非対応Content-Type 415、サイズ超過413、タイムアウト504等をHTTPステータスで判定してください。MarkdownにはWorkerのBrowser Runバインディングが必要です。

### QR — 作成後に遷移先を変更

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/qr/links" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Event QR","targetUrl":"https://example.com/"}'
```

レスポンスの`redirectPath`、`svgPath`をWorkerオリジンと組み合わせて利用します。後から`PATCH /api/picosvc/qr/links/:id`へ`{"targetUrl":"https://example.com/new"}`を送り、印刷済みのQRを変えずに転送先を更新できます。スキャン時には製品の月間スキャン枠が適用されます。

### Shot — 直接バイナリを保存

```bash
curl --fail-with-body -sS -X POST "$BASE_URL/api/picosvc/shot" \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/","format":"png","width":1280,"height":720}' \
  --output capture.png
```

撮影の制御項目、`pss_...`形式のScreenshot専用キー発行／失効、画像が白紙になるケース、PDF例、D1移行要件は[SCREENSHOT_API.md](SCREENSHOT_API.md)を参照してください。エラー時には画像ではなくJSONが返るため、`--fail-with-body`とHTTPステータスの確認が重要です。

## 認証・セキュリティ上の区別

- **Clerk session token:** 所有者の管理API用。管理画面のブラウザーが取得するものを、公開リポジトリやドキュメントに実値で記載しない。
- **Screenshot専用API key (`pss_...`):** `/api/picosvc/shot`のサーバー側自動化専用。他の製品とキー管理には使用できません。初回表示時に安全に保管し、漏えい時は失効。
- **MCPの保護トークン／JSONストアのBearer token:** 対象の公開・データエンドポイント専用で、Clerk session tokenや他製品のキーと互換ではありません。MCPの保護トークンは発行／ローテーション時のみ表示されます。
- **公開URL:** Mock、QR、RSSなど製品ごとにアクセス制御と利用枠が異なります。「URLを知っている人だけが使える」とは考えないでください。
- **外部URLの取得／送信:** 公開HTTP(S)のみを前提とし、内部ホストや埋め込み認証情報等を拒否する実装があります。ただしBrowserを含む実運用環境でのDNS rebinding／SSRF安全性が完全に検証済みという意味ではありません。

## エラー・運用

成功時のJSONスキーマは製品ごとに異なります。`x-request-id`や`error.code`がある場合は調査用に記録し、トークン・ヘッダー・メール本文などはマスクしてください。代表的なHTTPステータスは400（入力値）、401（認証）、402（リソース枠）、429（月間利用枠）、503（バインディング／機能未設定）。すべてのレガシールートが同じエラー形式を返すとは限りません。

本番のテスト計画、D1の必要移行、Pagesだけを更新してもWorkerが変わらない点は[デプロイガイド](PICOSVC_DEPLOYMENT.md)と[ローンチ判定](PICOSVC_LAUNCH_HANDOFF.md)を参照してください。
