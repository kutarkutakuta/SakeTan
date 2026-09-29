"use client";

import { useEffect, useState } from "react";
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
import { supabase, viewerIdentity } from "@/lib/supabase/browser";
import {
  isIdentityProvider,
  loginProviderForIdentity,
} from "@/lib/auth-identities";

type AccountState = {
  name: string | null;
  linkedIdentities: LinkedIdentity[];
  totalIdentityCount: number;
  linked: string[];
  contribution: ContributionSummary;
};

export default function AccountPage() {
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const [db, account] = await Promise.all([supabase(), viewerIdentity()]);
      if (!db || !account.user || account.anonymous) {
        window.location.replace("/login?next=/account");
        return;
      }
      const identities: Array<{ identity_id: string; provider: string }> =
        account.user.identities ?? [];
      const linkedIdentities: LinkedIdentity[] = identities.flatMap(
        (identity) =>
          isIdentityProvider(identity.provider)
            ? [
                {
                  identityId: identity.identity_id,
                  provider: identity.provider,
                },
              ]
            : [],
      );
      const { data, error: queryError } = await db.rpc(
        "get_my_contribution_summary",
      );
      if (queryError) {
        if (active) setError("貢献記録を取得できませんでした");
        return;
      }
      if (active)
        setState({
          name: account.name,
          linkedIdentities,
          totalIdentityCount: identities.length,
          linked: linkedIdentities.map((identity) =>
            loginProviderForIdentity(identity.provider),
          ),
          contribution: data as unknown as ContributionSummary,
        });
    })().catch(() => {
      if (active) setError("アカウント情報を取得できませんでした");
    });
    return () => {
      active = false;
    };
  }, []);

  if (!state)
    return (
      <main id="main" className="page narrow">
        <p className="muted">{error || "アカウント情報を読み込んでいます…"}</p>
      </main>
    );

  const { contribution, linkedIdentities, linked } = state;
  const achievement = contributionAchievement(contribution.shop_brand_count);
  return (
    <main id="main" className="page narrow">
      <a className="back" href="/">
        <ArrowLeft size={17} />
        地図に戻る
      </a>
      <div className="page-head">
        <h1>アカウント</h1>
      </div>
      <ProfileForm initialName={state.name ?? "日本酒さん"} />
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
            <strong>{contribution.approved_brand_application_count}</strong>
            <span>承認された銘柄申請</span>
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
              <a href={`/shops/${shop.shop_id}`} key={shop.shop_id}>
                <Store size={19} />
                <span>
                  <strong>{shop.shop_name}</strong>
                  <small>取扱銘柄を{shop.contribution_count}件登録</small>
                </span>
              </a>
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
          totalIdentityCount={state.totalIdentityCount}
        />
        <LoginOptions next="/account" exclude={linked} linking />
      </section>
      <form action="/auth/signout" method="post">
        <button className="button ghost full" type="submit">
          ログアウト
        </button>
      </form>
    </main>
  );
}
