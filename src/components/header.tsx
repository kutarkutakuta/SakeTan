import Link from "next/link";
import { CircleQuestionMark } from "lucide-react";
import { HeaderAuth } from "@/components/header-auth";

export function Header() {
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
        <HeaderAuth />
      </nav>
    </header>
  );
}
