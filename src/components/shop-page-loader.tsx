"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, History, Pencil, Plus } from "lucide-react";
import { ShopBrandList } from "@/components/shop-brand-list";
import { ShopPageTabs } from "@/components/shop-page-tabs";
import type { ShopBrandSummary } from "@/lib/brand-index";
import { safeMapReturnPath } from "@/lib/map-view";
import type { Shop, ShopBrand } from "@/lib/types";
import { googleMapsShopUrl } from "@/lib/utils";

type ShopPageData = {
  shop: Pick<
    Shop,
    "id" | "name" | "prefecture" | "city" | "google_place_id" | "is_active"
  >;
  relations: ShopBrand[];
  error?: string;
};

export function ShopPageLoader() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const [data, setData] = useState<ShopPageData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/shops/${id}/page-data`, {
          cache: "no-store",
          signal,
        });
        const result = (await response.json()) as ShopPageData;
        if (!response.ok)
          throw new Error(result.error ?? "酒屋情報を読み込めませんでした");
        setData(result);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "酒屋情報を読み込めませんでした",
        );
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

  const returnTo = searchParams.get("return_to") ?? undefined;
  if (!data)
    return (
      <main id="main" className="page shop-page">
        <Link href={safeMapReturnPath(returnTo, id)} className="back">
          <ArrowLeft size={17} />
          地図に戻る
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

  return (
    <main id="main" className="page shop-page">
      <Link href={safeMapReturnPath(returnTo, id)} className="back">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head shop-head">
        <div>
          <h1>{data.shop.name}</h1>
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
          <Link className="button ghost small" href={`/edit/shop/${id}`}>
            <Pencil size={16} />
            店舗の編集
          </Link>
          <Link
            className="button ghost small"
            href={`/history?type=shop&id=${id}`}
          >
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
        shopId={id}
        brands={
          <div className="shop-content">
            <section className="card shop-brands-card">
              {listedBrands.length ? (
                <ShopBrandList
                  items={listedBrands as ShopBrandSummary[]}
                  title="取扱銘柄"
                />
              ) : (
                <>
                  <div className="shop-brands-heading">
                    <h2>取扱銘柄</h2>
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
