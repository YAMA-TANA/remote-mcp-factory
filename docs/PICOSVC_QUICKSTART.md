# PicoSvc クイックスタート

PicoSvcは、MCPホスティング・Mock API・Webhook受信など**16サービスを1つのClerkアカウントで管理する**開発者向けツール群です。このページは利用者向けです。自分でPicoSvcを運用・デプロイする場合は[運用ガイド](PICOSVC_DEPLOYMENT.md)を参照してください。

> **ご注意:** この文書はGitHubの現行ソースに基づきます。サービス公開状況、実際に反映済みの機能、決済・メール配送等の外部設定は本番環境で別途確認が必要です。

## 1. ログインしてサービスを選ぶ

1. PicoSvcのWebサイトを開き、Clerkでサインインします。すべてのサービスで同じログインを使用します。
2. 製品一覧から利用するサービスを開きます。画面の検索ナビゲーションからも16製品を探せます。
3. 作成フォームに名前と必須項目を入力し、送信します。APIの上限や権限不足が表示された場合は[料金モデル](BILLING_MODEL.md)と[エラー対処](#エラーが出たら)を確認します。
4. 一覧がある製品では、作成済みリソースの「管理・編集」から設定や操作履歴を確認します。具体的な操作は[サービス・APIガイド](PICOSVC_API_GUIDE.md)へ。

組織（Clerk Organization）が選ばれている場合、リソースの所有者は組織です。個人アカウントのリソースと混同しないよう、作成前に現在のアカウント／組織を確認してください。

## 2. 最初のリソースを作る（例：Mock API）

1. **Mock API**を開き、`Hello API`などの名前、`GET`、パス`hello`、HTTPステータス`200`を設定します。
2. レスポンス本文に `{"hello":"world"}` を入力して作成します。
3. 作成後の一覧に表示されるエンドポイントURLをコピーし、ブラウザーまたは `curl` でGETします。URLはダッシュボードが返した**実際の値**を使い、架空の公開IDを手入力しないでください。
4. 作成済みエンドポイントは編集画面で本文・ステータス・Content-Typeや有効／無効を変更できます。204/205/304など、本文を返せないステータスには本文を設定しないでください。

## 3. 目的別の最短手順

| やりたいこと | サービス | 最初に入力するもの・次の操作 |
| --- | --- | --- |
| GitHubのMCPを公開する | MCP | GitHub**リポジトリ**URL、ブランチ、公開／トークン保護。秘密リポジトリはGitHub App連携の手順を確認。 |
| 外部Webhookを受ける | Hooks | Inbox名 → 発行された受信URLを送信元に設定。イベント詳細・再送は管理画面へ。 |
| WebページをRSS化する | RSS | 公開ページURL。必要なら記事・タイトル・リンク・本文・日付のCSSセレクターを指定。作成後は発行された `.xml` URLを購読。 |
| メールをWebhookに転送する | Mail | HTTPSの転送先。**管理画面でルートを作るだけではメール受信は始まりません**。運営側のCloudflare Email Routing設定が必要です。 |
| ページを画像・PDFにする | Shot | 公開URL・PNG/PDF。自動化用の専用キーは[専用ガイド](SCREENSHOT_API.md)。 |
| URLからテキストを抽出する | Fetch | 公開URL・Markdown/metadata。レスポンスはJSONで返ります。 |
| 印刷済みQRのリンク先を変える | QR | 名前・遷移先URL。QR画像のSVGを保存して利用し、変更は管理画面で行います。 |
| 定期的にHTTPを呼ぶ | Cron | UTCの5フィールドCron式、URL、HTTPメソッド。必要ならヘッダーJSON・リクエスト本文。 |
| 小さなJavaScriptを公開する | Functions | `fetch(request)` を持つdefault exportのコード。公開前に返す情報や秘密情報を確認。 |
| JSONを保存する | JSON | ストア名 → **初回だけ表示されるBearer tokenを保存**。 |
| ファイルを配信する | Files | スペース名 → 利用目的に合った公開・非公開の設定を確認してアップロード。 |
| アプリのライセンスを管理する | License | プロジェクト名 → 管理画面でキーを発行／検証。 |
| 機能フラグを配信する | Flags | プロジェクト名 → 管理画面でフラグを作成。 |
| ページ変更を通知する | Monitor | 公開URL・監視間隔・任意のWebhook。Freeの最短間隔は60分、Picoは15分、PicoPlusは5分。 |
| フォーム投稿を受ける | Forms | フォーム名 → 発行された投稿先をフォームに設定。 |

**RSSのセレクター:** `itemSelector`は記事要素、`titleSelector`などは記事要素からの相対指定です。抽出できないページ・認証が必要なページでは失敗することがあります。

**Cron:** `*/15 * * * *`は15分おきのUTC指定です。リクエスト本文はPOST/PUT/PATCH/DELETE向けです。認証ヘッダー等を設定するときは画面共有やログに値を貼らないでください。

## 4. APIから使う

管理APIは、特記されない限りClerkセッションの `Authorization: Bearer <session-token>` と、JSONリクエストでは `Content-Type: application/json` を使います。**Clerk公開キーはBearerトークンではありません。** `NEXT_PUBLIC_`環境変数に管理用シークレットやScreenshot APIキーを入れないでください。

以下の例では、ログイン済みセッションから取得したトークンを安全なローカル環境変数 `PICOSVC_SESSION_TOKEN` に、**実際に稼働しているWorkerのオリジン**を `PICOSVC_API_URL` に設定してから実行します。実際のトークンをチャットやGitHubに貼らないでください。

```bash
export PICOSVC_API_URL='https://YOUR_DEPLOYED_WORKER_ORIGIN'
export PICOSVC_SESSION_TOKEN='YOUR_CLERK_SESSION_TOKEN'

curl --fail-with-body -sS \
  -H "Authorization: Bearer $PICOSVC_SESSION_TOKEN" \
  "$PICOSVC_API_URL/api/picosvc/account"
```

初回の実用的なPOST例、一覧URL、公開ランタイムとの認証の違いは[APIガイド](PICOSVC_API_GUIDE.md)に記載しています。Screenshotだけは専用の`pss_...`キーでも撮影可能です（他サービスやキー管理には使えません）。

## 5. 料金と上限

製品単体はFree、Pico（月額$1/製品）、PicoPlus（月額$5/製品）。Bundle Pico（月額$5）／Bundle Pro（月額$22）は複数製品の権限を付与する設計です。**製品ごとにリソース数・月間リクエスト数などの上限が異なります。** 現行の値は[カタログ実装](../src/picosvc/catalog.ts)、稼働中の値はWorkerの `GET /api/picosvc/catalog`、購入画面の実際の請求額は決済画面で必ず確認してください。

## エラーが出たら

| 症状 | 確認すること |
| --- | --- |
| 401 / Session expired | 正しいアカウントでサインインしているか、セッショントークンが期限切れでないか。 |
| 400 / Invalid URL | 公開HTTP(S) URLか、localhost・プライベートIP・埋め込み認証情報等を含んでいないか。MCPにはファイル・ブランチではなくリポジトリURLを入力。 |
| 402 / 429 | 製品ごとのリソース数または月間利用上限を確認。再試行の連打は避ける。 |
| 415 / 413 / 422 / 504 (Fetch) | 非対応形式／2MiB超／空の内容／タイムアウトの可能性。別の公開HTMLページで再現確認。 |
| 503 / Browser unavailable | Shot・Markdown Fetchの実行に必要なWorkerのBrowser Run設定などを運営側で確認。 |
| 作成できたのに本番で動かない | GitHub CIの成功はデプロイ成功ではありません。[運用ガイド](PICOSVC_DEPLOYMENT.md)のWorker・Pages・D1・実動作チェックを分けて確認。 |

シークレットを公開リポジトリやサポート投稿に載せてしまった場合は、該当サービスで失効・再発行してください。
