import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "さけのありかにおける利用者情報の取り扱いについて説明します。",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="page info-page policy-page">
      <Link className="back" href="/help">
        <ArrowLeft size={17} aria-hidden="true" />
        ヘルプに戻る
      </Link>

      <section className="info-hero" aria-labelledby="privacy-title">
        <h1 id="privacy-title">プライバシーポリシー</h1>
        <p className="info-lead">
          「さけのありか」では、サービスの提供と改善に必要な範囲で利用者情報を取り扱います。
        </p>
        <p className="policy-date">制定日：2026年9月20日</p>
      </section>

      <div className="policy-sections">
        <section className="policy-section">
          <h2>1. 取得する情報</h2>
          <p>本サービスでは、次の情報を取得する場合があります。</p>
          <ul>
            <li>
              ログイン時の識別情報、メールアドレス、表示名、プロフィール画像など、認証サービスから提供される情報
            </li>
            <li>
              酒屋情報、取扱銘柄、投稿日時、コメント、変更履歴など、利用者が登録・投稿した情報
            </li>
            <li>
              Cookie、IPアドレス、ブラウザーや端末の情報、アクセス日時など、サービス利用時に自動的に送信される情報
            </li>
            <li>
              現在地の利用を許可した場合の位置情報。近くの酒屋を表示するために使用し、利用者プロフィールとして保存することを目的としていません
            </li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>2. 利用目的</h2>
          <ul>
            <li>
              地図、検索、取扱情報、投稿など本サービスの機能を提供するため
            </li>
            <li>本人確認、アカウント管理、不正利用の防止を行うため</li>
            <li>
              登録内容の変更履歴を保ち、情報の信頼性を確認できるようにするため
            </li>
            <li>
              利用状況を把握し、本サービスの品質や使いやすさを改善するため
            </li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>3. 公開される情報</h2>
          <p>
            表示名、酒屋情報、取扱銘柄、コメント、投稿日時、変更内容などは、サービス上で他の利用者に公開される場合があります。メールアドレスやログインに用いる識別情報は公開しません。
          </p>
          <p>
            情報の信頼性を保つため、ログアウトやログイン方法の連携解除後も、投稿や変更履歴が残る場合があります。
          </p>
        </section>

        <section className="policy-section">
          <h2>4. 外部サービスの利用</h2>
          <p>本サービスは、機能提供のために次の外部サービスを利用します。</p>
          <ul>
            <li>Supabase：認証、データベースおよび関連機能</li>
            <li>Google Maps Platform：地図、現在地周辺および店舗検索</li>
            <li>Google、X、Facebook：希望した場合のソーシャルログイン</li>
            <li>さけのわデータ：酒蔵・銘柄マスタのデータ提供元</li>
          </ul>
          <p>
            各サービスによる情報の取り扱いには、それぞれの利用規約やプライバシーポリシーが適用されます。
          </p>
        </section>

        <section className="policy-section">
          <h2>5. 第三者への提供</h2>
          <p>
            法令に基づく場合、利用者または第三者の権利・安全を守るために必要な場合、ならびにサービス提供に必要な委託先へ取り扱いを委託する場合を除き、利用者情報を本人の同意なく第三者へ提供しません。
          </p>
        </section>

        <section className="policy-section">
          <h2>6. Cookieなどの利用</h2>
          <p>
            ログイン状態の維持、匿名操作の記録、セキュリティ確保などのためにCookieまたは同様の仕組みを利用します。ブラウザーの設定でCookieを無効にすると、一部の機能を利用できない場合があります。
          </p>
        </section>

        <section className="policy-section">
          <h2>7. 情報の管理</h2>
          <p>
            取得した情報への不正アクセス、漏えい、改ざんなどを防ぐため、合理的な安全管理措置を講じます。情報は、利用目的、法令、サービス運営上の必要性に応じた期間保持します。
          </p>
        </section>

        <section className="policy-section">
          <h2>8. ポリシーの変更</h2>
          <p>
            サービス内容や法令の変更に応じて、本ポリシーを改定することがあります。重要な変更がある場合は、サービス上で分かりやすくお知らせします。
          </p>
        </section>
      </div>
    </main>
  );
}
