import Link from "next/link";
import { CircleQuestionMark, LogIn, UserRound } from "lucide-react";
import { viewer } from "@/lib/supabase/server";
export async function Header() {
  const { user, anonymous, name } = await viewer();
  return (
    <header className="header">
      <Link href="/" className="logo" aria-label="さけたん ホーム">
        <span className="logo-icon">
          <img src="/brand-icon.png" alt="" width="42" height="42" />
        </span>
        <span className="logo-copy">
          <span className="logo-title">さけのありか</span>
          <span className="logo-subtitle">次の一杯を探そう。</span>
        </span>
      </Link>
      <nav>
        <Link href="/help" className="nav-help" aria-label="ヘルプ">
          <CircleQuestionMark size={19} aria-hidden="true" />
          <span>ヘルプ</span>
        </Link>
        <Link href="/history" className="nav-map">
          更新履歴
        </Link>
        {user && !anonymous ? (
          <Link
            className="button small ghost header-auth-link"
            href="/account"
            aria-label={name ?? "アカウント"}
          >
            <UserRound size={17} />
            <span className="account-name header-auth-label">
              {name ?? "アカウント"}
            </span>
          </Link>
        ) : (
          <Link
            className="button small ghost header-auth-link"
            href="/login"
            aria-label={anonymous ? "アカウントを保存" : "ログイン"}
          >
            <LogIn size={17} />
            <span className="header-auth-label">
              {anonymous ? "アカウントを保存" : "ログイン"}
            </span>
          </Link>
        )}
      </nav>
    </header>
  );
}
