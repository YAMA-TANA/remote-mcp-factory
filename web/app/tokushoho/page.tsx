import type { Metadata } from 'next';
import ProtectedContact from '../components/ProtectedContact';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 — PicoSvc',
  description: 'PicoSvcの特定商取引法に基づく表示です。',
};

export default function TokushohoPage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="/">Products</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
      </nav>

      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> Legal</div>
        <h1>特定商取引法に基づく表記</h1>

        <div className="legalTable">
          <section><h2>運営</h2><p>個人事業主 Y&amp;T</p></section>
          <section><h2>販売事業者の氏名</h2><p>請求があった場合、電子メールその他の適切な方法により遅滞なく開示します。</p></section>
          <section><h2>所在地</h2><p>請求があった場合、電子メールその他の適切な方法により遅滞なく開示します。</p></section>
          <section><h2>お問い合わせ先</h2><p>メール</p><ProtectedContact kind="email" /><p>電話</p><ProtectedContact kind="phone" /></section>
          <section><h2>販売価格・役務の対価</h2><p>各PicoSvc製品ページおよび購入・申込みの最終確認画面に表示します。製品ごとに個別のプラン・料金・利用上限が設定されます。Bundleを販売する場合は、対象製品、付与されるプランまたは利用枠、料金、契約期間を購入画面に表示します。</p></section>
          <section><h2>販売価格以外に必要となる費用</h2><p>インターネット接続料金、通信料金その他利用者側で発生する費用は利用者の負担となります。決済事業者、カード会社または金融機関が別途手数料や為替手数料を課す場合があります。</p></section>
          <section><h2>支払方法</h2><p>購入画面に表示される決済方法をご利用いただけます。</p></section>
          <section><h2>支払時期</h2><p>初回申込み時に課金され、継続課金プランについては購入画面に表示された請求周期ごとに自動更新・課金されます。</p></section>
          <section><h2>役務の提供時期</h2><p>原則として決済確認後、技術的処理に必要な時間を除き速やかに利用可能となります。無料プランはアカウント作成後、対象機能の提供条件を満たした時点から利用できます。</p></section>
          <section><h2>継続契約・自動更新</h2><p>月額その他の継続課金プランは、購入画面に表示された請求周期で自動更新されます。次回更新前にアカウントまたは決済管理画面から解約できます。解約後も、特段の表示がない限り、支払済み期間の終了まで利用できます。</p></section>
          <section><h2>申込みの撤回・解約・返金</h2><p>デジタルサービスの性質上、提供開始後の返品はありません。継続課金は将来の更新を停止する形で解約できます。既に支払われた料金は、法令上必要な場合または購入画面等で明示した場合を除き返金しません。</p></section>
          <section><h2>申込み期間</h2><p>申込み期間を限定する場合は、対象ページおよび購入画面にその期間を表示します。表示がない場合、特別な申込み期限はありません。</p></section>
          <section><h2>利用条件・動作環境</h2><p>インターネット接続環境が必要です。Web管理画面は最新の主要ブラウザを想定しています。API・Webhook・MCP等の製品は、各製品ページまたはドキュメントに記載する技術要件、利用上限、レート制限その他の条件に従います。</p></section>
          <section><h2>特別な販売条件</h2><p>各製品は原則として個別契約です。ある製品の有料プランを購入しても、別の製品が自動的に有料化されるものではありません。Bundleについては、購入画面に明示された製品・プラン・利用枠のみが対象です。</p></section>
          <section><h2>その他の表示事項の開示</h2><p>法令上、請求により開示することが認められている事項については、購入判断に先立って確認できるよう、請求を受けた後に遅滞なく開示します。開示請求は <a href="/contact">Contact &amp; Support</a> から行ってください。</p></section>
        </div>
      </article>

      <footer className="shell"><span>PicoSvc</span><span><a href="/contact">Contact</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/tokushoho">特定商取引法</a></span></footer>
    </main>
  );
}
