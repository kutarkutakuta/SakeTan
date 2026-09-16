import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Heart, Store, Trophy } from "lucide-react";
import { LoginOptions } from "@/components/login-options";
import {
  IdentityManager,
  type LinkedIdentity,
} from "@/components/identity-manager";
import { ProfileForm } from "@/components/profile-form";
import {
  contributionAchievement,
  type ContributionSummary,
} from "@/lib/contribution";
import { supabase, viewer } from "@/lib/supabase/server";
import {
  isIdentityProvider,
  loginProviderForIdentity,
} from "@/lib/auth-identities";

export default async function AccountPage() {
  const account = await viewer();
  if (!account.user || account.anonymous) redirect("/login?next=/account");
  const identities = account.user.identities ?? [];
  const linkedIdentities = identities.flatMap((identity): LinkedIdentity[] =>
    isIdentityProvider(identity.provider)
      ? [
          {
            identityId: identity.identity_id,
            provider: identity.provider,
          },
        ]
      : [],
  );
  const linked = new Set(
    linkedIdentities.map((identity) =>
      loginProviderForIdentity(identity.provider),
    ),
  );
  const db = await supabase();
  const { data, error } = await db!.rpc("get_my_contribution_summary");
  if (error) throw new Error("貢献記録を取得できませんでした");
  const contribution = data as unknown as ContributionSummary;
  const achievement = contributionAchievement(contribution.shop_brand_count);
  return (
    <main id="main" className="page narrow">
      <Link className="back" href="/">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head">
        <h1>アカウント</h1>
      </div>
      <ProfileForm initialName={account.name ?? "日本酒さん"} />
      <section className="card contribution-card">
        <div className="contribution-heading">
          <div>
            <p className="eyebrow">
              <Trophy size={16} /> あなたの貢献
            </p>
            <h2>取扱登録の達成度</h2>
          </div>
          <span className="achievement-badge" aria-label="現在の達成名">
            <BadgeCheck size={22} />
            {achievement.name}
          </span>
        </div>
        <div className="contribution-stats">
          <div>
            <strong>{contribution.shop_brand_count}</strong>
            <span>取扱銘柄登録</span>
          </div>
          <div>
            <strong>{contribution.shop_count}</strong>
            <span>酒屋登録</span>
          </div>
          <div>
            <strong>{contribution.resolved_brand_request_count}</strong>
            <span>解決した銘柄報告</span>
          </div>
        </div>
        <div className="achievement-progress">
          <div>
            <span>
              {achievement.next
                ? `次の「${achievement.next.name}」まで`
                : "すべての達成名を獲得しました"}
            </span>
            <strong>
              {achievement.value} / {achievement.target}件
            </strong>
          </div>
          <progress
            value={achievement.value}
            max={achievement.target}
            aria-label="取扱銘柄登録の達成度"
          >
            {achievement.value} / {achievement.target}
          </progress>
          <p className="hint">
            「取扱あり」「現在は取扱なし」の有効な取扱銘柄登録で進みます。
          </p>
        </div>
      </section>
      <section className="card favorite-shops-card">
        <div className="favorite-shops-heading">
          <Heart size={20} />
          <div>
            <h2>ひいきの酒屋</h2>
            <p className="hint">よく取扱銘柄を登録している酒屋です。</p>
          </div>
        </div>
        {contribution.favorite_shops.length ? (
          <div className="favorite-shop-list">
            {contribution.favorite_shops.map((shop) => (
              <Link href={`/shops/${shop.shop_id}`} key={shop.shop_id}>
                <Store size={19} />
                <span>
                  <strong>{shop.shop_name}</strong>
                  <small>取扱銘柄を{shop.contribution_count}件登録</small>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted favorite-shop-empty">
            同じ酒屋で取扱銘柄を2件以上登録すると、ここに表示されます。
          </p>
        )}
      </section>
      <section className="card form-stack">
        <div>
          <h2>ログイン方法</h2>
          <p className="hint">
            複数のサービスを連携すると、どの方法でも同じアカウントを利用できます。
          </p>
        </div>
        <IdentityManager
          identities={linkedIdentities}
          totalIdentityCount={identities.length}
        />
        <LoginOptions next="/account" exclude={[...linked]} linking />
      </section>
      <form action="/auth/signout" method="post">
        <button className="button ghost full" type="submit">
          ログアウト
        </button>
      </form>
    </main>
  );
}
