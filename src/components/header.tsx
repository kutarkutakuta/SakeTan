import Link from "next/link";
import { MapPin, LogIn, UserRound } from "lucide-react";
import { viewer } from "@/lib/supabase/server";
export async function Header() {
  const { user, anonymous, name } = await viewer();
  return (
    <header className="header">
      <Link href="/" className="logo" aria-label="さけたん ホーム">
        <span className="logo-icon">
          <MapPin size={23} strokeWidth={1.8} />
        </span>
        <span>さけたん</span>
      </Link>
      <nav>
        <Link href="/history" className="nav-map">
          更新履歴
        </Link>
        {user && !anonymous ? (
          <Link className="button small ghost" href="/account">
            <UserRound size={17} />
            <span className="account-name">{name ?? "アカウント"}</span>
          </Link>
        ) : (
          <Link className="button small ghost" href="/login">
            <LogIn size={17} />
            {anonymous ? "アカウントを保存" : "ログイン"}
          </Link>
        )}
      </nav>
    </header>
  );
}
