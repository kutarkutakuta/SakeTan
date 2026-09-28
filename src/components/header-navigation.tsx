"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleQuestionMark, Menu, X } from "lucide-react";
import { HeaderAuth } from "@/components/header-auth";

const registrationLinks = [
  { href: "/brands", label: "銘柄の状態" },
  { href: "/edit", label: "登録情報を編集" },
  { href: "/history", label: "更新履歴" },
] as const;

function RegistrationLinks() {
  const pathname = usePathname();
  return registrationLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={
        pathname === link.href || pathname.startsWith(`${link.href}/`)
          ? "page"
          : undefined
      }
    >
      {link.label}
    </Link>
  ));
}

function closeAfterNavigation(event: MouseEvent<HTMLDetailsElement>) {
  if (event.target instanceof Element && event.target.closest("a"))
    event.currentTarget.removeAttribute("open");
}

export function HeaderNavigation() {
  return (
    <nav className="header-navigation" aria-label="メインメニュー">
      <div className="header-desktop-links">
        <Link href="/help" className="nav-help">
          <CircleQuestionMark size={19} aria-hidden="true" />
          <span>ヘルプ</span>
        </Link>
        <details
          className="header-registration-menu"
          onClick={closeAfterNavigation}
        >
          <summary className="header-registration-trigger">
            登録情報
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <div className="header-registration-submenu">
            <RegistrationLinks />
          </div>
        </details>
        <HeaderAuth />
      </div>

      <details className="mobile-header-details" onClick={closeAfterNavigation}>
        <summary className="mobile-menu-trigger">
          <Menu
            className="mobile-menu-open-icon"
            size={21}
            aria-hidden="true"
          />
          <X className="mobile-menu-close-icon" size={21} aria-hidden="true" />
          <span>メニュー</span>
        </summary>
        <span className="mobile-menu-backdrop" aria-hidden="true" />
        <div className="mobile-header-menu">
          <Link href="/help" className="mobile-header-link">
            <CircleQuestionMark size={19} aria-hidden="true" />
            ヘルプ
          </Link>
          <div className="mobile-header-section">
            <p>登録情報</p>
            <RegistrationLinks />
          </div>
          <div className="mobile-header-account">
            <HeaderAuth />
          </div>
        </div>
      </details>
    </nav>
  );
}
