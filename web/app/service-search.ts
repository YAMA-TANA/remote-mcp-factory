import type { GenericServiceSlug } from './service-data';

export type SearchableService = GenericServiceSlug | 'mock';

/** User vocabulary, not just product names. Shared by the home directory and command palette. */
export const SERVICE_SEARCH_ALIASES: Record<SearchableService, string> = {
  mock: 'モック 模擬 テスト api 仮レスポンス 模拟 接口 测试',
  mcp: 'エムシーピー ai ツール サーバー 公開 ホスティング 托管 服务器 部署',
  hooks: 'ウェブフック フック 受信 再送 通知 钩子 接收 重放',
  rss: 'フィード 更新 ニュース サイト 購読 订阅 资讯',
  mail: 'メール 電子メール 転送 受信 邮件 转发',
  shot: 'スクショ スクリーンショット 画面撮影 キャプチャ 画像 png pdf 截图 网页截图',
  fetch: '取得 抽出 本文 メタデータ マークダウン 爬取 提取 抓取',
  qr: '二次元コード キューアール リンク リダイレクト 二维码 跳转',
  cron: 'スケジュール 定期実行 時間 予約 タイマー 定时 计划任务',
  functions: '関数 コード 実行 エッジ 脚本 函数 边缘计算',
  json: 'データ 保存 ストア キーバリュー 数据 存储 文档',
  files: 'ファイル アップロード ダウンロード ストレージ 文件 上传 下载 对象存储',
  license: 'ライセンス 認証キー アクティベーション 许可证 激活 密钥',
  flags: 'フラグ 機能切替 リモート設定 トグル 开关 功能标志 配置',
  monitor: '監視 変更検知 差分 アラート 稼働確認 网站监控 变更提醒',
  forms: 'フォーム 問い合わせ アンケート 送信 收集 表单 提交',
};

export function normalizeServiceSearch(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

export function matchesServiceSearch(slug: SearchableService, normalizedQuery: string, ...texts: string[]): boolean {
  if (!normalizedQuery) return true;
  return [slug, SERVICE_SEARCH_ALIASES[slug], ...texts]
    .some(text => normalizeServiceSearch(text).includes(normalizedQuery));
}
