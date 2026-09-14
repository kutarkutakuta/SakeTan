import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginOptions } from "@/components/login-options";
import { configured, viewer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const next = safeNext(query.next);
  const account = await viewer();
  return (
    <main id="main" className="page narrow">
      <Link className="back" href={next}>
        <ArrowLeft size={17} />
        戻る
      </Link>
      <section className="card login-page-card">
        <p className="eyebrow">さけたんを、続けて使う。</p>
        <h1>
          {account.anonymous
            ? "匿名の操作履歴をアカウントに引き継ぐ"
            : account.user
              ? "ログイン方法を追加"
              : "ログイン"}
        </h1>
        <p className="login-description">
          {account.anonymous
            ? "このブラウザで行った取扱情報の変更を保ったまま、別の端末でも利用できるようになります。"
            : "Google、X、Facebookのいずれかを利用できます。表示名はあとから変更できます。"}
        </p>
        {query.error && (
          <p className="notice error" role="alert">
            {query.error}
          </p>
        )}
        {configured() ? (
          <LoginOptions next={next} />
        ) : (
          <p className="notice">ログインにはSupabaseの接続設定が必要です。</p>
        )}
        <p className="login-note">
          取扱銘柄の編集は、ログインなしでも利用できます。
        </p>
      </section>
    </main>
  );
}
