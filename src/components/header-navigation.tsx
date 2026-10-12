"use client";

import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleQuestionMark, Menu, Search, X } from "lucide-react";
import { HeaderAuth, type HeaderViewer } from "@/components/header-auth";
import { fetchJson } from "@/lib/client";

const directoryLinks = [
  { href: "/brands", label: "銘柄一覧" },
  { href: "/breweries", label: "酒蔵一覧" },
  { href: "/shops", label: "酒屋一覧" },
  { href: "/history", label: "更新履歴" },
] as const;

function DirectoryLinks() {
  const pathname = usePathname();
  return directoryLinks.map((link) => (
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

function closeOnFocusOut(event: FocusEvent<HTMLDetailsElement>) {
  const nextTarget = event.relatedTarget;
  if (
    !(nextTarget instanceof Node) ||
    !event.currentTarget.contains(nextTarget)
  )
    event.currentTarget.removeAttribute("open");
}

export function HeaderNavigation() {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<HeaderViewer | null>();

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<HeaderViewer>(
      "/api/viewer",
      { cache: "no-store", signal: controller.signal },
      "アカウント情報を取得できませんでした",
    )
      .then(setViewer)
      .catch(() => {
        if (!controller.signal.aborted) setViewer(null);
      });
    return () => controller.abort();
  }, []);

  return (
    <nav className="header-navigation" aria-label="メインメニュー">
      <div className="header-desktop-links">
        <div className="header-directory-links">
          <DirectoryLinks />
        </div>
        <Link href="/help" className="nav-help" aria-label="ヘルプ">
          <CircleQuestionMark size={19} aria-hidden="true" />
          <span>ヘルプ</span>
        </Link>
        <HeaderAuth viewer={viewer} />
      </div>

      {pathname === "/" && (
        <button
          type="button"
          className="mobile-search-trigger"
          aria-controls="mobile-search-area"
          aria-label="検索を開閉"
          title="検索"
          onClick={() => window.dispatchEvent(new Event("sake:toggle-search"))}
        >
          <Search size={21} aria-hidden="true" />
        </button>
      )}

      <details
        className="mobile-header-details"
        onClick={closeAfterNavigation}
        onBlur={closeOnFocusOut}
      >
        <summary className="mobile-menu-trigger">
          <Menu
            className="mobile-menu-open-icon"
            size={21}
            aria-hidden="true"
          />
          <X className="mobile-menu-close-icon" size={21} aria-hidden="true" />
          <span className="sr-only">メニュー</span>
        </summary>
        <span className="mobile-menu-backdrop" aria-hidden="true" />
        <div className="mobile-header-menu">
          <div className="mobile-header-section">
            <DirectoryLinks />
          </div>
          <Link href="/help" className="mobile-header-link">
            <CircleQuestionMark size={19} aria-hidden="true" />
            ヘルプ
          </Link>
          <div className="mobile-header-account">
            <HeaderAuth viewer={viewer} />
          </div>
        </div>
      </details>
    </nav>
  );
}
