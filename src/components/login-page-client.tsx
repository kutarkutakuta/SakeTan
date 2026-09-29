"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LoginOptions } from "@/components/login-options";
import { ToastOnMount } from "@/components/toast-provider";
import { configured, viewerIdentity } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/utils";

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next") ?? undefined);
  const error = searchParams.get("error");
  const [account, setAccount] = useState<{
    anonymous: boolean;
    signedIn: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void viewerIdentity()
      .then(({ user, anonymous }) => {
        if (active) setAccount({ anonymous, signedIn: Boolean(user) });
      })
      .catch(() => {
        if (active) setAccount({ anonymous: false, signedIn: false });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main id="main" className="page narrow">
      <a className="back" href={next}>
        <ArrowLeft size={17} />
        戻る
      </a>
      <section className="card login-page-card">
        <p className="eyebrow">さけたんを、続けて使う。</p>
        <h1>
          {account?.anonymous
            ? "匿名の操作履歴をアカウントに引き継ぐ"
            : account?.signedIn
              ? "ログイン方法を追加"
              : "ログイン"}
        </h1>
        <p className="login-description">
          {account?.anonymous
            ? "このブラウザで行った取扱情報の変更を保ったまま、別の端末でも利用できるようになります。"
            : "Google、X、Facebookのいずれかを利用できます。表示名はあとから変更できます。"}
        </p>
        {error && <ToastOnMount message={error} tone="error" />}
        {configured() ? (
          <LoginOptions next={next} />
        ) : (
          <p className="notice">ログインにはSupabaseの接続設定が必要です。</p>
        )}
        <p className="login-note">
          個別の取扱銘柄編集はログインなしでも利用できます。
        </p>
      </section>
    </main>
  );
}
