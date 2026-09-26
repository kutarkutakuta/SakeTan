"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";
import { AvailabilityInfo } from "@/components/availability-info";
import { PostForm } from "@/components/post-form";
import { errorMessage, fetchJson, isAbortError } from "@/lib/client";
import type { PostShop, PostShopRelation } from "@/lib/types";

type PostData = {
  shop: PostShop;
  shopRelations: PostShopRelation[];
  copyAllowed: boolean;
  error?: string;
};

export function PostPageLoader() {
  const searchParams = useSearchParams();
  const shopId = searchParams.get("shop_id") ?? "";
  const [data, setData] = useState<PostData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(shopId));

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!shopId) return;
      setLoading(true);
      setError("");
      try {
        const result = await fetchJson<PostData>(
          `/api/shops/${shopId}/post-data`,
          { cache: "no-store", signal },
          "取扱情報を取得できませんでした",
        );
        setData(result);
      } catch (reason) {
        if (isAbortError(reason)) return;
        setError(errorMessage(reason, "取扱情報を取得できませんでした"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shopId],
  );

  useEffect(() => {
    setData(null);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!shopId)
    return (
      <main id="main" className="page narrow">
        <h1>酒屋を選んで取扱情報を変更</h1>
        <p className="notice">
          地図から酒屋を開き、「取扱状況を変更」を選んでください。
        </p>
        <Link href="/" className="button">
          地図から酒屋を探す
        </Link>
      </main>
    );

  return (
    <main id="main" className="page post-page">
      <Link className="back" href={`/shops/${shopId}`}>
        <ArrowLeft size={17} />
        酒屋に戻る
      </Link>
      {loading && !data && <p className="muted">取扱情報を読み込んでいます…</p>}
      {error && !data && (
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
      {data &&
        (!data.shop.is_active ? (
          <>
            <div className="page-head post-page-head">
              <div className="post-page-title">
                <h1>取扱銘柄の編集</h1>
                <AvailabilityInfo />
              </div>
              <Link className="post-shop" href={`/shops/${data.shop.id}`}>
                <Store size={18} />
                <span>{data.shop.name}</span>
              </Link>
            </div>
            <p className="notice">この酒屋は無効化されています。</p>
          </>
        ) : (
          <PostForm
            shop={data.shop}
            shopRelations={data.shopRelations}
            copyAllowed={data.copyAllowed}
          />
        ))}
    </main>
  );
}
