# PicoSvc 運用・デプロイ手順（Cloudflare）

対象：`YAMA-TANA/remote-mcp-factory` の管理者。**GitHubへのコミット、GitHub Actions CI、Cloudflare Pages公開、Cloudflare Worker公開、D1移行は別の工程**です。手順を実行する前に本番プロジェクト・DB・ドメインを目視で確認し、停止やデータ削除につながる操作はバックアップ／復旧方針を用意してください。GitHubからCloudflareの実際のDashboard設定、デプロイ履歴、稼働中の秘密値は確認できません。

## 1. 構成と変更の反映先

| 対象 | リポジトリ内の場所 | 反映方法 | 確認すること |
| --- | --- | --- | --- |
| フロントエンド（製品ページ・フォーム・SVGアイコン・文言） | `web/` | Cloudflare **Pages**でビルド／デプロイ | 実サイトを開き、変更後のフォーム・ナビゲーションを確認 |
| 管理・公開API、MCPランタイム、定期実行 | `src/`, `wrangler.jsonc`等 | Cloudflare **Workers**をデプロイ | 実Workerのヘルスチェックと製品別リクエストを確認 |
| D1データモデル | `migrations/` | 対象DBに**マイグレーションを適用** | 履歴・対象DB・依存する画面/APIを確認 |
| Email Routing・ドメイン・Billing・Cloudflareバインディング | Cloudflare／Clerkの各管理画面 | **各プロバイダー側で設定** | 実際に受信・認証・課金できるか確認 |

Webフォームの改善だけなら通常Worker更新／新規D1マイグレーションは不要ですが、**既存のWorkerやDBが未デプロイの場合にはそのままでは動きません**。Workerのコード変更だけではPagesの画面は更新されません。

## 2. Cloudflare Pagesの設定

Git連携の対象リポジトリは `YAMA-TANA/remote-mcp-factory`。`web/README.md`と一致させます。

```text
Production branch:       main
Root directory:          web
Framework preset:        Next.js (Static HTML Export)
Build command:           npm run build
Build output directory:  out
```

Pagesのビルド環境変数：

```text
NEXT_PUBLIC_FACTORY_API_URL=https://YOUR_DEPLOYED_WORKER_ORIGIN
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLIC_CLERK_KEY
```

`NEXT_PUBLIC_FACTORY_API_URL`には**Workerの実際のオリジン**を指定し、Pagesのサイト自身や未設定のサブドメインを指定しないでください。`NEXT_PUBLIC_`はブラウザーに露出する公開変数です。Clerk secret key、GitHub App秘密鍵、APIキーをここに置かないでください。

Worker側の`WEB_ORIGINS`と、使用している場合の`CLERK_AUTHORIZED_PARTIES`には実際のPages／カスタムドメインのオリジンを合わせます。ソースの`wrangler.jsonc`では`PUBLIC_MCP_ORIGIN=https://mcp.picosvc.com`、`WEB_ORIGINS=https://picosvc.com,https://app.picosvc.com`が設定されています。`mcp.picosvc.com`に関するDNS／ルーティングは運用側で別途確認してください。

### 「The deployment was skipped because no changed files matched your configured include and exclude paths.」

このメッセージが出た場合は、**まずどのCloudflareプロジェクトに出たか**を確認します。

- **Pagesフロントエンドのプロジェクト**で`web/`内を変更したのにスキップされる：Cloudflare DashboardのWorkers & Pages → 該当Pagesプロジェクト → Settings → Build → **Build watch paths**を確認します。Includeに`web/`以下を含むパターンを設定し、Excludeが`web/`を打ち消していないか確認してください。パターン解釈はCloudflare UIの説明に従ってください。切り分けのためにBuild watch pathsのフィルターを一時的に外す方法もありますが、その場合はバックエンドのみの変更でもPagesをビルドし得ます。
- **Worker側のプロジェクト**で`web/`だけを変更した場合：Workerのデプロイがスキップされるのは通常想定内です。Pagesのデプロイ履歴を別に確認してください。

設定を保存した後、適切なデプロイを再試行するか**設定に一致する新しい変更**で確認します。CI成功だけではCloudflareのスキップ問題は解決したことになりません。既存設定値をこちらで読み取ったわけではないので、特定のパターンが原因だったとは断定できません。

## 3. D1: 変更履歴を確認してから適用

最新のコードが要求するマイグレーションは`migrations/`と[ローンチ引き継ぎ](PICOSVC_LAUNCH_HANDOFF.md)を照合してください。同引き継ぎには`0027_picosvc_monitor_advanced.sql`と`0029_picosvc_shot_api_keys.sql`の必要性が記録されています。**この番号を今後の最新版として固定しないでください**。

リポジトリのルートで、正しいCloudflareアカウントに認証したこと、`wrangler.jsonc`内のD1 `database_name`／`database_id`が意図する環境であることを確認してから実行します。

```bash
npm install
npx wrangler d1 migrations list remote-mcp-factory --remote
# 本番DBのバックアップと差分確認後、対象が正しい場合のみ:
npx wrangler d1 migrations apply remote-mcp-factory --remote
```

`npm run db:init`は新規環境向けの初期化用であり、稼働中のDBに対して安易に実行しないでください。マイグレーションを本番に適用したという記録なしに「機能が利用可能」と宣言しないでください。

## 4. Workerをデプロイする

リポジトリのルートから、Cloudflareアカウント、対象Worker名、各バインディングとsecretの設定を確認してからデプロイします。`wrangler.jsonc`のWorker名は`remote-mcp-factory`、入口は`src/picosvc-entry.ts`です。

```bash
npm install
npm run typecheck
npx wrangler deploy
```

`wrangler.jsonc`で使用する代表的なバインディングはD1 `DB`、R2 `ARTIFACTS`、Browser Run `BROWSER`、Dynamic Worker `LOADER`、Sandbox、1分間隔のCron Triggerです。MCPのGitHub App、暗号化、Clerk認証に必要な秘密値は[ルートREADME](../README.md)に記載しています。**秘密値をログやREADMEに貼らない**でください。

Cloudflare Email RoutingはWorkerデプロイだけでは設定されません。Mailの受信にはメールドメイン・ルーティング先・受信ルールが別途必要です。BillingもClerk側の実際のプラン設定と権限反映を検証してください。

## 5. 公開後の検証（本番または隔離されたステージング）

1. `GET https://YOUR_DEPLOYED_WORKER_ORIGIN/api/picosvc/health` がHTTP 200か確認。**ヘルスチェックだけでは16製品の正常動作を保証しません**。
2. Pagesの日本語・英語・中国語ページを開き、Clerkログイン、現在の所有者、一覧・作成・編集・エラー表示を確認。
3. `GET /api/picosvc/catalog`で実際の価格・製品・上限を確認。`GET /api/picosvc/account`で現在の権限・当月利用量を確認。
4. 制御できるテスト先でMock公開呼び出し、Hooks受信、RSS初回抽出とXML、Cron実行履歴、Monitor変更／取得エラーを確認。
5. Shotで**実際の画像ピクセル**とPDF、FetchでHTML／空応答／バイナリ／2MiB超／タイムアウトを確認。トークンの失効と利用枠も検証。
6. Mail、Files、Functions、MCP、Billing等、外部プロバイダー依存の機能を個別に確認。テスト用データ・キーの後片付けを行う。

詳細な合否条件は[PICOSVC_LAUNCH_HANDOFF.md](PICOSVC_LAUNCH_HANDOFF.md)、Screenshotの専用手順は[SCREENSHOT_API.md](SCREENSHOT_API.md)へ。CIは型チェック・テスト・ビルド・静的出力の確認であり、**プロバイダーへの実リクエスト、デプロイ反映、課金、メール配送までは保証しません**。

## 6. 切り戻しとトラブルシューティング

- **Pagesは成功、APIが古い／503：** Workerのデプロイ・`NEXT_PUBLIC_FACTORY_API_URL`・バインディング・D1移行を確認。
- **Workerは成功、画面が古い：** Pagesの実デプロイ履歴、Build watch paths、production branch、キャッシュを確認。
- **ログイン後401／CORS：** Clerkのアプリが一致するか、トークンと`WEB_ORIGINS`／`CLERK_AUTHORIZED_PARTIES`を確認。
- **404／偽のURL：** 作成レスポンスからURLをコピー。カタログの`endpointHost`は、DNS設定・稼働確認の証拠ではありません。
- **D1関連500／503：** 本番DB名・IDと適用済みマイグレーションを確認。データを保持したまま復旧できるか評価するまでDROPやDB再作成はしない。
- **本番に問題がある：** 最後に動作確認できたPages／Workerリリースへ戻す手順をCloudflare側で実施。DBのダウングレードは自動で安全とは限らないため、事前にバックアップ・互換性・復旧計画を確認。
