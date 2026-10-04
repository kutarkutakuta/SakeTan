import Link from "next/link";
import { HeaderNavigation } from "@/components/header-navigation";

export function Header() {
  return (
    // Display extensions can add background-related classes before hydration.
    // Limit tolerance to these two decorated elements, not their descendants.
    <header className="header" suppressHydrationWarning>
      <Link href="/" className="logo" aria-label="さけたん ホーム">
        <span className="logo-icon">
          <img src="/brand-icon.png" alt="" width="42" height="42" />
        </span>
        <span className="logo-copy">
          <span className="logo-title">さけのありか</span>
          <span className="logo-subtitle">次の一杯を探そう。</span>
        </span>
      </Link>
      <span
        className="header-plum"
        aria-hidden="true"
        suppressHydrationWarning
      />
      <HeaderNavigation />
    </header>
  );
}
