# JSON / Hooks 個別管理画面

PicoSvc の既存 Worker API を利用する、Clerk 認証付きの個別管理画面。日本語・英語・中国語の静的ページを生成します。コード上の機能の説明であり、Cloudflare 本番への反映や実運用試験を保証するものではありません。

| サービス | パス | 主な機能 |
| --- | --- | --- |
| JSON | `/ja/json/manage/` | ストア一覧、公開読み取り切替、指定キーのドキュメント取得／編集／削除、スコープ付きトークンの**メタデータ**と失効 |
| Hooks | `/ja/hooks/manage/` | 受信箱一覧、受付停止／再開、名称変更、イベントメタデータ一覧、過去履歴の追加読み込み、確認付きイベント削除 |

`/en/` および `/zh-cn/` でも同じ経路を静的出力します。各サービスの既存ワークスペースにも専用管理画面への導線を追加します。

## 接続先とプライバシー

- 認証は Clerk のアクティブセッションによる Bearer トークン。`NEXT_PUBLIC_FACTORY_API_URL` と `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` が必要。リクエストは `cache: 'no-store'`、`redirect: 'error'` を使います。アカウント／組織変更時は編集画面を再マウントします。
- JSON 一覧は `GET /api/picosvc/json/stores`。設定は `GET/PATCH /api/picosvc/json/stores/:id/settings`。トークン一覧は `GET /api/picosvc/json/stores/:id/tokens`、失効は `DELETE /api/picosvc/json/stores/:id/tokens/:tokenId`。
- JSON ドキュメントは**キー入力後に限り** `GET/PUT/DELETE /api/picosvc/json/stores/:id/documents/:key`。本文は明示的な読み込み／編集中だけブラウザに保持します。公開 URL は公開読み取り設定を有効にした場合に限り認証なしでアクセス可能です。設定変更前には警告を表示します。
- 管理用ドキュメント PUT は既存 API の無条件上書き仕様。上書き前に確認しますが、競合検出は行えません。他の編集者がいる場合は保存直前の内容再確認が必要です。ドキュメント最大 256 KiB。キー名は UI で保守的に検証し、`..` は許可しません。
- Hooks 一覧は `GET /api/picosvc/hooks/inboxes`、編集は `PATCH /api/picosvc/hooks/inboxes/:id`、イベント一覧は `GET /api/picosvc/hooks/inboxes/:id/events?limit=50` と `before` ページング。イベント削除は `DELETE /api/picosvc/hooks/events/:eventId`。
- Hooks のイベント本文・本文プレビュー・ヘッダー・クエリ・受信パスを画面に渡すモデルで除外。`GET /api/picosvc/hooks/events/:eventId`（全文取得）と再送 API は、この画面では**呼び出しません**。本文を扱う作業は既存の詳細ワークスペースを利用してください。
- ストアと受信箱は owner-scoped な既存管理 API を使用。トークンの秘密文字列／ハッシュは一覧に表示せず、この画面では新規トークン発行と主トークンのローテーションは行いません。
- 受信箱を停止すると新規 `/hooks/:publicId` へのリクエストは 404。削除したイベントと本文は復元できません。操作前に確認ダイアログを表示します。

## CI とリリース境界

- 通常CI: `node --experimental-strip-types scripts/test-picosvc-json-hooks-desks.mjs`。レスポンスの allowlist、無効ID／キー、秘密情報遮断、ページ配線と操作確認を検証。
- Web CI: TypeScript、既存UI回帰テスト、Next.js build、静的出力を確認。
- 今回は Worker API、データベース移行、課金処理を変更しません。

## 本番の受け入れ確認（未実施）

1. デプロイされた Pages と Worker の環境変数・バージョンを照合し、日本語・英語・中国語ページを認証付きで開く。
2. 2つの独立アカウントで相互のリソースが見えないことと、組織切替で旧データが残らないことを確認。
3. JSON でテスト用ストアの公開読み取りを有効／無効にし、匿名 GET の許可／拒否を確認。テストキーに保存・再読込・削除し、256 KiB 制限を確認。
4. Hooks でテスト受信箱を停止・再開、ダミーイベントを受信、ページングとイベント削除を確認。通常のイベント一覧に機密本文・ヘッダーが出ないことを確認。
5. 実ユーザーのトークン失効・本番データ削除は行わず、専用テスト用リソースを使用。
