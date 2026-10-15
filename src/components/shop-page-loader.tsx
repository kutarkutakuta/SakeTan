"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, History, Pencil, Plus } from "lucide-react";
import { ShopBrandList } from "@/components/shop-brand-list";
import { ShopPageTabs } from "@/components/shop-page-tabs";
import { ShopBrandInfoNotice } from "@/components/shop-brand-info-notice";
import { HomeRedirect } from "@/components/home-redirect";
import {
  errorMessage,
  fetchJson,
  isAbortError,
  isMissingPageError,
} from "@/lib/client";
import { safeMapReturnPath } from "@/lib/map-view";
import { masterReturnPath } from "@/lib/master-navigation";
import { shopPageTitle } from "@/lib/shop-page-title";
import type { PublicShopData } from "@/lib/public-detail";
import { useBrowserQuery } from "./use-browser-query";
import { useDetailCanonical } from "./use-detail-canonical";
import { googleMapsShopUrl } from "@/lib/utils";

export function ShopPageLoader({
  shopId,
  query,
  initialData,
}: {
  shopId: string;
  query?: string;
  initialData?: PublicShopData;
}) {
  const searchParams = useBrowserQuery(query);
  const id = shopId;
  const [data, setData] = useState<PublicShopData | null>(initialData ?? null);
  useDetailCanonical(`/shops/${encodeURIComponent(id)}`);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      setMissing(false);
      try {
        const result = await fetchJson<PublicShopData>(
          `/api/shops/${id}/page-data`,
          { cache: "no-store", signal },
          "酒屋情報を読み込めませんでした",
        );
        setData(result);
      } catch (reason) {
        if (isAbortError(reason)) return;
        if (isMissingPageError(reason)) {
          setMissing(true);
          return;
        }
        setError(errorMessage(reason, "酒屋情報を読み込めませんでした"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!data?.shop.name) return;
    const previousTitle = document.title;
    document.title = shopPageTitle(
      data.shop.name,
      data.shop.prefecture,
      data.shop.city,
    );
    return () => {
      document.title = previousTitle;
    };
  }, [data?.shop.name, data?.shop.prefecture, data?.shop.city]);

  const returnTo =
    (query === undefined
      ? searchParams.get("return_to")
      : new URLSearchParams(query).get("return_to")) ?? undefined;
  const directoryReturn =
    returnTo?.split("?", 1)[0] === "/shops"
      ? masterReturnPath(returnTo)
      : undefined;
  const backHref = directoryReturn ?? safeMapReturnPath(returnTo, id);
  const backLabel = directoryReturn ? "酒屋一覧に戻る" : "地図に戻る";
  if (missing) return <HomeRedirect />;
  if (!data)
    return (
      <main id="main" className="page shop-page">
        <Link href={backHref} className="back">
          <ArrowLeft size={17} />
          {backLabel}
        </Link>
        {loading && <p className="muted">酒屋情報を読み込んでいます…</p>}
        {error && (
          <div className="card empty">
            <p className="notice">{error}</p>
            <button
              className="button small"
              type="button"
              onClick={() => void load()}
            >
              再読み込み
            </button>
          </div>
        )}
      </main>
    );

  const listedBrands = data.relations.filter(
    (relation) =>
      (relation.status === "available" || relation.status === "unavailable") &&
      relation.brands?.is_active,
  );
  const googleMapsUrl = googleMapsShopUrl(data.shop);
  const shopLocation = [data.shop.prefecture, data.shop.city]
    .filter(Boolean)
    .join(" ");

  return (
    <main id="main" className="page shop-page">
      <Link href={backHref} className="back">
        <ArrowLeft size={17} />
        {backLabel}
      </Link>
      <div className="page-head shop-head">
        <div>
          <h1 className="shop-title">
            <span>{data.shop.name}</span>
            {data.shop.name_kana?.trim() && (
              <span className="shop-title-kana">{data.shop.name_kana}</span>
            )}
          </h1>
          {shopLocation && <p className="shop-location">{shopLocation}</p>}
          <div className="shop-links">
            <a
              className="text-link"
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              営業時間等をGoogle マップで確認
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <div className="actions">
          {data.shop.is_active && (
            <Link
              className="button small shop-head-brand-edit"
              href={`/post?shop_id=${id}`}
            >
              <Plus size={17} />
              取扱銘柄の編集
            </Link>
          )}
          <a className="button ghost small" href={`/edit/shop/${id}`}>
            <Pencil size={16} />
            店舗の編集
          </a>
          <Link className="button ghost small" href={`/history?shop_id=${id}`}>
            <History size={16} />
            更新履歴
          </Link>
        </div>
      </div>
      {!data.shop.is_active && (
        <p className="notice">この酒屋は無効化されています。</p>
      )}

      <ShopPageTabs
        initialTab={
          searchParams.get("tab") === "comments" ? "comments" : "brands"
        }
        brandCount={listedBrands.length}
        commentCount={data.commentCount}
        shopId={id}
        brands={
          <div className="shop-content">
            <section className="card shop-brands-card">
              {listedBrands.length ? (
                <ShopBrandList
                  items={listedBrands}
                  title="取扱銘柄"
                  seekingBrandInfo={
                    data.shop.is_active && data.shop.seeking_brand_info
                  }
                />
              ) : (
                <>
                  <div className="shop-brands-heading">
                    <div className="shop-brands-title">
                      <h2>取扱銘柄</h2>
                      {data.shop.is_active && data.shop.seeking_brand_info && (
                        <ShopBrandInfoNotice />
                      )}
                    </div>
                    <span className="brand-filter-count">0件</span>
                  </div>
                  <p className="muted">まだ取扱銘柄の登録がありません。</p>
                </>
              )}
            </section>
          </div>
        }
      />

      {data.shop.is_active && (
        <div className="sticky-post">
          <Link className="button full" href={`/post?shop_id=${id}`}>
            <Plus size={20} />
            取扱銘柄の編集
          </Link>
        </div>
      )}
    </main>
  );
}
