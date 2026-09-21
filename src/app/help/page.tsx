import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Database,
  ExternalLink,
  HeartHandshake,
  LogIn,
  Mail,
  UserRound,
} from "lucide-react";

export const metadata: Metadata = {
  title: "ヘルプ",
  description:
    "さけのありかの特徴、掲載情報についての注意点、ログインの有無で利用できる機能をご案内します。",
};

function XLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function HelpPage() {
  return (
    <main id="main" className="page info-page">
      <Link className="back" href="/">
        <ArrowLeft size={17} aria-hidden="true" />
        地図に戻る
      </Link>

      <section className="info-hero" aria-labelledby="help-title">
        <p className="info-lead">
          「
          <span className="logo-title" style={{ fontSize: "20px" }}>
            さけのありか
          </span>
          」
          は、飲みたい日本酒から取扱店を探したり、近くの酒屋から取扱銘柄を探したりできる、
          みんなで育てる酒屋マップです。
        </p>
      </section>

      <section className="info-section" aria-labelledby="important-title">
        <h2 id="important-title">はじめに知ってほしいこと</h2>
        <div className="help-callout-grid">
          <article className="help-callout help-callout-community">
            <div className="help-callout-heading">
              <HeartHandshake size={22} aria-hidden="true" />
              <h3>見つけた情報を、次の人へ</h3>
            </div>
            <p>
              「
              <span className="logo-title" style={{ fontSize: "18px" }}>
                さけのありか
              </span>
              」は、
              みなさんの投稿で成り立っています。探していたお酒や酒屋を見つけて「役に立った」と思ったら、店頭で見かけた銘柄や変わっていた取扱情報を、ぜひ積極的に更新してください。ひとつひとつの更新が、次に探す人の助けになります。
            </p>
          </article>

          <article className="help-callout">
            <div className="help-callout-heading">
              <Database size={22} aria-hidden="true" />
              <h3>銘柄マスタは「さけのわ」由来です</h3>
            </div>
            <p>
              銘柄・酒蔵の基本データは、
              <a
                href="https://sakenowa.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                さけのわデータ
                <ExternalLink size={15} aria-hidden="true" />
              </a>
              を取り込んでいます。利用者は銘柄・酒蔵を直接登録したり、削除したりできません。見つからない銘柄は、運営へ報告できます。
            </p>
          </article>

          <article className="help-callout help-callout-warning">
            <div className="help-callout-heading">
              <CircleAlert size={22} aria-hidden="true" />
              <h3>取扱いや在庫を保証する情報ではありません</h3>
            </div>
            <p>
              酒屋の取扱情報は、利用者の発見や投稿をもとに蓄積しています。誰でも取扱銘柄を登録・変更できるため、現在の取扱いや在庫を保証するものではありません。
            </p>
            <p>
              <strong>
                特に入手困難な人気銘柄（十四代、新政、而今、花陽浴、ソガペールなど）は、購入条件があったり、店頭販売されていない場合があります。
              </strong>
              掲載されていても購入できるとは限らないため、ご注意ください。
            </p>
          </article>

          <article className="help-callout help-callout-contact">
            <div className="help-callout-heading">
              <Mail size={22} aria-hidden="true" />
              <h3>掲載内容の修正・削除について</h3>
            </div>
            <p>
              店舗関係者の方で掲載を希望されない場合や、掲載内容の修正・削除をご希望の場合は、お問い合わせください。
              <br />
              内容を確認のうえ、速やかに対応します。
            </p>
          </article>
        </div>
      </section>

      <section className="info-section" aria-labelledby="marker-colors-title">
        <h2 id="marker-colors-title">地図の色について</h2>
        <p className="info-section-intro">
          酒蔵アイコンは、登録されている取扱銘柄数に応じて色が変わります。色が濃いほど、登録銘柄が多いことを示します。0件は取扱情報がまだ登録されていない状態で、実際に取扱がないとは限りません。
        </p>
        <ul className="marker-color-legend">
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-0"
              aria-hidden="true"
            />
            <span>
              <strong>0件</strong>
              <small>取扱情報が未登録</small>
            </span>
          </li>
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-1"
              aria-hidden="true"
            />
            <span>
              <strong>1〜19件</strong>
              <small>少なめ</small>
            </span>
          </li>
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-2"
              aria-hidden="true"
            />
            <span>
              <strong>20〜49件</strong>
              <small>やや多め</small>
            </span>
          </li>
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-3"
              aria-hidden="true"
            />
            <span>
              <strong>50〜99件</strong>
              <small>中程度</small>
            </span>
          </li>
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-4"
              aria-hidden="true"
            />
            <span>
              <strong>100〜199件</strong>
              <small>多め</small>
            </span>
          </li>
          <li>
            <span
              className="marker-color-swatch marker-color-swatch-5"
              aria-hidden="true"
            />
            <span>
              <strong>200件以上</strong>
              <small>とても多い</small>
            </span>
          </li>
        </ul>
      </section>

      <section className="info-section" aria-labelledby="usage-title">
        <h2 id="usage-title">ログインは必要なときだけ</h2>
        <p className="info-section-intro">
          探す・見る・取扱情報を更新する基本機能は、ログインせず利用できます。アカウントが必要なのは、酒屋情報や自分の記録を継続して管理するときです。
        </p>

        <div className="help-access-grid">
          <article className="help-access-card">
            <div className="help-access-heading">
              <LogIn size={22} aria-hidden="true" />
              <h3>ログインなしでできること</h3>
            </div>
            <ul>
              <li>
                <strong>酒屋・銘柄を探す</strong>
                <span>名前や現在地、地図のエリアから検索できます。</span>
              </li>
              <li>
                <strong>取扱情報を見る・更新する</strong>
                <span>
                  酒屋の取扱銘柄を確認し、「取扱あり」「現在は取扱なし」「誤った取扱情報」を登録できます。
                </span>
              </li>
              <li>
                <strong>見つけた情報を共有する</strong>
                <span>
                  日付やコメントを添えて投稿し、見つからない銘柄を運営へ報告できます。
                </span>
              </li>
            </ul>
          </article>

          <article className="help-access-card help-access-card-account">
            <div className="help-access-heading">
              <UserRound size={22} aria-hidden="true" />
              <h3>ログインしてできること</h3>
            </div>
            <ul>
              <li>
                <strong>酒屋情報を登録・編集する</strong>
                <span>新しい酒屋の追加や、掲載情報の修正ができます。</span>
              </li>
              <li>
                <strong>酒屋へコメントする</strong>
                <span>店舗についての情報をコメントとして共有できます。</span>
              </li>
              <li>
                <strong>自分の貢献を引き継ぐ</strong>
                <span>
                  ログイン前の操作履歴を引き継ぎ、表示名や貢献記録を確認できます。
                </span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <div className="privacy-link-row">
        <p className="help-contact">
          お問い合わせ：
          <a
            href="https://x.com/kutakutakutar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X（クタクター）"
            title="X（クタクター）"
          >
            <XLogo size={18} />
          </a>
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=kutarkutakuta@gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="メールでお問い合わせ（kutarkutakuta@gmail.com）"
            title="メールでお問い合わせ"
          >
            <Mail size={18} aria-hidden="true" />
          </a>
        </p>
        <Link href="/privacy">
          プライバシーポリシー
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
