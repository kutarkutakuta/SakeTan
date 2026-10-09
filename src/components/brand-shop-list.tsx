"use client";

import { useEffect, useMemo, useState } from "react";
import {
  groupBrandShops,
  loadBrandShops,
  type BrandShop,
} from "@/lib/brand-shops";
import { supabase } from "@/lib/supabase/browser";

export function BrandShopList({ brandId }: { brandId: string }) {
  const [shops, setShops] = useState<BrandShop[]>([]);
  const [selectedPrefectures, setSelectedPrefectures] = useState<Set<string>>(
    () => new Set(),
  );
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      const db = await supabase();
      if (!db) throw new Error("取扱店舗の接続先が設定されていません");
      const entries = await loadBrandShops(db, brandId, controller.signal);
      if (controller.signal.aborted) return;
      setShops(entries);
    })()
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "取扱店舗を取得できませんでした",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [brandId, retry]);

  const groups = useMemo(() => groupBrandShops(shops), [shops]);
  const hasSelection = groups.some((group) =>
    selectedPrefectures.has(group.prefecture),
  );

  return (
    <section
      className="master-related-section"
      aria-labelledby="brand-shops-heading"
    >
      <h2 id="brand-shops-heading">
        取扱店舗
        {shops.length > 0 && <span className="count">{shops.length}</span>}
      </h2>
      {groups.length > 0 && (
        <>
          <div
            className="brand-shop-prefectures"
            role="group"
            aria-label="取扱店舗の都道府県（複数選択可）"
          >
            {groups.map((group, index) => (
              <button
                key={group.prefecture}
                type="button"
                aria-pressed={selectedPrefectures.has(group.prefecture)}
                aria-controls={`brand-shop-region-${index}`}
                onClick={() =>
                  setSelectedPrefectures((previous) => {
                    const selected = new Set(previous);
                    if (selected.has(group.prefecture))
                      selected.delete(group.prefecture);
                    else selected.add(group.prefecture);
                    return selected;
                  })
                }
              >
                <span>{group.label}</span>
                <span>{group.shops.length}</span>
              </button>
            ))}
          </div>
          {!hasSelection && (
            <p className="hint">
              県を選ぶと取扱店舗を表示します（複数選択可）。
            </p>
          )}
          {groups.map((group, index) => (
            <section
              key={group.prefecture}
              id={`brand-shop-region-${index}`}
              className="brand-shop-region-panel"
              aria-labelledby={`brand-shop-region-heading-${index}`}
              hidden={!selectedPrefectures.has(group.prefecture)}
            >
              <h3 id={`brand-shop-region-heading-${index}`}>
                {group.prefecture}の取扱店舗
              </h3>
              <ul className="brand-shop-list">
                {group.shops.map((shop) => (
                  <li key={shop.id}>
                    <a href={`/shops/${shop.id}`}>
                      <span>{shop.name}</span>
                      {shop.city && (
                        <span className="brand-shop-location">{shop.city}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {loading && (
        <p className="muted" role="status">
          取扱店舗を読み込んでいます…
        </p>
      )}
      {!loading && !error && shops.length === 0 && (
        <p className="muted">取扱店舗はまだ登録されていません。</p>
      )}
      {error && (
        <>
          <p className="notice error" role="alert">
            {error}
          </p>
          <button
            className="button ghost small"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            再読み込み
          </button>
        </>
      )}
    </section>
  );
}
