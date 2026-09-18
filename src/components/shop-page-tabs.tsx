"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type ShopPageTab = "brands" | "comments";

export function ShopPageTabs({
  initialTab,
  brandCount,
  commentCount,
  brands,
  comments,
}: {
  initialTab: ShopPageTab;
  brandCount: number;
  commentCount: number;
  brands: ReactNode;
  comments: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<ShopPageTab>(initialTab);
  const tabsRef = useRef<HTMLDivElement>(null);
  const brandTabRef = useRef<HTMLButtonElement>(null);
  const commentTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function syncTabFromUrl() {
      const url = new URL(window.location.href);
      if (
        url.hash === "#comments" ||
        url.searchParams.get("tab") === "comments"
      ) {
        setActiveTab("comments");
      } else if (url.searchParams.get("tab") === "brands") {
        setActiveTab("brands");
      }
    }

    syncTabFromUrl();
    window.addEventListener("hashchange", syncTabFromUrl);
    window.addEventListener("popstate", syncTabFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncTabFromUrl);
      window.removeEventListener("popstate", syncTabFromUrl);
    };
  }, []);

  function selectTab(nextTab: ShopPageTab, moveFocus = false) {
    setActiveTab(nextTab);

    const url = new URL(window.location.href);
    if (nextTab === "comments") {
      url.searchParams.set("tab", "comments");
      url.hash = "comments";
    } else {
      url.searchParams.delete("tab");
      url.hash = "";
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    requestAnimationFrame(() => {
      tabsRef.current?.scrollIntoView({ block: "start" });
      if (moveFocus) {
        (nextTab === "brands" ? brandTabRef : commentTabRef).current?.focus();
      }
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(activeTab === "brands" ? "comments" : "brands", true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab("brands", true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab("comments", true);
    }
  }

  return (
    <div className="shop-tabs" ref={tabsRef}>
      <div className="shop-tabs-list" role="tablist" aria-label="店舗情報">
        <button
          ref={brandTabRef}
          id="shop-brands-tab"
          className="shop-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "brands"}
          aria-controls="shop-brands-panel"
          tabIndex={activeTab === "brands" ? 0 : -1}
          onClick={() => selectTab("brands")}
          onKeyDown={handleTabKeyDown}
        >
          <span>取扱銘柄</span>
          <span className="shop-tab-count">{brandCount}</span>
        </button>
        <button
          ref={commentTabRef}
          id="shop-comments-tab"
          className="shop-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "comments"}
          aria-controls="shop-comments-panel"
          tabIndex={activeTab === "comments" ? 0 : -1}
          onClick={() => selectTab("comments")}
          onKeyDown={handleTabKeyDown}
        >
          <span>コメント</span>
          <span className="shop-tab-count">{commentCount}</span>
        </button>
      </div>

      <div
        id="shop-brands-panel"
        className="shop-tab-panel"
        role="tabpanel"
        aria-labelledby="shop-brands-tab"
        hidden={activeTab !== "brands"}
      >
        {brands}
      </div>
      <div
        id="shop-comments-panel"
        className="shop-tab-panel"
        role="tabpanel"
        aria-labelledby="shop-comments-tab"
        hidden={activeTab !== "comments"}
      >
        {comments}
      </div>
    </div>
  );
}
